import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processHostingerSupportEvent } from "@/lib/services/hostinger-support-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const expected = process.env.HOSTINGER_MAIL_WEBHOOK_SECRET;
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!expected || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const raw = await request.text();
  if (raw.length > 100_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await processHostingerSupportEvent(payload);
    return NextResponse.json(result, {
      status: result.ok ? 200 : 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[hostinger-support] processing failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "processing_failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
