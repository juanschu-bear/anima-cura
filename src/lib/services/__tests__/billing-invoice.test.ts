import assert from "node:assert/strict";
import test from "node:test";
import { buildIssuedInvoicePdf, invoiceSnapshot, issueInvoiceCommand } from "../../billing-invoice";

const snapshot = {
  invoiceNumber: "AC-2026-000001", issueDate: "2026-10-24", dueDate: "2026-11-07",
  patientId: "1ab0dc07-6209-44c1-bd56-ee5098ddc22e", patientName: "Erika Mustermann", patientNumber: "00001234",
  periodFrom: "2026-07-01", periodTo: "2026-09-30", payerModel: "statutory_share", patientShareBasisPoints: 2000,
  shareSourceReference: "Kassenvertrag vom 01.07.2026", grossCents: 7960, totalCents: 1592,
  lines: [{ versionId: "21b0dc07-6209-44c1-bd56-ee5098ddc22e", serviceDate: "2026-09-10", schedule: "BEMA",
    code: "119", description: "Kieferorthopädische Behandlung", quantity: 1, factor: null, grossCents: 7960, justification: null }],
};

test("invoice command requires an approved payer version, due date and reason", () => {
  assert.equal(issueInvoiceCommand.safeParse({ action: "issue_invoice", payerVersionId: snapshot.lines[0].versionId, dueDate: snapshot.dueDate, reason: "Geprüfte Quartalsrechnung" }).success, true);
  assert.equal(issueInvoiceCommand.safeParse({ action: "issue_invoice", payerVersionId: snapshot.lines[0].versionId, dueDate: snapshot.dueDate, reason: "" }).success, false);
});

test("issued invoice PDF is deterministic in content and bound to a validated snapshot", async () => {
  assert.equal(invoiceSnapshot.parse(snapshot).totalCents, 1592);
  const result = await buildIssuedInvoicePdf(snapshot);
  assert.equal(result.pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.snapshot.invoiceNumber, snapshot.invoiceNumber);
});

test("invoice snapshot rejects totals, numbering or empty services that cannot form a receivable", () => {
  assert.equal(invoiceSnapshot.safeParse({ ...snapshot, totalCents: 0 }).success, false);
  assert.equal(invoiceSnapshot.safeParse({ ...snapshot, invoiceNumber: "draft-1" }).success, false);
  assert.equal(invoiceSnapshot.safeParse({ ...snapshot, lines: [] }).success, false);
  assert.equal(invoiceSnapshot.safeParse({ ...snapshot, grossCents: 7000 }).success, false);
  assert.equal(invoiceSnapshot.safeParse({ ...snapshot, totalCents: 1500 }).success, false);
});
