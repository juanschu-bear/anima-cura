import { createHash, randomUUID } from "node:crypto";
import { createServerClient } from "../src/lib/db/supabase";
import { buildBillingInvoiceEmail } from "../src/lib/email/billing-invoice-campaign";
import { buildPatientPortalClarificationEmail } from "../src/lib/email/patient-portal-clarification";
import { Q3_INVOICE_EMAIL_SETTING, Q3_INVOICE_EMAIL_WORKFLOW_ID } from "../src/lib/services/q3-invoice-email-campaign";
import { CLARIFICATION_WORKFLOW_ID } from "../src/lib/services/patient-portal-clarification-campaign";

const CLARIFICATION_CAMPAIGN = "patient_portal_clarification_20261015";
const INVOICE_CAMPAIGN = "q3_2026_invoice_email";

type Recipient = {
  email: string;
  patientIds: string[];
  priority?: "activation" | "invoice_alert";
  invoices?: Array<{ documentId: string }>;
};

type WorkflowRun = {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  result: { providerId?: string; patientIds?: string[] } | null;
};

type LedgerCandidate = {
  providerId: string;
  recipient: string;
  patientIds: string[];
  subject: string;
  campaignKey: string;
  startedAt: string;
  finishedAt: string;
  metadata: Record<string, unknown>;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function claimId(workflowId: string, email: string) {
  const value = hash(`${workflowId}:${email.trim().toLowerCase()}`);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function chunks<T>(rows: T[], size = 100) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
}

async function settingRecipients(key: string): Promise<Recipient[]> {
  const db = createServerClient();
  const result = await db.from("einstellungen").select("value").eq("key", key).maybeSingle();
  if (result.error || !result.data?.value) throw new Error(`Setting fehlt: ${key}`);
  const value = result.data.value as { recipients?: Recipient[] };
  if (!Array.isArray(value.recipients)) throw new Error(`Empfängerliste fehlt: ${key}`);
  return value.recipients;
}

async function successfulRuns(workflowId: string): Promise<WorkflowRun[]> {
  const db = createServerClient();
  const rows: WorkflowRun[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await db.from("workflow_runs")
      .select("id,workflow_id,status,started_at,finished_at,result")
      .eq("workflow_id", workflowId)
      .eq("status", "success")
      .range(offset, offset + 499);
    if (result.error) throw new Error(`Workflow-Läufe konnten nicht gelesen werden: ${result.error.message}`);
    rows.push(...(result.data as WorkflowRun[]));
    if (result.data.length < 500) return rows;
  }
}

async function candidates(): Promise<LedgerCandidate[]> {
  const [recipients, clarificationRuns, invoiceRuns] = await Promise.all([
    settingRecipients(Q3_INVOICE_EMAIL_SETTING),
    successfulRuns(CLARIFICATION_WORKFLOW_ID),
    successfulRuns(Q3_INVOICE_EMAIL_WORKFLOW_ID),
  ]);
  const clarificationById = new Map(clarificationRuns.map(row => [row.id, row]));
  const invoiceById = new Map(invoiceRuns.map(row => [row.id, row]));
  const clarificationSubject = buildPatientPortalClarificationEmail("de").subject;
  const invoiceSubjects = {
    activation: buildBillingInvoiceEmail({ activationRequired: true, dueDate: "27.10.2026", invoices: [{ patientName: "Patient/in", amountCents: 1 }] }).subject,
    invoice_alert: buildBillingInvoiceEmail({ activationRequired: false, dueDate: "27.10.2026", invoices: [{ patientName: "Patient/in", amountCents: 1 }] }).subject,
  };
  const result: LedgerCandidate[] = [];

  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase();
    const clarificationRun = clarificationById.get(claimId(CLARIFICATION_WORKFLOW_ID, email));
    if (clarificationRun?.result?.providerId && clarificationRun.finished_at) {
      result.push({
        providerId: clarificationRun.result.providerId,
        recipient: email,
        patientIds: recipient.patientIds,
        subject: clarificationSubject,
        campaignKey: CLARIFICATION_CAMPAIGN,
        startedAt: clarificationRun.started_at,
        finishedAt: clarificationRun.finished_at,
        metadata: { patientIds: recipient.patientIds, backfilledFrom: "workflow_runs" },
      });
    }

    const invoiceRun = invoiceById.get(claimId(Q3_INVOICE_EMAIL_WORKFLOW_ID, email));
    if (invoiceRun?.result?.providerId && invoiceRun.finished_at && recipient.priority) {
      result.push({
        providerId: invoiceRun.result.providerId,
        recipient: email,
        patientIds: recipient.patientIds,
        subject: invoiceSubjects[recipient.priority],
        campaignKey: INVOICE_CAMPAIGN,
        startedAt: invoiceRun.started_at,
        finishedAt: invoiceRun.finished_at,
        metadata: {
          patientIds: recipient.patientIds,
          documentIds: recipient.invoices?.map(invoice => invoice.documentId) ?? [],
          backfilledFrom: "workflow_runs",
        },
      });
    }
  }
  return result;
}

