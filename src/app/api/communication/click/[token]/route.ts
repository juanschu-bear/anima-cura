import { NextResponse } from "next/server";
import { communicationLinkByToken, safeRecordCommunicationEvent } from "@/lib/services/communication-ledger";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  try {
    const link = await communicationLinkByToken(params.token);
    if (!link) return NextResponse.redirect(new URL("https://animacura.io/patient/login"), 302);
    await safeRecordCommunicationEvent({
      messageId: link.message_id,
      eventType: "clicked",
      source: "tracked_link",
      metadata: { destinationHost: new URL(link.target_url).host },
    });
    return NextResponse.redirect(new URL(link.target_url), 302);
  } catch {
    return NextResponse.redirect(new URL("https://animacura.io/patient/login"), 302);
  }
}
