import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { deterministicBillingUuid, parseBillingCaseKey } from "@/lib/billing-publish";
import { BILLING_DOCUMENTS_BUCKET, billingDocumentPath, billingDocumentUrl } from "@/lib/billing-document-access";
import { createServerClient } from "@/lib/db/supabase";
import { billingInvoiceEmailVersion, buildBillingInvoiceEmail } from "@/lib/email/billing-invoice-campaign";
import { PATIENT_EMAIL_FROM, PATIENT_EMAIL_REPLY_TO } from "@/lib/email/delivery";
import { contactEmailIssue } from "@/lib/services/patient-outreach-audit";
import {
  prepareTrackedEmail,
  safeCreateCommunicationMessage,
  safeRecordCommunicationEvent,
} from "@/lib/services/communication-ledger";

export const Q3_INVOICE_EMAIL_WORKFLOW_ID = "bedfe0d5-e279-4ad0-be8f-f8e8319f38af";
export const Q3_INVOICE_EMAIL_SETTING = "q3_2026_invoice_email_campaign";
const EVENT = "q3_2026_invoice_email";
const TEST_EMAIL = "psycreeds@gmail.com";

const invoiceSchema = z.object({
  patientId: z.string().uuid(),
  documentId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  caseKey: z.string().min(1),
});
const recipientSchema = z.object({
  email: z.string().refine(value => !contactEmailIssue(value, new Set()), "Invalid email"),
  priority: z.enum(["activation", "invoice_alert"]),
  patientIds: z.array(z.string().uuid()).min(1),
  invoices: z.array(invoiceSchema).min(1),
});
const manifestSchema = z.object({
  version: z.string().regex(/^[a-f0-9]{64}$/),
  dueDate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/),
  createdAt: z.string().datetime(),
  recipients: z.array(recipientSchema).min(1),
});
export type Q3InvoiceEmailManifest = z.infer<typeof manifestSchema>;
type Db = ReturnType<typeof createServerClient>;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function uuidFromHash(value: string) {
  const hex = hash(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const claimId = (email: string) => uuidFromHash(`${Q3_INVOICE_EMAIL_WORKFLOW_ID}:${email.trim().toLowerCase()}`);
const testClaimId = (version: string) => uuidFromHash(`${Q3_INVOICE_EMAIL_WORKFLOW_ID}:test:${version}`);

async function readManifest(db: Db) {
  const result = await db.from("einstellungen").select("value").eq("key", Q3_INVOICE_EMAIL_SETTING).maybeSingle();
  if (result.error) throw new Error("Campaign manifest unavailable");
  if (!result.data?.value) return null;
  return manifestSchema.parse(result.data.value);
}

async function readRuns(db: Db) {
  const rows: Array<{ id: string; status: string; error: string | null; result: Record<string, unknown> | null }> = [];
  for (let offset = 0; ; offset += 500) {
    const result = await db.from("workflow_runs").select("id,status,error,result")
      .eq("workflow_id", Q3_INVOICE_EMAIL_WORKFLOW_ID).range(offset, offset + 499);
    if (result.error) throw new Error("Campaign audit unavailable");
    rows.push(...(result.data as typeof rows));
    if (result.data.length < 500) return rows;
  }
}

async function campaignProgress(db: Db, manifest: Q3InvoiceEmailManifest | null) {
  const runs = await readRuns(db);
  const byId = new Map(runs.map(row => [row.id, row]));
  const recipients = manifest?.recipients ?? [];
  const test = manifest ? byId.get(testClaimId(manifest.version)) : null;
  return {
    prepared: Boolean(manifest),
    total: recipients.length,
    activation: recipients.filter(row => row.priority === "activation").length,
    invoiceAlert: recipients.filter(row => row.priority === "invoice_alert").length,
    invoices: recipients.reduce((sum, row) => sum + row.invoices.length, 0),
    testAccepted: test?.status === "success",
    accepted: recipients.filter(row => byId.get(claimId(row.email))?.status === "success").length,
    failed: recipients.filter(row => ["failed", "running", "skipped"].includes(byId.get(claimId(row.email))?.status ?? "")).length,
    pending: recipients.filter(row => !byId.has(claimId(row.email))).length,
  };
}

export async function storeQ3InvoiceEmailManifest(input: unknown) {
  const manifest = manifestSchema.parse(input);
  if (manifest.version !== billingInvoiceEmailVersion(manifest.dueDate)) throw new Error("Campaign content version mismatch");
  const emails = new Set<string>();
  const documentIds = new Set<string>();
  for (const recipient of manifest.recipients) {
    const normalized = recipient.email.trim().toLowerCase();
    if (emails.has(normalized)) throw new Error("Duplicate campaign recipient");
    emails.add(normalized);
    for (const invoice of recipient.invoices) {
      if (!recipient.patientIds.includes(invoice.patientId)) throw new Error("Invoice recipient ownership mismatch");
      if (invoice.documentId !== deterministicBillingUuid("document", invoice.caseKey)) throw new Error("Invoice document identity mismatch");
      if (documentIds.has(invoice.documentId)) throw new Error("Duplicate campaign invoice");
      documentIds.add(invoice.documentId);
    }
  }
  const db = createServerClient();
  const progress = await campaignProgress(db, await readManifest(db));
  if (progress.accepted || progress.failed) throw new Error("A dispatched campaign cannot be replaced");
  const result = await db.from("einstellungen").upsert({ key: Q3_INVOICE_EMAIL_SETTING, value: manifest }, { onConflict: "key" });
  if (result.error) throw new Error("Could not store campaign manifest");
  return campaignProgress(db, manifest);
}

async function providerSend(input: {
  idempotencyKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: Array<{ filename: string; content: string }>;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = PATIENT_EMAIL_FROM;
  if (!apiKey) throw new Error("Mail transport unavailable");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({ from, to: input.to, reply_to: PATIENT_EMAIL_REPLY_TO, subject: input.subject,
      html: input.html, text: input.text, attachments: input.attachments }),
  });
  const payload = await response.json().catch(() => null) as { id?: string } | null;
  if (!response.ok || !payload?.id) throw new Error(`Mail provider rejected request (${response.status})`);
  return payload.id;
}

async function makeTestPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("TEST - KEINE RECHNUNG", { x: 70, y: 740, size: 24, font: bold, color: rgb(0.08, 0.25, 0.21) });
  page.drawText("Nur technische Versandpruefung. Keine Zahlungsaufforderung.", {
    x: 70, y: 700, size: 12, font: regular, color: rgb(0.2, 0.25, 0.24),
  });
  return Buffer.from(await document.save());
}

