import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
import { buildPortalActivationEmail } from "@/lib/email/portal-activation";
import { loadActivationCohort } from "./portal-activation-workflow";

const ID = "e8c5f5ae-2092-4b6b-89c0-f063e512a688";
const KEY = "portal_invitation_campaign_20260929";
type Recipient = { email: string; patientIds: string[]; accountIds: string[]; firstName?: string };
type Manifest = { version: string; createdAt: string; recipients: Recipient[] };
type Db = ReturnType<typeof createServerClient>;
const mail = (firstName?: string) => buildPortalActivationEmail({ purpose: "invitation", firstName });
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const invitationVersion = () => hash(mail("{{vorname}}").subject + mail("{{vorname}}").text);
export function invitationClaimId(email: string) {
  const h = hash(`${ID}:${email.trim().toLowerCase()}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const testId = () => invitationClaimId(`test:${invitationVersion()}`);

export function invitationRecipients(cohort: Awaited<ReturnType<typeof loadActivationCohort>>): Recipient[] {
  return cohort.recipients.filter(r => !r.issues.length).map(r => {
    const rows = cohort.rows.filter(row => r.patientIds.includes(row.patientId));
    const latest = r.patientIds.length === 1 ? cohort.submissions.filter(s => rows[0].submissionIds.includes(s.id))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] : null;
    const firstName = latest?.guardian_email?.trim().toLowerCase() === r.email ? latest.guardian_first_name
      : latest?.form_email?.trim().toLowerCase() === r.email ? latest.vorname : undefined;
    return { email: r.email, patientIds: r.patientIds.slice().sort(),
      accountIds: rows.map(row => row.portalAccountId!).sort(), firstName: firstName || undefined };
  });
}

async function manifest(db: Db): Promise<Manifest | null> {
  const q = await db.from("einstellungen").select("value").eq("key", KEY).maybeSingle();
  if (q.error) throw new Error("Campaign manifest unavailable");
  const value = q.data?.value as Manifest | undefined;
  if (value && (value.version !== invitationVersion() || !Array.isArray(value.recipients))) throw new Error("Campaign content changed; review required");
  return value || null;
}

async function runs(db: Db) {
  const all: { id: string; status: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const q = await db.from("workflow_runs").select("id,status").eq("workflow_id", ID).order("id").range(offset, offset + 499);
    if (q.error) throw new Error("Campaign audit unavailable");
    all.push(...q.data);
    if (q.data.length < 500) return all;
  }
}

async function progress(db: Db, saved: Manifest | null) {
  const history = await runs(db);
  const claims = new Map(history.map(row => [row.id, row.status]));
  const recipients = saved?.recipients || [];
  return { prepared: !!saved, testAccepted: claims.get(testId()) === "success",
    total: recipients.length, accepted: recipients.filter(r => claims.get(invitationClaimId(r.email)) === "success").length,
    held: recipients.filter(r => ["failed", "skipped", "running"].includes(claims.get(invitationClaimId(r.email)) || "")).length,
    pending: recipients.filter(r => !claims.has(invitationClaimId(r.email))).length };
}

export async function previewInvitationCampaign() {
  const db = createServerClient();
  const cohort = await loadActivationCohort(db, new Date().toISOString());
  const saved = await manifest(db);
  const eligible = invitationRecipients(cohort);
  return { ...await progress(db, saved), eligible: eligible.length, patients: cohort.rows.length,
    heldAddresses: cohort.recipients.length - eligible.length,
    subject: mail("{{Vorname}}").subject, text: mail("{{Vorname}}").text };
}

export async function prepareInvitationCampaign() {
  const db = createServerClient();
  let saved = await manifest(db);
  if (!saved) {
    const cohort = await loadActivationCohort(db, new Date().toISOString());
    saved = { createdAt: new Date().toISOString(), version: invitationVersion(), recipients: invitationRecipients(cohort) };
    if (!saved.recipients.length) throw new Error("No eligible recipients");
    const q = await db.from("einstellungen").insert({ key: KEY, value: saved });
    if (q.error && q.error.code !== "23505") throw new Error("Could not freeze recipient manifest");
    saved = await manifest(db);
  }
  return progress(db, saved);
}

async function dispatch(db: Db, id: string, recipient: Recipient, test: boolean) {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.ANIMASIGN_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Mail transport unavailable");
  const q = await db.from("workflow_runs").insert({ id, workflow_id: ID, trigger_event: test ? "portal_invitation_test" : "portal_invitation_campaign",
    status: "running", started_at: new Date().toISOString(), result: { test, version: invitationVersion(), patientIds: recipient.patientIds } });
  if (q.error?.code === "23505") return "already_claimed";
  if (q.error) throw new Error("Could not reserve dispatch");
  let status = "failed", providerId: string | null = null;
  try {
    if (!test) {
      for (const accountId of recipient.accountIds) {
        const { data, error } = await db.auth.admin.getUserById(accountId);
        const user = data.user;
        if (error || !user || !recipient.patientIds.includes(user.user_metadata?.patient_id) ||
            (user.app_metadata?.role || user.user_metadata?.role) !== "patient" ||
            (user.banned_until && Date.parse(user.banned_until) > Date.now())) throw new Error("Account verification changed");
      }
    }
    const content = mail(recipient.firstName);
    const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": id },
      body: JSON.stringify({ from, to: recipient.email, reply_to: "orthoschub@web.de", ...content,
        subject: test ? `[TEST] ${content.subject}` : content.subject }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.id) throw new Error("Mail acceptance not confirmed");
    providerId = payload.id;
    status = "success";
  } catch {
    // Preserve a failed/uncertain claim: human review instead of blind retries.
  }
  const finished = await db.from("workflow_runs").update({ status, finished_at: new Date().toISOString(),
    result: { test, version: invitationVersion(), patientIds: recipient.patientIds, providerId, deliveryConfirmed: false },
    error: status === "failed" ? "Dispatch requires review; no automatic retry" : null }).eq("id", id);
  if (finished.error) throw new Error("Dispatch audit finalization failed");
  return status;
}

export async function testInvitationCampaign() {
  const db = createServerClient();
  await dispatch(db, testId(), { email: "psycreeds@gmail.com", firstName: "Juan", patientIds: [], accountIds: [] }, true);
  return progress(db, await manifest(db));
}

export async function sendInvitationBatch() {
  const db = createServerClient();
  const saved = await manifest(db);
  if (!saved || !(await progress(db, saved)).testAccepted) throw new Error("Reviewed campaign and accepted test required");
  const prior = new Set((await runs(db)).map(row => row.id));
  const batch = saved.recipients.filter(r => !prior.has(invitationClaimId(r.email))).slice(0, 3);
  const cohort = await loadActivationCohort(db, new Date().toISOString());
  const fresh = new Map(invitationRecipients(cohort).map(r => [r.email, r]));
  let dispatchFailed = false;
  for (const recipient of batch) {
    const current = fresh.get(recipient.email);
    if (!current || JSON.stringify(current.patientIds) !== JSON.stringify(recipient.patientIds) ||
        JSON.stringify(current.accountIds) !== JSON.stringify(recipient.accountIds)) {
      const held = await db.from("workflow_runs").insert({ id: invitationClaimId(recipient.email), workflow_id: ID,
        trigger_event: "portal_invitation_campaign", status: "skipped", started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
        result: { reason: "recipient_changed", patientIds: recipient.patientIds } });
      if (held.error && held.error.code !== "23505") throw new Error("Could not record recipient hold");
      continue;
    }
    const outcome = await dispatch(db, invitationClaimId(recipient.email), current, false);
    if (outcome === "failed") { dispatchFailed = true; break; }
    // Respect the provider's typical two-requests-per-second limit.
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  return { ...await progress(db, saved), dispatchFailed };
}
