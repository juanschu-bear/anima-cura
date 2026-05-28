import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { prompt } = await request.json();
  if (!prompt) return NextResponse.json({ error: "Kein Prompt" }, { status: 400 });

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("\n");
    return NextResponse.json({ reply: text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "AI-Fehler" }, { status: 500 });
  }
}
