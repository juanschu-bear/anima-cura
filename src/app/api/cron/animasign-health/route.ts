import { NextRequest, NextResponse } from "next/server";
import { checkAndStoreAnimaSignHealth } from "@/lib/services/animasign-service-observability";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await checkAndStoreAnimaSignHealth();
  return NextResponse.json({ ok: true, ...result });
}
