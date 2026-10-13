import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  BILLING_DOCUMENTS_BUCKET,
  billingDocumentPath,
  billingDocumentUrl,
} from "./billing-document-access";
import { t } from "./i18n";
import { encodePatientDocumentName } from "./patient-document-types";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const QUERY_CHUNK_SIZE = 150;
const WRITE_CONCURRENCY = 8;

const manifestRowSchema = z.object({
  case_key: z.string().min(1),
  file: z.string().min(1),
  draft_pages: z.number().int().positive().optional(),
  total_pages: z.number().int().positive().optional(),
  patient_id: z.string().uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  cents: z.number().int().positive(),
  published: z.boolean().optional(),
});

const manifestSchema = z.object({
  audit_at: z.string().datetime(),
  issued: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
  rows: z.array(manifestRowSchema).min(1),
});

export type BillingManifestRow = z.infer<typeof manifestRowSchema>;
export type BillingManifest = z.infer<typeof manifestSchema>;

export type ParsedBillingCaseKey = {
  year: number;
  quarter: number;
  schedule: "BEMA" | "GOZ";
  patientNumber: string;
  sequence: number;
};

export type BillingPublishRecord = {
  row: BillingManifestRow;
  parsed: ParsedBillingCaseKey;
  documentId: string;
  notificationId: string;
  storagePath: string;
  fileUrl: string;
  documentName: string;
  notificationTitle: string;
  notificationBody: string;
};

export type BillingPublishSummary = {
  apply: boolean;
  total: number;
  patients: number;
  bucketReady: boolean;
  bucketCreated: boolean;
  documentsCreated: number;
  documentsUpdated: number;
  notificationsCreated: number;
  notificationsExisting: number;
};

export function parseBillingCaseKey(caseKey: string): ParsedBillingCaseKey {
  const match = /^(\d{4})-Q([1-4]):(bema|goz):(\d{1,16}):([1-9]\d*)$/i.exec(caseKey);
  if (!match) throw new Error(`Invalid billing case key: ${caseKey}`);
  return {
    year: Number(match[1]),
    quarter: Number(match[2]),
    schedule: match[3].toUpperCase() as "BEMA" | "GOZ",
    patientNumber: match[4],
    sequence: Number(match[5]),
  };
}

