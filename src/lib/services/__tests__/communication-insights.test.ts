import test from "node:test";
import assert from "node:assert/strict";
import { linkedPatientIds, mailEvidence, invoiceOpenedAt, inboundContact, inertEmailDocument, type DispatchMessage } from "../../communication-insights";

const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
const message = { id: a, patient_id: a, status: "clicked", created_at: "2026-10-15T00:00:00Z", sent_at: "2026-10-15T00:01:00Z", events: [], portalEvents: [] } as unknown as DispatchMessage;

test("family messages include all explicitly linked patients, without duplicates or untrusted IDs", () => {
  assert.deepEqual(linkedPatientIds({ patient_id: a, metadata: { patientIds: [a, b, null, 'x),id.neq.anything'] } }), [a, b]);
  assert.deepEqual(linkedPatientIds({ patient_id: null, metadata: { patientIds: [a, b] } }), [a, b]);
});
test("accepted is not delivered; clicked is neither proof of email opening nor delivery", () => {
  assert.equal(mailEvidence(message, "accepted"), message.sent_at);
  assert.equal(mailEvidence(message, "delivered"), null);
  assert.equal(mailEvidence(message, "opened"), null);
  assert.equal(mailEvidence({ ...message, events: [{ id: a, event_type: "opened", occurred_at: "2026-10-15T10:00:00Z", source: "pixel" }] }, "opened"), "2026-10-15T10:00:00Z");
});
test("generic documents tab and another invoice are not evidence for this PDF", () => {
  const base = { patient_id: a, created_at: "2026-10-15T10:00:00Z" };
  assert.equal(invoiceOpenedAt(a, [{ ...base, event_type: "document_view", metadata: { documentId: a } }]), null);
  assert.equal(invoiceOpenedAt(a, [{ ...base, event_type: "invoice_document_opened", metadata: { documentId: b, source: "authenticated_document_delivery" } }]), null);
  assert.equal(invoiceOpenedAt(a, [{ ...base, event_type: "invoice_document_opened", metadata: { documentId: a, source: "authenticated_document_delivery" } }]), base.created_at);
});
test("support audit distinguishes incoming messages, automatic response and manual escalation", () => {
  assert.equal(inboundContact({ id: a, status: "success", started_at: "now", result: { sender: " Test@example.org ", ignored: true } }), null);
  const result = inboundContact({ id: a, status: "success", started_at: "now", result: { sender: " Test@example.org ", manualReview: true, practiceNotified: true } });
  assert.equal(result?.sender, "test@example.org");
  assert.equal(result?.autoReplied, false);
  assert.equal(result?.practiceNotified, true);
});
test("email preview removes tracking and navigation and applies restrictive CSP", () => {
  const html = inertEmailDocument('<meta http-equiv="refresh" content="0;url=https://bad.example"><script>alert(1)</script><img src="https://x.test/pixel" srcset="https://x.test/other 2x"><a href="https://x.test/click" onclick="alert(1)">Invoice</a><style>body{background:url(https://x.test/css)}</style>');
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("img-src 'none'"));
  assert.doesNotMatch(html, /<script|onclick=|src=|href=|http-equiv="refresh"/i);
  assert.ok(html.includes("Invoice"));
});
