import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { addIvorisKarteiEintrag } from "@/lib/api/ivoris-doku-client";
import { createServerClient } from "@/lib/db/supabase";
import { repairDokuPatientIvorisLink, type PatientIdentity } from "@/lib/services/patient-ivoris-link";
import { buildScribeRetryFailurePatch } from "@/lib/services/scribe-ivoris-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/doku/eintrag/[id]/ivoris-push
// Pusht einen bestaetigten Eintrag als Karteieintrag in die ivoris-Akte
// (POST /Documentation/v1/Entry, Treatment=Orthodontics, append-only).
// Idempotent: bereits gepushte Eintraege (gleiche Version) werden nicht erneut gesendet.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as string | undefined) ?? null;
  const permissions = (profile?.permissions ?? {}) as { scribe_schreiben?: boolean };
  const scribeErlaubt = permissions.scribe_schreiben ?? (!!role && ["admin", "verwaltung"].includes(role));
  if (!scribeErlaubt) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const { data: eintrag, error: loadError } = await supabase
    .from("doku_eintraege")
    .select("*, patients ( id, ivoris_id, vorname, nachname, geburtsdatum )")
    .eq("id", params.id)
    .single();

  if (loadError || !eintrag) return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });

  if (eintrag.status !== "bestaetigt") {
    return NextResponse.json({ error: "Nur bestaetigte Eintraege werden gepusht" }, { status: 409 });
  }

  if (eintrag.ivoris_push_status === "gepusht" && eintrag.ivoris_entry_id) {
    return NextResponse.json({
      status: "bereits_gepusht",
      ivoris_entry_id: eintrag.ivoris_entry_id,
    });
  }

  const service = createServerClient();
  const workerId = `scribe-manual-${randomUUID()}`;
  const claim = await service.rpc("claim_integration_outbox_job_for_artifact", {
    p_artifact_type: "carteitext",
    p_artifact_id: eintrag.id,
    p_worker_id: workerId,
    p_lease_minutes: 15,
    p_force: true,
  });
  if (claim.error) {
    return NextResponse.json({ error: `Scribe-Job konnte nicht reserviert werden: ${claim.error.message}` }, { status: 500 });
  }
  if (!Array.isArray(claim.data) || claim.data.length === 0) {
    return NextResponse.json({ error: "Dieser Scribe-Eintrag wird bereits verarbeitet oder benötigt eine manuelle Patientenprüfung." }, { status: 409 });
  }

  let patient = eintrag.patients as PatientIdentity | null;
  if (patient && !patient.ivoris_id) {
    patient = await repairDokuPatientIvorisLink(service, eintrag.id, patient);
  }
  if (!patient?.ivoris_id) {
    await supabase
      .from("doku_eintraege")
      .update(buildScribeRetryFailurePatch("Patient hat keine ivoris_id", eintrag.ivoris_retry_count))
      .eq("id", eintrag.id);
    return NextResponse.json({ error: "Patient hat keine ivoris_id" }, { status: 422 });
  }

  // Korrektur-Kennzeichnung: ab Version 2 entsteht in ivoris ein zusaetzlicher Eintrag
  const zaehne = (eintrag.zaehne as string[]) ?? [];
  const prefix = (eintrag.version as number) > 1 ? `KORREKTUR (v${eintrag.version}): ` : "";
  const kuerzel = (eintrag.bestaetigt_kuerzel as string | null) ?? null;
  const text = `${prefix}${eintrag.text}${kuerzel ? ` ${kuerzel}` : ""}`;

  try {
    const result = await addIvorisKarteiEintrag({
      patientIvorisId: patient.ivoris_id,
      date: eintrag.termin_datum as string,
      text,
      tooth: zaehne.length === 1 ? zaehne[0] : undefined,
    });

    const { error: updError } = await supabase
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

    if (updError) {
      return NextResponse.json(
        { status: "gepusht", ivoris_entry_id: result.entryId, warnung: updError.message },
        { status: 207 }
      );
    }

    return NextResponse.json({ status: "gepusht", ivoris_entry_id: result.entryId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler";
    await supabase
      .from("doku_eintraege")
      .update(buildScribeRetryFailurePatch(message, eintrag.ivoris_retry_count))
      .eq("id", eintrag.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
