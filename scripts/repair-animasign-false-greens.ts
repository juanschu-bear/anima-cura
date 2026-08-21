import { createServerClient } from "@/lib/db/supabase";

type RepairSummary = {
  falseGreensRequeued: string[];
  legacyDocumentStatesRequeued: string[];
};

async function collectFalseGreenSubmissionIds() {
  const db = createServerClient();
  const { data, error } = await db
    .from("animasign_sync_log")
    .select("submission_id, metadata, created_at")
    .eq("stage", "patient")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    throw new Error(`Sync-Logs konnten nicht geladen werden: ${error.message}`);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const metadata = row.metadata;
    if (
      metadata &&
      typeof metadata === "object" &&
      (metadata as Record<string, unknown>).warningCode ===
        "IVORIS_CONTACT_UPDATE_BLOCKED" &&
      !seen.has(row.submission_id)
    ) {
      seen.add(row.submission_id);
      ids.push(row.submission_id);
    }
  }

  if (!ids.length) {
    return [];
  }

  const { data: submissions, error: submissionError } = await db
    .from("anamnese_submissions")
    .select("id, ivoris_synced")
    .in("id", ids);

  if (submissionError) {
    throw new Error(`False-green Submissions konnten nicht geladen werden: ${submissionError.message}`);
  }

  return (submissions ?? [])
    .filter((row) => row.ivoris_synced === true)
    .map((row) => row.id);
}

async function collectLegacyDocumentStateIds() {
  const db = createServerClient();
  const { data, error } = await db
    .from("anamnese_submissions")
    .select("id, ivoris_doc_synced, ivoris_document_id, signed_pdf_path")
    .eq("ivoris_doc_synced", true)
    .is("ivoris_document_id", null)
    .not("signed_pdf_path", "is", null)
    .limit(500);

  if (error) {
    throw new Error(`Legacy-Dokumentstatus konnte nicht geladen werden: ${error.message}`);
  }

  return (data ?? []).map((row) => row.id);
}

async function main() {
  const db = createServerClient();
  const nowIso = new Date().toISOString();
  const summary: RepairSummary = {
    falseGreensRequeued: await collectFalseGreenSubmissionIds(),
    legacyDocumentStatesRequeued: await collectLegacyDocumentStateIds(),
  };

  if (summary.falseGreensRequeued.length > 0) {
    const { error } = await db
      .from("anamnese_submissions")
      .update({
        ivoris_synced: false,
        ivoris_sync_retry_count: 0,
        ivoris_sync_next_retry_at: nowIso,
        ivoris_sync_failed_permanently: false,
        ivoris_sync_error: "Re-queued after false-green repair",
      })
      .in("id", summary.falseGreensRequeued);

    if (error) {
      throw new Error(`False-greens konnten nicht neu eingereiht werden: ${error.message}`);
    }
  }

  if (summary.legacyDocumentStatesRequeued.length > 0) {
    const { error } = await db
      .from("anamnese_submissions")
      .update({
        ivoris_doc_synced: false,
        ivoris_doc_retry_count: 0,
        ivoris_doc_next_retry_at: nowIso,
        ivoris_doc_failed_permanently: false,
      })
      .in("id", summary.legacyDocumentStatesRequeued);

    if (error) {
      throw new Error(`Legacy-Dokumente konnten nicht neu eingereiht werden: ${error.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        updated: {
          falseGreens: summary.falseGreensRequeued.length,
          legacyDocumentStates: summary.legacyDocumentStatesRequeued.length,
        },
        ids: summary,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
