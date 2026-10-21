import assert from "node:assert/strict";
import test from "node:test";

import { buildTransferReconciliationPlan } from "../kasse-transfer-reconciliation";

const intent = {
  id: "k1",
  patient_id: "p1",
  kassen_datum: "2026-09-15",
  betrag: 123.45,
  zeichen: "00007123",
};

const transaction = {
  id: "t1",
  datum: "2026-09-16",
  betrag: 123.45,
  verwendungszweck: "Behandlung 00007123 Mustermann",
  finapi_id: 99,
  matched_patient_id: null,
};

test("links one exact amount and practice reference deterministically", () => {
  const result = buildTransferReconciliationPlan([intent], [transaction]);
  assert.deepEqual(result.matches.map((row) => [row.intent.id, row.transaction.id]), [["k1", "t1"]]);
  assert.deepEqual(result.ambiguousIntentIds, []);
});

test("does not reuse a bank transaction already linked to another receipt", () => {
  const result = buildTransferReconciliationPlan([intent], [transaction], ["t1"]);
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.unmatchedIntentIds, ["k1"]);
});

test("keeps duplicate candidate transactions for manual review", () => {
  const second = { ...transaction, id: "t2", finapi_id: 100 };
  const result = buildTransferReconciliationPlan([intent], [transaction, second]);
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.ambiguousIntentIds, ["k1"]);
});

test("keeps one transaction matching two waiting receipts ambiguous", () => {
  const result = buildTransferReconciliationPlan(
    [intent, { ...intent, id: "k2" }],
    [transaction]
  );
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.ambiguousIntentIds.sort(), ["k1", "k2"]);
});

test("rejects amount, date, reference and patient conflicts", () => {
  const rows = [
    { ...transaction, id: "amount", betrag: 123.44 },
    { ...transaction, id: "date", datum: "2026-09-14" },
    { ...transaction, id: "reference", verwendungszweck: "anderer Patient" },
    { ...transaction, id: "patient", matched_patient_id: "p2" },
  ];
  const result = buildTransferReconciliationPlan([intent], rows);
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.unmatchedIntentIds, ["k1"]);
});
