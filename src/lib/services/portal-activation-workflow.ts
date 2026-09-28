import { createHash } from "node:crypto";
import { t } from "@/lib/i18n";
import { createServerClient } from "@/lib/db/supabase";
import { buildPortalActivationEmail } from "@/lib/email/portal-activation";
import { activationDueAt } from "./patient-communication-policy";
import { buildPatientOutreachAudit, groupOutreachRecipients, type OutreachSubmission, type OutreachPatient, type OutreachAccount, type OutreachConsent } from "./patient-outreach-audit";

export const PORTAL_ACTIVATION_WORKFLOW_ID = "0e3159ec-c11a-46a4-a2c4-21827e26fe32";
export const PORTAL_ACTIVATION_EVENT = "portal_activation_24h";
export function portalActivationDefinition(enabledAfter: string) {
  const email = buildPortalActivationEmail({ firstName: "{{vorname}}" });
  return {
    id: PORTAL_ACTIVATION_WORKFLOW_ID, name: t("activation.workflowName"),
    description: t("activation.workflowDescription"),
    active: true, updatedAt: enabledAfter,
    nodes: [
      { id: "activation-trigger", type: "trigger", position: { x: 60, y: 180 }, data: { event: PORTAL_ACTIVATION_EVENT, enabledAfter, systemManaged: true } },
      { id: "activation-email", type: "action_email", position: { x: 420, y: 180 }, data: { recipient: "patient", subject: email.subject, body: email.text, systemManaged: true } },
    ],
    edges: [{ id: "activation-edge", source: "activation-trigger", target: "activation-email", type: "smoothstep" }],
  };
}
type Db = ReturnType<typeof createServerClient>;
type Profile = { id: string; email: string; patient_id: string | null; role: string };
type ActivationSubmission = OutreachSubmission & { guardian_first_name?: string | null };

async function readAll<T>(db: Db, table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await db.from(table).select(select).order("id").range(start, start + 499);
    if (error) throw new Error(`Activation lookup failed: ${table}`);
    rows.push(...data as unknown as T[]);
    if (data.length < 500) return rows;
  }
}

export async function loadActivationCohort(db: Db, now: string) {
  const [submissions, patients, profiles, consents] = await Promise.all([
    readAll<ActivationSubmission>(db, "anamnese_submissions", "id,patient_id,matched_patient_id,email,account_email,vorname,nachname,geburtsdatum,created_at,status,form_email:answers->>patient_email,guardian_email:answers->>vp_email,guardian_first_name:answers->>vp_vorname,digital_consent:answers->ew_digitale_rechnung"),
    readAll<OutreachPatient>(db, "patients", "id,vorname,nachname,geburtsdatum,email,versicherter_email"),
    readAll<Profile>(db, "user_profiles", "id,email,patient_id,role"),
    readAll<OutreachConsent>(db, "patient_consents", "id,patient_id,digitaler_rechnungsempfang,akzeptiert_am,updated_at"),
  ]);
  const accounts: OutreachAccount[] = [];
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error("Activation account lookup failed");
    for (const user of data.users) {
      const profile = profilesById.get(user.id);
      if (!profile) continue;
      accounts.push({ ...profile, auth_exists: true, auth_patient_id: user.user_metadata?.patient_id || null,
        auth_role: user.app_metadata?.role || user.user_metadata?.role || null,
        last_sign_in_at: user.last_sign_in_at || null, banned_until: user.banned_until || null });
    }
    if (data.users.length < 500) break;
  }
  const rows = buildPatientOutreachAudit({ submissions, patients, accounts, consents, now });
  return { rows, submissions, recipients: groupOutreachRecipients(rows) };
}

