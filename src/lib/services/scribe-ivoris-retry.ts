import { addIvorisKarteiEintrag } from "@/lib/api/ivoris-doku-client";
import { createServerClient } from "@/lib/db/supabase";
import { repairDokuPatientIvorisLink, type PatientIdentity } from "@/lib/services/patient-ivoris-link";
import {
  buildScribeRetryFailurePatch,
  classifyScribeIvorisError,
  isAutomaticScribeIvorisRetry,
  isIvorisServiceOutage,
} from "@/lib/services/scribe-ivoris-error";

type DbClient = ReturnType<typeof createServerClient>;

type RetryOptions = {
  db?: DbClient;
  datum?: string | null;
  limit?: number;
};

type RetryEntry = {
  id: string;
  termin_datum: string;
  version: number;
  text: string | null;
  zaehne: string[] | null;
  bestaetigt_kuerzel: string | null;
  ivoris_push_status: string | null;
  ivoris_fehler: string | null;
  ivoris_retry_count: number | null;
  ivoris_next_retry_at: string | null;
  patients: PatientIdentity | PatientIdentity[] | null;
};

export async function retryPendingScribeIvorisPushes(options: RetryOptions = {}) {
  const db = options.db ?? createServerClient();
  const datum = options.datum && /^\d{4}-\d{2}-\d{2}$/.test(options.datum) ? options.datum : null;
  const limit = Math.max(1, Math.min(50, options.limit ?? 20));
  const workerId = `scribe-${crypto.randomUUID()}`;

  const baseSelect =
    "id, termin_datum, version, text, zaehne, bestaetigt_kuerzel, ivoris_push_status, ivoris_fehler, ivoris_retry_count, ivoris_next_retry_at, patients ( id, ivoris_id, vorname, nachname, geburtsdatum )";

  let data: RetryEntry[] | null = null;
  let error: { message: string } | null = null;
  const claimedIds: string[] = [];

  if (datum) {
    const result = await db
      .from("doku_eintraege")
      .select(baseSelect)
      .eq("status", "bestaetigt")
      .in("ivoris_push_status", ["ausstehend", "fehler"])
      .or(`ivoris_next_retry_at.is.null,ivoris_next_retry_at.lte.${new Date().toISOString()}`)
      .eq("termin_datum", datum)
      .order("bestaetigt_am", { ascending: true })
      .limit(limit);
    data = result.data as RetryEntry[] | null;
    error = result.error;
  } else {
    for (let index = 0; index < limit; index += 1) {
      const claim = await db.rpc("claim_integration_outbox_job", {
        p_artifact_type: "carteitext",
        p_worker_id: workerId,
        p_lease_minutes: 15,
      });
      if (claim.error) throw new Error(`Scribe-Job konnte nicht reserviert werden: ${claim.error.message}`);
      const claimed = Array.isArray(claim.data) ? claim.data[0] : null;
      if (!claimed) break;
      claimedIds.push(String((claimed as { artifact_id: string }).artifact_id));
    }

    if (claimedIds.length === 0) {
      return { datum: "alle", processed: 0, recovered: 0, failed: 0, circuitBreakerOpen: false, results: [] };
    }

    const result = await db
    .from("doku_eintraege")
      .select(baseSelect)
      .in("id", claimedIds);
    data = result.data as RetryEntry[] | null;
    error = result.error;
  }

  if (error) throw new Error(error.message);

  const manualReviewEntries = (data ?? []).filter((eintrag) => {
    const pushStatus = (eintrag as { ivoris_push_status?: string | null }).ivoris_push_status;
    const fehler = (eintrag as { ivoris_fehler?: string | null }).ivoris_fehler;
    return pushStatus === "fehler" && !isAutomaticScribeIvorisRetry(fehler);
  });
  for (const eintrag of manualReviewEntries) {
    const fehler = (eintrag as { ivoris_fehler?: string | null }).ivoris_fehler;
    await db
      .from("doku_eintraege")
      .update({ ivoris_error_class: classifyScribeIvorisError(fehler) })
      .eq("id", eintrag.id);
  }

  const claimOrder = new Map(claimedIds.map((id, index) => [id, index]));
  const kandidaten = (data ?? []).filter((eintrag) => {
    const pushStatus = (eintrag as { ivoris_push_status?: string | null }).ivoris_push_status;
    const fehler = (eintrag as { ivoris_fehler?: string | null }).ivoris_fehler;
    if (pushStatus === "ausstehend") return true;
    if (pushStatus !== "fehler") return false;
    return isAutomaticScribeIvorisRetry(fehler);
  }).sort((left, right) =>
    (claimOrder.get(String(left.id)) ?? Number.MAX_SAFE_INTEGER) -
    (claimOrder.get(String(right.id)) ?? Number.MAX_SAFE_INTEGER)
  );

  let recovered = 0;
  let failed = 0;
  let processed = 0;
  let circuitBreakerOpen = false;
  const results: Array<{ id: string; status: "gepusht" | "fehler"; patient: string; message?: string }> = [];

  for (let index = 0; index < kandidaten.length; index += 1) {
    const eintrag = kandidaten[index];
    processed += 1;
    const previousRetryCount = Number((eintrag as { ivoris_retry_count?: number | null }).ivoris_retry_count ?? 0);
    await db
      .from("doku_eintraege")
      .update({
        ivoris_last_attempt_at: new Date().toISOString(),
        ivoris_error_class: "automatic_retry",
      })
      .eq("id", eintrag.id);
    let patient = (Array.isArray(eintrag.patients) ? eintrag.patients[0] : eintrag.patients) as
      | PatientIdentity
      | null;
    if (patient && !patient.ivoris_id) {
      patient = await repairDokuPatientIvorisLink(db, String(eintrag.id), patient);
    }
    const patientName = patient ? `${patient.vorname ?? ""} ${patient.nachname ?? ""}`.trim() || "Unbekannt" : "Unbekannt";

    if (!patient?.ivoris_id) {
      await db
        .from("doku_eintraege")
        .update(buildScribeRetryFailurePatch("Patient hat keine ivoris_id", previousRetryCount))
        .eq("id", eintrag.id);
      failed += 1;
      results.push({ id: String(eintrag.id), status: "fehler", patient: patientName, message: "Patient hat keine ivoris_id" });
      continue;
    }

    const zaehne = ((eintrag.zaehne as string[] | null) ?? []).map(String);
    const prefix = (eintrag.version as number) > 1 ? `KORREKTUR (v${eintrag.version}): ` : "";
    const kuerzel = typeof eintrag.bestaetigt_kuerzel === "string" && eintrag.bestaetigt_kuerzel.trim()
      ? ` ${eintrag.bestaetigt_kuerzel.trim()}`
      : "";
    const text = `${prefix}${(eintrag.text as string) ?? ""}${kuerzel}`;

    try {
      const result = await addIvorisKarteiEintrag({
        patientIvorisId: patient.ivoris_id,
        date: String(eintrag.termin_datum),
        text,
        tooth: zaehne.length === 1 ? zaehne[0] : undefined,
      });

      const { error: updError } = await db
        .from("doku_eintraege")
        .update({
          ivoris_push_status: "gepusht",
          ivoris_entry_id: result.entryId,
          ivoris_gepusht_am: new Date().toISOString(),
          ivoris_fehler: null,
          ivoris_retry_count: 0,
          ivoris_next_retry_at: null,
          ivoris_error_class: null,
        })
        .eq("id", eintrag.id);

      if (updError) throw updError;
      recovered += 1;
      results.push({ id: String(eintrag.id), status: "gepusht", patient: patientName });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unbekannter Fehler";
      await db
        .from("doku_eintraege")
        .update(buildScribeRetryFailurePatch(message, previousRetryCount))
        .eq("id", eintrag.id);
      failed += 1;
      results.push({ id: String(eintrag.id), status: "fehler", patient: patientName, message });
      if (isIvorisServiceOutage(message)) {
        circuitBreakerOpen = true;
        const unprocessedIds = kandidaten.slice(index + 1).map((entry) => String(entry.id));
        if (claimedIds.length > 0 && unprocessedIds.length > 0) {
          const retryAt = new Date(Date.now() + 5 * 60_000).toISOString();
          const { error: releaseError } = await db
            .from("integration_outbox_jobs")
            .update({
              status: "retry_wait",
              next_attempt_at: retryAt,
              locked_at: null,
              locked_by: null,
              updated_at: new Date().toISOString(),
            })
            .eq("artifact_type", "carteitext")
            .eq("locked_by", workerId)
            .in("artifact_id", unprocessedIds);
          if (releaseError) {
            throw new Error(`Scribe-Reservierungen konnten nach IVORIS-Ausfall nicht freigegeben werden: ${releaseError.message}`);
          }
        }
        break;
      }
    }
  }

  return {
    datum: datum ?? "alle",
    processed,
    recovered,
    failed,
    circuitBreakerOpen,
    results,
  };
}
