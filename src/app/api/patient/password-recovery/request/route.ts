import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestPatientPasswordRecovery } from "@/lib/services/patient-password-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email().max(254) });

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  try {
    const result = await requestPatientPasswordRecovery({ portalEmail: parsed.data.email, ip });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[patient-password-recovery] request failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
