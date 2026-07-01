import test from "node:test";
import assert from "node:assert/strict";
import {
  namesMatchSubmission,
  shouldReusePriorSubmissionMatch,
} from "../animasign-ivoris-sync";

test("does not treat shared parent email as same patient when names differ", () => {
  const sameName = namesMatchSubmission(
    { vorname: "Anna", nachname: "Marchenko" },
    "Tymofii",
    "Opanasenko"
  );

  const shouldReuse = shouldReusePriorSubmissionMatch({
    sameName,
    sameEmail: true,
    samePhone: false,
    hasSubmissionContact: true,
  });

  assert.equal(sameName, false);
  assert.equal(shouldReuse, false);
});

test("allows prior submission reuse only when the person name also matches", () => {
  const sameName = namesMatchSubmission(
    { vorname: "Tammo", nachname: "Kornelson" },
    "Tammo",
    "Kornelson"
  );

  const shouldReuse = shouldReusePriorSubmissionMatch({
    sameName,
    sameEmail: true,
    samePhone: false,
    hasSubmissionContact: true,
  });

  assert.equal(sameName, true);
  assert.equal(shouldReuse, true);
});

test("filters email or phone directory hits when returned name differs", () => {
  const sameName = namesMatchSubmission(
    { vorname: "Anna", nachname: "Marchenko" },
    "Tymofii ",
    "Opanasenko "
  );

  assert.equal(sameName, false);
});