async function main() {
  const db = createServerClient();
  const rows = await candidates();
  const existing = new Map<string, string>();
  for (const group of chunks(rows.map(row => row.providerId))) {
    const result = await db.from("communication_messages").select("id,provider_message_id")
      .eq("provider", "resend").in("provider_message_id", group);
    if (result.error) throw new Error(`Bestehende Versanddaten konnten nicht gelesen werden: ${result.error.message}`);
    for (const row of result.data) if (row.provider_message_id) existing.set(row.provider_message_id, row.id);
  }

  let inserted = 0;
  for (const group of chunks(rows.filter(row => !existing.has(row.providerId)), 100)) {
    const payload = group.map(row => ({
      id: randomUUID(),
      patient_id: row.patientIds.length === 1 ? row.patientIds[0] : null,
      campaign_key: row.campaignKey,
      channel: "email",
      provider: "resend",
      provider_message_id: row.providerId,
      recipient: row.recipient,
      subject: row.subject,
      status: "accepted",
      tracking_token: randomUUID(),
      sent_at: row.finishedAt,
      last_event_at: row.finishedAt,
      metadata: row.metadata,
      created_at: row.startedAt,
      updated_at: row.finishedAt,
    }));
    const result = await db.from("communication_messages").insert(payload).select("id,provider_message_id");
    if (result.error) throw new Error(`Versanddaten konnten nicht übernommen werden: ${result.error.message}`);
    for (const row of result.data) if (row.provider_message_id) existing.set(row.provider_message_id, row.id);
    inserted += result.data.length;
  }

  const events = rows.flatMap(row => {
    const messageId = existing.get(row.providerId);
    if (!messageId) throw new Error(`Ledger-ID fehlt: ${row.providerId}`);
    return [
      { message_id: messageId, event_type: "queued", event_key: `backfill:${row.providerId}:queued`, source: "anima_cura", occurred_at: row.startedAt, metadata: { backfilled: true } },
      { message_id: messageId, event_type: "accepted", event_key: `backfill:${row.providerId}:accepted`, source: "transport", occurred_at: row.finishedAt, metadata: { backfilled: true } },
    ];
  });
  const existingEventKeys = new Set<string>();
  for (const group of chunks(events.map(event => event.event_key), 100)) {
    const result = await db.from("communication_events").select("event_key").in("event_key", group);
    if (result.error) throw new Error(`Bestehende Versandereignisse konnten nicht gelesen werden: ${result.error.message}`);
    for (const row of result.data) if (row.event_key) existingEventKeys.add(row.event_key);
  }
  for (const group of chunks(events.filter(event => !existingEventKeys.has(event.event_key)), 200)) {
    const result = await db.from("communication_events").insert(group);
    if (result.error) throw new Error(`Versandereignisse konnten nicht übernommen werden: ${result.error.message}`);
  }

  const campaignCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.campaignKey] = (counts[row.campaignKey] ?? 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({ candidates: rows.length, inserted, existing: rows.length - inserted, campaignCounts }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
