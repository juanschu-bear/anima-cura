import test from "node:test";
import assert from "node:assert/strict";
import {
  deterministicAnamnesisDocumentId,
  syncSignedAnamnesisToPatientDocuments,
} from "../patient-document-sync";
import { billingDocumentPath, billingDocumentUrl } from "../../billing-document-access";
import { decodePatientDocumentRecord } from "../../patient-document-types";

const submissionId = "00000000-0000-4000-8000-000000000101";
const patientId = "00000000-0000-4000-8000-000000000102";

function fixture(linkedPatient: string | null = patientId) {
  const state = {
    submission: {
      id: submissionId,
      patient_id: linkedPatient,
      matched_patient_id: linkedPatient,
      status: "signiert",
      signed_pdf_path: `${submissionId}/Anamnesebogen-signiert.pdf`,
      signiert_am: "2026-11-04T12:00:00.000Z",
    },
    document: null as null | Record<string, unknown>,
    downloads: [] as string[],
    uploads: [] as string[],
    bucketPublic: false,
  };

  const db = {
    from(table: string) {
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() {
          if (table === "anamnese_submissions") return { data: state.submission, error: null };
          if (table === "patient_documents") return { data: state.document, error: null };
          return { data: null, error: null };
        },
        async upsert(value: Record<string, unknown>) {
          state.document = value;
          return { error: null };
        },
      };
      return query;
    },
    storage: {
      async getBucket() { return { data: { public: state.bucketPublic }, error: null }; },
      async createBucket() { return { error: null }; },
      from(bucket: string) {
        return {
          async download(path: string) {
            state.downloads.push(`${bucket}:${path}`);
            return { data: new Blob(["%PDF-1.7\nsynthetic"]), error: null };
          },
          async upload(path: string) {
            state.uploads.push(`${bucket}:${path}`);
            return { error: null };
          },
        };
      },
    },
  };
  return { db, state };
}

test("Anamnesebogen document identity is deterministic per submission", () => {
  const first = deterministicAnamnesisDocumentId(submissionId);
  assert.equal(first, deterministicAnamnesisDocumentId(submissionId));
  assert.notEqual(first, deterministicAnamnesisDocumentId("00000000-0000-4000-8000-000000000103"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("unassigned signed submissions are not exposed as patient documents", async () => {
  const { db, state } = fixture(null);
  const result = await syncSignedAnamnesisToPatientDocuments(db as never, { id: submissionId });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "patient_unassigned");
  assert.equal(state.document, null);
  assert.deepEqual(state.downloads, []);
});

test("signed PDF is copied privately and linked exactly once", async () => {
  const { db, state } = fixture();
  const documentId = deterministicAnamnesisDocumentId(submissionId);
  const first = await syncSignedAnamnesisToPatientDocuments(db as never, { id: submissionId });
  assert.equal(first.skipped, false);
  assert.equal(state.uploads.length, 1);
  assert.equal(state.uploads[0], `billing-documents:${billingDocumentPath(patientId, documentId)}`);
  assert.equal(state.document?.patient_id, patientId);
  assert.equal(state.document?.file_url, billingDocumentUrl(documentId));
  assert.equal(state.document?.typ, "sonstiges");
  assert.match(String(state.document?.name), /^\[\[typ:anamnesebogen\]\]/);

  const second = await syncSignedAnamnesisToPatientDocuments(db as never, { id: submissionId });
  assert.equal(second.skipped, true);
  assert.equal(second.reason, "already_linked");
  assert.equal(state.uploads.length, 1);
});

test("a later patient assignment makes the existing signed form available", async () => {
  const { db, state } = fixture(null);
  assert.equal((await syncSignedAnamnesisToPatientDocuments(db as never, { id: submissionId })).reason, "patient_unassigned");
  state.submission.patient_id = patientId;
  state.submission.matched_patient_id = patientId;
  const linked = await syncSignedAnamnesisToPatientDocuments(db as never, { id: submissionId });
  assert.equal(linked.skipped, false);
  assert.equal(state.document?.patient_id, patientId);
});

test("Anamnesebogen document type is available in German and English", () => {
  const decoded = decodePatientDocumentRecord({
    id: "doc",
    name: "[[typ:anamnesebogen]] Anamnesebogen",
    typ: "sonstiges",
  });
  assert.equal(decoded.typ, "anamnesebogen");
  assert.equal(decoded.anzeige_typ_de, "Anamnesebogen");
  assert.equal(decoded.anzeige_typ_en, "Medical history form");
});
