import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBLEM_STATUSES = new Set(["failed", "bounced", "complained", "suppressed"]);
const ACCEPTED_STATUSES = new Set(["accepted", "delivered", "opened", "clicked"]);
const Q3_INVOICE_CAMPAIGN = "q3_2026_invoice_email";
const Q3_CLARIFICATION_CAMPAIGN = "patient_portal_clarification_20261015";
const Q3_EXPECTED_INVOICES = 732;
const Q3_EXPECTED_PATIENTS = 692;
const Q3_CAMPAIGN_MANIFEST = "q3_2026_invoice_email_campaign";
const chunk = <T,>(rows: T[], size = 100) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

type ManifestRecipient = {
  email: string;
  patientIds: string[];
  invoiceDocumentIds: string[];
};

type BillingReconciliation = {
  quarter: string;
  expectedInvoices: number;
  expectedPatients: number;
  publishedInvoices: number;
  publishedPatients: number;
  portalMissingInvoices: number;
  portalMissingPatients: number;
  preparedRecipients: number;
  preparedPatients: number;
  preparedInvoices: number;
  acceptedRecipients: number;
  acceptedPatients: number;
  acceptedInvoices: number;
  clarificationMessages: number;
  clarificationRecipients: number;
  noContactInvoices: number;
  noContactPatients: number;
  transportIssueInvoices: number;
  transportIssuePatients: number;
  unnotifiedInvoices: number;
  unnotifiedPatients: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function readManifestRecipients(value: unknown): ManifestRecipient[] {
  const record = asRecord(value);
  const recipients = Array.isArray(record?.recipients) ? record.recipients : [];
  return recipients.flatMap((entry) => {
    const row = asRecord(entry);
    if (!row || typeof row.email !== "string" || !row.email.trim()) return [];
    const invoices = Array.isArray(row.invoices) ? row.invoices : [];
    return [{
      email: row.email.trim().toLowerCase(),
      patientIds: asStringArray(row.patientIds),
      invoiceDocumentIds: invoices.flatMap((invoice) => {
        const invoiceRow = asRecord(invoice);
        return typeof invoiceRow?.documentId === "string" && invoiceRow.documentId.trim() ? [invoiceRow.documentId] : [];
      }),
    }];
  });
}

async function loadBillingReconciliation(db: ReturnType<typeof createServerClient>): Promise<BillingReconciliation | null> {
  const [documentsResult, manifestResult, campaignResult] = await Promise.all([
    db.from("patient_documents").select("id,patient_id").ilike("name", "%Rechnung 3/2026%").limit(1000),
    db.from("einstellungen").select("value").eq("key", Q3_CAMPAIGN_MANIFEST).maybeSingle(),
    db.from("communication_messages")
      .select("campaign_key,status,recipient,metadata")
      .in("campaign_key", [Q3_INVOICE_CAMPAIGN, Q3_CLARIFICATION_CAMPAIGN])
      .limit(3000),
  ]);

  if (documentsResult.error || manifestResult.error || campaignResult.error) return null;

  const publishedDocIds = new Set((documentsResult.data ?? []).map((row) => row.id));
  const publishedPatientIds = new Set((documentsResult.data ?? []).map((row) => row.patient_id).filter(Boolean));
  const manifestRecipients = readManifestRecipients(manifestResult.data?.value);
  const preparedRecipients = new Set(manifestRecipients.map((row) => row.email));
  const preparedPatientIds = new Set(manifestRecipients.flatMap((row) => row.patientIds));
  const preparedInvoiceIds = new Set(manifestRecipients.flatMap((row) => row.invoiceDocumentIds));

  const invoiceRows = (campaignResult.data ?? []).filter((row) => row.campaign_key === Q3_INVOICE_CAMPAIGN && ACCEPTED_STATUSES.has(row.status));
  const clarificationRows = (campaignResult.data ?? []).filter((row) => row.campaign_key === Q3_CLARIFICATION_CAMPAIGN && ACCEPTED_STATUSES.has(row.status));

  const acceptedRecipients = new Set(invoiceRows.map((row) => row.recipient.trim().toLowerCase()));
  const acceptedPatientIds = new Set(invoiceRows.flatMap((row) => asStringArray(asRecord(row.metadata)?.patientIds)));
  const acceptedInvoiceIds = new Set(invoiceRows.flatMap((row) => asStringArray(asRecord(row.metadata)?.documentIds)));
  const clarificationRecipients = new Set(clarificationRows.map((row) => row.recipient.trim().toLowerCase()));

  const noContactInvoiceIds = new Set(Array.from(publishedDocIds).filter((id) => !preparedInvoiceIds.has(id)));
  const noContactPatientIds = new Set(Array.from(publishedPatientIds).filter((id) => !preparedPatientIds.has(id)));
  const transportIssueInvoiceIds = new Set(Array.from(preparedInvoiceIds).filter((id) => !acceptedInvoiceIds.has(id)));
  const transportIssuePatientIds = new Set(Array.from(preparedPatientIds).filter((id) => !acceptedPatientIds.has(id)));
  const unnotifiedInvoiceIds = new Set(Array.from(publishedDocIds).filter((id) => !acceptedInvoiceIds.has(id)));
  const unnotifiedPatientIds = new Set(Array.from(publishedPatientIds).filter((id) => !acceptedPatientIds.has(id)));

  return {
    quarter: "Q3/2026",
    expectedInvoices: Q3_EXPECTED_INVOICES,
    expectedPatients: Q3_EXPECTED_PATIENTS,
    publishedInvoices: publishedDocIds.size,
    publishedPatients: publishedPatientIds.size,
    portalMissingInvoices: Math.max(0, Q3_EXPECTED_INVOICES - publishedDocIds.size),
    portalMissingPatients: Math.max(0, Q3_EXPECTED_PATIENTS - publishedPatientIds.size),
    preparedRecipients: preparedRecipients.size,
    preparedPatients: preparedPatientIds.size,
    preparedInvoices: preparedInvoiceIds.size,
    acceptedRecipients: acceptedRecipients.size,
    acceptedPatients: acceptedPatientIds.size,
    acceptedInvoices: acceptedInvoiceIds.size,
    clarificationMessages: clarificationRows.length,
    clarificationRecipients: clarificationRecipients.size,
    noContactInvoices: noContactInvoiceIds.size,
    noContactPatients: noContactPatientIds.size,
    transportIssueInvoices: transportIssueInvoiceIds.size,
    transportIssuePatients: transportIssuePatientIds.size,
    unnotifiedInvoices: unnotifiedInvoiceIds.size,
    unnotifiedPatients: unnotifiedPatientIds.size,
  };
}

export async function GET(request: NextRequest) {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days") || "30")));
  const status = request.nextUrl.searchParams.get("status")?.trim() || "all";
  const query = request.nextUrl.searchParams.get("q")?.trim().toLocaleLowerCase("de-DE") || "";
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = createServerClient();

  let messageQuery = db.from("communication_messages")
    .select("id,patient_id,campaign_key,channel,provider,recipient,subject,status,sent_at,delivered_at,first_opened_at,first_clicked_at,last_event_at,created_at,metadata")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1500);
  if (status !== "all" && status !== "problem") messageQuery = messageQuery.eq("status", status);
  if (status === "problem") messageQuery = messageQuery.in("status", Array.from(PROBLEM_STATUSES));
  const messagesResult = await messageQuery;

  if (messagesResult.error) {
    const schemaMissing = messagesResult.error.code === "42P01" || messagesResult.error.message.includes("communication_messages");
    return NextResponse.json({
      ready: false,
      schemaMissing,
      summary: { total: 0, accepted: 0, delivered: 0, opened: 0, clicked: 0, problems: 0 },
      messages: [],
      billingReconciliation: null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const rawMessages = messagesResult.data ?? [];
  const patientIds = Array.from(new Set(rawMessages.map(row => row.patient_id).filter(Boolean))) as string[];
  const messageIds = rawMessages.map(row => row.id);
  const [billingReconciliation, patientBatches, eventBatches, engagementBatches] = await Promise.all([
    loadBillingReconciliation(db),
    Promise.all(chunk(patientIds).map(ids => db.from("patients").select("id,vorname,nachname,ivoris_nummer").in("id", ids))),
    Promise.all(chunk(messageIds).map(ids => db.from("communication_events")
      .select("id,message_id,event_type,source,occurred_at,metadata")
      .in("message_id", ids).order("occurred_at", { ascending: false }).limit(1000))),
    Promise.all(chunk(patientIds).map(ids => db.from("patient_engagement")
      .select("patient_id,event_type,created_at,metadata").in("patient_id", ids)
      .in("event_type", ["app_open", "notification_clicked", "document_view", "payment_view", "qrcode_view"])
      .gte("created_at", since).order("created_at", { ascending: false }).limit(1000))),
  ]);
  const failedLookup = [...patientBatches, ...eventBatches, ...engagementBatches].find(result => result.error);
  if (failedLookup?.error) {
    return NextResponse.json({ error: "communication_history_unavailable" }, { status: 503 });
  }
  const patientRows = patientBatches.flatMap(result => result.data ?? []);
  const eventRows = eventBatches.flatMap(result => result.data ?? []);
  const engagementRows = engagementBatches.flatMap(result => result.data ?? []);

  const patients = new Map(patientRows.map(row => [row.id, row]));
  const eventsByMessage = new Map<string, typeof eventRows>();
  for (const event of eventRows) {
    const current = eventsByMessage.get(event.message_id) ?? [];
    current.push(event);
    eventsByMessage.set(event.message_id, current);
  }
  const engagementByPatient = new Map<string, typeof engagementRows>();
  for (const event of engagementRows) {
    const current = engagementByPatient.get(event.patient_id) ?? [];
    current.push(event);
    engagementByPatient.set(event.patient_id, current);
  }

  const enriched = rawMessages.map((row) => {
    const patient = row.patient_id ? patients.get(row.patient_id) : null;
    const patientName = patient ? [patient.vorname, patient.nachname].filter(Boolean).join(" ") : null;
    return {
      ...row,
      patientName,
      patientNumber: patient?.ivoris_nummer ?? null,
      events: eventsByMessage.get(row.id) ?? [],
      portalEvents: row.patient_id ? (engagementByPatient.get(row.patient_id) ?? []).slice(0, 8) : [],
    };
  });
  const messages = query
    ? enriched.filter(row => `${row.patientName ?? ""} ${row.patientNumber ?? ""} ${row.recipient} ${row.subject}`.toLocaleLowerCase("de-DE").includes(query))
    : enriched;

  const allStatuses = rawMessages.map(row => row.status);
  const summary = {
    total: rawMessages.length,
    accepted: allStatuses.filter(value => ["accepted", "delivered", "opened", "clicked"].includes(value)).length,
    delivered: allStatuses.filter(value => ["delivered", "opened", "clicked"].includes(value)).length,
    opened: allStatuses.filter(value => ["opened", "clicked"].includes(value)).length,
    clicked: allStatuses.filter(value => value === "clicked").length,
    problems: allStatuses.filter(value => PROBLEM_STATUSES.has(value)).length,
  };

  return NextResponse.json({ ready: true, summary, messages, billingReconciliation }, { headers: { "Cache-Control": "no-store" } });
}
