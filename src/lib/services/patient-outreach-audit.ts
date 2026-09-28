// Read-only selection rules. This module never creates accounts, resets passwords,
// changes consent or sends email. Contact addresses are NOT portal login aliases.
export type OutreachSubmission = {
  id: string;
  patient_id: string | null;
  matched_patient_id: string | null;
  email: string | null;
  account_email: string | null;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  created_at: string;
  status: string;
  form_email: string | null;
  guardian_email: string | null;
  digital_consent: unknown;
};

export type OutreachPatient = {
  id: string;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  email: string | null;
  versicherter_email: string | null;
};

export type OutreachAccount = {
  id: string;
  email: string | null;
  patient_id: string | null;
  auth_patient_id: string | null;
  role: string | null;
  auth_role: string | null;
  auth_exists: boolean;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

export type OutreachConsent = {
  patient_id: string;
  digitaler_rechnungsempfang: boolean | null;
  akzeptiert_am: string | null;
  updated_at: string | null;
};

export const normalizeEmail = (value: string | null | undefined) =>
  (value || "").trim().toLowerCase();

export function contactEmailIssue(value: string | null, loginAliases: Set<string>): string | null {
  const email = normalizeEmail(value);
  if (!email) return "missing_email";
  if (email.length > 254 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email)) {
    return "invalid_email_syntax";
  }
  const [local, domain] = email.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || email.includes("..") ||
      domain.split(".").some(label => label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
    return "invalid_email_syntax";
  }
  if (loginAliases.has(email) || ["animacura.de", "anima-cura.app"].includes(domain)) return "login_or_internal_address";
  if (["gmai.com", "gmial.com", "gamil.com", "gmail.clm", "gmail.con", "example.com", "example.org", "test.de"].includes(domain)) {
    return "suspicious_email_domain";
  }
  return null;
}

function normalizeName(value: string | null) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/ß/g, "ss").replace(new RegExp("[^\\p{L}\\p{N}]", "gu"), "");
}

function identity(value: { vorname: string | null; nachname: string | null; geburtsdatum: string | null }) {
  if (!value.vorname || !value.nachname || !value.geburtsdatum) return null;
  return [normalizeName(value.vorname), normalizeName(value.nachname), value.geburtsdatum.slice(0, 10)].join("|");
}

export function latestDigitalConsent(submissions: OutreachSubmission[], consent?: OutreachConsent) {
  const evidence = submissions.filter(s => typeof s.digital_consent === "boolean").map(s => ({
    value: s.digital_consent as boolean, at: s.created_at, source: `submission:${s.id}`,
  }));
  if (consent && typeof consent.digitaler_rechnungsempfang === "boolean") {
    // An undated portal record must not silently override a dated decision.
    const at = consent.updated_at || consent.akzeptiert_am;
    if (!at) return { value: null, source: "undated_portal_consent", at: null };
    evidence.push({ value: consent.digitaler_rechnungsempfang, at, source: "patient_consents" });
  }
  evidence.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (!evidence.length) return { value: null, source: "not_recorded", at: null };
  const latest = evidence[0];
  if (!Number.isFinite(Date.parse(latest.at)) || evidence.some(e => Date.parse(e.at) === Date.parse(latest.at) && e.value !== latest.value)) {
    return { value: null, source: "conflicting_consent", at: null };
  }
  return latest;
}

