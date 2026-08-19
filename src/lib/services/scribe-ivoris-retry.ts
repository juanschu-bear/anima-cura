import { addIvorisKarteiEintrag } from "@/lib/api/ivoris-doku-client";
import { createServerClient } from "@/lib/db/supabase";

type DbClient = ReturnType<typeof createServerClient>;

type RetryOptions = {
  db?: DbClient;
  datum?: string | null;
  limit?: number;
};

function istAutomatischWiederholbarerPushFehler(fehler: string | null | undefined): boolean {
  const text = (fehler ?? "").trim();
  return (
    text.includes("(502)") ||
    text.includes("(503)") ||
    text.includes("(504)") ||
    text.includes("nicht stabil erreichbar") ||
    text === 'IVORIS AddEntry fehlgeschlagen (500): {"message":"An error has occurred."}'
  );
}

export async function retryPendingScribeIvorisPushes(options: RetryOptions = {}) {
  const db = options.db ?? createServerClient();
  const datum = options.datum && /^\d{4}-\d{2}-\d{2}$/.test(options.datum) ? options.datum : null;
  const limit = Math.max(1, Math.min(50, options.limit ?? 20));

  let query = db
    .from("doku_eintraege")
    .select(
      "id, termin_datum, version, text, zaehne, bestaetigt_kuerzel, ivoris_push_status, ivoris_fehler, patients ( ivoris_id, vorname, nachname )"
    )
    .eq("status", "bestaetigt")
    .in("ivoris_push_status", ["ausstehend", "fehler"])
    .order("bestaetigt_am", { ascending: true })
    .limit(limit);

  if (datum) {
    query = query.eq("termin_datum", datum);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const kandidaten = (data ?? []).filter((eintrag) => {
    const pushStatus = (eintrag as { ivoris_push_status?: string | null }).ivoris_push_status;
    const fehler = (eintrag as { ivoris_fehler?: string | null }).ivoris_fehler;
    if (pushStatus === "ausstehend") return true;
    if (pushStatus !== "fehler") return false;
    return istAutomatischWiederholbarerPushFehler(fehler);
  });

  let recovered = 0;
  let failed = 0;
  const results: Array<{ id: string; status: "gepusht" | "fehler"; patient: string; message?: string }> = [];

  for (const eintrag of kandidaten) {
    const patient = (Array.isArray(eintrag.patients) ? eintrag.patients[0] : eintrag.patients) as
      | { ivoris_id: string | null; vorname?: string; nachname?: string }
      | null;
    const patientName = patient ? `${patient.vorname ?? ""} ${patient.nachname ?? ""}`.trim() || "Unbekannt" : "Unbekannt";

    if (!patient?.ivoris_id) {
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
        })
        .eq("id", eintrag.id);

      if (updError) throw updError;
      recovered += 1;
      results.push({ id: String(eintrag.id), status: "gepusht", patient: patientName });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unbekannter Fehler";
      await db
        .from("doku_eintraege")
        .update({ ivoris_push_status: "fehler", ivoris_fehler: message })
        .eq("id", eintrag.id);
      failed += 1;
      results.push({ id: String(eintrag.id), status: "fehler", patient: patientName, message });
    }
  }

  return {
    datum: datum ?? "alle",
    processed: kandidaten.length,
    recovered,
    failed,
    results,
  };
}
