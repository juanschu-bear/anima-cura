import { createServerClient } from "@/lib/db/supabase";
import { downloadSignedPdf, getEnvelope } from "@/lib/documenso/client";
import { stampStoredSignatureOnReservedPage } from "@/lib/animasign/pdf-layout";
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
  answers?: Record<string, unknown> | null;
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

async function storageFileExists(
  db: ReturnType<typeof createServerClient>,
  path: string
): Promise<boolean> {
  const { data, error } = await db.storage.from("anamnese-dokumente").download(path);
  if (error || !data) {
    return false;
  }
  return true;
}

async function updateSubmissionPath(
  db: ReturnType<typeof createServerClient>,
  row: SubmissionRow,
  signedPath: string
) {
  const signiertAm = row.signiert_am ?? new Date().toISOString();
  const { error: updateError } = await db
    .from("anamnese_submissions")
    .update({
      signed_pdf_path: signedPath,
      signiert_am: signiertAm,
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
    signiert_am: signiertAm,
  });
}

async function repairFromStoredSignature(
  db: ReturnType<typeof createServerClient>,
  row: SubmissionRow,
  signedPath: string
) {
  const signatureDataUrl = typeof row.answers?.unterschrift_versicherter === "string"
    ? row.answers.unterschrift_versicherter
    : null;

  if (!signatureDataUrl) {
    throw new Error("missing_stored_signature");
  }

  const unsignedPath = `${row.id}/Anamnesebogen.pdf`;
  const { data: unsignedPdf, error: unsignedPdfError } = await db.storage
    .from("anamnese-dokumente")
    .download(unsignedPath);

  if (unsignedPdfError || !unsignedPdf) {
    throw new Error(`unsigned_download_failed:${unsignedPdfError?.message ?? unsignedPath}`);
  }

  const repairedPdf = await stampStoredSignatureOnReservedPage({
    unsignedPdf: Buffer.from(await unsignedPdf.arrayBuffer()),
    signatureDataUrl,
    signedAt: row.signiert_am,
    signedDateText:
      typeof row.answers?.abschluss_datum === "string" ? row.answers.abschluss_datum : null,
    ort: typeof row.answers?.abschluss_ort === "string" ? row.answers.abschluss_ort : null,
  });

  const { error: uploadError } = await db.storage
    .from("anamnese-dokumente")
    .upload(signedPath, repairedPdf, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`signed_upload_failed:${uploadError.message}`);
  }

  await updateSubmissionPath(db, row, signedPath);
}

async function main() {
  const { apply, limit } = parseArgs();
  const db = createServerClient();

  const { data, error } = await db
    .from("anamnese_submissions")
    .select(
      "id, created_at, signiert_am, vorname, nachname, patient_id, matched_patient_id, signed_pdf_path, documenso_envelope_id, ivoris_doc_synced, ivoris_document_id, answers"
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
    try {
      const signedPath = `${row.id}/Anamnesebogen-signiert.pdf`;
      const existingSignedFile = await storageFileExists(db, signedPath);

      if (existingSignedFile) {
        if (apply) {
          await updateSubmissionPath(db, row, signedPath);
        }

        results.push({
          submissionId: row.id,
          patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
          mode: apply ? "applied" : "dry-run",
          strategy: "storage-path-relink",
          previousPath: row.signed_pdf_path,
          nextPath: signedPath,
          ivorisDocSynced: row.ivoris_doc_synced ?? null,
          ivorisDocumentId: row.ivoris_document_id ?? null,
        });
        continue;
      }

      if (!row.documenso_envelope_id) {
        if (apply) {
          await repairFromStoredSignature(db, row, signedPath);
        }

        results.push({
          submissionId: row.id,
          patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
          mode: apply ? "applied" : "dry-run",
          strategy: "stored-signature-rebuild",
          previousPath: row.signed_pdf_path,
          nextPath: signedPath,
          ivorisDocSynced: row.ivoris_doc_synced ?? null,
          ivorisDocumentId: row.ivoris_document_id ?? null,
        });
        continue;
      }

      let documentId: number | null = null;
      let lastDocumensoError: string | null = null;
      try {
        const envelope = await getEnvelope(row.documenso_envelope_id);
        documentId = extractCompletedEnvelopeDocumentId(envelope.raw);
      } catch (documensoError) {
        lastDocumensoError =
          documensoError instanceof Error ? documensoError.message : String(documensoError);
      }

      if (!documentId) {
        if (apply) {
          await repairFromStoredSignature(db, row, signedPath);
        }

        results.push({
          submissionId: row.id,
          patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
          mode: apply ? "applied" : "dry-run",
          strategy: "stored-signature-rebuild",
          previousPath: row.signed_pdf_path,
          nextPath: signedPath,
          documensoFallbackReason: lastDocumensoError ?? "completed_envelope_without_document_id",
          ivorisDocSynced: row.ivoris_doc_synced ?? null,
          ivorisDocumentId: row.ivoris_document_id ?? null,
        });
        continue;
      }

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

        await updateSubmissionPath(db, row, signedPath);
      }

      results.push({
        submissionId: row.id,
        patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
        mode: apply ? "applied" : "dry-run",
        strategy: "documenso-redownload",
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
