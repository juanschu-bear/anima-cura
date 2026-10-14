import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmPatientSelfActivation } from "@/lib/services/patient-self-activation";

export const runtime = "nodejs";

const schema = z.object({
  patientNumber: z.string().trim().regex(/^\d{1,12}$/),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contactEmail: z.string().trim().email().max(254),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const result = await confirmPatientSelfActivation(input.data);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ ok: true, loginEmail: result.loginEmail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("patient self activation confirm failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
