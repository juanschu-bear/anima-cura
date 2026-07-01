import test from "node:test";
import assert from "node:assert/strict";
import { extractCompletedEnvelopeDocumentId } from "../animasign-signature-reconciliation";

test("extracts document id from documents array", () => {
  const documentId = extractCompletedEnvelopeDocumentId({
    id: "envelope_123",
    status: "COMPLETED",
    documents: [{ id: 98765, title: "Anamnesebogen" }],
  });

  assert.equal(documentId, 98765);
});

test("extracts nested documentId field before unrelated numeric ids", () => {
  const documentId = extractCompletedEnvelopeDocumentId({
    recipients: [{ id: 11, token: "abc" }],
    meta: {
      documentId: 54321,
    },
  });

  assert.equal(documentId, 54321);
});

test("returns null when no document reference exists", () => {
  const documentId = extractCompletedEnvelopeDocumentId({
    id: "envelope_123",
    status: "PENDING",
    recipients: [{ id: 11 }],
  });

  assert.equal(documentId, null);
});
