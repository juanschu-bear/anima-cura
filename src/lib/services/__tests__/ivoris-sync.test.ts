import test from "node:test";
import assert from "node:assert/strict";
import { findPotentialDuplicateCandidates, isSamePersonCandidate } from "../ivoris-sync";

test("treats same name and birthday with different ivoris ids as duplicate candidate", () => {
  const duplicate = isSamePersonCandidate(
    {
      ivoris_id: "new-ivoris-id",
      vorname: "Tammo",
      nachname: "Kornelson",
      geburtsdatum: "2005-07-11",
    },
    {
      id: "local-patient",
      ivoris_id: "existing-ivoris-id",
      vorname: "Tammo",
      nachname: "Kornelson",
      geburtsdatum: "2005-07-11",
    }
  );

  assert.equal(duplicate, true);
});

test("normalizes spacing and casing when checking duplicate candidates", () => {
  const candidates = findPotentialDuplicateCandidates(
    {
      ivoris_id: "new-id",
      vorname: "Fiona",
      nachname: "Muller",
      geburtsdatum: "2008-02-05",
    },
    [
      {
        id: "a",
        ivoris_id: "existing-a",
        vorname: " Fiona ",
        nachname: "Muller",
        geburtsdatum: "2008-02-05",
      },
      {
        id: "b",
        ivoris_id: "existing-b",
        vorname: "Fiona",
        nachname: "Schmidt",
        geburtsdatum: "2008-02-05",
      },
    ]
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["a"]
  );
});

test("does not flag the same ivoris id as duplicate", () => {
  const duplicate = isSamePersonCandidate(
    {
      ivoris_id: "same-id",
      vorname: "Tammo",
      nachname: "Kornelson",
      geburtsdatum: "2005-07-11",
    },
    {
      id: "local-patient",
      ivoris_id: "same-id",
      vorname: "Tammo",
      nachname: "Kornelson",
      geburtsdatum: "2005-07-11",
    }
  );

  assert.equal(duplicate, false);
});
