import { createServerClient } from "@/lib/db/supabase";
import {
  deterministicAnamnesisDocumentId,
  syncSignedAnamnesisToPatientDocuments,
} from "@/lib/services/patient-document-sync";

const apply = process.argv.includes("--apply");

async function main() {
  const db = createServerClient();
  const { data, error } = await db
    .from("anamnese_submissions")
    .select("id,status,signed_pdf_path,signiert_am,patient_id,matched_patient_id,email")
    .not("signed_pdf_path", "is", null)
    .in("status", ["signiert", "an_ivoris_uebertragen"])
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);

  // Synthetic E2E records are evidence, not practice documents to backfill.
  const rows = (data ?? []).filter((row) => !row.email?.endsWith("@invalid.example"));
  const linked = rows.filter((row) => row.matched_patient_id ?? row.patient_id);
  const expectedIds = linked.map((row) => deterministicAnamnesisDocumentId(row.id));
  const existing = new Set<string>();
  for (let offset = 0; offset < expectedIds.length; offset += 150) {
    const result = await db.from("patient_documents").select("id").in("id", expectedIds.slice(offset, offset + 150));
    if (result.error) throw new Error(result.error.message);
    for (const document of result.data ?? []) existing.add(document.id);
  }

  const summary = {
    mode: apply ? "apply" : "dry-run",
    signed: rows.length,
    linked: linked.length,
    unlinked: rows.length - linked.length,
    existingBefore: existing.size,
    created: 0,
    alreadyLinked: 0,
    failed: 0,
  };

  if (apply) {
    const pending = linked.filter(
      (row) => !existing.has(deterministicAnamnesisDocumentId(row.id)),
    );
    summary.alreadyLinked = linked.length - pending.length;
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const row = pending[cursor++];
        try {
          const result = await syncSignedAnamnesisToPatientDocuments(db, row);
          if (result.skipped) summary.alreadyLinked += 1;
          else summary.created += 1;
        } catch {
          summary.failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, pending.length) }, worker));
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
