import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  communicationMessageByProviderId,
  recordCommunicationEvent,
} from "@/lib/services/communication-ledger";
import {
  resendCommunicationEvent,
  type ResendEmailWebhook,
} from "@/lib/services/resend-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ code: "resend_webhook_not_configured" }, { status: 503 });
  }

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ code: "resend_webhook_signature_missing" }, { status: 400 });
  }

  const rawBody = await request.text();
  let verified: ResendEmailWebhook;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY || "re_webhook_verification_only");
    verified = resend.webhooks.verify({
      payload: rawBody,
      headers: { id, timestamp, signature },
      webhookSecret,
    }) as ResendEmailWebhook;
  } catch {
    return NextResponse.json({ code: "resend_webhook_signature_invalid" }, { status: 400 });
  }

  const event = resendCommunicationEvent(verified);
  if (!event) return NextResponse.json({ ok: true, ignored: true }, { status: 202 });

  const message = await communicationMessageByProviderId("resend", event.providerMessageId);
  if (!message) return NextResponse.json({ ok: true, ignored: true }, { status: 202 });

  await recordCommunicationEvent({
    messageId: message.id,
    eventType: event.eventType,
    source: "transport:resend",
    eventKey: id,
    occurredAt: event.occurredAt,
    providerMessageId: event.providerMessageId,
    metadata: event.metadata,
  });
  return NextResponse.json({ ok: true });
}
