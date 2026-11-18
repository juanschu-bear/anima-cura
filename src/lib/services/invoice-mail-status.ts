import { createServerClient } from "@/lib/db/supabase";
import {
  invoiceMailCampaigns,
  invoiceMailTimeline,
  type DispatchMessage,
  type InvoiceMailStatusRow,
} from "@/lib/communication-insights";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const chunk = <T,>(rows: T[], size = 100) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function ids(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && UUID.test(item))))
    : [];
}

export async function loadInvoiceMailStatusOverview(days = 730) {
  const db = createServerClient();
  const since = new Date(Date.now() - Math.min(1095, Math.max(1, days)) * 86_400_000).toISOString();
  const pages = [];
  // Filter in the database and fetch independent, stable offset windows together.
  // Invoice emails are the only messages with documentIds in metadata.
  for (let offset = 0; offset < 20_000; offset += 2_000) {
    const batch = await Promise.all([0, 500, 1_000, 1_500].map(step => db.from("communication_messages")
      .select("id,patient_id,campaign_key,channel,provider,recipient,subject,status,sent_at,delivered_at,first_opened_at,first_clicked_at,created_at,metadata")
      .eq("channel", "email").gte("created_at", since).not("metadata->documentIds", "is", null)
      .order("created_at", { ascending: false }).order("id").range(offset + step, offset + step + 499)));
    pages.push(...batch);
    if (batch.some(page => page.error || (page.data?.length ?? 0) < 500)) break;
  }
  const failedPage = pages.find(page => page.error);
  if (failedPage?.error) throw new Error("invoice_mail_status_unavailable");
  const messages = pages.flatMap(page => page.data ?? []).filter(row => ids(record(row.metadata)?.documentIds).length > 0);
  const documentIds = Array.from(new Set(messages.flatMap(row => ids(record(row.metadata)?.documentIds))));
  const documentPages = await Promise.all(chunk(documentIds).map(batch => db.from("patient_documents").select("id,patient_id").in("id", batch)));
  const messageIds = messages.map(row => row.id);
  const eventPages = await Promise.all(chunk(messageIds).map(batch => db.from("communication_events")
    .select("id,message_id,event_type,source,occurred_at,metadata").in("message_id", batch).order("occurred_at", { ascending: false }).limit(2000)));
  if ([...documentPages, ...eventPages].some(result => result.error)) throw new Error("invoice_mail_status_unavailable");

  const documents = documentPages.flatMap(result => result.data ?? []);
  const patientIds = Array.from(new Set(documents.map(document => document.patient_id).filter(Boolean)));
  const patientPages = await Promise.all(chunk(patientIds).map(batch => db.from("patients").select("id,vorname,nachname,ivoris_nummer").in("id", batch)));
  if (patientPages.some(result => result.error)) throw new Error("invoice_mail_status_unavailable");
  const patients = new Map(patientPages.flatMap(result => result.data ?? []).map(patient => [patient.id, patient]));
  const documentOwner = new Map(documents.map(document => [document.id, document.patient_id]));
  const events = eventPages.flatMap(result => result.data ?? []);
  const eventsByMessage = new Map<string, typeof events>();
  for (const event of events) {
    const current = eventsByMessage.get(event.message_id) ?? [];
    current.push(event);
    eventsByMessage.set(event.message_id, current);
  }

  const invoiceMailStatuses: InvoiceMailStatusRow[] = messages.flatMap(row => {
    const timeline = invoiceMailTimeline({ ...row, events: eventsByMessage.get(row.id) ?? [] } as unknown as DispatchMessage);
    if (!timeline) return [];
    return ids(record(row.metadata)?.documentIds).flatMap(documentId => {
      const patientId = documentOwner.get(documentId) ?? row.patient_id;
      if (!patientId) return [];
      const patient = patients.get(patientId);
      const firstName = patient?.vorname ?? null;
      const lastName = patient?.nachname ?? null;
      return [{
        patientId,
        firstName,
        lastName,
        patientName: [firstName, lastName].filter(Boolean).join(" ") || null,
        patientNumber: patient?.ivoris_nummer ?? null,
        documentId,
        messageId: row.id,
        campaignKey: row.campaign_key,
        ...timeline,
      }];
    });
  }).sort((left, right) => Date.parse(right.statusAt) - Date.parse(left.statusAt));

  return {
    asOf: new Date().toISOString(),
    invoiceMailStatuses,
    campaigns: invoiceMailCampaigns(invoiceMailStatuses),
    truncated: pages.length === 40 || eventPages.some(result => (result.data?.length ?? 0) >= 2000),
  };
}
