import assert from "node:assert/strict";
import test from "node:test";
import { reconcileLedgerTransaction } from "../../payment-ledger-reconciliation";
import { buildLedgerPatientCandidates, type LedgerCandidate } from "../../payment-ledger-matching";
import type { PatientAllocation } from "../../payment-ledger";

const tx = { id: "t", amountCents: 10000, existingPatientId: "p", existingMatchingStatus: "auto" };
const candidate: LedgerCandidate = { patientId: "p", amountCents: 10000, confidenceScore: 100,
  state: "confirmed_auto", evidence: [{ kind: "patient_number", value: "00001234", score: 100 }], reason: "test" };
const allocation: PatientAllocation = { id: "a", transactionId: "t", patientId: "p", amountCents: 10000,
  state: "confirmed_manual", confidenceScore: 100 };

test("only independently evidenced legacy agreement without history is ready", () => {
  assert.equal(reconcileLedgerTransaction(tx, [candidate], []).state, "ready");
  assert.equal(reconcileLedgerTransaction({ ...tx, existingPatientId: null }, [candidate], []).state, "needs_evidence");
  assert.equal(reconcileLedgerTransaction({ ...tx, existingMatchingStatus: "vorschlag" }, [candidate], []).state, "needs_evidence");
  assert.equal(reconcileLedgerTransaction(tx, [{ ...candidate, evidence: [{ kind: "exact_full_name", value: "Name", score: 75 }] }], []).state, "needs_evidence");
});

test("existing full allocation is covered, not imported again", () => {
  const result = reconcileLedgerTransaction(tx, [candidate], [allocation]);
  assert.equal(result.state, "covered");
  assert.equal(result.remainingCents, 0);
});

test("family split is counted once and partial allocations remain blocked", () => {
  const split = [ { ...allocation, amountCents: 4000 },
    { ...allocation, id: "b", patientId: "q", amountCents: 6000 } ];
  assert.equal(reconcileLedgerTransaction(tx, [], split).state, "covered");
  assert.equal(reconcileLedgerTransaction(tx, [], split.slice(0, 1)).state, "partial");
  assert.equal(reconcileLedgerTransaction(tx, [], [...split, { ...allocation, id: "c" }]).state, "overallocated");
});

test("reversal, rejection or pending decision is never resurrected", () => {
  for (const state of ["rejected", "candidate"] as const) {
    assert.equal(reconcileLedgerTransaction(tx, [candidate], [{ ...allocation, state }]).state, "prior_decision");
  }
  assert.equal(reconcileLedgerTransaction(tx, [candidate], [allocation,
    { ...allocation, id: "r", state: "reversed", reversalOfAllocationId: "a" }]).state, "prior_decision");
});

test("conflicts cannot become ready, including conflicts with booked allocations", () => {
  assert.equal(reconcileLedgerTransaction({ ...tx, existingPatientId: "q" }, [candidate], []).state, "conflict");
  assert.equal(reconcileLedgerTransaction(tx, [{ ...candidate, patientId: "q" }], [allocation]).state, "conflict");
  assert.equal(reconcileLedgerTransaction(tx, [candidate, { ...candidate, patientId: "q" }], [allocation]).state, "conflict");
  assert.equal(reconcileLedgerTransaction({ ...tx, amountCents: NaN }, [], []).state, "conflict");
});

test("invoice fragments inside longer numbers do not identify a patient", () => {
  const invoice = { id: "i", patientId: "p", invoiceNumber: "12345" };
  assert.deepEqual(buildLedgerPatientCandidates({ id: "t", amountCents: 100, purpose: "98712345678" }, [], [invoice]), []);
  assert.equal(buildLedgerPatientCandidates({ id: "t", amountCents: 100, purpose: "Rechnung 12345" }, [], [invoice])[0].patientId, "p");
});

test("a surname without given name and conflicting legacy identity cannot auto-confirm", () => {
  const patients = [{ id: "p", vorname: "", nachname: "Meyer" }];
  assert.deepEqual(buildLedgerPatientCandidates({ id: "t", amountCents: 100, purpose: "Meyer" }, patients, []), []);
  const result = buildLedgerPatientCandidates({ id: "t", amountCents: 100, purpose: "Anna Meyer", existingPatientId: "q" }, [{ ...patients[0], vorname: "Anna" }], []);
  assert.equal(result[0].state, "candidate");
});
