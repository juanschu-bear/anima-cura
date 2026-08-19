import test from "node:test";
import assert from "node:assert/strict";
import {
  decideExactLocalPatientCandidate,
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

test("reuses exact local patient by identity even when patient contact is missing on submission", () => {
  const decision = decideExactLocalPatientCandidate(
    {
      vorname: "Tammo",
      nachname: "Kornelson",
      email: null,
      geburtsdatum: "2012-05-03",
      answers: {},
    },
    [
      {
        id: "patient-1",
        ivoris_id: "11111111-1111-4111-8111-111111111111",
        vorname: "Tammo",
        nachname: "Kornelson",
        geburtsdatum: "2012-05-03",
        email: "mutter@example.com",
        telefon: "01701234567",
      },
    ]
  );

  assert.equal(decision.kind, "reuse");
  if (decision.kind === "reuse") {
    assert.equal(decision.candidate.id, "patient-1");
    assert.equal(decision.reason, "identity");
  }
});

test("forces manual review when exact local identity exists more than once", () => {
  const decision = decideExactLocalPatientCandidate(
    {
      vorname: "Felix",
      nachname: "Liegel",
      email: null,
      geburtsdatum: "2014-07-11",
      answers: {},
    },
    [
      {
        id: "patient-1",
        ivoris_id: "11111111-1111-4111-8111-111111111111",
        vorname: "Felix",
        nachname: "Liegel",
        geburtsdatum: "2014-07-11",
        email: null,
        telefon: null,
      },
      {
        id: "patient-2",
        ivoris_id: "22222222-2222-4222-8222-222222222222",
        vorname: "Felix",
        nachname: "Liegel",
        geburtsdatum: "2014-07-11",
        email: null,
        telefon: null,
      },
    ]
  );

  assert.equal(decision.kind, "manual_review");
});
