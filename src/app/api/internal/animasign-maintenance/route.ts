import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { deleteEnvelope, getEnvelope } from "@/lib/documenso/client";
import { finalizeExistingFormSubmission } from "@/lib/services/animasign-finalization-maintenance";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYNTHETIC_SUBMISSION_ID = "36b0c3f3-fbaa-43dd-b4df-5f62204aa29f";

function authorized(request: Request) {
  const configured = process.env.ANIMASIGN_MAINTENANCE_TOKEN ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || configured.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(configured), Buffer.from(supplied));
}

async function deleteApprovedSyntheticSubmission() {
  const db = createServerClient();
  const { data: submission, error } = await db
    .from("anamnese_submissions")
    .select("id,email,status,documenso_envelope_id")
    .eq("id", SYNTHETIC_SUBMISSION_ID)
    .single();
  if (error || !submission) throw new Error("synthetic_submission_missing");
  if (!submission.email?.endsWith("@invalid.example")) throw new Error("synthetic_marker_missing");
  if (!submission.documenso_envelope_id) throw new Error("synthetic_envelope_missing");

  const envelopeId = submission.documenso_envelope_id as string;
  const envelope = await getEnvelope(envelopeId);
  if (!["DRAFT", "PENDING", "REJECTED"].includes(envelope.status)) {
    throw new Error(`synthetic_envelope_not_deletable:${envelope.status}`);
  }
  await deleteEnvelope(envelopeId);

  const listed = await db.storage.from("anamnese-dokumente").list(SYNTHETIC_SUBMISSION_ID, { limit: 100 });
  if (listed.error) throw new Error(`synthetic_storage_list_failed:${listed.error.message}`);
  const paths = (listed.data ?? []).map((file) => `${SYNTHETIC_SUBMISSION_ID}/${file.name}`);
  if (paths.length) {
    const removed = await db.storage.from("anamnese-dokumente").remove(paths);
    if (removed.error) throw new Error(`synthetic_storage_delete_failed:${removed.error.message}`);
  }

  const outbox = await db.from("integration_outbox_jobs").delete().eq("artifact_id", SYNTHETIC_SUBMISSION_ID);
  if (outbox.error) throw new Error(`synthetic_outbox_delete_failed:${outbox.error.message}`);
  const intents = await db
    .from("einstellungen")
    .delete()
    .filter("value->>submission_id", "eq", SYNTHETIC_SUBMISSION_ID);
  if (intents.error) throw new Error(`synthetic_intent_delete_failed:${intents.error.message}`);
  const deleted = await db
    .from("anamnese_submissions")
    .delete()
    .eq("id", SYNTHETIC_SUBMISSION_ID)
    .select("id");
  if (deleted.error || deleted.data?.length !== 1) {
    throw new Error(`synthetic_submission_delete_failed:${deleted.error?.message ?? "not_deleted"}`);
  }
  return { submissionId: SYNTHETIC_SUBMISSION_ID, envelopeId, storageObjects: paths.length };
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { action?: string; submissionId?: string };
    if (body.action === "delete-approved-synthetic") {
      return NextResponse.json({ ok: true, result: await deleteApprovedSyntheticSubmission() });
    }
    if (body.action === "finalize-ready" && typeof body.submissionId === "string") {
      const db = createServerClient();
      return NextResponse.json({
        ok: true,
        result: await finalizeExistingFormSubmission(db, body.submissionId),
      });
    }
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
