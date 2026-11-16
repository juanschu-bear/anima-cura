import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisUser } from "@/lib/require-praxis";
import { syncAnimaSignSubmission } from "@/lib/services/animasign-ivoris-sync";
import { syncSignedAnamnesisToPatientDocuments } from "@/lib/services/patient-document-sync";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResolveBody = {
  patientId?: string | null;
  ivorisId?: string | null;
};

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePraxisUser(["admin", "verwaltung"]);
  if ("error" in auth) return auth.error;

  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  const patientId = normalizeUuid(body.patientId);
  const ivorisId = normalizeUuid(body.ivorisId);

  if (!patientId && !ivorisId) {
    return NextResponse.json(
      { error: "Bitte lokalen Patienten oder ivoris_id angeben." },
      { status: 400 }
    );
  }

  const db = createServerClient();

  const { data: submission, error: submissionError } = await db
    .from("anamnese_submissions")
    .select("id, matched_patient_id, patient_id, geburtsdatum")
    .eq("id", params.id)
    .maybeSingle();

  if (submissionError || !submission) {
    return NextResponse.json(
      { error: `Submission nicht gefunden: ${submissionError?.message ?? params.id}` },
      { status: 404 }
    );
  }

  let resolvedIvorisId = ivorisId;
  let resolvedPatientId = patientId ?? normalizeUuid(submission.matched_patient_id) ?? normalizeUuid(submission.patient_id);

  // Die Zuordnung durch die Praxis ist die Bestätigung, dass Bogen und Patient zusammengehören (16.11.2026). Sie gilt auch bei
  // anders geschriebenem Namen, aber nur bei gleichem Geburtsdatum. Ohne sie lehnt die Identitätsprüfung jede Abweichung im Namen ab.
  let confirmedPatient: { id: string; ivoris_id: string | null; geburtsdatum: string | null } | null = null;
  if (patientId) {
    const { data: patient, error: patientError } = await db
      .from("patients")
      .select("id, ivoris_id, geburtsdatum")
      .eq("id", patientId)
      .maybeSingle();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: `Patient nicht gefunden: ${patientError?.message ?? patientId}` },
        { status: 404 }
      );
    }

    confirmedPatient = patient;
    resolvedPatientId = patient.id;
    resolvedIvorisId = resolvedIvorisId ?? normalizeUuid(patient.ivoris_id);
  } else if (ivorisId) {
    // Nur die IVORIS-ID eingetragen: Gibt es dazu genau einen Patienten in Anima Cura, ist er der bestätigte Patient.
    const { data: byIvoris } = await db.from("patients").select("id, ivoris_id, geburtsdatum").eq("ivoris_id", ivorisId).limit(2);
    if (byIvoris?.length === 1) {
      confirmedPatient = byIvoris[0];
      resolvedPatientId = byIvoris[0].id;
    }
  }

  if (confirmedPatient) {
    const formBirth = submission.geburtsdatum ? String(submission.geburtsdatum).slice(0, 10) : null;
    const patientBirth = confirmedPatient.geburtsdatum ? String(confirmedPatient.geburtsdatum).slice(0, 10) : null;
    if (!formBirth || !patientBirth || formBirth !== patientBirth) {
      return NextResponse.json(
        {
          ok: false,
          code: "birthdate_mismatch",
          error: "Das Geburtsdatum im Bogen und beim Patienten ist nicht gleich. Bitte zuerst klären, welches stimmt. Es wurde nichts geändert.",
        },
        { status: 409 }
      );
    }
    const { error: confirmError } = await db.from("intake_identity_confirmations").upsert(
      { submission_id: params.id, patient_id: confirmedPatient.id, confirmed_by: auth.userId, confirmed_at: new Date().toISOString() },
      { onConflict: "submission_id" }
    );
    if (confirmError) {
      return NextResponse.json(
        { ok: false, error: `Die Bestätigung konnte nicht gespeichert werden: ${confirmError.message}` },
        { status: 500 }
      );
    }
  }

  const patch: Record<string, unknown> = {
    matched_patient_id: resolvedPatientId ?? null,
    patient_id: resolvedPatientId ?? submission.patient_id ?? null,
    ivoris_patient_id: resolvedIvorisId ?? null,
    ivoris_sync_error: null,
    ivoris_synced: false,
    ivoris_doc_synced: false,
    ivoris_sync_failed_permanently: false,
    ivoris_doc_failed_permanently: false,
    ivoris_sync_retry_count: 0,
    ivoris_doc_retry_count: 0,
    ivoris_sync_next_retry_at: null,
    ivoris_doc_next_retry_at: null,
  };

  const { error: updateError } = await db
    .from("anamnese_submissions")
    .update(patch)
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json(
      { error: `Submission konnte nicht aktualisiert werden: ${updateError.message}` },
      { status: 500 }
    );
  }

  try {
    const patientDocument = await syncSignedAnamnesisToPatientDocuments(db, {
      id: params.id,
    });
    const result = await syncAnimaSignSubmission(params.id, {
      db,
      stages: ["patient", "document"],
      stageOverrides: {
        patient: { attemptNo: 0, retryCountOnFailure: 0 },
        document: { attemptNo: 0, retryCountOnFailure: 0 },
      },
    });
    return NextResponse.json({
      ok: true,
      // Ehrlich melden, ob der Bogen wirklich in IVORIS angekommen ist. „ok“ heißt nur: Die Zuordnung ist gespeichert.
      transferred: result.patient !== "error" && result.document === "success",
      confirmed: Boolean(confirmedPatient),
      matched_patient_id: resolvedPatientId,
      ivoris_patient_id: resolvedIvorisId,
      result,
      patient_document: patientDocument,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      matched_patient_id: resolvedPatientId,
      ivoris_patient_id: resolvedIvorisId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
