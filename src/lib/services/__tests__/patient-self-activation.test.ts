import test from "node:test";
import assert from "node:assert/strict";
import { contactMatchesKnownAddresses, normalizePatientNumber } from "../patient-self-activation";

test("normalizes IVORIS patient numbers without changing existing leading zeros", () => {
  assert.equal(normalizePatientNumber("3728"), "00003728");
  assert.equal(normalizePatientNumber("00003728"), "00003728");
  assert.equal(normalizePatientNumber(""), null);
  assert.equal(normalizePatientNumber("1234567890123"), null);
});

test("matches only a valid private contact address case-insensitively", () => {
  assert.equal(contactMatchesKnownAddresses("Patient@Gmail.com", ["patient@gmail.com"]), true);
  assert.equal(contactMatchesKnownAddresses("other@gmail.com", ["patient@gmail.com"]), false);
  assert.equal(contactMatchesKnownAddresses("patient@animacura.de", ["patient@animacura.de"]), false);
});
