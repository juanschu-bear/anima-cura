import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  communicationMessageByProviderId,
  recordCommunicationEvent,
} from "@/lib/services/communication-ledger";

export const runtime = "nodejs";

const schema = z.object({
  provider: z.string().min(1).max(60),
  providerMessageId: z.string().min(1).max(240),
  eventType: z.enum(["accepted", "delivered", "delayed", "failed", "bounced", "complained", "suppressed"]),
  eventKey: z.string().min(1).max(300),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

function authorized(request: Request) {
  const expected = process.env.COMMUNICATION_EVENT_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiges Ereignis" }, { status: 400 });
  const message = await communicationMessageByProviderId(parsed.data.provider, parsed.data.providerMessageId);
  if (!message) return NextResponse.json({ error: "Nachricht nicht gefunden" }, { status: 404 });
  await recordCommunicationEvent({
    messageId: message.id,
    eventType: parsed.data.eventType,
    source: `transport:${parsed.data.provider}`,
    eventKey: parsed.data.eventKey,
    occurredAt: parsed.data.occurredAt,
    metadata: parsed.data.metadata,
  });
  return NextResponse.json({ ok: true });
}
