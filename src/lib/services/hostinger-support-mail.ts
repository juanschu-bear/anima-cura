import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
import { generateGroundedSupportCore } from "@/lib/services/hostinger-support-ai";
import { retrieveSupportKnowledge } from "@/lib/support/knowledge-base";

export const HOSTINGER_SUPPORT_WORKFLOW_ID = "31480537-b9a8-4b93-b4d1-c011dfab415f";
export const HOSTINGER_SUPPORT_EVENT = "hostinger_support_message_received";
const SUPPORT_ADDRESS = "praxisteam@animacura.io";
const MANUAL_REVIEW_ADDRESS = "orthoschub@web.de";
const PORTAL_RECOVERY_URL = "https://animacura.io/patient/login?recovery=1";
const PORTAL_INVOICES_URL = "https://animacura.io/patient/login?next=%2Fpatient%2Fportal%3Fsection%3Dinvoices";
const PORTAL_LOGIN_URL = "https://animacura.io/patient/login";

export type SupportCategory =
  | "login_password"
  | "invoice_access"
  | "payment_method"
  | "portal_setup"
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

function reportsMissingSecurityCode(text: string) {
  return /\b(?:kein(?:e|en|er|es|em)?|ohne)\b[^.!?\n]{0,80}\b(?:aktivierungs|sicherheits|zugangs|bestätigungs|bestaetigungs)?codes?\b/.test(text)
    || /\b(?:aktivierungs|sicherheits|zugangs|bestätigungs|bestaetigungs)?codes?\b[^.!?\n]{0,100}\b(?:fehlt|fehlen|(?:nicht|nie)\b[^.!?\n]{0,40}\b(?:an|angekommen|erhalten|bekommen|zugestellt|eingetroffen|gesendet|versendet|empfangen))\b/.test(text);
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
  if (!event.excerpt.trim()) {
    return { category: "other", autoReply: false, reason: "missing_message_body" };
  }
  if (reportsMissingSecurityCode(text)) {
    return { category: "login_password", autoReply: false, reason: "security_code_not_received" };
  }
  if (/passwort|password|sicherheitscode|code kommt|kennwort/.test(text)) {
    return { category: "login_password", autoReply: true, reason: "technical_access" };
  }
  const invoiceNavigation = /(rechnung|rechnungslink|dokument)/.test(text)
    && /(öffn|seh|find|abruf|zugriff|anmeld|login|app)/.test(text);
  if (invoiceNavigation || /qr.*login/.test(text)) {
    return { category: "invoice_access", autoReply: true, reason: "invoice_navigation" };
  }
  if (/banking.?qr|überweis|ueberweis|wie.*zahl|zahlung.*qr|zahlungsweg/.test(text)) {
    return { category: "payment_method", autoReply: true, reason: "generic_payment_navigation" };
  }
  if (/app.*(install|einricht|hinzufüg)|home.?bildschirm|homescreen|startbildschirm|benachrichtigung|push.?nachricht/.test(text)) {
    return { category: "portal_setup", autoReply: true, reason: "portal_setup" };
  }
  if (/anmeld|login|einlog|zugang/.test(text)) {
    return { category: "login_password", autoReply: true, reason: "technical_access" };
  }
  return { category: "other", autoReply: false, reason: "human_review_required" };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] || char);
}

function salutation(name: string | null) {
  const normalized = name?.trim();
  if (normalized?.toLocaleLowerCase("de-DE").startsWith("familie ")) return `Hallo ${normalized},`;
  const first = normalized?.split(/\s+/)[0];
  return first && first.length <= 60 ? `Hallo ${first},` : "Guten Tag,";
}

type SupportIdentitySubmission = { vorname?: string | null; nachname?: string | null; email?: string | null; answers?: unknown };
type SupportIdentityPatient = { vorname?: string | null; nachname?: string | null; email?: string | null; versicherter_email?: string | null };

function normalizedEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("de-DE") : "";
}

