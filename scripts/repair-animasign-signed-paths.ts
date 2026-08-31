import { createServerClient } from "@/lib/db/supabase";
import { downloadSignedPdf, getEnvelope } from "@/lib/documenso/client";
import { extractCompletedEnvelopeDocumentId } from "@/lib/services/animasign-signature-reconciliation";
import { syncSignedAnamnesisToPatientDocuments } from "@/lib/services/patient-document-sync";

type SubmissionRow = {
  id: string;
  created_at: string;
  signiert_am: string | null;
  vorname: string | null;
  nachname: string | null;
  patient_id: string | null;
  matched_patient_id: string | null;
  signed_pdf_path: string | null;
  documenso_envelope_id: string | null;
  ivoris_doc_synced?: boolean | null;
  ivoris_document_id?: string | null;
};

function parseArgs() {
  const apply = process.argv.includes("--apply");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1];
  const limit = limitArg ? Number.parseInt(limitArg, 10) : 200;
  return {
    apply,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 200,
  };
}

async function main() {
  const { apply, limit } = parseArgs();
  const db = createServerClient();

  const { data, error } = await db
    .from("anamnese_submissions")
    .select(
      "id, created_at, signiert_am, vorname, nachname, patient_id, matched_patient_id, signed_pdf_path, documenso_envelope_id, ivoris_doc_synced, ivoris_document_id"
    )
    .eq("status", "signiert")
    .like("signed_pdf_path", "%/Anamnesebogen.pdf")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Legacy-Signaturpfade konnten nicht geladen werden: ${error.message}`);
  }

  const rows = (data ?? []) as SubmissionRow[];
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    if (!row.documenso_envelope_id) {
      results.push({
        submissionId: row.id,
        patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
        mode: apply ? "applied" : "dry-run",
        error: "missing_documenso_envelope_id",
      });
      continue;
    }

    try {
      const envelope = await getEnvelope(row.documenso_envelope_id);
      const documentId = extractCompletedEnvelopeDocumentId(envelope.raw);

      if (!documentId) {
        results.push({
          submissionId: row.id,
          patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
          mode: apply ? "applied" : "dry-run",
          error: "completed_envelope_without_document_id",
        });
        continue;
      }

      const signedPath = `${row.id}/Anamnesebogen-signiert.pdf`;

      if (apply) {
        const signedPdf = await downloadSignedPdf(documentId);
        const { error: uploadError } = await db.storage
          .from("anamnese-dokumente")
          .upload(signedPath, signedPdf, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`upload_failed:${uploadError.message}`);
        }

        const { error: updateError } = await db
          .from("anamnese_submissions")
          .update({
            signed_pdf_path: signedPath,
            signiert_am: row.signiert_am ?? new Date().toISOString(),
          })
          .eq("id", row.id);

        if (updateError) {
          throw new Error(`submission_update_failed:${updateError.message}`);
        }

        await syncSignedAnamnesisToPatientDocuments(db, {
          id: row.id,
          patient_id: row.patient_id,
          matched_patient_id: row.matched_patient_id,
          vorname: row.vorname,
          nachname: row.nachname,
          signiert_am: row.signiert_am ?? new Date().toISOString(),
        });
      }

      results.push({
        submissionId: row.id,
        patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
        mode: apply ? "applied" : "dry-run",
        documentId,
        previousPath: row.signed_pdf_path,
        nextPath: signedPath,
        ivorisDocSynced: row.ivoris_doc_synced ?? null,
        ivorisDocumentId: row.ivoris_document_id ?? null,
      });
    } catch (entryError) {
      results.push({
        submissionId: row.id,
        patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
        mode: apply ? "applied" : "dry-run",
        error: entryError instanceof Error ? entryError.message : String(entryError),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: results.every((entry) => !("error" in entry)),
        apply,
        limit,
        total: rows.length,
        results,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error("[repair-animasign-signed-paths]", error);
  process.exit(1);
});
