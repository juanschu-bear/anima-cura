import { createServerClient } from "@/lib/db/supabase";

export type CommunicationEventType =
  | "queued" | "accepted" | "delivered" | "delayed" | "opened" | "clicked"
  | "failed" | "bounced" | "complained" | "suppressed"
  | "portal_login" | "document_opened" | "document_downloaded" | "payment_opened";

export type CommunicationMessageStatus =
  | "queued" | "accepted" | "delivered" | "delayed" | "opened" | "clicked"
  | "failed" | "bounced" | "complained" | "suppressed";

export type CommunicationMessage = {
  id: string;
  trackingToken: string;
};

type CreateMessageInput = {
  patientId?: string | null;
  campaignKey?: string | null;
  channel?: "email" | "sms" | "push" | "portal";
  provider?: string | null;
  recipient: string;
  subject: string;
  metadata?: Record<string, unknown>;
};

const STATUS_BY_EVENT: Partial<Record<CommunicationEventType, CommunicationMessageStatus>> = {
  queued: "queued",
  accepted: "accepted",
  delivered: "delivered",
  delayed: "delayed",
  opened: "opened",
  clicked: "clicked",
  failed: "failed",
  bounced: "bounced",
  complained: "complained",
  suppressed: "suppressed",
};

const TERMINAL_FAILURES = new Set<CommunicationMessageStatus>(["failed", "bounced", "complained", "suppressed"]);
const SUCCESS_RANK: Partial<Record<CommunicationMessageStatus, number>> = {
  queued: 0,
  accepted: 1,
  delayed: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
};

export function nextCommunicationStatus(
  current: CommunicationMessageStatus,
  eventType: CommunicationEventType,
): CommunicationMessageStatus {
  const incoming = STATUS_BY_EVENT[eventType];
  if (!incoming) return current;
  if (TERMINAL_FAILURES.has(incoming)) return incoming;
  if (TERMINAL_FAILURES.has(current)) return current;
  return (SUCCESS_RANK[incoming] ?? -1) >= (SUCCESS_RANK[current] ?? -1) ? incoming : current;
}

function publicBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://animacura.io").replace(/\/$/, "");
}

export async function createCommunicationMessage(input: CreateMessageInput): Promise<CommunicationMessage> {
  const db = createServerClient();
  const id = crypto.randomUUID();
  const trackingToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const inserted = await db.from("communication_messages").insert({
    id,
    patient_id: input.patientId ?? null,
    campaign_key: input.campaignKey ?? null,
    channel: input.channel ?? "email",
    provider: input.provider ?? null,
    recipient: input.recipient.trim().toLowerCase(),
    subject: input.subject,
    status: "queued",
    tracking_token: trackingToken,
    last_event_at: now,
    metadata: input.metadata ?? {},
  });
  if (inserted.error) throw new Error(`Communication ledger unavailable: ${inserted.error.message}`);
  const event = await db.from("communication_events").insert({
    message_id: id,
    event_type: "queued",
    source: "anima_cura",
    occurred_at: now,
  });
  if (event.error) throw new Error(`Communication event unavailable: ${event.error.message}`);
  return { id, trackingToken };
}

export async function safeCreateCommunicationMessage(input: CreateMessageInput): Promise<CommunicationMessage | null> {
  try {
    return await createCommunicationMessage(input);
  } catch (error) {
    console.error("[communication-ledger] message registration failed", error);
    return null;
  }
}

