import test from "node:test";
import assert from "node:assert/strict";
import { buildPatientOutreachAudit, groupOutreachRecipients, type OutreachSubmission, type OutreachPatient, type OutreachAccount } from "../patient-outreach-audit";
import { activationRunId, selectActivationRecipients } from "../portal-activation-workflow";

const submission: OutreachSubmission = { id: "s1", patient_id: "p1", matched_patient_id: null,
  email: "person@outlook.com", form_email: "person@outlook.com", guardian_email: null,
  account_email: "person@animacura.de", vorname: "Nora", nachname: "Beispiel", geburtsdatum: "1990-01-01",
  created_at: "2026-09-28T10:00:00Z", status: "signiert", digital_consent: true };
const patient: OutreachPatient = { id: "p1", vorname: "Nora", nachname: "Beispiel", geburtsdatum: "1990-01-01", email: submission.email, versicherter_email: null };
const account: OutreachAccount = { id: "a1", email: submission.account_email, patient_id: "p1", auth_patient_id: "p1", role: "patient", auth_role: "patient", auth_exists: true, last_sign_in_at: null, banned_until: null };
function cohort(overrides: Partial<OutreachAccount> = {}, submissions = [submission]) {
  const rows = buildPatientOutreachAudit({ submissions, patients: [patient], accounts: [{ ...account, ...overrides }], consents: [], now: "2026-09-29T10:00:00Z" });
  return { rows, submissions, recipients: groupOutreachRecipients(rows) };
}
const enabled = "2026-09-28T09:00:00Z";
test("sends only at/after 24 hours and excludes historical backfill", () => {
  assert.equal(selectActivationRecipients(cohort(), enabled, "2026-09-29T09:59:59Z").length, 0);
  assert.equal(selectActivationRecipients(cohort(), enabled, "2026-09-29T10:00:00Z").length, 1);
  assert.equal(selectActivationRecipients(cohort(), "2026-09-28T11:00:00Z", "2026-09-29T10:00:00Z").length, 0);
  assert.equal(selectActivationRecipients(cohort(), "bad", "2026-09-29T10:00:00Z").length, 0);
});
test("signed-in, disabled and inconsistent accounts are excluded", () => {
  for (const override of [{ last_sign_in_at: enabled }, { banned_until: "2027-01-01" }, { auth_patient_id: "other" }, { auth_exists: false }]) {
    assert.equal(selectActivationRecipients(cohort(override), enabled, "2026-09-29T10:00:00Z").length, 0);
  }
});
test("repeated forms produce one recipient and one permanent dispatch claim", () => {
  const repeated = cohort({}, [submission, { ...submission, id: "s2", created_at: "2026-09-28T22:00:00Z" }]);
  assert.equal(selectActivationRecipients(repeated, enabled, "2026-09-29T10:00:00Z").length, 1);
  assert.equal(activationRunId("Person@Outlook.com "), activationRunId("person@outlook.com"));
  assert.notEqual(activationRunId("other@outlook.com"), activationRunId("person@outlook.com"));
  assert.match(activationRunId("person@outlook.com"), /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
});
test("ambiguous shared contacts remain in the audit, not an incorrect personalized send", () => {
  const input = cohort(); input.recipients[0].patientIds.push("p2");
  assert.equal(selectActivationRecipients(input, enabled, "2026-09-29T10:00:00Z").length, 0);
  assert.equal(input.rows.length, 1);
});
