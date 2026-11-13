import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { normalizeContactEmail } from "@/lib/services/invoice-contact-access";
import { summarizeInvoiceAccess, type TrackingEvent, type TrackingNotice } from "@/lib/services/invoice-access-tracking";

export const runtime = "nodejs";

/**
 * Reaktionen auf die Rechnungsmail für den Leitstand (13.11.2026). Der Leitstand darf die Tabellen von Anima Cura nicht lesen,
 * deshalb holt er die Zahlen hier ab, geschützt mit demselben Geheimnis wie der App-Hinweis. Zurück kommen nur Zeitpunkte je
 * Empfänger, keine Adressen oder Namen.
 */
const body = z.strictObject({
  since: z.string().datetime({ offset: true }),
  recipients: z.array(z.strictObject({
    key: z.string().min(1).max(100),
    email: z.string().max(320),
    patientIds: z.array(z.string().uuid()).max(20),
    appTitle: z.string().max(300).nullable(),
  })).max(5000),
});

const chunks = <T,>(values: T[], size: number) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, index * size + size));
const unavailable = () => NextResponse.json({ code: "tracking_unavailable" }, { status: 503 });

export async function POST(request: NextRequest) {
  const secret = process.env.INVOICE_ACCESS_WORKER_SECRET;
  if (!secret || request.headers.get("x-invoice-worker-secret") !== secret) return NextResponse.json({ code: "not_authorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  const { since, recipients } = parsed.data;
  const db = createServerClient();

  const contactByEmail = new Map<string, string>();
  const emails = Array.from(new Set(recipients.map(recipient => normalizeContactEmail(recipient.email)).filter(Boolean)));
  for (const part of chunks(emails, 150)) {
    const { data, error } = await db.from("invoice_access_contacts").select("id,normalized_email").in("normalized_email", part);
    if (error) return unavailable();
    for (const row of data ?? []) contactByEmail.set(row.normalized_email as string, row.id as string);
  }

  const events: TrackingEvent[] = [];
  for (const part of chunks(Array.from(new Set(contactByEmail.values())), 150)) {
    const { data, error } = await db.from("invoice_access_events").select("contact_id,patient_id,event,occurred_at")
      .in("contact_id", part).in("event", ["page_opened", "button_clicked", "access_created", "link_consumed", "app_read"]).gte("occurred_at", since);
    if (error) return unavailable();
    for (const row of data ?? []) events.push({ contactId: row.contact_id as string, patientId: row.patient_id as string | null, event: row.event as string, occurredAt: row.occurred_at as string });
  }

  // Ereignisse aus der App hängen am Patienten (Anmeldung in der App), nicht unbedingt am Mail-Kontakt.
  const notices: TrackingNotice[] = [];
  for (const part of chunks(Array.from(new Set(recipients.flatMap(recipient => recipient.patientIds))), 150)) {
    const appEvents = await db.from("invoice_access_events").select("contact_id,patient_id,event,occurred_at")
      .in("patient_id", part).in("event", ["app_read", "button_clicked"]).gte("occurred_at", since);
    if (appEvents.error) return unavailable();
    for (const row of appEvents.data ?? []) events.push({ contactId: null, patientId: row.patient_id as string, event: row.event as string, occurredAt: row.occurred_at as string });
    // Der App-Hinweis hat kein Lesedatum, deshalb steht als Zeitpunkt seine Anlage.
    const read = await db.from("patient_notifications").select("patient_id,titel,created_at")
      .in("patient_id", part).eq("typ", "eingang").eq("gelesen", true).gte("created_at", since);
    if (read.error) return unavailable();
    for (const row of read.data ?? []) notices.push({ patientId: row.patient_id as string, titel: row.titel as string, createdAt: row.created_at as string });
  }

  return NextResponse.json(
    { ok: true, asOf: new Date().toISOString(), recipients: summarizeInvoiceAccess({ recipients, contactByEmail, events, notices }) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