type RecordEventInput = {
  messageId: string;
  eventType: CommunicationEventType;
  source?: string;
  eventKey?: string | null;
  occurredAt?: string;
  providerMessageId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordCommunicationEvent(input: RecordEventInput) {
  const db = createServerClient();
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const current = await db.from("communication_messages").select("status").eq("id", input.messageId).maybeSingle();
  if (current.error || !current.data) throw new Error("Communication message not found");
  const status = nextCommunicationStatus(current.data.status as CommunicationMessageStatus, input.eventType);
  const eventRow = {
    message_id: input.messageId,
    event_type: input.eventType,
    event_key: input.eventKey ?? null,
    source: input.source ?? "anima_cura",
    occurred_at: occurredAt,
    metadata: input.metadata ?? {},
  };
  // event_key is optional. PostgreSQL cannot use the partial unique index for
  // an ON CONFLICT clause when the key is NULL, so ordinary transport events
  // must be inserted directly. Otherwise accepted code mails remain shown as
  // merely queued even though the provider accepted them.
  const event = input.eventKey
    ? await db.from("communication_events").upsert(eventRow, { onConflict: "event_key", ignoreDuplicates: true })
    : await db.from("communication_events").insert(eventRow);
  if (event.error) throw new Error(`Communication event unavailable: ${event.error.message}`);
  const patch: Record<string, unknown> = { status, last_event_at: occurredAt, updated_at: new Date().toISOString() };
  if (input.providerMessageId) patch.provider_message_id = input.providerMessageId;
  if (input.eventType === "accepted") patch.sent_at = occurredAt;
  if (input.eventType === "delivered") patch.delivered_at = occurredAt;
  if (input.eventType === "opened") patch.first_opened_at = occurredAt;
  if (input.eventType === "clicked") patch.first_clicked_at = occurredAt;
  const updated = await db.from("communication_messages").update(patch).eq("id", input.messageId);
  if (updated.error) throw new Error(`Communication message update failed: ${updated.error.message}`);
}

export async function safeRecordCommunicationEvent(input: RecordEventInput) {
  try {
    await recordCommunicationEvent(input);
  } catch (error) {
    console.error("[communication-ledger] event registration failed", error);
  }
}

export function appendOpenTracking(html: string, trackingToken: string) {
  const src = `${publicBaseUrl()}/api/communication/open/${trackingToken}`;
  return `${html}<img src="${src}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;overflow:hidden" />`;
}

export async function createTrackedLink(messageId: string, targetUrl: string, label?: string) {
  const parsed = new URL(targetUrl);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Unsupported tracked link protocol");
  const token = crypto.randomUUID();
  const result = await createServerClient().from("communication_links").insert({
    message_id: messageId,
    token,
    target_url: parsed.toString(),
    label: label ?? null,
  });
  if (result.error) throw new Error(`Communication link unavailable: ${result.error.message}`);
  return `${publicBaseUrl()}/api/communication/click/${token}`;
}

export async function prepareTrackedEmail(
  message: CommunicationMessage,
  input: { html: string; text: string },
) {
  const linkTrackingEnabled = process.env.COMMUNICATION_LINK_TRACKING_ENABLED === "true";
  const openTrackingEnabled = process.env.COMMUNICATION_OPEN_TRACKING_ENABLED === "true";
  const hrefs = Array.from(input.html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)).map(match => match[1]);
  const unique = Array.from(new Set(hrefs));
  let html = input.html;
  let text = input.text;
  if (linkTrackingEnabled) {
    for (const target of unique) {
      try {
        const tracked = await createTrackedLink(message.id, target);
        html = html.split(target).join(tracked);
        text = text.split(target.replaceAll("&amp;", "&")).join(tracked);
      } catch (error) {
        console.error("[communication-ledger] link registration failed", error);
      }
    }
  }
  return { html: openTrackingEnabled ? appendOpenTracking(html, message.trackingToken) : html, text };
}

export async function communicationMessageByTrackingToken(token: string) {
  const result = await createServerClient().from("communication_messages").select("id").eq("tracking_token", token).maybeSingle();
  if (result.error) throw new Error("Tracking lookup failed");
  return result.data as { id: string } | null;
}

export async function communicationLinkByToken(token: string) {
  const result = await createServerClient().from("communication_links").select("message_id,target_url").eq("token", token).maybeSingle();
  if (result.error) throw new Error("Link lookup failed");
  return result.data as { message_id: string; target_url: string } | null;
}

export async function communicationMessageByProviderId(provider: string, providerMessageId: string) {
  const result = await createServerClient().from("communication_messages").select("id")
    .eq("provider", provider).eq("provider_message_id", providerMessageId).maybeSingle();
  if (result.error) throw new Error("Provider message lookup failed");
  return result.data as { id: string } | null;
}
