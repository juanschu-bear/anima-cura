import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resendInvoiceAccess } from "@/lib/services/invoice-contact-access";
const schema = z.object({ token: z.string().min(20).max(200) });
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (input.success) await resendInvoiceAccess(input.data.token).catch(() => undefined);
  return NextResponse.json({ ok: true, expiresInDays: 14 }, { headers: { "Cache-Control": "no-store" } });
}
