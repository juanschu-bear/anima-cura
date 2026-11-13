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
// Die Datenbank liefert höchstens 1000 Zeilen je Abfrage. Ohne Seiten würden Reaktionen still fehlen.
const PAGE = 1000;
type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;
async function allRows<T>(query: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
const inParallel = async <T, R>(parts: T[][], run: (part: T[]) => Promise<R[]>) => (await Promise.all(parts.map(run))).flat();

type ContactRow = { id: string; normalized_email: string };
type EventRow = { contact_id: string | null; patient_id: string | null; event: string; occurred_at: string };
type NoticeRow = { patient_id: string; titel: string; created_at: string };

export async function POST(request: NextRequest) {
  const secret = process.env.INVOICE_ACCESS_WORKER_SECRET;
  if (!secret || request.headers.get("x-invoice-worker-secret") !== secret) return NextResponse.json({ code: "not_authorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  const { since, recipients } = parsed.data;
  const db = createServerClient();

  try {
    const emails = Array.from(new Set(recipients.map(recipient => normalizeContactEmail(recipient.email)).filter(Boolean)));
    const patientIds = Array.from(new Set(recipients.flatMap(recipient => recipient.patientIds)));
    const contacts = await inParallel(chunks(emails, 150), part => allRows<ContactRow>((from, to) =>
      db.from("invoice_access_contacts").select("id,normalized_email").in("normalized_email", part).order("id").range(from, to)));
    const contactByEmail = new Map(contacts.map(row => [row.normalized_email, row.id]));

    const [contactEvents, appEvents, notices] = await Promise.all([
      inParallel(chunks(Array.from(new Set(contactByEmail.values())), 150), part => allRows<EventRow>((from, to) =>
        db.from("invoice_access_events").select("contact_id,patient_id,event,occurred_at")
          .in("contact_id", part).in("event", ["page_opened", "button_clicked", "access_created", "link_consumed", "app_read"]).gte("occurred_at", since).order("id").range(from, to))),
      // Ereignisse aus der App hängen am Patienten (Anmeldung in der App), nicht unbedingt am Mail-Kontakt.
      inParallel(chunks(patientIds, 150), part => allRows<EventRow>((from, to) =>
        db.from("invoice_access_events").select("contact_id,patient_id,event,occurred_at")
          .in("patient_id", part).in("event", ["app_read", "button_clicked"]).gte("occurred_at", since).order("id").range(from, to))),
      // Der App-Hinweis hat kein Lesedatum, deshalb steht als Zeitpunkt seine Anlage.
      inParallel(chunks(patientIds, 150), part => allRows<NoticeRow>((from, to) =>
        db.from("patient_notifications").select("patient_id,titel,created_at")
          .in("patient_id", part).eq("typ", "eingang").eq("gelesen", true).gte("created_at", since).order("id").range(from, to))),
    ]);

    const events: TrackingEvent[] = [
      ...contactEvents.map(row => ({ contactId: row.contact_id, patientId: row.patient_id, event: row.event, occurredAt: row.occurred_at })),
      ...appEvents.map(row => ({ contactId: null, patientId: row.patient_id, event: row.event, occurredAt: row.occurred_at })),
    ];
    const readNotices: TrackingNotice[] = notices.map(row => ({ patientId: row.patient_id, titel: row.titel, createdAt: row.created_at }));
    return NextResponse.json(
      { ok: true, asOf: new Date().toISOString(), recipients: summarizeInvoiceAccess({ recipients, contactByEmail, events, notices: readNotices }) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return unavailable();
  }
}
