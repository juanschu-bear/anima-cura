import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFallbackExistingPatientUpdateOperations,
  buildIdentityFingerprint,
  decideIdentityClaimAction,
  decideExactLocalPatientCandidate,
  isTransientIvorisAvailabilityError,
  namesMatchSubmission,
  shouldPushIvorisSummary,
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

test("builds a stable identity fingerprint from normalized name and birthday", () => {
  const left = buildIdentityFingerprint({
    vorname: " Félix ",
    nachname: " Liegel",
    geburtsdatum: "2014-07-11",
  });

  const right = buildIdentityFingerprint({
    vorname: "felix",
    nachname: "liegel",
    geburtsdatum: "2014-07-11T10:15:00.000Z",
  });

  assert.equal(typeof left, "string");
  assert.equal(left, right);
});

test("blocks create when another submission already owns the same pending identity claim", () => {
  const decision = decideIdentityClaimAction(
    {
      fingerprint: "abc",
      patient_id: null,
      ivoris_id: null,
      last_submission_id: "submission-older",
      status: "pending",
      note: null,
    },
    "submission-new"
  );

  assert.equal(decision.kind, "manual_review");
});

test("reuses existing ivoris id from identity claim instead of creating again", () => {
  const decision = decideIdentityClaimAction(
    {
      fingerprint: "abc",
      patient_id: "patient-1",
      ivoris_id: "11111111-1111-4111-8111-111111111111",
      last_submission_id: "submission-older",
      status: "resolved",
      note: null,
    },
    "submission-new"
  );

  assert.equal(decision.kind, "reuse");
  if (decision.kind === "reuse") {
    assert.equal(decision.ivorisId, "11111111-1111-4111-8111-111111111111");
    assert.equal(decision.patientId, "patient-1");
  }
});

test("detects transient ivoris availability errors", () => {
  assert.equal(
    isTransientIvorisAvailabilityError(
      new Error("IVORIS GetPatient abc fehlgeschlagen (503): null")
    ),
    true
  );
  assert.equal(
    isTransientIvorisAvailabilityError(
      new Error("IVORIS UpdatePatient abc fehlgeschlagen (400): bad request")
    ),
    false
  );
});

test("builds fallback existing-patient operations from submission data", () => {
  const operations = buildFallbackExistingPatientUpdateOperations({
    vorname: "Emma",
    nachname: "Muller",
    email: "emma@example.com",
    geburtsdatum: "2012-04-01",
    answers: {
      patient_telefon: "01701234567",
      patient_mobil: "01707654321",
      patient_strasse: "Musterweg 7",
      patient_plz: "04109",
      patient_wohnort: "Leipzig",
    },
  });

  assert.equal(operations.length, 4);
  assert.equal(
    operations.some(
      (operation) =>
        operation.Firstname === "Emma" &&
        operation.Lastname === "Muller" &&
        operation.Birthday === "2012-04-01" &&
        operation.Email === "emma@example.com"
    ),
    true
  );
});

test("does not push ivoris summary twice when a retry sees the same summary hash", () => {
  assert.equal(
    shouldPushIvorisSummary({
      alreadySynced: true,
      previousHash: "abc",
      nextHash: "abc",
    }),
    false
  );

  assert.equal(
    shouldPushIvorisSummary({
      alreadySynced: false,
      previousHash: "abc",
      nextHash: "abc",
    }),
    false
  );

  assert.equal(
    shouldPushIvorisSummary({
      alreadySynced: false,
      previousHash: null,
      nextHash: "new-hash",
    }),
    true
  );
});