export function buildPatientOutreachAudit(input: {
  submissions: OutreachSubmission[];
  patients: OutreachPatient[];
  accounts: OutreachAccount[];
  consents: OutreachConsent[];
  now: string;
}) {
  const patients = new Map(input.patients.map(p => [p.id, p]));
  const consents = new Map(input.consents.map(c => [c.patient_id, c]));
  const loginAliases = new Set([
    ...input.submissions.map(s => normalizeEmail(s.account_email)),
    ...input.accounts.map(a => normalizeEmail(a.email)),
  ].filter(Boolean));
  const grouped = new Map<string, OutreachSubmission[]>();
  for (const submission of input.submissions) {
    const patientId = submission.matched_patient_id || submission.patient_id;
    const key = patientId || `unlinked:${submission.id}`;
    grouped.set(key, [...(grouped.get(key) || []), submission]);
  }
  const identityPatientIds = new Map<string, Set<string>>();
  for (const [patientId, submissions] of Array.from(grouped)) {
    for (const submission of submissions) {
      const key = identity(submission);
      if (key) identityPatientIds.set(key, new Set([...Array.from(identityPatientIds.get(key) || []), patientId]));
    }
  }
  return Array.from(grouped).map(([patientId, submissions]) => {
    submissions.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id));
    const latest = submissions[0];
    const patient = patients.get(patientId);
    const issues: string[] = [];
    if (!patient) issues.push("patient_missing");
    if (submissions.some(s => s.patient_id && s.matched_patient_id && s.patient_id !== s.matched_patient_id)) issues.push("conflicting_patient_links");
    if (patient && submissions.some(s => !identity(s) || !identity(patient) || identity(s) !== identity(patient))) issues.push("patient_identity_review");
    if (submissions.some(s => (identityPatientIds.get(identity(s) || "")?.size || 0) > 1)) issues.push("duplicate_patient_identity");
    if (/\b(test|testpatient|demo)\b/i.test(`${latest.vorname} ${latest.nachname}`)) issues.push("possible_test_record");

    const email = normalizeEmail(latest.email);
    const contactIssue = contactEmailIssue(latest.email, loginAliases);
    if (contactIssue) issues.push(contactIssue);
    if (latest.form_email && normalizeEmail(latest.form_email) !== email) issues.push("submission_email_conflict");
    if (submissions.some(s => Date.parse(s.created_at) === Date.parse(latest.created_at) && normalizeEmail(s.email) !== email)) issues.push("same_time_email_conflict");
    const accounts = input.accounts.filter(a => a.patient_id === patientId);
    const account = accounts.length === 1 ? accounts[0] : undefined;
    if (!account) issues.push(accounts.length ? "multiple_portal_accounts" : "portal_account_missing");
    else if (!account.auth_exists || account.role !== "patient" || account.auth_role !== "patient" || account.auth_patient_id !== patientId) issues.push("portal_account_link_review");
    if (account?.banned_until && Date.parse(account.banned_until) > Date.parse(input.now)) issues.push("portal_account_disabled");
    if (account && latest.account_email && normalizeEmail(account.email) !== normalizeEmail(latest.account_email)) issues.push("submission_account_conflict");

    return {
      patientId,
      patientName: `${latest.vorname || ""} ${latest.nachname || ""}`.trim(),
      submissionIds: submissions.map(s => s.id),
      latestSubmissionAt: latest.created_at,
      latestSubmissionStatus: latest.status,
      email,
      contactIssue,
      // Alternatives are for review only. Never auto-correct spelling or switch recipients.
      alternativeContacts: Array.from(new Set([latest.guardian_email, patient?.email, patient?.versicherter_email]
        .map(normalizeEmail).filter(v => v && v !== email))),
      previousContactChanged: submissions.some(s => normalizeEmail(s.email) !== email),
      digitalInvoiceConsent: latestDigitalConsent(submissions, consents.get(patientId)),
      lastSignInAt: account?.last_sign_in_at || null,
      portalAccountId: account?.id || null,
      issues: Array.from(new Set(issues)),
    };
  });
}

export type OutreachAuditRow = ReturnType<typeof buildPatientOutreachAudit>[number];

export function groupOutreachRecipients(rows: OutreachAuditRow[]) {
  const grouped = new Map<string, OutreachAuditRow[]>();
  for (const row of rows) {
    if (row.contactIssue || !row.email) continue;
    grouped.set(row.email, [...(grouped.get(row.email) || []), row]);
  }
  return Array.from(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([email, patients]) => ({
    email,
    patientIds: patients.map(p => p.patientId),
    // One neutral email per address. Never include names, records or passwords for a family.
    issues: Array.from(new Set(patients.flatMap(p => p.issues))),
    consentSegment: patients.every(p => p.digitalInvoiceConsent.value === true) ? "all_consented"
      : patients.some(p => p.digitalInvoiceConsent.value === false) ? "includes_declined" : "unconfirmed",
    allEverSignedIn: patients.every(p => p.lastSignInAt !== null),
  }));
}
