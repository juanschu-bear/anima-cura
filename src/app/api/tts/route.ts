import { NextRequest, NextResponse } from "next/server";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  const { text, locale } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "NE7AIW5DoJ7lUosXV2KR";

  if (!apiKey) {
    return NextResponse.json({ error: "ElevenLabs not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.slice(0, 1000),
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[tts] ElevenLabs error:", res.status, err);
      return NextResponse.json({ error: "TTS failed" }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e: any) {
    console.error("[tts] Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
