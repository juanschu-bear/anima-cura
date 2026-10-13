import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { deterministicBillingUuid, validateBillingManifest, verifyBillingPdf, parseBillingCaseKey } from "../src/lib/billing-publish";
import { createServerClient } from "../src/lib/db/supabase";
import { billingInvoiceEmailVersion, buildBillingInvoiceEmail } from "../src/lib/email/billing-invoice-campaign";
import { loadActivationCohort } from "../src/lib/services/portal-activation-workflow";
import { contactEmailIssue, normalizeEmail } from "../src/lib/services/patient-outreach-audit";
import { storeQ3InvoiceEmailManifest } from "../src/lib/services/q3-invoice-email-campaign";

loadEnvConfig(process.cwd());

const WORKFLOW_ID = "bedfe0d5-e279-4ad0-be8f-f8e8319f38af";
const EVENT = "q3_2026_invoice_email";
const TEST_EMAIL = "psycreeds@gmail.com";
const REPLY_TO = "orthoschub@web.de";

const auditSchema = z.object({
  summary: z.object({ invoice_count: z.number().int(), unique_patients: z.number().int() }),
  patients: z.array(z.object({
    patient_id: z.string().uuid(),
    contact_email: z.string().refine(value => !contactEmailIssue(value, new Set()), "Invalid email").nullable(),
    contact_source: z.enum(["verified_anamnesis", "patient_master_data"]).nullable(),
    contact_ready: z.boolean(),
    contact_hold_reasons: z.array(z.string()),
    priority: z.enum(["activation", "invoice_alert", "reached"]),
  })),
  recipients: z.array(z.object({
    email: z.string().refine(value => !contactEmailIssue(value, new Set()), "Invalid email"),
    patient_ids: z.array(z.string().uuid()).min(1),
    priority: z.enum(["activation", "invoice_alert"]),
  })),
});

type PatientRow = {
  id: string;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  versicherter_email: string | null;
};

