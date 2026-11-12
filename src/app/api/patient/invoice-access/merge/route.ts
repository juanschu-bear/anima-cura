import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { mergeInvoiceAccess } from "@/lib/services/invoice-contact-access";
const schema = z.object({ token: z.string().min(20).max(200), birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const session = createServerComponentClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ code: "not_authenticated" }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  const result = await mergeInvoiceAccess({ ...input.data, userId: user.id });
  return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
