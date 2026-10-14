import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestPatientSelfActivation } from "@/lib/services/patient-self-activation";

export const runtime = "nodejs";

const schema = z.object({
  patientNumber: z.string().trim().regex(/^\d{1,12}$/),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contactEmail: z.string().trim().email().max(254),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const result = await requestPatientSelfActivation({ ...input.data, ip });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("patient self activation request failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
