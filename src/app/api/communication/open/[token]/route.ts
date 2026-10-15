import { NextResponse } from "next/server";
import { communicationMessageByTrackingToken, safeRecordCommunicationEvent } from "@/lib/services/communication-ledger";

export const dynamic = "force-dynamic";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  try {
    const message = await communicationMessageByTrackingToken(params.token);
    if (message) {
      await safeRecordCommunicationEvent({ messageId: message.id, eventType: "opened", source: "tracking_pixel" });
    }
  } catch {
    // Tracking must never prevent the harmless pixel response.
  }
  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Content-Length": String(PIXEL.length),
    },
  });
}
