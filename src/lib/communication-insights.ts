/** Evidence shared by the delivery overview and the patient dossier. */
export type CommunicationEvent = { id: string; event_type: string; source: string; occurred_at: string; metadata?: Record<string, unknown> };
export type PortalTouchpoint = { id?: string; patient_id: string; event_type: string; created_at: string; metadata?: Record<string, unknown> };
export type CommunicationPatient = { id: string; name: string; number: string | null };
export type DispatchMessage = {
  id: string; patient_id: string | null; campaign_key: string | null; channel: string;
  provider: string | null; recipient: string; subject: string; status: string;
  sent_at: string | null; delivered_at: string | null; first_opened_at: string | null;
  first_clicked_at: string | null; created_at: string;
  metadata?: Record<string, unknown> | null;
  patientName?: string | null; patientNumber?: string | null;
  patients?: CommunicationPatient[];
  events: CommunicationEvent[]; portalEvents: PortalTouchpoint[];
};
export type InboundContact = {
  id: string; sender: string; subject: string; receivedAt: string;
  autoReplied: boolean; manualReview: boolean; practiceNotified: boolean; failed: boolean;
};
export type PatientDossier = {
  patients: Array<CommunicationPatient & {
    login: { state: "used" | "never" | "missing" | "unknown"; lastAt: string | null };
  }>;
  messages: DispatchMessage[];
  portalEvents: PortalTouchpoint[];
  documents: Array<{ id: string; patient_id: string; name: string; openedAt: string | null }>;
  inbound: InboundContact[];
  availability: { replies: boolean; portal: boolean; documents: boolean };
  truncated: boolean;
};

export type InvoiceMailStatusCode = "accepted" | "delivered" | "delayed" | "rejected" | "complaint" | "opened";
export type InvoiceMailRejectionKind = "bounced" | "failed" | "suppressed";
export type InvoiceMailTimeline = {
  status: InvoiceMailStatusCode;
  statusAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  delayedAt: string | null;
  rejectedAt: string | null;
  complaintAt: string | null;
  openedAt: string | null;
  rejectionKind: InvoiceMailRejectionKind | null;
  rejectionReason: string | null;
};

export type InvoiceMailStatusRow = InvoiceMailTimeline & {
  patientId: string;
  firstName: string | null;
  lastName: string | null;
  patientName: string | null;
  patientNumber: string | null;
  documentId: string;
  messageId: string;
  campaignKey: string | null;
};

export type InvoiceMailCampaign = {
  campaignKey: string;
  name: string;
  sentAt: string;
  mailCount: number;
  invoiceCount: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function linkedPatientIds(row: { patient_id: string | null; metadata?: Record<string, unknown> | null }) {
  const linked = Array.isArray(row.metadata?.patientIds) ? row.metadata.patientIds : [];
  return Array.from(new Set([row.patient_id, ...linked].filter((id): id is string => typeof id === "string" && UUID.test(id))));
}

// A click or a portal visit does not prove that an email was read or delivered.
export function mailEvidence(row: DispatchMessage, type: "accepted" | "delivered" | "opened" | "clicked") {
  const field = { accepted: row.sent_at, delivered: row.delivered_at, opened: row.first_opened_at, clicked: row.first_clicked_at }[type];
  return field || row.events.find(event => event.event_type === type)?.occurred_at || null;
}

export function invoiceOpenedAt(documentId: string, events: PortalTouchpoint[]) {
  // Historical document_view means the documents TAB, not an individual PDF.
  return events.filter(event => event.event_type === "invoice_document_opened" && event.metadata?.documentId === documentId && event.metadata?.source === "authenticated_document_delivery")
    .map(event => event.created_at).sort().at(-1) ?? null;
}

const INVOICE_MAIL_STATUS: Partial<Record<string, InvoiceMailStatusCode>> = {
  accepted: "accepted", delivered: "delivered", delayed: "delayed",
  failed: "rejected", bounced: "rejected", suppressed: "rejected",
  complained: "complaint", opened: "opened", clicked: "opened",
};

function latestTimestamp(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function rejectionReason(event: CommunicationEvent | undefined) {
  if (!event) return null;
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const bounce = metadata.bounce && typeof metadata.bounce === "object" && !Array.isArray(metadata.bounce)
    ? metadata.bounce as Record<string, unknown>
    : {};
  const values = event.event_type === "bounced"
    ? [bounce.type, bounce.subType, bounce.message, metadata.bounceType, metadata.bounceSubType, metadata.message]
    : event.event_type === "suppressed"
      ? [metadata.suppressionType, metadata.message]
      : [metadata.reason, metadata.message];
  const parts = Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map(value => value.trim())));
  return parts.length ? parts.join(" · ") : null;
}

