import test from "node:test";
import assert from "node:assert/strict";
import { addPlanMonths, allocatePaymentToRates, buildGeneratedRates, reconcileInstallments } from "../reconciliation";

test("builds quarterly due dates in three month steps", () => {
  const dates = buildGeneratedRates({
    id: "plan-1",
    patient_id: "patient-1",
    anzahl_raten: 3,
    rate_betrag: 150,
    start_datum: "2026-01-15",
    rhythmus: "quartalsweise",
  }).map((rate) => rate.faellig_am);

  assert.deepEqual(dates, ["2026-01-15", "2026-04-15", "2026-07-15"]);
  assert.equal(addPlanMonths("2026-01-15", 2, "quartalsweise"), "2026-07-15");
});

test("reconciles full, multi and partial payments against a plan", () => {
  const result = reconcileInstallments(
    {
      anzahl_raten: 4,
      rate_betrag: 100,
      start_datum: "2026-01-01",
      rhythmus: "monatlich",
    },
    [],
    [
      { datum: "2026-01-02", betrag: 100 },
      { datum: "2026-02-03", betrag: 200 },
      { datum: "2026-04-01", betrag: 50 },
    ],
    new Date("2026-04-15")
  );

  assert.equal(result.rechnerischBezahlt, 3);
  assert.equal(result.teilbezahlt, 1);
  assert.equal(result.restschuld, 50);
  assert.equal(result.installments[3].zustand, "teilbezahlt");
  assert.equal(result.installments[3].zugeordnet, 50);
});

test("allocates one payment across multiple open or partial rates", () => {
  const allocation = allocatePaymentToRates(
    [
      {
        id: "rate-1",
        rate_nummer: 1,
        betrag: 100,
        status: "teilbezahlt",
        faellig_am: "2026-01-01",
        bezahlt_betrag: 40,
      },
      {
        id: "rate-2",
        rate_nummer: 2,
        betrag: 100,
        status: "offen",
        faellig_am: "2026-02-01",
        bezahlt_betrag: 0,
      },
    ],
    160,
    "2026-02-10",
    "tx-1"
  );

  assert.deepEqual(allocation.updates, [
    {
      id: "rate-1",
      status: "bezahlt",
      bezahlt_betrag: 100,
      bezahlt_am: "2026-02-10",
      transaktion_id: "tx-1",
    },
    {
      id: "rate-2",
      status: "bezahlt",
      bezahlt_betrag: 100,
      bezahlt_am: "2026-02-10",
      transaktion_id: "tx-1",
    },
  ]);
  assert.equal(allocation.restbetrag, 0);
});
