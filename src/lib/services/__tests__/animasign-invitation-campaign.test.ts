import test from "node:test";
import assert from "node:assert/strict";
import { invitationClaimId, invitationRecipients } from "../portal-invitation-campaign";
import { activationRunId } from "../portal-activation-workflow";
import { buildPortalActivationEmail } from "../../email/portal-activation";
import { buildPatientOutreachAudit, groupOutreachRecipients, type OutreachSubmission, type OutreachPatient, type OutreachAccount } from "../patient-outreach-audit";

const submission: OutreachSubmission = { id: "s1", patient_id: "p1", matched_patient_id: null,
  email: "person@outlook.com", form_email: "person@outlook.com", guardian_email: null,
  account_email: "person@animacura.de", vorname: "Nora", nachname: "Beispiel", geburtsdatum: "1990-01-01",
  created_at: "2026-09-28T10:00:00Z", status: "signiert", digital_consent: true };
const patient: OutreachPatient = { id: "p1", vorname: "Nora", nachname: "Beispiel", geburtsdatum: "1990-01-01", email: submission.email, versicherter_email: null };
const account: OutreachAccount = { id: "a1", email: submission.account_email, patient_id: "p1", auth_patient_id: "p1", role: "patient", auth_role: "patient", auth_exists: true, last_sign_in_at: "2026-09-28T12:00:00Z", banned_until: null };
function cohort(overrides: Partial<OutreachAccount> = {}, submissions = [submission]) {
  const rows = buildPatientOutreachAudit({ submissions, patients: [patient], accounts: [{ ...account, ...overrides }], consents: [], now: "2026-09-29T10:00:00Z" });
  return { rows, submissions, recipients: groupOutreachRecipients(rows) };
}
test("invites existing logged-in accounts once, excludes ambiguous or disabled accounts", () => {
  assert.equal(invitationRecipients(cohort()).length, 1);
  assert.equal(invitationRecipients(cohort())[0].firstName, "Nora");
  assert.equal(invitationRecipients(cohort({}, [submission, { ...submission, id: "s2" }])).length, 1);
  for (const override of [{ banned_until: "2027-01-01" }, { auth_patient_id: "other" }, { auth_exists: false }]) {
    assert.equal(invitationRecipients(cohort(override)).length, 0);
  }
});
test("shared contacts receive neutral wording instead of one child's name", () => {
  const input = cohort(); input.recipients[0].patientIds.push("p2");
  assert.equal(invitationRecipients(input)[0].firstName, undefined);
});
test("campaign claims are normalized and separate from the 24-hour workflow", () => {
  assert.equal(invitationClaimId(" Person@Outlook.com "), invitationClaimId("person@outlook.com"));
  assert.notEqual(invitationClaimId("person@outlook.com"), activationRunId("person@outlook.com"));
});
test("invitation explains access without claiming invoices are already available or threatening fees", () => {
  const email = buildPortalActivationEmail({ purpose: "invitation", firstName: "<Juan>" });
  assert.ok(email.text.includes("Wir bereiten die digitale Bereitstellung"));
  assert.ok(email.text.includes("keine Rechnung oder Zahlungsaufforderung"));
  assert.ok(email.text.includes("kein neues privates E-Mail-Postfach"));
  assert.ok(email.html.includes("&lt;Juan&gt;"));
  assert.ok(!email.html.includes("<Juan>"));
  assert.ok(!email.text.includes("24 Stunden"));
  assert.ok(!email.text.includes("Mahngebühren"));
  assert.ok(!buildPortalActivationEmail().text.includes("Wir bereiten die digitale Bereitstellung"));
});
test("personal access buttons point only to our welcome pages, with escaped family labels", () => {
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const email = buildPortalActivationEmail({ purpose: "invitation", accessLinks: [{ name: "<Kind>", submissionId: id }] });
  assert.ok(email.html.includes(`https://animacura.io/welcome/${id}`));
  assert.ok(email.html.includes("Meine Zugangsdaten öffnen – &lt;Kind&gt;"));
  assert.ok(email.text.includes(`/welcome/${id}`));
  assert.throws(() => buildPortalActivationEmail({ purpose: "invitation", accessLinks: [{ name: "", submissionId: "https://evil.example" }] }));
});