function answerValue(answers: unknown, key: string) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return "";
  const value = (answers as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function resolveSupportContactName(
  email: string,
  directSubmissions: SupportIdentitySubmission[],
  guardianSubmissions: SupportIdentitySubmission[],
  directPatients: SupportIdentityPatient[],
  guardianPatients: SupportIdentityPatient[],
) {
  const target = normalizedEmail(email);
  const guardianNames = guardianSubmissions
    .filter(row => normalizedEmail(answerValue(row.answers, "vp_email")) === target)
    .map(row => answerValue(row.answers, "vp_vorname"))
    .filter(Boolean);
  const uniqueGuardianNames = Array.from(new Set(guardianNames.map(name => name.toLocaleLowerCase("de-DE"))));
  if (uniqueGuardianNames.length === 1) return guardianNames[0];

  const directNames = [
    ...directSubmissions.filter(row => normalizedEmail(row.email) === target).map(row => row.vorname?.trim()),
    ...directPatients.filter(row => normalizedEmail(row.email) === target).map(row => row.vorname?.trim()),
  ].filter((value): value is string => Boolean(value));
  const uniqueDirectNames = Array.from(new Set(directNames.map(name => name.toLocaleLowerCase("de-DE"))));
  if (uniqueDirectNames.length === 1) return directNames[0];

  const familyNames = [...guardianPatients, ...guardianSubmissions, ...directPatients, ...directSubmissions]
    .map(row => row.nachname?.trim())
    .filter((value): value is string => Boolean(value));
  const uniqueFamilyNames = Array.from(new Set(familyNames.map(name => name.toLocaleLowerCase("de-DE"))));
  if (uniqueFamilyNames.length === 1) return `Familie ${familyNames[0]}`;
  return null;
}

async function enrichSupportContact(event: ParsedSupportEvent) {
  if (event.senderName) return event;
  const db = createServerClient();
  const [directSubmissions, guardianSubmissions, directPatients, guardianPatients] = await Promise.all([
    db.from("anamnese_submissions").select("vorname,nachname,email,answers").eq("email", event.senderEmail).order("created_at", { ascending: false }).limit(8),
    db.from("anamnese_submissions").select("vorname,nachname,email,answers").eq("answers->>vp_email", event.senderEmail).order("created_at", { ascending: false }).limit(8),
    db.from("patients").select("vorname,nachname,email,versicherter_email").eq("email", event.senderEmail).limit(8),
    db.from("patients").select("vorname,nachname,email,versicherter_email").eq("versicherter_email", event.senderEmail).limit(8),
  ]);
  const senderName = resolveSupportContactName(
    event.senderEmail,
    directSubmissions.data ?? [],
    guardianSubmissions.data ?? [],
    directPatients.data ?? [],
    guardianPatients.data ?? [],
  );
  return senderName ? { ...event, senderName } : event;
}

function supportEmailPresentation(category: SupportCategory) {
  if (category === "login_password") return {
    title: "Zugang sicher wiederherstellen",
    summary: "Wir führen dich direkt zurück in dein persönliches Patientenportal.",
    action: "Passwort neu einrichten",
    url: PORTAL_RECOVERY_URL,
  };
  if (category === "invoice_access") return {
    title: "Rechnung sicher öffnen",
    summary: "Deine Dokumente bleiben geschützt und werden nach der Anmeldung angezeigt.",
    action: "Zu meinen Rechnungen",
    url: PORTAL_INVOICES_URL,
  };
  if (category === "payment_method") return {
    title: "Zahlungsweg öffnen",
    summary: "Banking-QR und klassische Überweisung stehen dir im geschützten Bereich zur Verfügung.",
    action: "Rechnung und Zahlung öffnen",
    url: PORTAL_INVOICES_URL,
  };
  return {
    title: "Anima Cura einrichten",
    summary: "Richte dein Patientenportal ein und aktiviere wichtige Benachrichtigungen.",
    action: "Anima Cura öffnen",
    url: PORTAL_LOGIN_URL,
  };
}

function isCredentialSafetyParagraph(paragraph: string) {
  return /(?:passwort|sicherheitscode)/i.test(paragraph)
    && /(?:niemals|nicht).*(?:senden|weitergeben)|(?:senden|weitergeben).*(?:niemals|nicht)/i.test(paragraph);
}

export function buildSupportEmailHtml(message: string, category: SupportCategory, options?: { showAction?: boolean; title?: string; summary?: string | null }) {
  const presentation = supportEmailPresentation(category);
  const title = options?.title || presentation.title;
  const summary = options?.summary === null ? "" : options?.summary || presentation.summary;
  const showAction = options?.showAction !== false;
  const paragraphs = message.split("\n\n").map(value => value.trim()).filter(Boolean);
  const greeting = paragraphs.shift() || "Guten Tag,";
  const body = paragraphs.filter(paragraph =>
    !paragraph.startsWith("Bitte sende uns niemals") &&
    !isCredentialSafetyParagraph(paragraph) &&
    !paragraph.startsWith("Liebe Grüße") &&
    !paragraph.includes(PORTAL_RECOVERY_URL),
  );
  const bodyHtml = body.map(paragraph => `<p style="margin:0 0 18px;color:#33443f;font-size:16px;line-height:1.7;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>@media only screen and (max-width:620px){.ac-shell{padding:18px 10px!important}.ac-card{border-radius:16px!important}.ac-pad{padding-left:22px!important;padding-right:22px!important}.ac-title{font-size:28px!important}.ac-button{display:block!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background:#eef2ef;color:#17372f;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(summary || title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#eef2ef;"><tr><td class="ac-shell" align="center" style="padding:38px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ac-card" style="width:100%;max-width:640px;background:#fffdf9;border:1px solid #dbe3de;border-radius:20px;overflow:hidden;box-shadow:0 18px 50px rgba(24,55,47,.12);">
    <tr><td style="height:5px;background:#1d5f4e;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td class="ac-pad" style="padding:30px 42px 24px;border-bottom:1px solid #e5ebe7;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;"><div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1;color:#17372f;">Anima Cura</div><div style="margin-top:7px;color:#65766f;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Digitaler Patientenservice</div></td>
        <td align="right" style="vertical-align:middle;"><span style="display:inline-block;border:1px solid #bfd3ca;border-radius:7px;padding:7px 10px;color:#1d5f4e;font-size:12px;font-weight:700;">Antwort des Praxisteams</span></td>
      </tr></table>
    </td></tr>
    <tr><td class="ac-pad" style="padding:38px 42px 14px;">
      <p style="margin:0 0 18px;color:#1d5f4e;font-size:16px;font-weight:700;">${escapeHtml(greeting)}</p>
      <h1 class="ac-title" style="margin:0;max-width:520px;color:#142f28;font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:500;line-height:1.16;letter-spacing:-.02em;">${escapeHtml(title)}</h1>
      ${summary ? `<p style="margin:14px 0 0;max-width:540px;color:#65766f;font-size:16px;line-height:1.65;">${escapeHtml(summary)}</p>` : ""}
    </td></tr>
    <tr><td class="ac-pad" style="padding:22px 42px 8px;">${bodyHtml}</td></tr>
    ${showAction ? `<tr><td class="ac-pad" style="padding:18px 42px 34px;">
      <a class="ac-button" href="${presentation.url}" target="_blank" style="display:inline-block;background:#1d5f4e;border:1px solid #1d5f4e;border-radius:10px;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:750;line-height:1.2;">${escapeHtml(presentation.action)} &nbsp;→</a>
      <p style="margin:14px 0 0;color:#788780;font-size:12px;line-height:1.6;word-break:break-all;">Falls der Button nicht öffnet: <a href="${presentation.url}" style="color:#1d5f4e;text-decoration:underline;">${presentation.url}</a></p>
    </td></tr>` : ""}
    <tr><td class="ac-pad" style="padding:0 42px 34px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f6f3;border:1px solid #d8e4de;border-radius:12px;"><tr><td style="padding:17px 18px;">
        <div style="color:#1d5f4e;font-size:13px;font-weight:750;">Sicherer Umgang mit Zugangsdaten</div>
        <div style="margin-top:5px;color:#5d6f68;font-size:13px;line-height:1.55;">Wir fragen niemals per E-Mail nach deinem Passwort oder einem Sicherheitscode. Gib beides ausschließlich in der geöffneten Anima-Cura-Anwendung ein.</div>
      </td></tr></table>
    </td></tr>
    <tr><td class="ac-pad" style="padding:24px 42px 30px;background:#17372f;color:#dce9e3;">
      <div style="font-size:15px;font-weight:700;">Dein Anima-Cura-Praxisteam</div>
      <div style="margin-top:7px;color:#a9c0b6;font-size:13px;line-height:1.6;">KFO-Praxis Dr. Maria Elena Schubert · Leipzig</div>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

export function buildSupportReply(event: ParsedSupportEvent, classification: SupportClassification) {
  const hello = salutation(event.senderName);
  const commonEnd = "\n\nBitte sende uns niemals dein Passwort oder einen Sicherheitscode per E-Mail.\n\nLiebe Grüße\nDein Anima-Cura-Praxisteam";
  const activationRequest = /noch kein.*(zugang|konto)|kein.*(zugang|konto)|account.*(erstellen|aktivieren)|noch nie.*angemeldet/.test(normalizedText(event));
  let message: string;
  if (classification.category === "login_password" && activationRequest) {
    message = `${hello}\n\ndeinen bestehenden Patientenzugang kannst du direkt in Anima Cura aktivieren:\n\n1. Öffne auf der Anmeldeseite „Noch keinen Zugang? Patientenkonto aktivieren“.\n2. Gib deine Patientennummer, dein Geburtsdatum und die private Kontakt-E-Mail ein, die bei der Praxis hinterlegt ist.\n3. Trage den sechsstelligen Sicherheitscode aus dieser privaten E-Mail in der geöffneten App ein.\n4. Lege dein eigenes Passwort fest. Danach wirst du direkt angemeldet.\n\nEs wird keine neue Patientenakte und kein neuer Anamnesebogen erstellt.\n\nAnima Cura jetzt öffnen:\n${PORTAL_LOGIN_URL}${commonEnd}`;
  } else if (classification.category === "login_password") {
    message = `${hello}\n\ndeinen Zugang kannst du direkt in Anima Cura wiederherstellen:\n\n1. Öffne „Passwort vergessen“.\n2. Gib deine persönliche Anima-Cura-Anmeldeadresse ein. Sie endet meist auf @animacura.de, dient aber nur als Benutzername und empfängt keine E-Mails.\n3. Den sechsstelligen Sicherheitscode erhältst du an deine bei der Praxis hinterlegte private Kontakt-E-Mail, zum Beispiel Gmail, GMX oder Web.de.\n4. Trage den Code in der geöffneten App ein und vergib dein neues Passwort zweimal.\n\nDanach führt dich Anima Cura direkt zu der zuvor geöffneten Rechnung zurück.\n\nPasswort jetzt neu einrichten:\n${PORTAL_RECOVERY_URL}${commonEnd}`;
  } else if (classification.category === "invoice_access") {
    message = `${hello}\n\nöffne den Rechnungsbutton oder QR-Code erneut und melde dich in Anima Cura an. Nach der Anmeldung wird die passende Rechnung automatisch geöffnet. Bereits bereitgestellte Rechnungen findest du außerdem im Patientenportal unter „Dokumente“.\n\nFalls das Passwort nicht mehr funktioniert, wähle auf der Anmeldeseite „Passwort vergessen“.${commonEnd}`;
  } else if (classification.category === "payment_method") {
    message = `${hello}\n\ndie Rechnung und die sicheren Zahlungswege findest du nach der Anmeldung in Anima Cura. Öffne dort die Rechnung oder den Zahlungsbereich und wähle Banking-QR oder normale Überweisung. Beide Wege sind möglich.\n\nBei Fragen zu einem konkreten Betrag wird deine Nachricht persönlich geprüft.${commonEnd}`;
  } else {
    message = `${hello}\n\nöffne deinen persönlichen Anima-Cura-Link auf dem Smartphone und füge das Patientenportal über die Browserfunktion zum Home- oder Startbildschirm hinzu. Aktiviere anschließend die Benachrichtigungen, damit du neue Rechnungen und wichtige Praxisnachrichten nicht übersiehst.${commonEnd}`;
  }
  return {
    subject: event.subject.toLocaleLowerCase("de-DE").startsWith("re:") ? event.subject : `Re: ${event.subject}`,
    text: message,
    html: buildSupportEmailHtml(message, classification.category),
  };
}

async function buildGroundedSupportReply(event: ParsedSupportEvent, classification: SupportClassification) {
  const fallback = buildSupportReply(event, classification);
  if (!classification.autoReply || !["login_password", "invoice_access", "payment_method", "portal_setup"].includes(classification.category)) {
    return {
      reply: fallback,
      mode: "template" as const,
      model: null,
      knowledgeVersion: null,
      sourceIds: [] as string[],
    };
  }
  const category = classification.category as "login_password" | "invoice_access" | "payment_method" | "portal_setup";
  const knowledge = retrieveSupportKnowledge(category, normalizedText(event));
  const generated = await generateGroundedSupportCore({ category, knowledge });
  if (!generated.core) return { reply: fallback, ...generated };

  const message = `${salutation(event.senderName)}\n\n${generated.core}\n\nBitte sende uns niemals dein Passwort oder einen Sicherheitscode per E-Mail.\n\nLiebe Grüße\nDein Anima-Cura-Praxisteam`;
  return {
    reply: {
      subject: fallback.subject,
      text: message,
      html: buildSupportEmailHtml(message, classification.category),
    },
    ...generated,
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
  const generated = await buildGroundedSupportReply(event, classification);
  const reply = generated.reply;
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
  return generated;
}

export async function sendHostingerSupportMessage(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: { folder: string; uid: number | string } | null;
}) {
  const apiToken = process.env.HOSTINGER_MAIL_API_TOKEN;
  const mailboxResourceId = process.env.HOSTINGER_MAILBOX_RESOURCE_ID;
  if (!apiToken || !mailboxResourceId) throw new Error("hostinger_mail_not_configured");
  const body: Record<string, unknown> = {
    to: [input.to],
    displayName: "Anima Cura Praxisteam",
    subject: input.subject,
    text: input.text,
    html: input.html ?? buildSupportEmailHtml(input.text, "login_password"),
  };
  if (input.inReplyTo) body.inReplyTo = input.inReplyTo;
  const response = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(mailboxResourceId)}/send`, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`hostinger_mail_rejected:${response.status}`);
}

export function buildAccessCodeReissueNotice(purpose: "activation" | "recovery" = "activation") {
  const purposeLabel = purpose === "activation" ? "Aktivierung deines Patientenkontos" : "Passwort-Neuvergabe";
  const nextStep = purpose === "activation"
    ? "Öffne in Anima Cura „Noch keinen Zugang? Patientenkonto aktivieren“ und gib den Code dort ein."
    : "Öffne in Anima Cura „Passwort vergessen?“ und gib den Code dort ein.";
  const text = [
    "Hallo,",
    "",
    "danke für deinen Hinweis. Wir haben deinen Zugangsvorgang geprüft.",
    "",
    `Ein neuer sechsstelliger Sicherheitscode für die ${purposeLabel} wurde an den E-Mail-Versand übergeben. Der Code ist 30 Minuten gültig. ${nextStep}`,
    "",
    "Falls die separate Code-E-Mail nicht innerhalb weniger Minuten eintrifft, antworte bitte direkt auf diese Nachricht. Starte dann keinen weiteren Vorgang, damit nicht mehrere Codes miteinander kollidieren.",
    "",
    "Liebe Grüße",
    "Dein Anima-Cura-Praxisteam",
  ].join("\n");
  return {
    subject: `Dein Sicherheitscode zur ${purposeLabel}`,
    text,
    html: buildSupportEmailHtml(text, purpose === "activation" ? "portal_setup" : "login_password"),
  };
}

export function buildManualReviewAcknowledgement(event: ParsedSupportEvent, classification: SupportClassification) {
  const hello = salutation(event.senderName);
  const core = classification.reason === "security_code_not_received"
    ? "Wir kontrollieren jetzt deinen letzten Codeversand und klären, ob es um die erstmalige Aktivierung oder eine Passwort-Neuvergabe geht. Bitte fordere bis zu unserer Rückmeldung keinen weiteren Code an, damit nicht mehrere Codes miteinander kollidieren."
    : classification.category === "medical"
      ? "Das Praxisteam prüft deine medizinische Frage persönlich. Du erhältst dazu eine gesonderte Rückmeldung."
      : classification.category === "billing_specific"
        ? "Das Praxisteam prüft deine individuelle Abrechnungsfrage. Du erhältst dazu eine gesonderte Rückmeldung."
        : "Das Praxisteam prüft dein Anliegen persönlich. Falls für die eindeutige Zuordnung noch eine Angabe fehlt, fragen wir gezielt nach.";
  const text = `${hello}\n\n${core}\n\nLiebe Grüße\nDein Anima-Cura-Praxisteam`;
  return {
    subject: event.subject.toLocaleLowerCase("de-DE").startsWith("re:") || event.subject.toLocaleLowerCase("de-DE").startsWith("aw:")
      ? event.subject
      : `Re: ${event.subject}`,
    text,
    html: buildSupportEmailHtml(text, classification.category, {
      showAction: false,
      title: "Wir kümmern uns darum",
      summary: null,
    }),
  };
}

export function buildManualReviewAlert(event: ParsedSupportEvent, classification: SupportClassification) {
  const patient = event.senderName?.trim() || event.senderEmail;
  const reason = classification.category === "medical"
    ? "Medizinische Frage – keine automatische Fachantwort"
    : classification.category === "billing_specific"
      ? "Individuelle Abrechnungsfrage – persönliche Prüfung erforderlich"
      : classification.reason === "security_code_not_received"
        ? "Sicherheitscode nicht erhalten – technische Prüfung der Codezustellung erforderlich"
        : classification.reason === "missing_message_body"
          ? "Nachrichtentext fehlt – Originalnachricht persönlich prüfen"
          : "Supportanfrage – persönliche Prüfung erforderlich";
  const subject = `[Anima Cura · Prüfung erforderlich] ${event.subject}`;
  const text = `${reason}\n\nVon: ${patient} <${event.senderEmail}>\nBetreff: ${event.subject}\n\nNachricht:\n${event.excerpt || "Keine Vorschau verfügbar."}\n\nDirekt an den Absender antworten: mailto:${event.senderEmail}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;color:#1d2d28;line-height:1.6"><h1 style="font-size:22px">Prüfung erforderlich</h1><p><strong>${escapeHtml(reason)}</strong></p><p>Von: ${escapeHtml(patient)} &lt;${escapeHtml(event.senderEmail)}&gt;<br>Betreff: ${escapeHtml(event.subject)}</p><div style="margin:20px 0;padding:18px;background:#f4f6f5;border:1px solid #d9e0dc;border-radius:10px;white-space:pre-wrap">${escapeHtml(event.excerpt || "Keine Vorschau verfügbar.")}</div><p><a href="mailto:${escapeHtml(event.senderEmail)}?subject=${encodeURIComponent(`Re: ${event.subject}`)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#1d5f4e;color:#fff;text-decoration:none;font-weight:700">Patient direkt antworten</a></p><p style="font-size:13px;color:#687770">Diese Nachricht wurde nicht automatisch fachlich beantwortet.</p></div>`;
  return { subject, text, html };
}

async function sendManualReviewAlert(event: ParsedSupportEvent, classification: SupportClassification) {
  const apiToken = process.env.HOSTINGER_MAIL_API_TOKEN;
  const mailboxResourceId = process.env.HOSTINGER_MAILBOX_RESOURCE_ID || event.mailboxResourceId;
  if (!apiToken || !mailboxResourceId) throw new Error("hostinger_mail_not_configured");
  const alert = buildManualReviewAlert(event, classification);
  const response = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(mailboxResourceId)}/send`, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: [process.env.SUPPORT_MANUAL_REVIEW_TO?.trim() || MANUAL_REVIEW_ADDRESS],
      displayName: "Anima Cura · Support-Prüfung",
      subject: alert.subject,
      text: alert.text,
      html: alert.html,
    }),
  });
  if (!response.ok) throw new Error(`manual_review_notification_rejected:${response.status}`);
}

async function sendManualReviewAcknowledgement(event: ParsedSupportEvent, classification: SupportClassification) {
  const apiToken = process.env.HOSTINGER_MAIL_API_TOKEN;
  const mailboxResourceId = process.env.HOSTINGER_MAILBOX_RESOURCE_ID || event.mailboxResourceId;
  if (!apiToken || !mailboxResourceId) throw new Error("hostinger_mail_not_configured");
  const acknowledgement = buildManualReviewAcknowledgement(event, classification);
  const body: Record<string, unknown> = {
    to: [event.senderEmail],
    displayName: "Anima Cura Praxisteam",
    subject: acknowledgement.subject,
    text: acknowledgement.text,
    html: acknowledgement.html,
  };
  if (event.uid) body.inReplyTo = { folder: event.folder, uid: event.uid };
  const response = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(mailboxResourceId)}/send`, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`manual_review_acknowledgement_rejected:${response.status}`);
  return acknowledgement;
}

