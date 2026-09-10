import test from "node:test";
import assert from "node:assert/strict";
import {
  selectUniqueIvorisIdentityCandidate,
  selectUniqueRemoteIvorisIdentityCandidate,
} from "../patient-ivoris-link";

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

test("selects one exact remote IVORIS identity and rejects ambiguity", () => {
  const exact = {
    Id: "11111111-1111-4111-8111-111111111111",
    Firstname: " EMILIIA ",
    Lastname: "Petushkova",
    Birthday: "2016-03-31T00:00:00",
  };
  assert.equal(
    selectUniqueRemoteIvorisIdentityCandidate(patient, [exact]),
    exact.Id
  );
  assert.equal(
    selectUniqueRemoteIvorisIdentityCandidate(patient, [
      exact,
      { ...exact, Id: "22222222-2222-4222-8222-222222222222" },
    ]),
    null
  );
  assert.equal(
    selectUniqueRemoteIvorisIdentityCandidate(patient, [
      { ...exact, Firstname: "Andere Person" },
    ]),
    null
  );
});
