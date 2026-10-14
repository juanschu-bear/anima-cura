import test from "node:test";
import assert from "node:assert/strict";
import { answerAccessQuestion } from "@/lib/services/patient-access-assistant";

test("recognizes a patient asking to register independently", () => {
  const answer = answerAccessQuestion("Kann ich mich als Patient dort einfach selber registrieren ohne die Praxis", "de");
  assert.match(answer, /kannst du deinen Zugang selbst aktivieren/i);
  assert.match(answer, /Patientennummer/);
  assert.doesNotMatch(answer, /Ich helfe dir bei Anmeldung/);
});

test("keeps password recovery separate from first activation", () => {
  const answer = answerAccessQuestion("Mein Passwort funktioniert nicht", "de");
  assert.match(answer, /Passwort vergessen/);
  assert.doesNotMatch(answer, /Patientennummer/);
});
