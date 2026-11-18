import type { CommunicationEventType } from "./communication-ledger";

export type ResendEmailWebhook = {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
    suppressed?: { type?: string; message?: string };
  };
};

const EVENT_TYPE: Record<string, CommunicationEventType> = {
  "email.sent": "accepted",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.failed": "failed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.suppressed": "suppressed",
};

export function resendCommunicationEvent(payload: ResendEmailWebhook) {
  const eventType = EVENT_TYPE[payload.type];
  const providerMessageId = payload.data?.email_id;
  if (!eventType || !providerMessageId) return null;

  const metadata: Record<string, unknown> = {};
  if (payload.data.bounce) {
    metadata.bounce = {
      ...(payload.data.bounce.type ? { type: payload.data.bounce.type } : {}),
      ...(payload.data.bounce.subType ? { subType: payload.data.bounce.subType } : {}),
      ...(payload.data.bounce.message ? { message: payload.data.bounce.message } : {}),
    };
    if (payload.data.bounce.type) metadata.bounceType = payload.data.bounce.type;
    if (payload.data.bounce.subType) metadata.bounceSubType = payload.data.bounce.subType;
    if (payload.data.bounce.message) metadata.message = payload.data.bounce.message;
  }
  if (payload.data.failed?.reason) metadata.reason = payload.data.failed.reason;
  if (payload.data.suppressed?.type) metadata.suppressionType = payload.data.suppressed.type;
  if (payload.data.suppressed?.message) metadata.message = payload.data.suppressed.message;

  return {
    eventType,
    providerMessageId,
    occurredAt: payload.created_at,
    metadata,
  };
}
