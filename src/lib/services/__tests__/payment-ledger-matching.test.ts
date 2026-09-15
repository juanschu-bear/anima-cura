import assert from "node:assert/strict";
import test from "node:test";

import { buildLedgerPatientCandidates } from "../../payment-ledger-matching";

const patients = [
  { id: "p1", ivorisNummer: "00007919", vorname: "Anna", nachname: "Meyer" },
  { id: "p2", ivorisNummer: "00007920", vorname: "Lisa", nachname: "Meyer" },
];

test("unique patient number confirms the whole payment", () => {
  const result = buildLedgerPatientCandidates({
    id: "t1", amountCents: 45_220, purpose: "KFO 00007919", senderName: "Familie Meyer",
  }, patients, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].patientId, "p1");
  assert.equal(result[0].state, "confirmed_auto");
  assert.equal(result[0].confidenceScore, 100);
  assert.equal(result[0].amountCents, 45_220);
});

test("unique exact full name reaches the 75 percent threshold", () => {
  const result = buildLedgerPatientCandidates({
    id: "t1", amountCents: 10_000, purpose: "Rate Anna Meyer",
  }, patients, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].state, "confirmed_auto");
  assert.equal(result[0].confidenceScore, 75);
});

test("two children named in one transfer remain split candidates", () => {
  const result = buildLedgerPatientCandidates({
    id: "t1", amountCents: 20_000, purpose: "Anna Meyer und Lisa Meyer",
  }, patients, []);
  assert.equal(result.length, 2);
  assert.ok(result.every((candidate) => candidate.state === "candidate"));
});

test("invoice reference identifies its patient independently of sender", () => {
  const result = buildLedgerPatientCandidates({
    id: "t1", amountCents: 12_000, purpose: "00007919-2/2026-1", senderName: "Dritte Person",
  }, patients, [{ id: "i1", patientId: "p1", reference: "00007919-2/2026-1" }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].patientId, "p1");
  assert.equal(result[0].confidenceScore, 100);
  assert.equal(result[0].state, "confirmed_auto");
});

test("existing legacy match alone is not treated as evidence", () => {
  const result = buildLedgerPatientCandidates({
    id: "t1", amountCents: 12_000, purpose: "Monatsrate", existingPatientId: "p1",
  }, patients, []);
  assert.deepEqual(result, []);
});

