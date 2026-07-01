import { createServerClient } from "@/lib/db/supabase";
import { downloadSignedPdf, getEnvelope } from "@/lib/documenso/client";
import { syncAnimaSignSubmission } from "@/lib/services/animasign-ivoris-sync";

type DbClient = ReturnType<typeof createServerClient>;

type SubmissionForFinalize = {
  id: string;
  status: string | null;
  signed_pdf_path: string | null;
  signiert_am: string | null;
  documenso_envelope_id: string | null;
};

export type ReconcileEntryResult = {
  submissionId: string;
  status: "completed" | "pending" | "rejected" | "skipped" | "error";
  detail?: string;
};

function scheduleFastRetryAt() {
  return new Date(Date.now() + 5 * 60_000).toISOString();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function collectDocumentIdCandidates(value: unknown, hint = ""): number[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectDocumentIdCandidates(entry, hint));
  }

  const objectValue = value as Record<string, unknown>;
  const candidates: number[] = [];

  for (const [key, nested] of Object.entries(objectValue)) {
    const lowered = key.toLowerCase();
    const nextHint = hint ? `${hint}.${lowered}` : lowered;

    if (
      (lowered === "documentid" || lowered === "document_id") &&
      asNumber(nested) !== null
    ) {
      candidates.push(asNumber(nested)!);
      continue;
    }

    if (
      (lowered === "id" || lowered.endsWith("id")) &&
      nextHint.includes("document") &&
      asNumber(nested) !== null
    ) {
      candidates.push(asNumber(nested)!);
      continue;
    }

    candidates.push(...collectDocumentIdCandidates(nested, nextHint));
  }

  return candidates;
}

export function extractCompletedEnvelopeDocumentId(raw: Record<string, unknown>): number | null {
  const candidates = collectDocumentIdCandidates(raw);
  return candidates.length ? candidates[0] : null;
}

async function finalizeSignedSubmission(params: {
  db: DbClient;
  submission: SubmissionForFinalize;
  documentId: number;
  completedAt?: string | null;
}): Promise<ReconcileEntryResult> {
  const { db, submission, documentId, completedAt } = params;

  if (submission.signed_pdf_path) {
    return { submissionId: submission.id, status: "skipped", detail: "signed_pdf_path already exists" };
  }

  const signedPdf = await downloadSignedPdf(documentId);
  const signedPath = `${submission.id}/Anamnesebogen-signiert.pdf`;

  const { error: uploadError } = await db.storage
    .from("anamnese-dokumente")
    .upload(signedPath, signedPdf, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage: ${uploadError.message}`);
  }

  const { error: updateError } = await db
    .from("anamnese_submissions")
    .update({
      status: "signiert",
      signed_pdf_path: signedPath,
      signiert_am: completedAt ?? submission.signiert_am ?? new Date().toISOString(),
    })
    .eq("id", submission.id);

  if (updateError) {
    throw new Error(`Submission-Update: ${updateError.message}`);
  }

  try {
    const syncResult = await syncAnimaSignSubmission(submission.id, {
      db,
      stages: ["document"],
      stageOverrides: {
        document: {
          attemptNo: 0,
          retryCountOnFailure: 0,
        },
      },
    });

    if (syncResult.document === "error") {
      const errorText =
        syncResult.errors.join(" | ").slice(0, 1000) ||
        "Initialer Ivoris-Dokumentsync fehlgeschlagen";
      await db
        .from("anamnese_submissions")
        .update({
          ivoris_sync_error: errorText,
          ivoris_doc_retry_count: 0,
          ivoris_doc_next_retry_at: scheduleFastRetryAt(),
          ivoris_doc_failed_permanently: false,
        })
        .eq("id", submission.id);
    }
  } catch (ivorisErr) {
    await db
      .from("anamnese_submissions")
      .update({
        ivoris_sync_error:
          ivorisErr instanceof Error ? ivorisErr.message : String(ivorisErr),
        ivoris_doc_retry_count: 0,
        ivoris_doc_next_retry_at: scheduleFastRetryAt(),
        ivoris_doc_failed_permanently: false,
      })
      .eq("id", submission.id);
  }

  return { submissionId: submission.id, status: "completed", detail: signedPath };
}

export async function reconcilePendingAnimaSignSignatures(options: {
  db?: DbClient;
  limit?: number;
  minAgeSeconds?: number;
} = {}): Promise<ReconcileEntryResult[]> {
  const db = options.db ?? createServerClient();
  const limit = options.limit ?? 10;
  const minAgeSeconds = options.minAgeSeconds ?? 60;
  const threshold = new Date(Date.now() - minAgeSeconds * 1000).toISOString();

  const { data: submissions, error } = await db
    .from("anamnese_submissions")
    .select("id, status, signed_pdf_path, signiert_am, documenso_envelope_id, created_at")
    .eq("status", "signatur_ausstehend")
    .is("signed_pdf_path", null)
    .not("documenso_envelope_id", "is", null)
    .lte("created_at", threshold)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Pending signatures konnten nicht geladen werden: ${error.message}`);
  }

  const results: ReconcileEntryResult[] = [];

  for (const submission of (submissions ?? []) as Array<SubmissionForFinalize & { created_at?: string | null }>) {
    if (!submission.documenso_envelope_id) {
      results.push({ submissionId: submission.id, status: "skipped", detail: "missing envelope id" });
      continue;
    }

    try {
      const envelope = await getEnvelope(submission.documenso_envelope_id);

      if (envelope.status === "PENDING" || envelope.status === "DRAFT") {
        results.push({ submissionId: submission.id, status: "pending", detail: envelope.status });
        continue;
      }

      if (envelope.status === "REJECTED") {
        await db
          .from("anamnese_submissions")
          .update({ status: "fehler", fehler_text: "Signatur abgelehnt oder abgebrochen" })
          .eq("id", submission.id);
        results.push({ submissionId: submission.id, status: "rejected" });
        continue;
      }

      const documentId = extractCompletedEnvelopeDocumentId(envelope.raw);
      if (!documentId) {
        results.push({
          submissionId: submission.id,
          status: "error",
          detail: "completed envelope without document id",
        });
        continue;
      }

      results.push(
        await finalizeSignedSubmission({
          db,
          submission,
          documentId,
          completedAt: null,
        })
      );
    } catch (reconcileError) {
      results.push({
        submissionId: submission.id,
        status: "error",
        detail: reconcileError instanceof Error ? reconcileError.message : String(reconcileError),
      });
    }
  }

  return results;
}
