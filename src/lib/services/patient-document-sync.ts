import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
import {
  BILLING_DOCUMENTS_BUCKET,
  billingDocumentPath,
  billingDocumentUrl,
} from "@/lib/billing-document-access";
import { encodePatientDocumentName } from "@/lib/patient-document-types";

type DbClient = ReturnType<typeof createServerClient>;

const MAX_PDF_BYTES = 25 * 1024 * 1024;

type SignedSubmission = {
  id: string;
  patient_id: string | null;
  matched_patient_id: string | null;
  status: string | null;
  signed_pdf_path: string | null;
  signiert_am: string | null;
};

export function deterministicAnamnesisDocumentId(submissionId: string): string {
  const bytes = createHash("sha256")
    .update(`anima-cura:animasign-patient-document:v1:${submissionId}`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function bucketMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: string | number; message?: string };
  return String(value.statusCode ?? "") === "404" || /not found/i.test(value.message ?? "");
}

async function ensurePrivateDocumentBucket(db: DbClient) {
  const { data: bucket, error } = await db.storage.getBucket(BILLING_DOCUMENTS_BUCKET);
  if (bucket && !error) {
    if (bucket.public !== false) throw new Error("patient_document_bucket_not_private");
    return;
  }
  if (error && !bucketMissing(error)) {
    throw new Error(`patient_document_bucket_unavailable:${error.message}`);
  }
  const created = await db.storage.createBucket(BILLING_DOCUMENTS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_PDF_BYTES,
    allowedMimeTypes: ["application/pdf"],
  });
  if (created.error && !/already exists/i.test(created.error.message ?? "")) {
    throw new Error(`patient_document_bucket_create_failed:${created.error.message}`);
  }
}

function resolvedPatientId(submission: SignedSubmission) {
  return submission.matched_patient_id ?? submission.patient_id;
}

export async function syncSignedAnamnesisToPatientDocuments(
  db: DbClient,
  submission: {
    id: string;
    patient_id?: string | null;
    matched_patient_id?: string | null;
    nachname?: string | null;
    vorname?: string | null;
    signiert_am?: string | null;
  },
) {
  const { data, error } = await db
    .from("anamnese_submissions")
    .select("id,patient_id,matched_patient_id,status,signed_pdf_path,signiert_am")
    .eq("id", submission.id)
    .maybeSingle();
  if (error) throw new Error(`patient_document_submission_read_failed:${error.message}`);
  if (!data) return { ok: true as const, skipped: true as const, reason: "submission_missing" };

  const signedSubmission = data as SignedSubmission;
  const patientId = resolvedPatientId(signedSubmission);
  if (!patientId) {
    return { ok: true as const, skipped: true as const, reason: "patient_unassigned" };
  }
  if (!signedSubmission.signed_pdf_path) {
    return { ok: true as const, skipped: true as const, reason: "signed_pdf_missing" };
  }

  const documentId = deterministicAnamnesisDocumentId(signedSubmission.id);
  const fileUrl = billingDocumentUrl(documentId);
  const storagePath = billingDocumentPath(patientId, documentId);
  const { data: existing, error: existingError } = await db
    .from("patient_documents")
    .select("id,patient_id,file_url")
    .eq("id", documentId)
    .maybeSingle();
  if (existingError) throw new Error(`patient_document_read_failed:${existingError.message}`);
  if (existing && existing.patient_id === patientId && existing.file_url === fileUrl) {
    return { ok: true as const, skipped: true as const, reason: "already_linked", documentId };
  }

  const downloaded = await db.storage
    .from("anamnese-dokumente")
    .download(signedSubmission.signed_pdf_path);
  if (downloaded.error || !downloaded.data) {
    throw new Error(`patient_document_source_download_failed:${downloaded.error?.message ?? "missing"}`);
  }
  if (downloaded.data.size === 0 || downloaded.data.size > MAX_PDF_BYTES) {
    throw new Error("patient_document_source_size_invalid");
  }
  const pdf = Buffer.from(await downloaded.data.arrayBuffer());
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("patient_document_source_not_pdf");
  }

  await ensurePrivateDocumentBucket(db);
  const upload = await db.storage.from(BILLING_DOCUMENTS_BUCKET).upload(storagePath, pdf, {
    contentType: "application/pdf",
    cacheControl: "0",
    upsert: true,
  });
  if (upload.error) throw new Error(`patient_document_upload_failed:${upload.error.message}`);

  const linkedAt = signedSubmission.signiert_am ?? new Date().toISOString();
  const upsert = await db.from("patient_documents").upsert({
    id: documentId,
    patient_id: patientId,
    name: encodePatientDocumentName("Anamnesebogen", "anamnesebogen"),
    typ: "sonstiges",
    file_url: fileUrl,
    hochgeladen_am: linkedAt,
  }, { onConflict: "id" });
  if (upsert.error) throw new Error(`patient_document_link_failed:${upsert.error.message}`);

  return { ok: true as const, skipped: false as const, documentId, storagePath };
}
