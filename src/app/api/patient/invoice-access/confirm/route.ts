import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmInvoiceAccess } from "@/lib/services/invoice-contact-access";
const schema = z.object({ token: z.string().min(20).max(200), birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), password: z.string().min(8).max(128) });
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  try {
    const result = await confirmInvoiceAccess(input.data);
    if (!result.ok) return NextResponse.json({ code: result.code }, { status: result.code === "access_unavailable" ? 503 : result.code === "rate_limited" ? 429 : 400 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("invoice access confirm failed", error);
    return NextResponse.json({ code: "access_unavailable" }, { status: 503 });
  }
}
