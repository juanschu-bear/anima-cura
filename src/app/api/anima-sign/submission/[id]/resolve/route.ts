import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisRole } from "@/lib/require-praxis";
import { syncAnimaSignSubmission } from "@/lib/services/animasign-ivoris-sync";

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
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

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
    .select("id, matched_patient_id, patient_id")
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

  if (patientId) {
    const { data: patient, error: patientError } = await db
      .from("patients")
      .select("id, ivoris_id")
      .eq("id", patientId)
      .maybeSingle();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: `Patient nicht gefunden: ${patientError?.message ?? patientId}` },
        { status: 404 }
      );
    }

    resolvedPatientId = patient.id;
    resolvedIvorisId = resolvedIvorisId ?? normalizeUuid(patient.ivoris_id);
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
      matched_patient_id: resolvedPatientId,
      ivoris_patient_id: resolvedIvorisId,
      result,
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
