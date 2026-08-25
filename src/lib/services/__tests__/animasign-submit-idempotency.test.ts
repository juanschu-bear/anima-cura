import test from "node:test";
import assert from "node:assert/strict";
import { buildSubmissionReplayFingerprint } from "../animasign-submit-idempotency";

test("buildSubmissionReplayFingerprint ignores signature pads and normalizes whitespace", () => {
  const left = buildSubmissionReplayFingerprint({
    vorname: "  Sophia ",
    nachname: "Bolívar",
    geburtsdatum: "2011-05-02",
    email: " TEST@EXAMPLE.COM ",
    answers: {
      patient_vorname: "Sophia",
      patient_nachname: "Bolivar ",
      ort: " Leipzig",
      unterschrift_versicherter: "data:image/png;base64,abc",
    },
  });

  const right = buildSubmissionReplayFingerprint({
    vorname: "sophia",
    nachname: "bolivar",
    geburtsdatum: "2011-05-02",
    email: "test@example.com",
    answers: {
      ort: "Leipzig",
      patient_nachname: " bolivar",
      patient_vorname: " Sophia ",
      unterschrift_versicherter: "data:image/png;base64,xyz",
    },
  });

  assert.equal(left, right);
});

test("buildSubmissionReplayFingerprint changes when business answers change", () => {
  const left = buildSubmissionReplayFingerprint({
    vorname: "Janik",
    nachname: "Recker",
    geburtsdatum: "2008-03-12",
    email: "family@example.com",
    answers: {
      versicherungsart: "gesetzlich",
      patient_wohnort: "Leipzig",
    },
  });

  const right = buildSubmissionReplayFingerprint({
    vorname: "Janik",
    nachname: "Recker",
    geburtsdatum: "2008-03-12",
    email: "family@example.com",
    answers: {
      versicherungsart: "privat",
      patient_wohnort: "Leipzig",
    },
  });

  assert.notEqual(left, right);
});
