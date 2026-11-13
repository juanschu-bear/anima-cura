import { normalizeContactEmail } from "./invoice-contact-access";

/**
 * Reaktionen auf die Rechnungsmail je Empfänger (13.11.2026). Reine Zusammenführung ohne Datenbank, damit sie testbar ist.
 * „Seite geöffnet“: page_opened (Seite hinter dem Button) oder button_clicked (Button in der App).
 * „Zugang eingerichtet“: access_created oder link_consumed.
 * „In der App gelesen“: app_read (Portal über den Rechnungslink geöffnet) oder der gelesene App-Hinweis mit genau dem Titel dieser Mail.
 */
export type TrackingRecipient = { key: string; email: string; patientIds: string[]; appTitle: string | null };
export type TrackingEvent = { contactId?: string | null; patientId?: string | null; event: string; occurredAt: string };
export type TrackingNotice = { patientId: string; titel: string; createdAt: string };
export type TrackingResult = { key: string; pageOpenedAt: string | null; accessCreatedAt: string | null; appReadAt: string | null };

const latest = (current: string | null, next: string | null | undefined) => (!next ? current : !current || next > current ? next : current);
const field = (event: string): keyof Omit<TrackingResult, "key"> | null =>
  event === "page_opened" || event === "button_clicked" ? "pageOpenedAt"
  : event === "access_created" || event === "link_consumed" ? "accessCreatedAt"
  : event === "app_read" ? "appReadAt" : null;

export function summarizeInvoiceAccess(input: {
  recipients: TrackingRecipient[];
  contactByEmail: Map<string, string>;
  events: TrackingEvent[];
  notices: TrackingNotice[];
}): TrackingResult[] {
  const byContact = new Map<string, TrackingEvent[]>(), byPatient = new Map<string, TrackingEvent[]>();
  for (const event of input.events) {
    if (event.contactId) byContact.set(event.contactId, [...(byContact.get(event.contactId) ?? []), event]);
    if (event.patientId) byPatient.set(event.patientId, [...(byPatient.get(event.patientId) ?? []), event]);
  }
  const notices = new Map<string, TrackingNotice[]>();
  for (const notice of input.notices) notices.set(notice.patientId, [...(notices.get(notice.patientId) ?? []), notice]);

  return input.recipients.map(recipient => {
    const result: TrackingResult = { key: recipient.key, pageOpenedAt: null, accessCreatedAt: null, appReadAt: null };
    const contactId = input.contactByEmail.get(normalizeContactEmail(recipient.email));
    const events = [...(contactId ? byContact.get(contactId) ?? [] : []), ...recipient.patientIds.flatMap(id => byPatient.get(id) ?? [])];
    for (const event of events) {
      const key = field(event.event);
      if (key) result[key] = latest(result[key], event.occurredAt);
    }
    if (recipient.appTitle) for (const id of recipient.patientIds)
      for (const notice of notices.get(id) ?? []) if (notice.titel === recipient.appTitle) result.appReadAt = latest(result.appReadAt, notice.createdAt);
    return result;
  });
}
