import test from "node:test";
import assert from "node:assert/strict";
import { selectUniqueIvorisIdentityCandidate } from "../patient-ivoris-link";

const patient = {
  id: "local",
  ivoris_id: null,
  vorname: "Emiliia",
  nachname: "Petushkova",
  geburtsdatum: "2016-03-31",
};

test("selects the unique matching IVORIS-linked patient", () => {
  const result = selectUniqueIvorisIdentityCandidate(patient, [
    patient,
    { ...patient, id: "canonical", ivoris_id: "ivoris-id", vorname: " EMILIIA " },
  ]);

  assert.equal(result?.id, "canonical");
});

test("does not guess when multiple IVORIS-linked patients match", () => {
  const result = selectUniqueIvorisIdentityCandidate(patient, [
    { ...patient, id: "a", ivoris_id: "ivoris-a" },
    { ...patient, id: "b", ivoris_id: "ivoris-b" },
  ]);

  assert.equal(result, null);
});
