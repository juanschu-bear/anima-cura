import assert from "node:assert/strict";
import test from "node:test";
import { hasCompletedPatientSignature } from "../animasign-completion";

test("a saved form or a status flag alone is not a completed signature", () => {
  for (const status of ["offen", "signatur_ausstehend", "signiert", "fehler"]) {
    assert.equal(hasCompletedPatientSignature({ status }), false);
  }
});

test("completion requires both the signed PDF and a valid completion timestamp", () => {
  const signed = { status: "signiert", signiert_am: "2026-09-28T12:00:00Z", signed_pdf_path: "id/signed.pdf" };
  assert.equal(hasCompletedPatientSignature(signed), true);
  assert.equal(hasCompletedPatientSignature({ ...signed, status: "an_ivoris_uebertragen" }), true);
  assert.equal(hasCompletedPatientSignature({ ...signed, signed_pdf_path: " " }), false);
  assert.equal(hasCompletedPatientSignature({ ...signed, signiert_am: "invalid" }), false);
  assert.equal(hasCompletedPatientSignature({ ...signed, status: "signatur_ausstehend" }), false);
});
