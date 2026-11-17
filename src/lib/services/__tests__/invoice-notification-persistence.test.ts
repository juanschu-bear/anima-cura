import test from "node:test";
import assert from "node:assert/strict";
import { invoiceNotificationRows } from "../invoice-notification-persistence";

test("invoice notices persist by patient even when no portal account exists", () => {
  const patientA = "11111111-1111-4111-8111-111111111111";
  const patientB = "22222222-2222-4222-8222-222222222222";
  const input = { patientIds: [patientA, patientB, patientA], jobId: "33333333-3333-4333-8333-333333333333", title: "Rechnung", text: "Ihre Rechnung ist verfügbar." };
  const first = invoiceNotificationRows(input);
  const repeated = invoiceNotificationRows(input);
  assert.equal(first.length, 2);
  assert.deepEqual(first, repeated);
  assert.deepEqual(first.map(row => row.patient_id), [patientA, patientB]);
  assert.ok(first.every(row => row.id !== row.patient_id && row.typ === "eingang"));
});

test("different delivery jobs receive different durable notification ids", () => {
  const shared = { patientIds: ["11111111-1111-4111-8111-111111111111"], title: "Rechnung", text: "Ihre Rechnung ist verfügbar." };
  const a = invoiceNotificationRows({ ...shared, jobId: "33333333-3333-4333-8333-333333333333" });
  const b = invoiceNotificationRows({ ...shared, jobId: "44444444-4444-4444-8444-444444444444" });
  assert.notEqual(a[0].id, b[0].id);
});
