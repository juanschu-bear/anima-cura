import { createHash } from "node:crypto";
import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { anamneseFormJson } from "@/lib/forms/anamnese-form";
import {
  appendReservedSignaturePage,
  stampStoredSignatureOnReservedPage,
} from "@/lib/animasign/pdf-layout";
import { signPdfWithP12 } from "@/lib/animasign/x509-signing";
import { createServerClient } from "@/lib/db/supabase";
import { syncAnimaSignSubmission } from "@/lib/services/animasign-ivoris-sync";
import { syncSignedAnamnesisToPatientDocuments } from "@/lib/services/patient-document-sync";

type DbClient = ReturnType<typeof createServerClient>;

export const FORM_SIGNATURE_FINALIZATION_FLAG =
  "ANIMASIGN_FORM_SIGNATURE_FINALIZATION_ENABLED";

export type CertificateFacts = {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  fingerprintSha256: string;
};

export type FormSignatureFinalizationArtifacts = {
  signedPdf: Buffer;
  signatureSha256: string;
  pdfSha256: string;
  sealedPdfSha256: string;
  certificate: CertificateFacts;
  signaturePage: number;
};

export type FormSignatureFinalizationRecord = {
  submissionId: string;
  submittedAt: string;
  formVersion: string;
  signatureSha256: string;
  pdfSha256: string;
  sealedPdfSha256: string;
  location: string;
  signedDate: string;
  certificate: CertificateFacts;
};

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function compactDistinguishedName(attributes: forge.pki.CertificateField[]) {
  return attributes
    .map((attribute) => `${attribute.shortName ?? attribute.name ?? attribute.type}=${attribute.value}`)
    .join(", ");
}

function signatureBytes(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/(?:png|jpe?g);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error("form_signature_invalid");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length === 0) throw new Error("form_signature_empty");
  return bytes;
}

export function isFormSignatureFinalizationEnabled(
  value = process.env[FORM_SIGNATURE_FINALIZATION_FLAG],
) {
  return value?.trim().toLowerCase() === "true";
}

export function buildAnimaSignFormVersion(renderSchema: unknown) {
  return `sha256:${sha256(stableJson({ form: anamneseFormJson, renderSchema: renderSchema ?? null }))}`;
}

export function readCertificateFacts(params: {
  certificate: Buffer;
  passphrase: string;
}): CertificateFacts {
  const p12Asn1 = forge.asn1.fromDer(params.certificate.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, params.passphrase);
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certificate = bags[forge.pki.oids.certBag]?.find((bag) => bag.cert)?.cert;
  if (!certificate) throw new Error("practice_certificate_missing");

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  return {
    subject: compactDistinguishedName(certificate.subject.attributes),
    issuer: compactDistinguishedName(certificate.issuer.attributes),
    serialNumber: certificate.serialNumber,
    validFrom: certificate.validity.notBefore.toISOString(),
    validTo: certificate.validity.notAfter.toISOString(),
    fingerprintSha256: sha256(Buffer.from(der, "binary")),
  };
}

export async function buildFormSignatureFinalizationArtifacts(params: {
  renderedPdf: Buffer;
  patientName: string;
  signatureDataUrl: string;
  location: string;
  signedDate: string;
  submittedAt: string;
  certificate: Buffer;
  passphrase: string;
}): Promise<FormSignatureFinalizationArtifacts> {
  const location = params.location.trim();
  const signedDate = params.signedDate.trim();
  if (!location) throw new Error("form_signature_location_missing");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signedDate)) {
    throw new Error("form_signature_date_invalid");
  }

  const rawSignature = signatureBytes(params.signatureDataUrl);
  const prepared = await appendReservedSignaturePage(
    params.renderedPdf,
    params.patientName,
    "stored-form-signature",
  );
  const completedPdf = await stampStoredSignatureOnReservedPage({
    unsignedPdf: prepared.pdfBuffer,
    signatureDataUrl: params.signatureDataUrl,
    signedAt: params.submittedAt,
    signedDateText: signedDate,
    ort: location,
  });

  // Re-open before hashing and sealing. A malformed PDF must never be recorded
  // as a completed form-signature document.
  const reopened = await PDFDocument.load(completedPdf);
  if (reopened.getPageCount() !== prepared.signaturePage) {
    throw new Error("form_signature_pdf_page_mismatch");
  }

  const pdfSha256 = sha256(completedPdf);
  const certificate = readCertificateFacts({
    certificate: params.certificate,
    passphrase: params.passphrase,
  });
  const signedPdf = await signPdfWithP12({
    pdf: completedPdf,
    certificate: params.certificate,
    passphrase: params.passphrase,
    metadata: {
      reason: "Anamnesebogen mit gespeicherter Formularunterschrift abgeschlossen",
      contactInfo: "praxis@praxis-schubert.de",
      name: "KFO-Praxis Dr. Maria Elena Schubert",
      location,
    },
  });

  // The certificate seal must be the final PDF mutation. Loading it here only
  // validates the completed byte stream; it does not save or modify it again.
  await PDFDocument.load(signedPdf);

  return {
    signedPdf,
    signatureSha256: sha256(rawSignature),
    pdfSha256,
    sealedPdfSha256: sha256(signedPdf),
    certificate,
    signaturePage: prepared.signaturePage,
  };
}

