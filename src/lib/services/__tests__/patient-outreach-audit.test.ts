import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPatientOutreachAudit, contactEmailIssue, groupOutreachRecipients, latestDigitalConsent,
  type OutreachSubmission, type OutreachPatient, type OutreachAccount,
} from "../patient-outreach-audit";

const submission: OutreachSubmission = {
  id: "s1", patient_id: "p1", matched_patient_id: null, email: "parent@outlook.com",
  account_email: "nora.beispiel@animacura.de", vorname: "Nora", nachname: "Beispiel",
  geburtsdatum: "2014-01-02", created_at: "2026-09-20T12:00:00Z", status: "signiert",
  form_email: "parent@outlook.com", guardian_email: null, digital_consent: true,
};
const patient: OutreachPatient = {
  id: "p1", vorname: "Nora", nachname: "Beispiel", geburtsdatum: "2014-01-02",
  email: "parent@outlook.com", versicherter_email: null,
};
const account: OutreachAccount = {
  id: "a1", email: "nora.beispiel@animacura.de", patient_id: "p1", auth_patient_id: "p1",
  role: "patient", auth_role: "patient", auth_exists: true, last_sign_in_at: null, banned_until: null,
};
function audit(submissions: OutreachSubmission[] = [submission], patients = [patient], accounts = [account]) {
  return buildPatientOutreachAudit({ submissions, patients, accounts, consents: [], now: "2026-09-28T12:00:00Z" });
}

test("accepts omitted extra given names only for one matching patient with contact agreement", () => {
  assert.deepEqual(audit([submission], [{ ...patient, vorname: "Nora-Marie" }])[0].issues, []);
  assert.deepEqual(audit([{ ...submission, vorname: "Nora Marie" }])[0].issues, []);
  for (const change of [{ email: "other@outlook.com" }, { geburtsdatum: "2015-01-02" }, { nachname: "Andere" }, { vorname: "Norah Marie" }]) {
    assert.ok(audit([submission], [{ ...patient, vorname: "Nora Marie", ...change }])[0].issues.includes("patient_identity_review"));
  }
});

test("does not accept a name prefix shared by two patients, even without a second form", () => {
  const patients = [{ ...patient, vorname: "Nora Marie" }, { ...patient, id: "p2", vorname: "Nora Anna" }];
  assert.ok(audit([submission], patients)[0].issues.includes("patient_identity_review"));
});

test("does not treat swapped siblings or a partial token as an omitted given name", () => {
  assert.ok(audit([{ ...submission, vorname: "No" }])[0].issues.includes("patient_identity_review"));
  assert.ok(audit([{ ...submission, vorname: "Marie Nora" }])[0].issues.includes("patient_identity_review"));
  assert.ok(audit([submission, { ...submission, id: "s2", vorname: "Finn" }])[0].issues.includes("patient_identity_review"));
});

test("takes all submitted statuses, not only signed forms, and deduplicates by linked patient", () => {
  const rows = audit([submission, { ...submission, id: "s2", created_at: "2026-09-21T12:00:00Z", status: "fehler" }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].submissionIds.length, 2);
  assert.equal(rows[0].latestSubmissionStatus, "fehler");
  assert.deepEqual(rows[0].issues, []);
});

test("never sends to login aliases or guessed typo corrections", () => {
  const aliases = new Set(["login@other-domain.de"]);
  assert.equal(contactEmailIssue("login@other-domain.de", aliases), "login_or_internal_address");
  assert.equal(contactEmailIssue("parent@gmail.com.", aliases), "invalid_email_syntax");
  assert.equal(contactEmailIssue("parent@gmai.com", aliases), "suspicious_email_domain");
  assert.equal(contactEmailIssue("parent+child@outlook.com", aliases), null);
  assert.equal(contactEmailIssue(" Parent@OUTLOOK.com ", aliases), null);
  assert.equal(contactEmailIssue("patient@firm.de0177", aliases), "invalid_email_syntax");
  assert.equal(contactEmailIssue("parent@-firm.de", aliases), "invalid_email_syntax");
  assert.equal(contactEmailIssue("parent..child@outlook.com", aliases), "invalid_email_syntax");
});

