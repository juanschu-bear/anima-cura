import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildBillingPublishRecord,
  deterministicBillingUuid,
  parseBillingCaseKey,
  publishBillingManifest,
  validateBillingManifest,
  verifyBillingPdf,
} from "../../billing-publish";

const pdf = Buffer.from("%PDF-1.4\n%%EOF\n", "ascii");
const row = {
  case_key: "2026-Q3:bema:00003728:1",
  file: "/private/example.pdf",
  draft_pages: 1,
  total_pages: 1,
  patient_id: "1ab0dc07-6209-44c1-bd56-ee5098ddc22e",
  sha256: createHash("sha256").update(pdf).digest("hex"),
  cents: 1592,
  published: false,
};

test("billing case keys are parsed without guessing patient data", () => {
  assert.deepEqual(parseBillingCaseKey(row.case_key), {
    year: 2026,
    quarter: 3,
    schedule: "BEMA",
    patientNumber: "00003728",
    sequence: 1,
  });
  assert.throws(() => parseBillingCaseKey("2026-Q5:bema:1:1"));
});

test("billing ids are stable and distinct per purpose", () => {
  const documentId = deterministicBillingUuid("document", row.case_key);
  assert.match(documentId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(documentId, deterministicBillingUuid("document", row.case_key));
  assert.notEqual(documentId, deterministicBillingUuid("notification", row.case_key));
});

test("publish records use the private document route and visible invoice type", () => {
  const record = buildBillingPublishRecord(row);
  assert.equal(record.storagePath, `${row.patient_id}/${record.documentId}.pdf`);
  assert.equal(record.fileUrl, `/api/patient/dokumente/${record.documentId}/datei`);
  assert.match(record.documentName, /^\[\[typ:rechnung\]\] Rechnung 3\/2026/);
  assert.match(record.notificationTitle, /Rechnung 3\/2026/);
});

test("manifest and PDF verification reject duplicates and changed files", () => {
  const manifest = {
    audit_at: "2026-10-12T20:15:55.092Z",
    issued: 0,
    published: 0,
    rows: [row],
  };
  assert.equal(validateBillingManifest(manifest).rows.length, 1);
  assert.equal(validateBillingManifest({ ...manifest, rows: [{ ...row, total_pages: 4 }] }).rows.length, 1);
  verifyBillingPdf(row, pdf);
  assert.throws(() => validateBillingManifest({ ...manifest, rows: [row, row] }), /Duplicate/);
  assert.throws(() => verifyBillingPdf(row, Buffer.from("%PDF-changed")), /checksum/);
});

test("draft manifests can never be applied to patient portals", async () => {
  const manifest = validateBillingManifest({
    audit_at: "2026-10-12T20:15:55.092Z",
    issued: 0,
    published: 0,
    rows: [row],
  });
  await assert.rejects(
    publishBillingManifest({ db: {} as SupabaseClient, manifest, apply: true }),
    /not marked as fully issued/,
  );
});
