import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { syncAnimaSignSubmission } from "@/lib/services/animasign-ivoris-sync";
import { isManualReviewErrorText } from "@/lib/services/animasign-sync-status";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResolutionBody = {
  submissionId?: string;
  patientIvorisId?: string;
  retryDocument?: boolean;
};

export async function POST(req: Request) {
  const supabase = createServerClient();
  const body = (await req.json().catch(() => ({}))) as ResolutionBody;
  const submissionId = body.submissionId?.trim();
  const patientIvorisId = body.patientIvorisId?.trim();
  const retryDocument = body.retryDocument !== false;

  if (!submissionId || !patientIvorisId) {
    return NextResponse.json(
      { error: "submissionId und patientIvorisId sind erforderlich." },
      { status: 400 }
    );
  }

  if (!UUID_RE.test(patientIvorisId)) {
    return NextResponse.json(
      { error: "patientIvorisId muss eine gueltige UUID sein." },
      { status: 400 }
    );
  }

  const { data: submission, error: loadError } = await supabase
    .from("anamnese_submissions")
    .select(
      "id, ivoris_synced, ivoris_doc_synced, ivoris_sync_error, ivoris_doc_failed_permanently, ivoris_doc_retry_count, ivoris_doc_next_retry_at"
    )
    .eq("id", submissionId)
    .single();

  if (loadError || !submission) {
    return NextResponse.json(
      { error: `Submission konnte nicht geladen werden: ${loadError?.message ?? "unbekannt"}` },
      { status: 404 }
    );
  }

  const { error: updateError } = await supabase
    .from("anamnese_submissions")
    .update({
      ivoris_patient_id: patientIvorisId,
      ivoris_doc_failed_permanently: false,
      ivoris_doc_retry_count: 0,
      ivoris_doc_next_retry_at: null,
      ...(submission.ivoris_synced === true && isManualReviewErrorText(submission.ivoris_sync_error)
        ? { ivoris_sync_error: null }
        : {}),
    })
    .eq("id", submissionId);

  if (updateError) {
    return NextResponse.json(
      { error: `Ivoris-Override konnte nicht gespeichert werden: ${updateError.message}` },
      { status: 500 }
    );
  }

  const result = retryDocument
    ? await syncAnimaSignSubmission(submissionId, {
        db: supabase,
        stages: ["document"],
      })
    : null;

  return NextResponse.json({
    ok: true,
    submissionId,
    patientIvorisId,
    retried: retryDocument,
    result,
  });
}
