/**
 * Read-only cohort audit for submitted anamnesis forms.
 * Usage: npx tsx scripts/audit-patient-outreach.ts [--write-private]
 * No mail, password resets, welcome-page visits, account changes or consent changes.
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { Resolver } from "node:dns/promises";
import { writeFileSync } from "node:fs";
import {
  buildPatientOutreachAudit, groupOutreachRecipients,
  type OutreachSubmission, type OutreachPatient, type OutreachAccount, type OutreachConsent,
} from "../src/lib/services/patient-outreach-audit";

loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing database credentials");
const db = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from(table).select(select).order("id").range(offset, offset + 499);
    if (error) throw new Error(`Read failed: ${table} (${error.code})`);
    rows.push(...(data as unknown as T[]));
    if (data.length < 500) return rows;
  }
}

async function readAuthAccounts() {
  const rows = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error("Cannot audit portal accounts");
    rows.push(...data.users.map(user => ({
      id: user.id, patient_id: user.user_metadata?.patient_id || null,
      role: user.app_metadata?.role || user.user_metadata?.role || null, last_sign_in_at: user.last_sign_in_at || null,
      banned_until: user.banned_until || null,
    })));
    if (data.users.length < 500) return rows;
  }
}

async function mailRouting(domain: string): Promise<string> {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  try {
    const mx = await resolver.resolveMx(domain);
    if (mx.some(record => record.exchange && record.exchange !== ".")) return "mx_found";
    if (mx.length) return "null_mx";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND") return "domain_not_found";
    if (code !== "ENODATA") return "dns_check_unavailable";
  }
  // SMTP permits A/AAAA fallback when no MX record exists; no mailbox probing.
  const addresses = await Promise.allSettled([resolver.resolve4(domain), resolver.resolve6(domain)]);
  return addresses.some(result => result.status === "fulfilled" && result.value.length > 0)
    ? "address_fallback" : "no_mail_route";
}

function counts<T>(rows: T[], key: (row: T) => string) {
  return rows.reduce<Record<string, number>>((result, row) => {
    const value = key(row); result[value] = (result[value] || 0) + 1; return result;
  }, {});
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--write-private")) throw new Error("Only --write-private is supported; this is not a sender");
  const generatedAt = new Date().toISOString();
  const [submissions, patients, profiles, auth, consents] = await Promise.all([
    fetchAll<OutreachSubmission>("anamnese_submissions", "id,patient_id,matched_patient_id,email,account_email,vorname,nachname,geburtsdatum,created_at,status,form_email:answers->>patient_email,guardian_email:answers->>vp_email,digital_consent:answers->ew_digitale_rechnung"),
    fetchAll<OutreachPatient>("patients", "id,vorname,nachname,geburtsdatum,email,versicherter_email"),
    fetchAll<{id: string; email: string; patient_id: string | null; role: string}>("user_profiles", "id,email,patient_id,role"),
    readAuthAccounts(),
    fetchAll<OutreachConsent>("patient_consents", "id,patient_id,digitaler_rechnungsempfang,akzeptiert_am,updated_at"),
  ]);
  const authById = new Map(auth.map(a => [a.id, a]));
  const accounts: OutreachAccount[] = profiles.map(profile => {
    const user = authById.get(profile.id);
    return { ...profile, auth_exists: Boolean(user), auth_patient_id: user?.patient_id || null,
      auth_role: user?.role || null, last_sign_in_at: user?.last_sign_in_at || null, banned_until: user?.banned_until || null };
  });
  const rows = buildPatientOutreachAudit({ submissions, patients, accounts, consents, now: generatedAt });
  const recipients = groupOutreachRecipients(rows);
  const domains = Array.from(new Set(recipients.map(r => r.email.split("@")[1])));
  const routing = new Map<string, string>();
  for (let offset = 0; offset < domains.length; offset += 5) {
    await Promise.all(domains.slice(offset, offset + 5).map(async domain => routing.set(domain, await mailRouting(domain))));
  }
  for (const recipient of recipients) {
    const route = routing.get(recipient.email.split("@")[1]);
    if (route !== "mx_found" && route !== "address_fallback") recipient.issues.push(route || "dns_check_unavailable");
  }
  const candidates = recipients.filter(r => r.issues.length === 0);
  const summary = {
    generatedAt, readOnly: true, emailsSent: 0,
    submissions: submissions.length,
    submissionStatuses: counts(submissions, s => s.status),
    linkedPatientRecords: rows.filter(r => !r.patientId.startsWith("unlinked:")).length,
    unlinkedSubmissions: rows.filter(r => r.patientId.startsWith("unlinked:")).length,
    repeatedSubmissions: submissions.length - rows.length,
    patientRecordsWithEmail: rows.filter(r => r.email).length,
    patientRecordsWithUsableEmailSyntax: rows.filter(r => !r.contactIssue).length,
    contactIssues: counts(rows.filter(r => r.contactIssue), r => r.contactIssue!),
    uniqueContactAddresses: recipients.length,
    sharedContactAddresses: recipients.filter(r => r.patientIds.length > 1).length,
    dnsResults: counts(Array.from(routing.values()), value => value),
    contactAddressesWithMailRouting: recipients.filter(r => ["mx_found", "address_fallback"].includes(routing.get(r.email.split("@")[1]) || "")).length,
    recipientHolds: counts(recipients.flatMap(r => r.issues), value => value),
    technicallyPreparedRecipients: candidates.length,
    patientRecordsCoveredByPreparedRecipients: candidates.reduce((total, r) => total + r.patientIds.length, 0),
    preparedRecipientConsentSegments: counts(candidates, r => r.consentSegment),
    patientConsentDecisions: counts(rows, r => String(r.digitalInvoiceConsent.value)),
    everSignedInPatientRecords: rows.filter(r => r.lastSignInAt).length,
    noRecordedSignInPatientRecords: rows.filter(r => !r.lastSignInAt).length,
    caveats: [
      "Counts refer to linked patient records, not proof that every record is a unique person.",
      "An email field and DNS records do not establish mailbox ownership or successful delivery.",
      "Ever signed in does not prove an app was installed or current credentials work.",
      "Digital invoice consent is not blanket marketing consent or a legal app-installation obligation.",
      "Candidates need content approval, working access instructions and sender/delivery verification before sending.",
    ],
  };
  if (args.includes("--write-private")) {
    // Unique, exclusive files: do not overwrite a reviewed manifest. Existing output/ only.
    const stamp = generatedAt.replace(/[:.]/g, "-");
    const filename = `output/patient-outreach-${stamp}.private.json`;
    writeFileSync(filename, JSON.stringify({ summary, patients: rows, recipients, domainRouting: Object.fromEntries(routing) }, null, 2), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ privateReport: filename }));
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(() => {
  // Never dump provider errors, credentials, URLs, recipient addresses or form contents.
  console.error("Patient outreach audit failed; no messages or database writes were made.");
  process.exitCode = 1;
});