export function activationRunId(email: string): string {
  // One claim per recipient across repeated forms and concurrent cron requests.
  const hash = createHash("sha256").update(`${PORTAL_ACTIVATION_WORKFLOW_ID}:${email.trim().toLowerCase()}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function selectActivationRecipients(cohort: Awaited<ReturnType<typeof loadActivationCohort>>, enabledAfter: string, now: string) {
  const enabled = Date.parse(enabledAfter), clock = Date.parse(now);
  if (!Number.isFinite(enabled) || !Number.isFinite(clock)) return [];
  return cohort.recipients.filter(recipient => {
    // Family accounts need their own wording/link selection; never expose a child's credentials.
    if (recipient.issues.length || recipient.patientIds.length !== 1 || recipient.allEverSignedIn) return false;
    const row = cohort.rows.find(item => item.patientId === recipient.patientIds[0]);
    if (!row?.portalAccountId || row.lastSignInAt) return false;
    const submissions = cohort.submissions.filter(item => row.submissionIds.includes(item.id));
    const due = activationDueAt(submissions.map(item => item.created_at));
    // Audit old records, but do not silently turn on a retrospective mass mailing.
    return due !== null && due - 86400000 >= enabled && due <= clock;
  }).map(recipient => ({ ...recipient, accountId: cohort.rows.find(row => row.patientId === recipient.patientIds[0])!.portalAccountId! }));
}

export async function runPortalActivationWorkflow(options: { dryRun?: boolean } = {}) {
  const db = createServerClient();
  const now = new Date().toISOString();
  const { data: settings, error } = await db.from("einstellungen").select("value").eq("key", "workflows").maybeSingle();
  if (error) throw new Error("Activation configuration unavailable");
  const workflow = Array.isArray(settings?.value) ? settings.value.find((item: { id: string }) => item.id === PORTAL_ACTIVATION_WORKFLOW_ID) : null;
  const trigger = workflow?.nodes?.find((node: { type: string }) => node.type === "trigger");
  if (!workflow?.active || trigger?.data?.event !== PORTAL_ACTIVATION_EVENT) return { status: "skipped", reason: "inactive" };
  const expected = portalActivationDefinition(trigger.data.enabledAfter);
  const action = workflow.nodes.find((node: { type: string }) => node.type === "action_email");
  if (workflow.nodes.length !== 2 || action?.data?.subject !== expected.nodes[1].data.subject ||
      action?.data?.body !== expected.nodes[1].data.body || workflow.edges?.length !== 1 ||
      workflow.edges[0].source !== trigger.id || workflow.edges[0].target !== action.id) {
    return { status: "failed", reason: "managed_workflow_configuration_changed" };
  }
  const cohort = await loadActivationCohort(db, now);
  const candidates = selectActivationRecipients(cohort, trigger.data.enabledAfter, now);
  const summary = { status: "success", auditedPatients: cohort.rows.length, candidates: candidates.length, accepted: 0, skipped: 0, failed: 0, dryRun: !!options.dryRun };
  if (options.dryRun || !candidates.length) return summary;
  const apiKey = process.env.RESEND_API_KEY, from = process.env.ANIMASIGN_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Activation mail transport unavailable");

  // Limit work per invocation. The unique claim makes concurrent invocations safe.
  let claimed = 0;
  const deadline = Date.now() + 40_000;
  for (const candidate of candidates) {
    if (claimed >= 3 || Date.now() >= deadline) break;
    const id = activationRunId(candidate.email);
    const { error: claimError } = await db.from("workflow_runs").insert({
      id, workflow_id: PORTAL_ACTIVATION_WORKFLOW_ID, trigger_event: PORTAL_ACTIVATION_EVENT,
      status: "running", started_at: now, result: { patientIds: candidate.patientIds, recipientHash: createHash("sha256").update(candidate.email).digest("hex") },
    });
    if (claimError?.code === "23505") { summary.skipped++; continue; }
    if (claimError) throw new Error("Activation dispatch claim failed");
    claimed++;
    let status = "failed", result: Record<string, unknown> = {};
    try {
      // Fresh auth check immediately before dispatch, not just the batch snapshot.
      const { data: auth, error: authError } = await db.auth.admin.getUserById(candidate.accountId);
      if (authError || !auth.user) throw new Error("Account recheck unavailable");
      if (auth.user.last_sign_in_at || (auth.user.banned_until && Date.parse(auth.user.banned_until) > Date.now())) {
        status = "skipped"; result = { reason: "signed_in_or_disabled" }; summary.skipped++;
      } else {
        // Reload identity/contact/consent state after claiming; stale snapshots cannot send.
        const fresh = await loadActivationCohort(db, new Date().toISOString());
        const stillEligible = selectActivationRecipients(fresh, trigger.data.enabledAfter, new Date().toISOString())
          .some(item => item.email === candidate.email && item.accountId === candidate.accountId);
        if (!stillEligible) {
          status = "skipped"; result = { reason: "eligibility_changed" }; summary.skipped++;
        } else {
          const { data: currentSettings, error: configError } = await db.from("einstellungen").select("value").eq("key", "workflows").maybeSingle();
          const current = currentSettings?.value?.find((item: { id: string }) => item.id === PORTAL_ACTIVATION_WORKFLOW_ID);
          if (configError || !current?.active || JSON.stringify(current.nodes) !== JSON.stringify(workflow.nodes) ||
              JSON.stringify(current.edges) !== JSON.stringify(workflow.edges)) throw new Error("Activation configuration changed before dispatch");
          const latest = fresh.submissions.filter(item => (item.matched_patient_id || item.patient_id) === candidate.patientIds[0])
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
          const guardianContact = latest?.guardian_email?.trim().toLowerCase() === candidate.email;
          const firstName = guardianContact ? latest?.guardian_first_name
            : latest?.form_email?.trim().toLowerCase() === candidate.email ? latest?.vorname : undefined;
          const email = buildPortalActivationEmail({ firstName: firstName || undefined });
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST", signal: AbortSignal.timeout(8000),
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": id },
            body: JSON.stringify({ from, to: candidate.email, reply_to: "orthoschub@web.de", ...email }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.id) throw new Error("Provider acceptance not confirmed");
          status = "success"; result = { providerId: payload.id, acceptedAt: new Date().toISOString(), deliveryConfirmed: false };
          summary.accepted++;
        }
      }
    } catch {
      // Unknown delivery outcomes require review; never blindly resend after a timeout.
      result = { reason: "dispatch_requires_review" }; summary.failed++;
    }
    const { error: finishError } = await db.from("workflow_runs").update({ status,
      result: { patientIds: candidate.patientIds, ...result }, finished_at: new Date().toISOString() }).eq("id", id);
    if (finishError) throw new Error("Activation dispatch audit could not be finalized");
  }
  return { ...summary, status: summary.failed ? "failed" : "success" };
}
