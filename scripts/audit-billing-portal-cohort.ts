import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServerClient } from "../src/lib/db/supabase";
import { validateBillingManifest } from "../src/lib/billing-publish";
import { loadActivationCohort } from "../src/lib/services/portal-activation-workflow";
import { contactEmailIssue, normalizeEmail } from "../src/lib/services/patient-outreach-audit";

loadEnvConfig(process.cwd());

type Db = ReturnType<typeof createServerClient>;
type Profile = { id: string; email: string | null; patient_id: string | null; role: string | null };
type Engagement = { patient_id: string; event_type: string; created_at: string };
type Push = { patient_id: string; updated_at: string | null };
type Patient = { id: string; email: string | null; versicherter_email: string | null };

function argument(name: string) {
  const prefix = `${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

function chunks<T>(input: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < input.length; index += size) rows.push(input.slice(index, index + size));
  return rows;
}

async function selectByPatientIds<T>(db: Db, table: string, columns: string, patientIds: string[]) {
  const result: T[] = [];
  for (const ids of chunks(patientIds, 100)) {
    for (let offset = 0; ; offset += 1000) {
      const query = await db.from(table).select(columns).in("patient_id", ids).range(offset, offset + 999);
      if (query.error) throw new Error(`Billing portal audit failed for ${table}`);
      const rows = (query.data ?? []) as unknown as T[];
      result.push(...rows);
      if (rows.length < 1000) break;
    }
  }
  return result;
}

async function selectPatients(db: Db, patientIds: string[]) {
  const result: Patient[] = [];
  for (const ids of chunks(patientIds, 100)) {
    const query = await db.from("patients").select("id,email,versicherter_email").in("id", ids);
    if (query.error) throw new Error("Billing portal audit failed for patients");
    result.push(...((query.data ?? []) as Patient[]));
  }
  return result;
}

function countPatientSet(rows: Array<{ patient_id: string }>) {
  return new Set(rows.map(row => row.patient_id)).size;
}

async function main() {
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith("--manifest=") && !value.startsWith("--receipt=") && !value.startsWith("--output=")) {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  const manifestPath = argument("--manifest");
  const receiptPath = argument("--receipt");
  const outputPath = argument("--output");
  if (!manifestPath || !receiptPath || !outputPath) {
    throw new Error("Use --manifest=/private/manifest.json --receipt=/private/receipt.json --output=/private/audit.json");
  }

  const manifest = validateBillingManifest(JSON.parse(await readFile(resolve(manifestPath), "utf8")));
  const receipt = JSON.parse(await readFile(resolve(receiptPath), "utf8")) as {
    apply?: boolean; total?: number; completed_at?: string;
  };
  if (!receipt.apply || receipt.total !== manifest.rows.length || !receipt.completed_at || !Number.isFinite(Date.parse(receipt.completed_at))) {
    throw new Error("Publication receipt does not prove this complete batch");
  }

  const patientIds = Array.from(new Set(manifest.rows.map(row => row.patient_id))).sort();
  const db = createServerClient();
  const now = new Date().toISOString();
  const [patientRows, profiles, engagement, pushes, activation] = await Promise.all([
    selectPatients(db, patientIds),
    selectByPatientIds<Profile>(db, "user_profiles", "id,email,patient_id,role", patientIds),
    selectByPatientIds<Engagement>(db, "patient_engagement", "patient_id,event_type,created_at", patientIds),
    selectByPatientIds<Push>(db, "push_subscriptions", "patient_id,updated_at", patientIds),
    loadActivationCohort(db, now),
  ]);

  const authUsers = new Map<string, {
    patientId: string | null; role: string | null; lastSignInAt: string | null; bannedUntil: string | null;
  }>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error("Billing portal auth audit failed");
    for (const user of data.users) {
      authUsers.set(user.id, {
        patientId: user.user_metadata?.patient_id || null,
        role: user.app_metadata?.role || user.user_metadata?.role || null,
        lastSignInAt: user.last_sign_in_at || null,
        bannedUntil: user.banned_until || null,
      });
    }
    if (data.users.length < 500) break;
  }

  const profilesByPatient = new Map<string, Profile[]>();
  for (const profile of profiles) {
    if (!profile.patient_id) continue;
    profilesByPatient.set(profile.patient_id, [...(profilesByPatient.get(profile.patient_id) ?? []), profile]);
  }
  const eventsByPatient = new Map<string, Engagement[]>();
  for (const event of engagement) {
    eventsByPatient.set(event.patient_id, [...(eventsByPatient.get(event.patient_id) ?? []), event]);
  }
  const pushPatients = new Set(pushes.map(row => row.patient_id));
  const outreachByPatient = new Map(activation.rows.map(row => [row.patientId, row]));
  const directPatients = new Map(patientRows.map(row => [row.id, row]));
  const loginAliases = new Set(profiles.map(profile => normalizeEmail(profile.email)).filter(Boolean));
  const identityHolds = new Set([
    "patient_missing", "conflicting_patient_links", "patient_identity_review", "duplicate_patient_identity",
    "possible_test_record", "submission_email_conflict", "same_time_email_conflict",
  ]);

  const patients = patientIds.map(patientId => {
    const linkedProfiles = profilesByPatient.get(patientId) ?? [];
    const validAccounts = linkedProfiles.filter(profile => {
      const auth = authUsers.get(profile.id);
      return profile.role === "patient" && auth?.role === "patient" && auth.patientId === patientId &&
        !(auth.bannedUntil && Date.parse(auth.bannedUntil) > Date.now());
    });
    const signedIn = validAccounts.some(profile => Boolean(authUsers.get(profile.id)?.lastSignInAt));
    const events = eventsByPatient.get(patientId) ?? [];
    const appOpens = events.filter(event => event.event_type === "app_open");
    const documentViews = events.filter(event => event.event_type === "document_view");
    const appOpenedSincePublication = appOpens.some(event => Date.parse(event.created_at) >= Date.parse(receipt.completed_at!));
    const documentViewedSincePublication = documentViews.some(event => Date.parse(event.created_at) >= Date.parse(receipt.completed_at!));
    const outreach = outreachByPatient.get(patientId);
    const outreachContactReady = Boolean(outreach?.email && !outreach.contactIssue &&
      !outreach.issues.some(issue => identityHolds.has(issue)));
    const direct = directPatients.get(patientId);
    const directCandidates = [direct?.email, direct?.versicherter_email]
      .map(value => ({ email: normalizeEmail(value), issue: contactEmailIssue(value ?? null, loginAliases) }))
      .filter((value, index, rows) => value.email && rows.findIndex(row => row.email === value.email) === index);
    const directContact = directCandidates.find(candidate => !candidate.issue)?.email ?? null;
    const contactEmail = outreachContactReady ? outreach!.email : directContact;
    const contactReady = Boolean(contactEmail);
    const directIssues = directCandidates.length
      ? directCandidates.map(candidate => candidate.issue).filter(Boolean) as string[]
      : ["missing_direct_patient_email"];
    const accountState = validAccounts.length === 1 ? "valid" : validAccounts.length === 0 ? "missing_or_invalid" : "multiple_valid";
    const priority = accountState !== "valid" || !signedIn ? "activation" : !appOpenedSincePublication ? "invoice_alert" : "reached";
    return {
      patient_id: patientId,
      invoice_count: manifest.rows.filter(row => row.patient_id === patientId).length,
      account_state: accountState,
      ever_signed_in: signedIn,
      app_opened_ever: appOpens.length > 0,
      app_opened_since_publication: appOpenedSincePublication,
      document_viewed_ever: documentViews.length > 0,
      document_viewed_since_publication: documentViewedSincePublication,
      push_subscription: pushPatients.has(patientId),
      contact_email: contactEmail,
      contact_source: outreachContactReady ? "verified_anamnesis" : directContact ? "patient_master_data" : null,
      contact_ready: contactReady,
      contact_hold_reasons: contactReady ? [] : Array.from(new Set([...(outreach?.issues ?? []), ...directIssues])),
      priority,
    };
  });

  const recipients = new Map<string, typeof patients>();
  for (const patient of patients) {
    if (!patient.contact_email || patient.priority === "reached") continue;
    recipients.set(patient.contact_email, [...(recipients.get(patient.contact_email) ?? []), patient]);
  }
  const recipientRows = Array.from(recipients).map(([email, rows]) => ({
    email,
    patient_ids: rows.map(row => row.patient_id),
    priority: rows.some(row => row.priority === "activation") ? "activation" : "invoice_alert",
  }));

  const event = (type: string) => engagement.filter(row => row.event_type === type);
  const summary = {
    generated_at: now,
    read_only: true,
    emails_sent: 0,
    invoice_count: manifest.rows.length,
    unique_patients: patientIds.length,
    publication_completed_at: receipt.completed_at,
    valid_portal_account_patients: patients.filter(row => row.account_state === "valid").length,
    missing_invalid_or_ambiguous_account_patients: patients.filter(row => row.account_state !== "valid").length,
    ever_signed_in_patients: patients.filter(row => row.ever_signed_in).length,
    never_signed_in_patients: patients.filter(row => !row.ever_signed_in).length,
    app_opened_ever_patients: countPatientSet(event("app_open")),
    app_opened_since_publication_patients: patients.filter(row => row.app_opened_since_publication).length,
    document_viewed_ever_patients: countPatientSet(event("document_view")),
    document_viewed_since_publication_patients: patients.filter(row => row.document_viewed_since_publication).length,
    push_subscription_patients: pushPatients.size,
    activation_priority_patients: patients.filter(row => row.priority === "activation").length,
    invoice_alert_priority_patients: patients.filter(row => row.priority === "invoice_alert").length,
    already_reached_patients: patients.filter(row => row.priority === "reached").length,
    contact_ready_patients_needing_email: patients.filter(row => row.priority !== "reached" && row.contact_ready).length,
    verified_anamnesis_contact_patients: patients.filter(row => row.contact_source === "verified_anamnesis").length,
    patient_master_contact_patients: patients.filter(row => row.contact_source === "patient_master_data").length,
    contact_held_patients_needing_review: patients.filter(row => row.priority !== "reached" && !row.contact_ready).length,
    unique_ready_email_recipients: recipientRows.length,
    activation_email_recipients: recipientRows.filter(row => row.priority === "activation").length,
    invoice_alert_email_recipients: recipientRows.filter(row => row.priority === "invoice_alert").length,
    caveats: [
      "A portal login proves account use, not installation of a PWA.",
      "An app_open event proves the portal was opened in a browser or installed app.",
      "A push subscription is the strongest available activation proxy but still not a formal installation receipt.",
      "No email was sent by this audit.",
    ],
  };

  await writeFile(resolve(outputPath), `${JSON.stringify({ summary, patients, recipients: recipientRows }, null, 2)}\n`, {
    flag: "wx", mode: 0o600,
  });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Billing portal audit failed");
  process.exitCode = 1;
});