export async function q3InvoiceEmailCampaignStatus() {
  const db = createServerClient();
  const manifest = await readManifest(db);
  return campaignProgress(db, manifest);
}

export async function testQ3InvoiceEmailCampaign() {
  const db = createServerClient();
  const manifest = await readManifest(db);
  if (!manifest || manifest.version !== billingInvoiceEmailVersion(manifest.dueDate)) throw new Error("Reviewed campaign required");
  const id = testClaimId(manifest.version);
  const existing = await db.from("workflow_runs").select("status").eq("id", id).maybeSingle();
  if (existing.error) throw new Error("Test audit unavailable");
  if (!existing.data) {
    const claim = await db.from("workflow_runs").insert({ id, workflow_id: Q3_INVOICE_EMAIL_WORKFLOW_ID,
      trigger_event: `${EVENT}_test`, status: "running", started_at: new Date().toISOString(), result: { version: manifest.version, test: true } });
    if (claim.error) throw new Error("Could not reserve test dispatch");
    let email = buildBillingInvoiceEmail({ activationRequired: true, dueDate: manifest.dueDate, test: true,
      invoices: [{ patientName: "TEST – Beispieldaten", amountCents: 1234 }] });
    const ledgerMessage = await safeCreateCommunicationMessage({
      campaignKey: EVENT,
      provider: "resend",
      recipient: TEST_EMAIL,
      subject: email.subject,
      metadata: { test: true, version: manifest.version },
    });
    if (ledgerMessage) email = { ...email, ...await prepareTrackedEmail(ledgerMessage, email) };
    try {
      const providerId = await providerSend({ idempotencyKey: id, to: TEST_EMAIL, ...email,
        attachments: [{ filename: "TEST-keine-Rechnung.pdf", content: (await makeTestPdf()).toString("base64") }] });
      if (ledgerMessage) await safeRecordCommunicationEvent({ messageId: ledgerMessage.id, eventType: "accepted", source: "transport", providerMessageId: providerId });
      const finish = await db.from("workflow_runs").update({ status: "success", finished_at: new Date().toISOString(),
        result: { version: manifest.version, test: true, providerId, deliveryConfirmed: false } }).eq("id", id);
      if (finish.error) throw new Error("Test audit finalization failed");
    } catch (error) {
      if (ledgerMessage) await safeRecordCommunicationEvent({ messageId: ledgerMessage.id, eventType: "failed", source: "transport" });
      await db.from("workflow_runs").update({ status: "failed", finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Test failed" }).eq("id", id);
      throw error;
    }
  }
  return campaignProgress(db, manifest);
}

async function loadRecipientContent(db: Db, recipient: Q3InvoiceEmailManifest["recipients"][number]) {
  const patientResult = await db.from("patients").select("id,vorname,nachname").in("id", recipient.patientIds);
  if (patientResult.error || patientResult.data.length !== recipient.patientIds.length) throw new Error("Patient verification failed");
  const patients = new Map(patientResult.data.map(row => [row.id, row]));
  const documentIds = recipient.invoices.map(row => row.documentId);
  const documentResult = await db.from("patient_documents").select("id,patient_id,file_url").in("id", documentIds);
  if (documentResult.error || documentResult.data.length !== documentIds.length) throw new Error("Invoice document verification failed");
  const documents = new Map(documentResult.data.map(row => [row.id, row]));
  const attachments: Array<{ filename: string; content: string }> = [];
  const invoiceLines: Array<{ patientName: string; amountCents: number; documentId: string }> = [];
  for (const invoice of recipient.invoices) {
    const patient = patients.get(invoice.patientId);
    const document = documents.get(invoice.documentId);
    if (!patient || !document || document.patient_id !== invoice.patientId || document.file_url !== billingDocumentUrl(invoice.documentId)) {
      throw new Error("Invoice ownership verification failed");
    }
    const downloaded = await db.storage.from(BILLING_DOCUMENTS_BUCKET)
      .download(billingDocumentPath(invoice.patientId, invoice.documentId));
    if (downloaded.error || !downloaded.data) throw new Error("Invoice download failed");
    const pdf = Buffer.from(await downloaded.data.arrayBuffer());
    const directHash = createHash("sha256").update(pdf).digest("hex");
    if (pdf.length === 0 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-" || directHash !== invoice.sha256) {
      throw new Error("Invoice checksum mismatch");
    }
    const parsed = parseBillingCaseKey(invoice.caseKey);
    attachments.push({ filename: `Rechnung-Q${parsed.quarter}-${parsed.year}-${parsed.schedule}-${parsed.patientNumber}-${parsed.sequence}.pdf`, content: pdf.toString("base64") });
    invoiceLines.push({ patientName: [patient.vorname, patient.nachname].filter(Boolean).join(" ") || "Patient/in", amountCents: invoice.amountCents, documentId: invoice.documentId });
  }
  return { attachments, invoiceLines };
}

export async function sendQ3InvoiceEmailBatch(limit = 8) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error("Invalid batch limit");
  const db = createServerClient();
  const manifest = await readManifest(db);
  if (!manifest || manifest.version !== billingInvoiceEmailVersion(manifest.dueDate)) throw new Error("Reviewed campaign required");
  const initial = await campaignProgress(db, manifest);
  if (!initial.testAccepted) throw new Error("Accepted test required");
  const runs = new Set((await readRuns(db)).map(row => row.id));
  const batch = manifest.recipients.filter(row => !runs.has(claimId(row.email))).slice(0, limit);
  for (const recipient of batch) {
    const id = claimId(recipient.email);
    const claim = await db.from("workflow_runs").insert({ id, workflow_id: Q3_INVOICE_EMAIL_WORKFLOW_ID,
      trigger_event: EVENT, status: "running", started_at: new Date().toISOString(),
      result: { version: manifest.version, patientIds: recipient.patientIds } });
    if (claim.error?.code === "23505") continue;
    if (claim.error) throw new Error("Could not reserve dispatch");
    let ledgerMessage: Awaited<ReturnType<typeof safeCreateCommunicationMessage>> = null;
    try {
      const content = await loadRecipientContent(db, recipient);
      let email = buildBillingInvoiceEmail({ activationRequired: recipient.priority === "activation",
        dueDate: manifest.dueDate, invoices: content.invoiceLines });
      ledgerMessage = await safeCreateCommunicationMessage({
        patientId: recipient.patientIds.length === 1 ? recipient.patientIds[0] : null,
        campaignKey: EVENT,
        provider: "resend",
        recipient: recipient.email,
        subject: email.subject,
        metadata: { patientIds: recipient.patientIds, documentIds: recipient.invoices.map(invoice => invoice.documentId) },
      });
      if (ledgerMessage) email = { ...email, ...await prepareTrackedEmail(ledgerMessage, email) };
      const providerId = await providerSend({ idempotencyKey: id, to: recipient.email, ...email, attachments: content.attachments });
      if (ledgerMessage) await safeRecordCommunicationEvent({ messageId: ledgerMessage.id, eventType: "accepted", source: "transport", providerMessageId: providerId });
      const finish = await db.from("workflow_runs").update({ status: "success", finished_at: new Date().toISOString(),
        result: { version: manifest.version, patientIds: recipient.patientIds, providerId, deliveryConfirmed: false } }).eq("id", id);
      if (finish.error) throw new Error("Dispatch audit finalization failed");
    } catch (error) {
      if (ledgerMessage) await safeRecordCommunicationEvent({ messageId: ledgerMessage.id, eventType: "failed", source: "transport" });
      await db.from("workflow_runs").update({ status: "failed", finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Dispatch requires review",
        result: { version: manifest.version, patientIds: recipient.patientIds, deliveryConfirmed: false } }).eq("id", id);
    }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  return campaignProgress(db, manifest);
}