function scheduleFastRetryAt() {
  return new Date(Date.now() + 5 * 60_000).toISOString();
}

export async function persistFormSignatureFinalization(params: {
  db: DbClient;
  record: FormSignatureFinalizationRecord;
  signedPdf: Buffer;
  patient: {
    patientId?: string | null;
    matchedPatientId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
}) {
  const { db, record } = params;
  const signedPath = `${record.submissionId}/Anamnesebogen-signiert.pdf`;
  const { error: uploadError } = await db.storage
    .from("anamnese-dokumente")
    .upload(signedPath, params.signedPdf, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) throw new Error(`form_signature_storage_failed:${uploadError.message}`);

  const protocolRow = {
    submission_id: record.submissionId,
    submitted_at: record.submittedAt,
    form_version: record.formVersion,
    signature_sha256: record.signatureSha256,
    pdf_sha256: record.pdfSha256,
    sealed_pdf_sha256: record.sealedPdfSha256,
    abschluss_ort: record.location,
    abschluss_datum: record.signedDate,
    certificate_subject: record.certificate.subject,
    certificate_issuer: record.certificate.issuer,
    certificate_serial_number: record.certificate.serialNumber,
    certificate_valid_from: record.certificate.validFrom,
    certificate_valid_to: record.certificate.validTo,
    certificate_fingerprint_sha256: record.certificate.fingerprintSha256,
  };
  const { error: protocolError } = await db
    .from("animasign_finalization_records")
    .insert(protocolRow);

  if (protocolError) {
    const { data: existing, error: existingError } = await db
      .from("animasign_finalization_records")
      .select("signature_sha256,pdf_sha256,sealed_pdf_sha256")
      .eq("submission_id", record.submissionId)
      .maybeSingle();
    if (
      existingError ||
      !existing ||
      existing.signature_sha256 !== record.signatureSha256 ||
      existing.pdf_sha256 !== record.pdfSha256 ||
      existing.sealed_pdf_sha256 !== record.sealedPdfSha256
    ) {
      throw new Error(`form_signature_protocol_failed:${protocolError.message}`);
    }
  }

  const { error: completionError } = await db
    .from("anamnese_submissions")
    .update({
      status: "signiert",
      signed_pdf_path: signedPath,
      signiert_am: record.submittedAt,
      fehler_text: null,
    })
    .eq("id", record.submissionId)
    .is("signed_pdf_path", null);
  if (completionError) {
    throw new Error(`form_signature_completion_failed:${completionError.message}`);
  }

  await syncSignedAnamnesisToPatientDocuments(db, {
    id: record.submissionId,
    patient_id: params.patient.patientId,
    matched_patient_id: params.patient.matchedPatientId,
    vorname: params.patient.firstName,
    nachname: params.patient.lastName,
    signiert_am: record.submittedAt,
  });

  try {
    const syncResult = await syncAnimaSignSubmission(record.submissionId, {
      db,
      stages: ["document"],
      stageOverrides: {
        document: { attemptNo: 0, retryCountOnFailure: 0 },
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
        .eq("id", record.submissionId);
    }
  } catch (error) {
    await db
      .from("anamnese_submissions")
      .update({
        ivoris_sync_error: error instanceof Error ? error.message : String(error),
        ivoris_doc_retry_count: 0,
        ivoris_doc_next_retry_at: scheduleFastRetryAt(),
        ivoris_doc_failed_permanently: false,
      })
      .eq("id", record.submissionId);
  }

  return { signedPath };
}
