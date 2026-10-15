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
