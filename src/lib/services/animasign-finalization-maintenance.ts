import { createServerClient } from "@/lib/db/supabase";
import { validateIntakeAnswers } from "@/lib/services/intake-required-fields";
import {
  buildAnimaSignFormVersion,
  buildFormSignatureFinalizationArtifacts,
  persistFormSignatureFinalization,
} from "@/lib/services/animasign-form-signature-finalization";

type DbClient = ReturnType<typeof createServerClient>;

type FinalizationRow = {
  id: string;
  created_at: string;
  status: string;
  signed_pdf_path: string | null;
  vorname: string | null;
  nachname: string | null;
  answers: Record<string, unknown> | null;
  patient_id: string | null;
  matched_patient_id: string | null;
};

function requiredString(value: unknown, code: string) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(code);
  return value.trim();
}

async function renderSubmissionPdf(answers: Record<string, unknown>) {
  const baseUrl = process.env.ANIMASIGN_PDF_URL;
  const apiKey = process.env.ANIMASIGN_PDF_KEY;
  if (!baseUrl || !apiKey) throw new Error("animasign_pdf_service_not_configured");

  const response = await fetch(`${baseUrl}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ answers, schema: null, filename: "Anamnesebogen.pdf" }),
  });
  if (!response.ok) throw new Error(`animasign_pdf_service_${response.status}`);
  const pdf = Buffer.from(await response.arrayBuffer());
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("animasign_pdf_service_invalid_pdf");
  }
  return pdf;
}

export async function finalizeExistingFormSubmission(
  db: DbClient,
  submissionId: string,
) {
  const { data, error } = await db
    .from("anamnese_submissions")
    .select("id,created_at,status,signed_pdf_path,vorname,nachname,answers,patient_id,matched_patient_id")
    .eq("id", submissionId)
    .single();
  if (error || !data) throw new Error(`animasign_submission_missing:${error?.message ?? submissionId}`);

  const row = data as FinalizationRow;
  if (row.signed_pdf_path) return { ok: true as const, skipped: "already_finalized" as const };
  if (!["offen", "signatur_ausstehend", "fehler"].includes(row.status)) {
    throw new Error(`animasign_submission_status_invalid:${row.status}`);
  }

  const answers = row.answers ?? {};
  const missing = validateIntakeAnswers(answers);
  if (missing.length) {
    throw new Error(`animasign_required_fields_missing:${missing.join(",")}`);
  }
  const signatureDataUrl = requiredString(
    answers.unterschrift_versicherter ?? answers.unterschrift_sig1,
    "animasign_signature_missing",
  );
  const location = requiredString(answers.abschluss_ort, "animasign_location_missing");
  const signedDate = requiredString(answers.abschluss_datum, "animasign_date_missing");
  const certBase64 = process.env.PDF_SIGNING_CERT;
  const passphrase = process.env.PDF_SIGNING_PASSPHRASE;
  if (!certBase64 || !passphrase) throw new Error("animasign_certificate_not_configured");

  const renderedPdf = await renderSubmissionPdf(answers);
  const patientName = [row.vorname, row.nachname].filter(Boolean).join(" ").trim() || "Patient";
  const artifacts = await buildFormSignatureFinalizationArtifacts({
    renderedPdf,
    patientName,
    signatureDataUrl,
    location,
    signedDate,
    submittedAt: row.created_at,
    certificate: Buffer.from(certBase64, "base64"),
    passphrase,
  });
  const persisted = await persistFormSignatureFinalization({
    db,
    signedPdf: artifacts.signedPdf,
    record: {
      submissionId: row.id,
      submittedAt: row.created_at,
      formVersion: buildAnimaSignFormVersion(null),
      signatureSha256: artifacts.signatureSha256,
      pdfSha256: artifacts.pdfSha256,
      sealedPdfSha256: artifacts.sealedPdfSha256,
      location,
      signedDate,
      certificate: artifacts.certificate,
    },
    patient: {
      patientId: row.patient_id,
      matchedPatientId: row.matched_patient_id,
      firstName: row.vorname,
      lastName: row.nachname,
    },
  });
  return { ok: true as const, skipped: null, signedPath: persisted.signedPath };
}