/** Last provider-backed state for one invoice email. Link clicks count as opened. */
export function invoiceMailTimeline(row: Pick<DispatchMessage,
  "status" | "sent_at" | "delivered_at" | "first_opened_at" | "first_clicked_at" | "created_at" | "events">): InvoiceMailTimeline | null {
  const occurrences = row.events.flatMap((event) => {
    const status = INVOICE_MAIL_STATUS[event.event_type];
    return status ? [{ status, at: event.occurred_at, eventType: event.event_type }] : [];
  });
  if (row.sent_at) occurrences.push({ status: "accepted", at: row.sent_at, eventType: "accepted" });
  if (row.delivered_at) occurrences.push({ status: "delivered", at: row.delivered_at, eventType: "delivered" });
  if (row.first_opened_at) occurrences.push({ status: "opened", at: row.first_opened_at, eventType: "opened" });
  if (row.first_clicked_at) occurrences.push({ status: "opened", at: row.first_clicked_at, eventType: "clicked" });
  if (!occurrences.length) {
    const fallback = INVOICE_MAIL_STATUS[row.status];
    if (fallback) occurrences.push({ status: fallback, at: row.created_at, eventType: row.status });
  }
  if (!occurrences.length) return null;
  occurrences.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  const current = occurrences[0];
  const rejection = row.events
    .filter(event => ["failed", "bounced", "suppressed"].includes(event.event_type))
    .sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at))[0];
  const at = (types: string[]) => latestTimestamp(occurrences.filter(item => types.includes(item.eventType)).map(item => item.at));
  return {
    status: current.status,
    statusAt: current.at,
    acceptedAt: at(["accepted"]),
    deliveredAt: at(["delivered"]),
    delayedAt: at(["delayed"]),
    rejectedAt: at(["failed", "bounced", "suppressed"]),
    complaintAt: at(["complained"]),
    openedAt: at(["opened", "clicked"]),
    rejectionKind: (rejection?.event_type as InvoiceMailRejectionKind | undefined) ?? null,
    rejectionReason: rejectionReason(rejection),
  };
}

function berlinDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(value));
}

export function invoiceMailCampaigns(rows: InvoiceMailStatusRow[]): InvoiceMailCampaign[] {
  const groups = new Map<string, InvoiceMailStatusRow[]>();
  for (const row of rows) {
    if (!row.campaignKey) continue;
    const current = groups.get(row.campaignKey) ?? [];
    current.push(row);
    groups.set(row.campaignKey, current);
  }
  return Array.from(groups, ([campaignKey, items]) => {
    const sentAt = items.map(item => item.acceptedAt ?? item.statusAt)
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
    const normalized = campaignKey.toLocaleLowerCase("de-DE");
    const label = normalized.includes("reminder") || normalized.includes("erinner") ? "Erinnerung" : "Rechnungsmail";
    return {
      campaignKey,
      name: `${label} vom ${berlinDate(sentAt)}`,
      sentAt,
      mailCount: new Set(items.map(item => item.messageId)).size,
      invoiceCount: new Set(items.map(item => item.documentId)).size,
    };
  }).sort((left, right) => Date.parse(right.sentAt) - Date.parse(left.sentAt));
}

export function inboundContact(row: { id: string; status: string; started_at: string; result: unknown }): InboundContact | null {
  const value = row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : {};
  if (typeof value.sender !== "string" || value.ignored === true) return null;
  return {
    id: row.id, sender: value.sender.trim().toLowerCase(), subject: typeof value.subject === "string" ? value.subject : "",
    receivedAt: typeof value.receivedAt === "string" && Number.isFinite(Date.parse(value.receivedAt)) ? value.receivedAt : row.started_at,
    autoReplied: value.autoReplied === true, manualReview: value.manualReview === true,
    practiceNotified: value.practiceNotified === true, failed: row.status === "failed",
  };
}

/** Isolated email preview: no remote assets, pixels, scripts, forms or links. */
export function inertEmailDocument(html: string) {
  const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<\/?(?:iframe|object|embed|form|base)\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "")
    .replace(/\s(?:href|src|srcset|action|formaction|poster|background|ping|xlink:href|on\w+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'"><style>html{color-scheme:light}body{margin:16px;color:#19352c;background:white;overflow-wrap:anywhere}a{pointer-events:none}img{display:none}table{max-width:100%}</style></head><body>${body}</body></html>`;
}
