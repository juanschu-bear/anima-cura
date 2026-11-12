import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { accessChildren } from "@/lib/services/invoice-contact-access";
export const runtime = "nodejs";
export async function GET() {
  const session = createServerComponentClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ code: "not_authenticated" }, { status: 401 });
  return NextResponse.json({ children: await accessChildren(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}
