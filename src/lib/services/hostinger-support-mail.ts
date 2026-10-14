import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";

export const HOSTINGER_SUPPORT_WORKFLOW_ID = "31480537-b9a8-4b93-b4d1-c011dfab415f";
export const HOSTINGER_SUPPORT_EVENT = "hostinger_support_message_received";
const SUPPORT_ADDRESS = "praxisteam@animacura.io";
const PORTAL_RECOVERY_URL = "https://animacura.io/patient/login?recovery=1";

export type SupportCategory =
  | "login_password"
  | "invoice_access"
  | "payment_method"
  | "medical"
  | "billing_specific"
  | "other";

export type ParsedSupportEvent = {
  event: string;
  eventKey: string;
  mailboxAddress: string | null;
  mailboxResourceId: string | null;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  excerpt: string;
  timestamp: string | null;
  uid: number | null;
  folder: string;
  messageId: string | null;
};

export type SupportClassification = {
  category: SupportCategory;
  autoReply: boolean;
  reason: string;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    const candidate = record(value);
    if (candidate) return candidate;
  }
  return null;
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function emailFrom(value: unknown): { address: string | null; name: string | null } {
  if (Array.isArray(value)) return emailFrom(value[0]);
  const row = record(value);
  if (row) {
    return {
      address: stringValue(row.address, row.email, row.mail)?.toLowerCase() ?? null,
      name: stringValue(row.name, row.displayName),
    };
  }
  const raw = stringValue(value);
  if (!raw) return { address: null, name: null };
  const bracket = raw.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  return bracket
    ? { address: bracket[2].toLowerCase(), name: bracket[1].replace(/^['"]|['"]$/g, "").trim() || null }
    : { address: raw.toLowerCase(), name: null };
}

function safeEmail(value: string | null) {
  if (!value || value.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

function eventId(payload: UnknownRecord, data: UnknownRecord, message: UnknownRecord) {
  return stringValue(
    payload.id,
    payload.eventId,
    payload.event_id,
    payload.deliveryId,
    payload.delivery_id,
    data.id,
    data.eventId,
    data.event_id,
    message.messageId,
    message.message_id,
    message.id,
    message.threadId,
    message.thread_id,
  );
}

function stableEventKey(parts: Array<string | number | null>) {
  return createHash("sha256").update(parts.map(value => String(value ?? "")).join("\u001f")).digest("hex");
}

export function parseHostingerSupportEvent(payload: unknown): ParsedSupportEvent | null {
  const root = record(payload);
  if (!root) return null;
  const data = firstRecord(root.data, root.payload) ?? root;
  const message = firstRecord(data.message, root.message, data.email, root.email) ?? data;
  const mailbox = firstRecord(data.mailbox, root.mailbox);
  const sender = emailFrom(message.from ?? message.sender ?? data.from ?? root.from);
  const senderEmail = safeEmail(sender.address);
  if (!senderEmail) return null;

  const event = stringValue(root.event, root.type, data.event, data.type) ?? "message.received";
  const mailboxAddress = safeEmail(stringValue(
    mailbox?.address,
    mailbox?.email,
    typeof data.mailbox === "string" ? data.mailbox : null,
    typeof root.mailbox === "string" ? root.mailbox : null,
  )?.toLowerCase() ?? null);
  const mailboxResourceId = stringValue(
    mailbox?.resourceId,
    mailbox?.resource_id,
    data.mailboxResourceId,
    data.mailbox_resource_id,
    root.mailboxResourceId,
    root.mailbox_resource_id,
  );
  const subject = stringValue(message.subject, data.subject, root.subject) ?? "Ohne Betreff";
  const excerpt = (stringValue(
    message.truncatedMessage,
    message.truncated_message,
    message.snippet,
    message.preview,
    message.excerpt,
    message.text,
    data.truncatedMessage,
    data.truncated_message,
    data.snippet,
    data.preview,
    root.truncatedMessage,
    root.truncated_message,
  ) ?? "").slice(0, 4_000);
  const timestamp = stringValue(message.timestamp, message.date, data.timestamp, data.createdAt, data.created_at, root.timestamp, root.createdAt, root.created_at);
  const uid = numberValue(message.uid, data.uid, root.uid);
  const folder = stringValue(message.path, message.folder, data.folder, root.folder) ?? "INBOX";
  const messageId = stringValue(message.messageId, message.message_id, data.messageId, data.message_id);
  const externalId = eventId(root, data, message);

  return {
    event,
    eventKey: externalId || stableEventKey([mailboxResourceId, mailboxAddress, uid, senderEmail, subject, timestamp, excerpt]),
    mailboxAddress,
    mailboxResourceId,
    senderEmail,
    senderName: sender.name,
    subject,
    excerpt,
    timestamp,
    uid,
    folder,
    messageId,
  };
}

function normalizedText(event: ParsedSupportEvent) {
  return `${event.subject}\n${event.excerpt}`.toLocaleLowerCase("de-DE");
}

export function classifySupportEvent(event: ParsedSupportEvent): SupportClassification {
  const text = normalizedText(event);
  const automatedSender = /^(no-?reply|mailer-daemon|postmaster)@/i.test(event.senderEmail);
  if (automatedSender || event.senderEmail === SUPPORT_ADDRESS || /abwesenheit|out of office|automatic reply|automatische antwort/.test(text)) {
    return { category: "other", autoReply: false, reason: "automated_or_loop_risk" };
  }
  if (/schmerz|entzünd|blut|notfall|allerg|medikament|behandlung|zahn|bogen|bracket|medizin|arzt|termin/.test(text)) {
    return { category: "medical", autoReply: false, reason: "medical_question" };
  }
  if (/(\d+[.,]\d{2}\s*(€|eur)|betrag|falsch berechnet|zu hoch|zu viel|mahnung|inkasso|widerspruch|reklamation|bezahlt|zahlung verbucht|ratenplan|rate(n)?\b)/.test(text)) {
    return { category: "billing_specific", autoReply: false, reason: "case_specific_billing" };
  }
  if (/passwort|password|anmeld|login|einlog|zugang|sicherheitscode|code kommt|kennwort/.test(text)) {
    return { category: "login_password", autoReply: true, reason: "technical_access" };
  }
  if (/rechnung.*(öffn|seh|find|abruf|zugriff)|dokument.*(öffn|seh|find)|qr.*login|rechnung.*app/.test(text)) {
    return { category: "invoice_access", autoReply: true, reason: "invoice_navigation" };
  }
  if (/banking.?qr|überweis|ueberweis|wie.*zahl|zahlung.*qr|zahlungsweg/.test(text)) {
    return { category: "payment_method", autoReply: true, reason: "generic_payment_navigation" };
  }
  return { category: "other", autoReply: false, reason: "human_review_required" };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] || char);
}

function salutation(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length <= 60 ? `Hallo ${first},` : "Guten Tag,";
}

export function buildSupportReply(event: ParsedSupportEvent, classification: SupportClassification) {
  const hello = salutation(event.senderName);
  const commonEnd = "\n\nBitte sende uns niemals dein Passwort oder einen Sicherheitscode per E-Mail.\n\nLiebe Grüße\nDein Anima-Cura-Praxisteam";
  let message: string;
  if (classification.category === "login_password") {
    message = `${hello}\n\ndeinen Zugang kannst du direkt in Anima Cura wiederherstellen:\n\n1. Öffne „Passwort vergessen“.\n2. Gib deine Anima-Cura-Anmeldeadresse ein.\n3. Trage den sechsstelligen Sicherheitscode aus deiner Kontakt-E-Mail in der geöffneten App ein.\n4. Vergib dein neues Passwort zweimal.\n\nDanach führt dich Anima Cura direkt zu der zuvor geöffneten Rechnung zurück.\n\nPasswort jetzt neu einrichten:\n${PORTAL_RECOVERY_URL}${commonEnd}`;
  } else if (classification.category === "invoice_access") {
    message = `${hello}\n\nöffne den Rechnungsbutton oder QR-Code erneut und melde dich in Anima Cura an. Nach der Anmeldung wird die passende Rechnung automatisch geöffnet. Bereits bereitgestellte Rechnungen findest du außerdem im Patientenportal unter „Dokumente“.\n\nFalls das Passwort nicht mehr funktioniert, wähle auf der Anmeldeseite „Passwort vergessen“.${commonEnd}`;
  } else {
    message = `${hello}\n\ndie Rechnung und die sicheren Zahlungswege findest du nach der Anmeldung in Anima Cura. Öffne dort die Rechnung oder den Zahlungsbereich und wähle Banking-QR oder normale Überweisung. Beide Wege sind möglich.\n\nBei Fragen zu einem konkreten Betrag wird deine Nachricht persönlich geprüft.${commonEnd}`;
  }
  const paragraphs = message.split("\n\n").map(paragraph => `<p style="margin:0 0 16px">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  return {
    subject: event.subject.toLocaleLowerCase("de-DE").startsWith("re:") ? event.subject : `Re: ${event.subject}`,
    text: message,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173b32;max-width:620px">${paragraphs}</div>`,
  };
}

export function hostingerSupportRunId(eventKey: string) {
  const hash = createHash("sha256").update(`${HOSTINGER_SUPPORT_WORKFLOW_ID}:${eventKey}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function sendHostingerReply(event: ParsedSupportEvent, classification: SupportClassification) {
  const apiToken = process.env.HOSTINGER_MAIL_API_TOKEN;
  const mailboxResourceId = process.env.HOSTINGER_MAILBOX_RESOURCE_ID || event.mailboxResourceId;
  if (!apiToken || !mailboxResourceId) throw new Error("hostinger_mail_not_configured");
  const reply = buildSupportReply(event, classification);
  const body: Record<string, unknown> = {
    to: [event.senderEmail],
    displayName: "Anima Cura Praxisteam",
    subject: reply.subject,
    text: reply.text,
    html: reply.html,
  };
  if (event.uid) body.inReplyTo = { folder: event.folder, uid: event.uid };
  const response = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(mailboxResourceId)}/send`, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`hostinger_mail_rejected:${response.status}`);
}

export async function processHostingerSupportEvent(payload: unknown) {
  const event = parseHostingerSupportEvent(payload);
  if (!event || event.event !== "message.received") return { ok: false as const, reason: "unsupported_event" };
  const expectedMailbox = (process.env.HOSTINGER_MAILBOX_ADDRESS || SUPPORT_ADDRESS).trim().toLowerCase();
  if (event.mailboxAddress && event.mailboxAddress !== expectedMailbox) return { ok: false as const, reason: "wrong_mailbox" };

  const classification = classifySupportEvent(event);
  const db = createServerClient();
  const id = hostingerSupportRunId(event.eventKey);
  const audit = {
    sender: event.senderEmail,
    subject: event.subject,
    category: classification.category,
    reason: classification.reason,
    receivedAt: event.timestamp,
    mailbox: event.mailboxAddress || expectedMailbox,
    sourceUid: event.uid,
    sourceFolder: event.folder,
    messageId: event.messageId,
  };
  const claim = await db.from("workflow_runs").insert({
    id,
    workflow_id: HOSTINGER_SUPPORT_WORKFLOW_ID,
    trigger_event: HOSTINGER_SUPPORT_EVENT,
    status: "running",
    started_at: new Date().toISOString(),
    result: audit,
  });
  if (claim.error?.code === "23505") return { ok: true as const, duplicate: true, category: classification.category };
  if (claim.error) throw new Error("support_audit_claim_failed");

  if (!classification.autoReply) {
    const saved = await db.from("workflow_runs").update({
      status: "skipped",
      finished_at: new Date().toISOString(),
      result: { ...audit, manualReview: true },
    }).eq("id", id);
    if (saved.error) throw new Error("support_audit_finalize_failed");
    return { ok: true as const, autoReplied: false, category: classification.category };
  }

  try {
    await sendHostingerReply(event, classification);
    const saved = await db.from("workflow_runs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      result: { ...audit, autoReplied: true },
    }).eq("id", id);
    if (saved.error) throw new Error("support_audit_finalize_failed");
    return { ok: true as const, autoReplied: true, category: classification.category };
  } catch (error) {
    await db.from("workflow_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : "support_reply_failed",
      result: { ...audit, outcomeUnknown: true },
    }).eq("id", id);
    throw error;
  }
}