test("does not substitute guardian or old contact email for a broken current address", () => {
  const rows = audit([submission, { ...submission, id: "s2", created_at: "2026-09-22T12:00:00Z",
    email: "parent@gmail.clm", form_email: "parent@gmail.clm", guardian_email: "guardian@outlook.com" }]);
  assert.equal(rows[0].email, "parent@gmail.clm");
  assert.equal(rows[0].previousContactChanged, true);
  assert.equal(groupOutreachRecipients(rows).length, 0);
  assert.ok(rows[0].alternativeContacts.includes("guardian@outlook.com"));
});

test("latest explicit decline overrides prior consent; unknown is not consent", () => {
  assert.equal(latestDigitalConsent([submission], { patient_id: "p1", digitaler_rechnungsempfang: false,
    updated_at: "2026-09-25T10:00:00Z", akzeptiert_am: null }).value, false);
  assert.equal(latestDigitalConsent([{ ...submission, digital_consent: null }]).value, null);
  assert.equal(latestDigitalConsent([{ ...submission, digital_consent: "true" }]).value, null);
  assert.equal(latestDigitalConsent([submission], { patient_id: "p1", digitaler_rechnungsempfang: false,
    updated_at: null, akzeptiert_am: null }).value, null);
  assert.equal(latestDigitalConsent([submission, { ...submission, id: "s2", digital_consent: false }]).value, null);
});

test("merges a shared family address once, without merging patient records or assuming common consent", () => {
  const second = { ...submission, id: "s2", patient_id: "p2", vorname: "Lena",
    account_email: "lena.beispiel@animacura.de", digital_consent: false };
  const rows = audit([submission, second], [patient, { ...patient, id: "p2", vorname: "Lena" }],
    [account, { ...account, id: "a2", patient_id: "p2", auth_patient_id: "p2", email: second.account_email }]);
  const recipients = groupOutreachRecipients(rows);
  assert.equal(recipients.length, 1);
  assert.deepEqual(recipients[0].patientIds, ["p1", "p2"]);
  assert.equal(recipients[0].consentSegment, "includes_declined");
  assert.deepEqual(recipients[0].issues, []);
});

test("blocks conflicting patient links, mismatching identity and duplicate identities", () => {
  assert.ok(audit([{ ...submission, matched_patient_id: "p2" }])[0].issues.includes("conflicting_patient_links"));
  assert.ok(audit([{ ...submission, vorname: "Other" }])[0].issues.includes("patient_identity_review"));
  const rows = audit([submission, { ...submission, id: "s2", patient_id: "p2" }], [patient, { ...patient, id: "p2" }]);
  assert.ok(rows.every(row => row.issues.includes("duplicate_patient_identity")));
});

test("does not silently discard unlinked submissions", () => {
  const rows = audit([{ ...submission, patient_id: null }]);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].issues.includes("patient_missing"));
});

test("blocks inconsistent or disabled portal accounts and does not infer installed state", () => {
  assert.ok(audit([submission], [patient], [{ ...account, auth_patient_id: "p2" }])[0].issues.includes("portal_account_link_review"));
  assert.ok(audit([submission], [patient], [{ ...account, banned_until: "2027-01-01T00:00:00Z" }])[0].issues.includes("portal_account_disabled"));
  assert.equal(audit()[0].lastSignInAt, null);
  assert.equal("installed" in audit()[0], false);
});

test("a problematic second patient at a shared address holds that recipient, not just that patient", () => {
  const rows = audit([submission, { ...submission, id: "s2", patient_id: "p2", vorname: "Lena" }]);
  assert.ok(groupOutreachRecipients(rows)[0].issues.includes("patient_missing"));
});