export function deterministicBillingUuid(kind: "document" | "notification", caseKey: string): string {
  const bytes = createHash("sha256")
    .update(`anima-cura:billing-publish:v1:${kind}:${caseKey}`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatAmount(cents: number, locale = "de-DE") {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function buildBillingPublishRecord(row: BillingManifestRow): BillingPublishRecord {
  const parsed = parseBillingCaseKey(row.case_key);
  const documentId = deterministicBillingUuid("document", row.case_key);
  const quarter = `${parsed.quarter}/${parsed.year}`;
  const amount = formatAmount(row.cents);
  const visibleName = t("billing.publish.documentName", "de", {
    quarter,
    schedule: parsed.schedule,
    amount,
  });
  return {
    row,
    parsed,
    documentId,
    notificationId: deterministicBillingUuid("notification", row.case_key),
    storagePath: billingDocumentPath(row.patient_id, documentId),
    fileUrl: billingDocumentUrl(documentId),
    documentName: encodePatientDocumentName(visibleName, "rechnung"),
    notificationTitle: t("billing.publish.notificationTitle", "de", { quarter }),
    notificationBody: t("billing.publish.notificationBody", "de", { quarter }),
  };
}

export function validateBillingManifest(input: unknown): BillingManifest {
  const manifest = manifestSchema.parse(input);
  const caseKeys = new Set<string>();
  const documentIds = new Set<string>();
  for (const row of manifest.rows) {
    const record = buildBillingPublishRecord(row);
    if (caseKeys.has(row.case_key)) throw new Error(`Duplicate billing case key: ${row.case_key}`);
    if (documentIds.has(record.documentId)) throw new Error(`Duplicate billing document id: ${record.documentId}`);
    if (row.draft_pages !== undefined && row.draft_pages !== 1) {
      throw new Error(`Generated billing cover must contain exactly one page: ${row.case_key}`);
    }
    if (row.total_pages !== undefined && row.draft_pages !== undefined && row.total_pages < row.draft_pages) {
      throw new Error(`Billing PDF page count is inconsistent: ${row.case_key}`);
    }
    caseKeys.add(row.case_key);
    documentIds.add(record.documentId);
  }
  return manifest;
}

export function verifyBillingPdf(row: BillingManifestRow, pdf: Buffer) {
  if (pdf.length === 0 || pdf.length > MAX_PDF_BYTES) {
    throw new Error(`Invalid billing PDF size: ${row.case_key}`);
  }
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`Billing file is not a PDF: ${row.case_key}`);
  }
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  if (sha256 !== row.sha256.toLowerCase()) {
    throw new Error(`Billing PDF checksum mismatch: ${row.case_key}`);
  }
}

async function mapWithConcurrency<T, R>(
  input: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(input.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, input.length) }, async () => {
    while (cursor < input.length) {
      const index = cursor++;
      results[index] = await handler(input[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function chunks<T>(input: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < input.length; index += size) result.push(input.slice(index, index + size));
  return result;
}

async function loadByIds(
  db: SupabaseClient,
  table: "patients" | "patient_documents" | "patient_notifications",
  ids: string[],
  columns: string,
) {
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunks(ids, QUERY_CHUNK_SIZE)) {
    const { data, error } = await db.from(table).select(columns).in("id", chunk);
    if (error) throw new Error(`Billing preflight failed for ${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return rows;
}

function bucketMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: string | number; message?: string };
  return String(value.statusCode ?? "") === "404" || /not found/i.test(value.message ?? "");
}

async function ensurePrivateBillingBucket(db: SupabaseClient, apply: boolean) {
  const { data: bucket, error } = await db.storage.getBucket(BILLING_DOCUMENTS_BUCKET);
  if (bucket && !error) {
    if (bucket.public === false) return { ready: true, created: false };
    if (!apply) return { ready: false, created: false };
    const updated = await db.storage.updateBucket(BILLING_DOCUMENTS_BUCKET, {
      public: false,
      fileSizeLimit: MAX_PDF_BYTES,
      allowedMimeTypes: ["application/pdf"],
    });
    if (updated.error) throw new Error(`Private billing bucket update failed: ${updated.error.message}`);
    return { ready: true, created: false };
  }
  if (error && !bucketMissing(error)) {
    throw new Error(`Billing bucket preflight failed: ${error.message}`);
  }
  if (!apply) return { ready: false, created: false };
  const created = await db.storage.createBucket(BILLING_DOCUMENTS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_PDF_BYTES,
    allowedMimeTypes: ["application/pdf"],
  });
  if (created.error) throw new Error(`Private billing bucket creation failed: ${created.error.message}`);
  return { ready: true, created: true };
}

export async function publishBillingManifest(options: {
  db: SupabaseClient;
  manifest: BillingManifest;
  apply: boolean;
  onProgress?: (completed: number, total: number) => void;
}): Promise<BillingPublishSummary> {
  const { db, manifest, apply, onProgress } = options;
  const records = manifest.rows.map(buildBillingPublishRecord);
  if (apply && manifest.issued !== records.length) {
    throw new Error("Billing publication blocked: the manifest is not marked as fully issued");
  }
  const patientIds = Array.from(new Set(records.map(record => record.row.patient_id)));
  const documentIds = records.map(record => record.documentId);
  const notificationIds = records.map(record => record.notificationId);

  await mapWithConcurrency(records, WRITE_CONCURRENCY, async record => {
    const pdf = await readFile(record.row.file);
    verifyBillingPdf(record.row, pdf);
    return pdf.length;
  });

  const patientRows = await loadByIds(db, "patients", patientIds, "id");
  const foundPatients = new Set(patientRows.map(row => String(row.id)));
  const missingPatients = patientIds.filter(id => !foundPatients.has(id));
  if (missingPatients.length) {
    throw new Error(`${missingPatients.length} invoice recipients do not exist in the patient database`);
  }

  const existingDocuments = await loadByIds(
    db,
    "patient_documents",
    documentIds,
    "id,patient_id,file_url,hochgeladen_am",
  );
  const documentsById = new Map(existingDocuments.map(row => [String(row.id), row]));
  const existingNotifications = await loadByIds(
    db,
    "patient_notifications",
    notificationIds,
    "id,patient_id",
  );
  const notificationsById = new Map(existingNotifications.map(row => [String(row.id), row]));

  for (const record of records) {
    const document = documentsById.get(record.documentId);
    const notification = notificationsById.get(record.notificationId);
    if (document && document.patient_id !== record.row.patient_id) {
      throw new Error(`Billing document ownership conflict: ${record.row.case_key}`);
    }
    if (document && document.file_url !== record.fileUrl) {
      throw new Error(`Billing document URL conflict: ${record.row.case_key}`);
    }
    if (notification && notification.patient_id !== record.row.patient_id) {
      throw new Error(`Billing notification ownership conflict: ${record.row.case_key}`);
    }
  }

  const bucket = await ensurePrivateBillingBucket(db, apply);
  if (!apply) {
    return {
      apply: false,
      total: records.length,
      patients: patientIds.length,
      bucketReady: bucket.ready,
      bucketCreated: false,
      documentsCreated: records.length - existingDocuments.length,
      documentsUpdated: existingDocuments.length,
      notificationsCreated: records.length - existingNotifications.length,
      notificationsExisting: existingNotifications.length,
    };
  }

  let completed = 0;
  let documentsCreated = 0;
  let documentsUpdated = 0;
  let notificationsCreated = 0;
  await mapWithConcurrency(records, WRITE_CONCURRENCY, async record => {
    const existingDocument = documentsById.get(record.documentId);
    const pdf = await readFile(record.row.file);
    verifyBillingPdf(record.row, pdf);
    const upload = await db.storage.from(BILLING_DOCUMENTS_BUCKET).upload(record.storagePath, pdf, {
      contentType: "application/pdf",
      cacheControl: "0",
      upsert: true,
    });
    if (upload.error) throw new Error(`Billing PDF upload failed: ${record.row.case_key}: ${upload.error.message}`);
    const document = await db.from("patient_documents").upsert({
      id: record.documentId,
      patient_id: record.row.patient_id,
      name: record.documentName,
      typ: "ratenzahlung",
      file_url: record.fileUrl,
      hochgeladen_am: existingDocument?.hochgeladen_am ?? new Date().toISOString(),
    }, { onConflict: "id" });
    if (document.error) throw new Error(`Billing document link failed: ${record.row.case_key}: ${document.error.message}`);
    if (existingDocument) documentsUpdated += 1;
    else documentsCreated += 1;

    if (!notificationsById.has(record.notificationId)) {
      const notification = await db.from("patient_notifications").insert({
        id: record.notificationId,
        patient_id: record.row.patient_id,
        typ: "eingang",
        titel: record.notificationTitle,
        text: record.notificationBody,
        gelesen: false,
      });
      if (notification.error) {
        throw new Error(`Billing notification failed: ${record.row.case_key}: ${notification.error.message}`);
      }
      notificationsCreated += 1;
    }
    completed += 1;
    onProgress?.(completed, records.length);
  });

  return {
    apply: true,
    total: records.length,
    patients: patientIds.length,
    bucketReady: bucket.ready,
    bucketCreated: bucket.created,
    documentsCreated,
    documentsUpdated,
    notificationsCreated,
    notificationsExisting: existingNotifications.length,
  };
}
