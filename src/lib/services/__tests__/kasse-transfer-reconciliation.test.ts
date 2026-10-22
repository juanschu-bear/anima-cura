import assert from "node:assert/strict";
import test from "node:test";

import { buildTransferReconciliationPlan } from "../kasse-transfer-reconciliation";

const intent = {
  id: "k1",
  patient_id: "p1",
  kassen_datum: "2026-09-15",
  betrag: 123.45,
  zeichen: "00007123",
  patient_vorname: "Max",
  patient_nachname: "Mustermann",
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
  const result = buildTransferReconciliationPlan([intent], [transaction], ["t1"], "2026-09-16");
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.unmatchedIntentIds, ["k1"]);
  assert.deepEqual(result.staleUnmatchedIntentIds, []);
});

test("marks an unmatched transfer as stale only after five days", () => {
  const recent = buildTransferReconciliationPlan([intent], [], [], "2026-09-20");
  const stale = buildTransferReconciliationPlan([intent], [], [], "2026-09-21");
  assert.deepEqual(recent.staleUnmatchedIntentIds, []);
  assert.deepEqual(stale.staleUnmatchedIntentIds, ["k1"]);
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

test("links an exact payment already confirmed for the same patient without a reference", () => {
  const confirmed = {
    ...transaction,
    verwendungszweck: "Behandlung ohne internes Zeichen",
    matching_status: "auto",
    matched_patient_id: "p1",
  };
  const result = buildTransferReconciliationPlan([intent], [confirmed]);
  assert.deepEqual(result.matches.map((row) => row.transaction.id), ["t1"]);
});

test("does not trust an unconfirmed name or amount-only candidate", () => {
  const unconfirmed = {
    ...transaction,
    verwendungszweck: "Familie des Patienten",
    matching_status: "unklar",
    matched_patient_id: "p1",
  };
  const result = buildTransferReconciliationPlan([intent], [unconfirmed]);
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.unmatchedIntentIds, ["k1"]);
});

test("links an exact near-term transfer naming the patient", () => {
  const named = {
    ...transaction,
    verwendungszweck: "Anfangsdiagnostik Mustermann",
    absender_name: "Erika Mustermann",
    matching_status: "unklar",
  };
  const result = buildTransferReconciliationPlan([{ ...intent, zeichen: null }], [named]);
  assert.deepEqual(result.matches.map((row) => row.transaction.id), ["t1"]);
});

test("links a near-term transfer with two distinctive patient name tokens", () => {
  const named = {
    ...transaction,
    verwendungszweck: "Daiyecker Abraham Olivar Gmez",
    absender_name: "Elternkonto",
    matching_status: "unklar",
  };
  const specialIntent = {
    ...intent,
    zeichen: null,
    patient_vorname: "Daiyecker Abraham Olivar",
    patient_nachname: "Gómez",
  };
  const result = buildTransferReconciliationPlan([specialIntent], [named]);
  assert.deepEqual(result.matches.map((row) => row.transaction.id), ["t1"]);
});

test("does not infer patient identity from an equal amount alone", () => {
  const unrelated = {
    ...transaction,
    verwendungszweck: "Anfangsdiagnostik Andere Familie",
    absender_name: "Andere Person",
    matching_status: "unklar",
  };
  const result = buildTransferReconciliationPlan([{ ...intent, zeichen: null }], [unrelated]);
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.unmatchedIntentIds, ["k1"]);
});

test("does not use delayed or intentionally ignored name-only transactions", () => {
  const delayed = {
    ...transaction,
    datum: "2026-09-20",
    verwendungszweck: "Mustermann",
    absender_name: "Erika Mustermann",
    matching_status: "unklar",
  };
  const ignored = { ...delayed, id: "t2", datum: "2026-09-16", matching_status: "ignoriert" };
  const result = buildTransferReconciliationPlan([{ ...intent, zeichen: null }], [delayed, ignored]);
  assert.equal(result.matches.length, 0);
});

test("never revives a bank transaction intentionally marked as ignored", () => {
  const ignoredReference = { ...transaction, matching_status: "ignoriert" };
  const result = buildTransferReconciliationPlan([intent], [ignoredReference]);
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.unmatchedIntentIds, ["k1"]);
});
