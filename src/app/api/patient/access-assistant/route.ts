import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { answerAccessQuestion } from "@/lib/services/patient-access-assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(800),
  locale: z.enum(["de", "en"]).default("de"),
});

const requestLog = new Map<string, number[]>();
const MAX_REQUESTS_PER_HOUR = 30;

function allowRequest(ip: string) {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  const recent = (requestLog.get(ip) || []).filter(value => value >= cutoff);
  if (recent.length >= MAX_REQUESTS_PER_HOUR) return false;
  recent.push(now);
  requestLog.set(ip, recent);
  return true;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (!allowRequest(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { text: answerAccessQuestion(parsed.data.message, parsed.data.locale) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
