import { NextRequest, NextResponse } from "next/server";
import { generateConversation, generateUnknownConversation } from "@/lib/services/animahost-conversation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { termin_id, mode } = body;

    if (mode === "unbekannt" || !termin_id) {
      const result = await generateUnknownConversation();
      return NextResponse.json(result);
    }

    const result = await generateConversation(termin_id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[animahost-conversation]", err);
    return NextResponse.json({ error: "Conversation generation failed" }, { status: 500 });
  }
}
