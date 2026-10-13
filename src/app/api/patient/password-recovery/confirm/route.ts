import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmPatientPasswordRecovery } from "@/lib/services/patient-password-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email().max(254),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    const result = await confirmPatientPasswordRecovery({
      portalEmail: parsed.data.email,
      code: parsed.data.code,
      password: parsed.data.password,
    });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[patient-password-recovery] confirm failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
