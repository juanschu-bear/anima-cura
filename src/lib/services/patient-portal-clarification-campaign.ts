import { createHash } from "node:crypto";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { PATIENT_EMAIL_FROM, PATIENT_EMAIL_REPLY_TO } from "@/lib/email/delivery";
import { buildPatientPortalClarificationEmail } from "@/lib/email/patient-portal-clarification";
import { prepareTrackedEmail, safeCreateCommunicationMessage, safeRecordCommunicationEvent } from "@/lib/services/communication-ledger";
import { loadActivationCohort } from "@/lib/services/portal-activation-workflow";

export const CLARIFICATION_WORKFLOW_ID = "81d31aaa-62f0-49dc-94ae-570c8bf13c29";
export const CLARIFICATION_AUTH_SETTING = "patient_portal_clarification_dispatch_authorization";
const SOURCE_SETTING = "q3_2026_invoice_email_campaign";
const EVENT = "patient_portal_clarification_20261015";
const sourceSchema = z.object({ recipients: z.array(z.object({ email: z.string().email(), patientIds: z.array(z.string().uuid()).min(1) })) });
type Db = ReturnType<typeof createServerClient>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const claimId = (email: string) => { const value = hash(`${CLARIFICATION_WORKFLOW_ID}:${email.trim().toLowerCase()}`); return `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`; };
const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

async function sourceRecipients(db: Db) {
  const setting = await db.from("einstellungen").select("value").eq("key", SOURCE_SETTING).maybeSingle();
  if (setting.error || !setting.data?.value) throw new Error("Freigegebener Empfängerkreis fehlt");
  const source = sourceSchema.parse(setting.data.value);
  const ids = Array.from(new Set(source.recipients.flatMap(row => row.patientIds)));
  const patientRows: Array<{ id: string; email: string | null; versicherter_email: string | null }> = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = await db.from("patients").select("id,email,versicherter_email").in("id", ids.slice(offset, offset + 100));
    if (result.error) throw new Error("Aktuelle Kontaktdaten konnten nicht geprüft werden");
    patientRows.push(...result.data);
  }
  const patients = new Map(patientRows.map(row => [row.id, row]));
  const activation = await loadActivationCohort(db, new Date().toISOString());
  const activationByPatient = new Map(activation.rows.map(row => [row.patientId, row]));
  const ready: typeof source.recipients = [];
  let held = 0;
  for (const recipient of source.recipients) {
    const email = normalize(recipient.email);
    const current = recipient.patientIds.every(patientId => {
      const patient = patients.get(patientId);
      const activationRow = activationByPatient.get(patientId);
      const direct = [patient?.email, patient?.versicherter_email].map(normalize).includes(email);
      const verified = normalize(activationRow?.email) === email && !activationRow?.contactIssue;
      return Boolean(patient && (direct || verified));
    });
    if (current) ready.push({ ...recipient, email }); else held += 1;
  }
  return { ready, held };
}

async function runs(db: Db) {
  const result = await db.from("workflow_runs").select("id,status,error").eq("workflow_id", CLARIFICATION_WORKFLOW_ID);
  if (result.error) throw new Error("Versandprotokoll konnte nicht gelesen werden");
  return new Map(result.data.map(row => [row.id, row]));
}

export async function patientPortalClarificationStatus() {
  const db = createServerClient();
  const { ready, held } = await sourceRecipients(db);
  const existing = await runs(db);
  return {
    total: ready.length,
    held,
    accepted: ready.filter(row => existing.get(claimId(row.email))?.status === "success").length,
    failed: ready.filter(row => existing.get(claimId(row.email))?.status === "failed").length,
    pending: ready.filter(row => !existing.has(claimId(row.email))).length,
  };
}

export async function sendPatientPortalClarificationBatch(limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("Ungültige Paketgröße");
  const db = createServerClient();
  const { ready } = await sourceRecipients(db);
  const existing = await runs(db);
  const batch = ready.filter(row => !existing.has(claimId(row.email))).slice(0, limit);
  for (const recipient of batch) {
    const id = claimId(recipient.email);
    const reserved = await db.from("workflow_runs").insert({ id, workflow_id: CLARIFICATION_WORKFLOW_ID, trigger_event: EVENT, status: "running", started_at: new Date().toISOString(), result: { patientIds: recipient.patientIds } });
    if (reserved.error?.code === "23505") continue;
    if (reserved.error) throw new Error("Versand konnte nicht reserviert werden");
    let message: Awaited<ReturnType<typeof safeCreateCommunicationMessage>> = null;
    try {
      let email = buildPatientPortalClarificationEmail("de");
      message = await safeCreateCommunicationMessage({ patientId: recipient.patientIds.length === 1 ? recipient.patientIds[0] : null, campaignKey: EVENT, provider: "resend", recipient: recipient.email, subject: email.subject, metadata: { patientIds: recipient.patientIds } });
      if (message) email = { ...email, ...await prepareTrackedEmail(message, email) };
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new Error("Versanddienst nicht konfiguriert");
      const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": id }, body: JSON.stringify({ from: PATIENT_EMAIL_FROM, to: recipient.email, reply_to: PATIENT_EMAIL_REPLY_TO, subject: email.subject, html: email.html, text: email.text }) });
      const payload = await response.json().catch(() => null) as { id?: string } | null;
      if (!response.ok || !payload?.id) throw new Error(`Versanddienst hat die Nachricht abgelehnt (${response.status})`);
      if (message) await safeRecordCommunicationEvent({ messageId: message.id, eventType: "accepted", source: "transport", providerMessageId: payload.id });
      const finished = await db.from("workflow_runs").update({ status: "success", finished_at: new Date().toISOString(), result: { patientIds: recipient.patientIds, providerId: payload.id, deliveryConfirmed: false } }).eq("id", id);
      if (finished.error) throw new Error("Versandprotokoll konnte nicht abgeschlossen werden");
    } catch (error) {
      if (message) await safeRecordCommunicationEvent({ messageId: message.id, eventType: "failed", source: "transport" });
      await db.from("workflow_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: error instanceof Error ? error.message : "Versand fehlgeschlagen" }).eq("id", id);
    }
    await new Promise(resolve => setTimeout(resolve, 650));
  }
  return patientPortalClarificationStatus();
}
