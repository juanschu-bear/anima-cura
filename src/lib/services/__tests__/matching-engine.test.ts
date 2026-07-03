import test from "node:test";
import assert from "node:assert/strict";
import { matchTransaction } from "../matching-engine";

const config = {
  min_score: 70,
  auto_approve_score: 80,
  fuzzy_threshold: 0.7,
} as const;

test("auto-matches a unique exact-name and exact-amount hit", () => {
  const result = matchTransaction(
    {
      absender_name: "Meyer Anna",
      absender_iban: null,
      betrag: 120,
      verwendungszweck: "Rate 3",
    },
    [
      {
        id: "patient-1",
        vorname: "Anna",
        nachname: "Meyer",
        normalizedNachname: "MEYER",
        raten: [
          {
            id: "rate-1",
            rate_nummer: 3,
            betrag: 120,
            faellig_am: "2026-07-01",
            status: "offen",
            ratenplan_id: "plan-1",
          },
        ],
      },
    ],
    new Map(),
    config
  );

  assert.equal(result.status, "auto");
  assert.equal(result.patient_id, "patient-1");
  assert.equal(result.score, 95);
  assert.equal(result.details.mehrdeutig, undefined);
});

test("downgrades sibling-style IBAN collisions to manual review", () => {
  const ibanHistory = new Map<string, Set<string>>([
    ["DE123", new Set(["patient-1", "patient-2"])],
  ]);

  const result = matchTransaction(
    {
      absender_name: "Meyer Familie",
      absender_iban: "DE123",
      betrag: 95,
      verwendungszweck: "Monatsrate",
    },
    [
      {
        id: "patient-1",
        vorname: "Anna",
        nachname: "Meyer",
        normalizedNachname: "MEYER",
        raten: [
          {
            id: "rate-1",
            rate_nummer: 1,
            betrag: 95,
            faellig_am: "2026-07-01",
            status: "offen",
            ratenplan_id: "plan-1",
          },
        ],
      },
      {
        id: "patient-2",
        vorname: "Lisa",
        nachname: "Meyer",
        normalizedNachname: "MEYER",
        raten: [
          {
            id: "rate-2",
            rate_nummer: 1,
            betrag: 95,
            faellig_am: "2026-07-01",
            status: "offen",
            ratenplan_id: "plan-2",
          },
        ],
      },
    ],
    ibanHistory,
    config
  );

  assert.equal(result.status, "abweichung");
  assert.equal(result.score, 79);
  assert.equal(result.details.betrag_match, true);
  assert.equal(result.details.mehrdeutig, true);
});

test("auto-matches by unique patient number in purpose even when the sender name is unrelated", () => {
  const result = matchTransaction(
    {
      absender_name: "Sabine Praxis Test",
      absender_iban: null,
      betrag: 150,
      verwendungszweck: "KFO 00007919 Rate Juli",
    },
    [
      {
        id: "patient-1",
        ivoris_nummer: "00007919",
        vorname: "Anna",
        nachname: "Marchenko",
        normalizedNachname: "MARCHENKO",
        raten: [
          {
            id: "rate-1",
            rate_nummer: 1,
            betrag: 150,
            faellig_am: "2026-07-01",
            status: "offen",
            ratenplan_id: "plan-1",
          },
        ],
      },
    ],
    new Map(),
    config
  );

  assert.equal(result.status, "auto");
  assert.equal(result.patient_id, "patient-1");
  assert.equal(result.score, 100);
  assert.equal(result.details.methode, "basisnummer");
  assert.equal(result.details.zweck_score, 100);
});

test("uses patient number for auto-match even when the amount covers more than one rate", () => {
  const result = matchTransaction(
    {
      absender_name: "Familie Marchenko",
      absender_iban: null,
      betrag: 300,
      verwendungszweck: "00007919 Sammelzahlung",
    },
    [
      {
        id: "patient-1",
        ivoris_nummer: "00007919",
        vorname: "Anna",
        nachname: "Marchenko",
        normalizedNachname: "MARCHENKO",
        raten: [
          {
            id: "rate-1",
            rate_nummer: 1,
            betrag: 150,
            faellig_am: "2026-07-01",
            status: "offen",
            ratenplan_id: "plan-1",
          },
          {
            id: "rate-2",
            rate_nummer: 2,
            betrag: 150,
            faellig_am: "2026-08-01",
            status: "offen",
            ratenplan_id: "plan-1",
          },
        ],
      },
    ],
    new Map(),
    config
  );

  assert.equal(result.status, "auto");
  assert.equal(result.patient_id, "patient-1");
  assert.equal(result.rate_id, "rate-1");
  assert.equal(result.score, 96);
  assert.equal(result.details.methode, "basisnummer");
  assert.equal(result.details.betrag_match, false);
});