export async function processHostingerSupportEvent(payload: unknown) {
  const parsedEvent = parseHostingerSupportEvent(payload);
  if (!parsedEvent || parsedEvent.event !== "message.received") return { ok: false as const, reason: "unsupported_event" };
  const event = await enrichSupportContact(parsedEvent);
  const expectedMailbox = (process.env.HOSTINGER_MAILBOX_ADDRESS || SUPPORT_ADDRESS).trim().toLowerCase();
  if (event.mailboxAddress && event.mailboxAddress !== expectedMailbox) return { ok: false as const, reason: "wrong_mailbox" };

  const classification = classifySupportEvent(event);
  const db = createServerClient();
  const id = hostingerSupportRunId(event.eventKey);
  const audit = {
    sender: event.senderEmail,
    senderName: event.senderName,
    subject: event.subject,
    excerpt: event.excerpt,
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

  if (classification.reason === "automated_or_loop_risk") {
    const saved = await db.from("workflow_runs").update({
      status: "skipped",
      finished_at: new Date().toISOString(),
      result: { ...audit, ignored: true },
    }).eq("id", id);
    if (saved.error) throw new Error("support_audit_finalize_failed");
    return { ok: true as const, autoReplied: false, ignored: true, category: classification.category };
  }

  if (!classification.autoReply) {
    const [acknowledgement, alert] = await Promise.allSettled([
      sendManualReviewAcknowledgement(event, classification),
      sendManualReviewAlert(event, classification),
    ]);
    const autoAcknowledged = acknowledgement.status === "fulfilled";
    const practiceNotified = alert.status === "fulfilled";
    const error = [acknowledgement, alert]
      .filter((entry): entry is PromiseRejectedResult => entry.status === "rejected")
      .map(entry => entry.reason instanceof Error ? entry.reason.message : String(entry.reason))
      .join("; ");
    const reply = acknowledgement.status === "fulfilled" ? acknowledgement.value : null;
    const saved = await db.from("workflow_runs").update({
      status: autoAcknowledged ? "success" : "failed",
      finished_at: new Date().toISOString(),
      error: error || null,
      result: {
        ...audit,
        manualReview: true,
        practiceNotified,
        autoAcknowledged,
        replySubject: reply?.subject ?? null,
        replyText: reply?.text ?? null,
        replyMode: reply ? "receipt_acknowledgement" : null,
      },
    }).eq("id", id);
    if (saved.error) throw new Error("support_audit_finalize_failed");
    return { ok: true as const, autoReplied: false, autoAcknowledged, practiceNotified, category: classification.category };
  }

  try {
    const generated = await sendHostingerReply(event, classification);
    const saved = await db.from("workflow_runs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      result: {
        ...audit,
        autoReplied: true,
        replySubject: generated.reply.subject,
        replyText: generated.reply.text,
        replyMode: generated.mode,
        knowledgeVersion: generated.knowledgeVersion,
        knowledgeSourceIds: generated.sourceIds,
        model: generated.model,
      },
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