function argument(name: string) {
  const prefix = `${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

function required(name: string) {
  const value = argument(name);
  if (!value) throw new Error(`Missing ${name}`);
  return resolve(value);
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function uuidFromHash(value: string) {
  const hex = hash(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function allByIds(db: ReturnType<typeof createServerClient>, ids: string[]) {
  const rows: PatientRow[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const result = await db.from("patients")
      .select("id,vorname,nachname,email,versicherter_email")
      .in("id", ids.slice(index, index + 100));
    if (result.error) throw new Error("Patient contact verification failed");
    rows.push(...((result.data ?? []) as PatientRow[]));
  }
  return rows;
}

async function writePrivateJson(path: string, value: unknown) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

function displayName(patient: PatientRow) {
  const name = [patient.vorname, patient.nachname].filter(Boolean).join(" ").trim();
  return name || "Patient/in";
}

function attachmentName(caseKey: string) {
  const parsed = parseBillingCaseKey(caseKey);
  return `Rechnung-Q${parsed.quarter}-${parsed.year}-${parsed.schedule}-${parsed.patientNumber}-${parsed.sequence}.pdf`;
}

async function testPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawText("TEST - KEINE RECHNUNG", { x: 70, y: 740, size: 24, font, color: rgb(0.08, 0.25, 0.21) });
  page.drawText("Nur technische Versandpruefung. Keine Zahlungsaufforderung.", {
    x: 70, y: 700, size: 12, font: await document.embedFont(StandardFonts.Helvetica), color: rgb(0.2, 0.25, 0.24),
  });
  return Buffer.from(await document.save());
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
  const from = process.env.ANIMASIGN_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Mail transport unavailable");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: input.to,
      reply_to: REPLY_TO,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
    }),
  });
  const payload = await response.json().catch(() => null) as { id?: string } | null;
  if (!response.ok || !payload?.id) throw new Error(`Mail provider rejected request (${response.status})`);
  return payload.id;
}

async function main() {
  const mode = argument("--mode");
  if (!mode || !["preview", "prepare", "test", "send", "status"].includes(mode)) {
    throw new Error("Use --mode=preview|prepare|test|send|status");
  }
  const manifestPath = required("--manifest");
  const receiptPath = required("--receipt");
  const auditPath = required("--audit");
  const reportPath = required("--report");
  const dueDate = argument("--due-date") || "27.10.2026";
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dueDate)) throw new Error("Invalid due date");

  const manifest = validateBillingManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as { apply?: boolean; total?: number };
  const audit = auditSchema.parse(JSON.parse(await readFile(auditPath, "utf8")));
  if (!receipt.apply || receipt.total !== manifest.rows.length || audit.summary.invoice_count !== manifest.rows.length) {
    throw new Error("Invoice publication proof and outreach audit do not describe the same complete batch");
  }
  const patientIds = Array.from(new Set(manifest.rows.map(row => row.patient_id))).sort();
  if (patientIds.length !== audit.summary.unique_patients) throw new Error("Patient cohort mismatch");

  const db = createServerClient();
  const patientRows = await allByIds(db, patientIds);
  const patients = new Map(patientRows.map(patient => [patient.id, patient]));
  const patientAudit = new Map(audit.patients.map(patient => [patient.patient_id, patient]));
  const invoiceRows = new Map<string, typeof manifest.rows>();
  for (const row of manifest.rows) invoiceRows.set(row.patient_id, [...(invoiceRows.get(row.patient_id) ?? []), row]);
  const activation = await loadActivationCohort(db, new Date().toISOString());
  const activationRows = new Map(activation.rows.map(row => [row.patientId, row]));
  const identityHolds = new Set([
    "patient_missing", "conflicting_patient_links", "patient_identity_review", "duplicate_patient_identity",
    "possible_test_record", "submission_email_conflict", "same_time_email_conflict",
  ]);

  const heldPatients = audit.patients.filter(patient => !patient.contact_ready).map(patient => ({
    patient_id: patient.patient_id,
    patient_name: patients.has(patient.patient_id) ? displayName(patients.get(patient.patient_id)!) : "Unbekannt",
    reasons: patient.contact_hold_reasons,
  }));
  const ready: Array<{
    email: string;
    priority: "activation" | "invoice_alert";
    patientIds: string[];
    invoices: Array<{ patientName: string; patientId: string; documentId: string; amountCents: number; file: string; filename: string; sha256: string; caseKey: string }>;
  }> = [];
  const heldRecipients: Array<{ email: string; patient_ids: string[]; reason: string }> = [];

  for (const recipient of audit.recipients) {
    let current = true;
    for (const patientId of recipient.patient_ids) {
      const patient = patients.get(patientId);
      const audited = patientAudit.get(patientId);
      if (!patient || !audited?.contact_email || normalizeEmail(audited.contact_email) !== normalizeEmail(recipient.email)) {
        current = false;
        break;
      }
      if (audited.contact_source === "patient_master_data") {
        const direct = [patient.email, patient.versicherter_email].map(normalizeEmail).filter(Boolean);
        if (!direct.includes(normalizeEmail(recipient.email)) || contactEmailIssue(recipient.email, new Set())) current = false;
      } else if (audited.contact_source === "verified_anamnesis") {
        const row = activationRows.get(patientId);
        if (!row || normalizeEmail(row.email) !== normalizeEmail(recipient.email) || row.contactIssue ||
          row.issues.some(issue => identityHolds.has(issue))) current = false;
      } else current = false;
    }
    if (!current) {
      heldRecipients.push({ email: recipient.email, patient_ids: recipient.patient_ids, reason: "contact_changed_since_audit" });
      continue;
    }
    const invoices = recipient.patient_ids.flatMap(patientId => {
      const patient = patients.get(patientId)!;
      return (invoiceRows.get(patientId) ?? []).map(row => ({
        patientName: displayName(patient),
        patientId,
        documentId: deterministicBillingUuid("document", row.case_key),
        amountCents: row.cents,
        file: row.file,
        filename: attachmentName(row.case_key),
        sha256: row.sha256,
        caseKey: row.case_key,
      }));
    });
    if (!invoices.length) {
      heldRecipients.push({ email: recipient.email, patient_ids: recipient.patient_ids, reason: "invoice_missing" });
      continue;
    }
    ready.push({ email: recipient.email, priority: recipient.priority, patientIds: recipient.patient_ids, invoices });
  }

  const version = billingInvoiceEmailVersion(dueDate);
  const priorReport = await readFile(reportPath, "utf8").then(value => JSON.parse(value)).catch(() => null) as {
    version?: string; testAccepted?: boolean;
  } | null;
  const baseReport = {
    generated_at: new Date().toISOString(),
    version,
    due_date: dueDate,
    invoices: manifest.rows.length,
    unique_patients: patientIds.length,
    ready_recipients: ready.length,
    activation_recipients: ready.filter(row => row.priority === "activation").length,
    invoice_alert_recipients: ready.filter(row => row.priority === "invoice_alert").length,
    held_patients_without_contact: heldPatients,
    held_recipients: heldRecipients,
  };
  if (mode === "preview" || mode === "status") {
    console.log(JSON.stringify({ ...baseReport, emails_sent: 0 }, null, 2));
    return;
  }
  if (mode === "prepare") {
    const prepared = await storeQ3InvoiceEmailManifest({
      version,
      dueDate,
      createdAt: new Date().toISOString(),
      recipients: ready.map(recipient => ({
        email: recipient.email,
        priority: recipient.priority,
        patientIds: recipient.patientIds,
        invoices: recipient.invoices.map(invoice => ({
          patientId: invoice.patientId,
          documentId: invoice.documentId,
          amountCents: invoice.amountCents,
          sha256: invoice.sha256,
          caseKey: invoice.caseKey,
        })),
      })),
    });
    await writePrivateJson(reportPath, { ...baseReport, prepared, testAccepted: false, emails_sent: 0 });
    console.log(JSON.stringify(prepared));
    return;
  }

  const testClaimId = uuidFromHash(`${WORKFLOW_ID}:test:${version}`);
  if (mode === "test") {
    const existing = await db.from("workflow_runs").select("status,result").eq("id", testClaimId).maybeSingle();
    if (existing.error) throw new Error("Test dispatch audit unavailable");
    if (existing.data?.status !== "success") {
      const claim = await db.from("workflow_runs").insert({
        id: testClaimId, workflow_id: WORKFLOW_ID, trigger_event: `${EVENT}_test`, status: "running",
        started_at: new Date().toISOString(), result: { version, test: true },
      });
      if (claim.error && claim.error.code !== "23505") throw new Error("Could not reserve test dispatch");
      const content = buildBillingInvoiceEmail({
        activationRequired: true, dueDate, test: true,
        invoices: [{ patientName: "TEST – Beispieldaten", amountCents: 1234 }],
      });
      let providerId: string | null = null;
      try {
        providerId = await providerSend({
          idempotencyKey: testClaimId,
          to: TEST_EMAIL,
          ...content,
          attachments: [{ filename: "TEST-keine-Rechnung.pdf", content: (await testPdf()).toString("base64") }],
        });
      } catch (error) {
        await db.from("workflow_runs").update({ status: "failed", finished_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Test failed", result: { version, test: true } }).eq("id", testClaimId);
        throw error;
      }
      await db.from("workflow_runs").update({ status: "success", finished_at: new Date().toISOString(),
        result: { version, test: true, providerId, deliveryConfirmed: false } }).eq("id", testClaimId);
    }
    await writePrivateJson(reportPath, { ...baseReport, testAccepted: true, testRecipient: TEST_EMAIL, emails_sent: 0 });
    console.log(JSON.stringify({ testAccepted: true, recipient: TEST_EMAIL, ready: ready.length }));
    return;
  }

  const testRun = await db.from("workflow_runs").select("status,result").eq("id", testClaimId).maybeSingle();
  if (testRun.error || testRun.data?.status !== "success") throw new Error("Accepted test email required before bulk send");
  if (priorReport?.version && priorReport.version !== version) throw new Error("Campaign content changed after test");

  const outcomes: Array<{ email: string; patient_ids: string[]; status: string; provider_id?: string; reason?: string }> = [];
  let accepted = 0;
  for (let index = 0; index < ready.length; index += 1) {
    const recipient = ready[index];
    const claimId = uuidFromHash(`${WORKFLOW_ID}:${recipient.email}`);
    const existing = await db.from("workflow_runs").select("status,result,error").eq("id", claimId).maybeSingle();
    if (existing.error) throw new Error("Dispatch audit unavailable");
    if (existing.data) {
      outcomes.push({ email: recipient.email, patient_ids: recipient.patientIds,
        status: existing.data.status === "success" ? "already_accepted" : "held_existing_claim",
        reason: existing.data.status === "success" ? undefined : existing.data.error || "existing_claim_requires_review" });
      if (existing.data.status === "success") accepted += 1;
      continue;
    }
    const claim = await db.from("workflow_runs").insert({
      id: claimId, workflow_id: WORKFLOW_ID, trigger_event: EVENT, status: "running",
      started_at: new Date().toISOString(), result: { version, patientIds: recipient.patientIds },
    });
    if (claim.error) {
      outcomes.push({ email: recipient.email, patient_ids: recipient.patientIds, status: "held", reason: "claim_failed" });
      continue;
    }
    try {
      const attachments = [] as Array<{ filename: string; content: string }>;
      for (const invoice of recipient.invoices) {
        const pdf = await readFile(invoice.file);
        const row = manifest.rows.find(value => value.case_key === invoice.caseKey)!;
        verifyBillingPdf(row, pdf);
        attachments.push({ filename: invoice.filename, content: pdf.toString("base64") });
      }
      const content = buildBillingInvoiceEmail({
        activationRequired: recipient.priority === "activation",
        dueDate,
        invoices: recipient.invoices.map(invoice => ({ patientName: invoice.patientName, amountCents: invoice.amountCents })),
      });
      const providerId = await providerSend({ idempotencyKey: claimId, to: recipient.email, ...content, attachments });
      const finished = await db.from("workflow_runs").update({
        status: "success", finished_at: new Date().toISOString(),
        result: { version, patientIds: recipient.patientIds, providerId, deliveryConfirmed: false },
      }).eq("id", claimId);
      if (finished.error) throw new Error("Accepted dispatch could not be finalized");
      outcomes.push({ email: recipient.email, patient_ids: recipient.patientIds, status: "provider_accepted", provider_id: providerId });
      accepted += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "dispatch_requires_review";
      await db.from("workflow_runs").update({ status: "failed", finished_at: new Date().toISOString(),
        error: reason, result: { version, patientIds: recipient.patientIds, deliveryConfirmed: false } }).eq("id", claimId);
      outcomes.push({ email: recipient.email, patient_ids: recipient.patientIds, status: "failed", reason });
    }
    if ((index + 1) % 25 === 0 || index + 1 === ready.length) {
      console.log(JSON.stringify({ processed: index + 1, total: ready.length, accepted,
        failed_or_held: outcomes.filter(row => !["provider_accepted", "already_accepted"].includes(row.status)).length }));
    }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  const finalReport = {
    ...baseReport,
    completed_at: new Date().toISOString(),
    testAccepted: true,
    provider_accepted_or_previously_accepted: accepted,
    failed_or_held: outcomes.filter(row => !["provider_accepted", "already_accepted"].includes(row.status)).length,
    outcomes,
    note: "Provider acceptance is not final delivery confirmation.",
  };
  await writePrivateJson(reportPath, finalReport);
  console.log(JSON.stringify({ accepted, failed_or_held: finalReport.failed_or_held,
    held_patients_without_contact: heldPatients.length, held_recipients: heldRecipients.length }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Billing email campaign failed");
  process.exitCode = 1;
});
