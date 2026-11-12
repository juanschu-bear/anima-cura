import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { token?: string } | null;
  if (typeof body?.token === "string" && body.token.length >= 20) {
    const db = createServerClient();
    const hash = createHash("sha256").update(body.token).digest("hex");
    const link = (await db.from("invoice_access_links").select("id,contact_id").eq("token_hash", hash).maybeSingle()).data;
    if (link) await db.from("invoice_access_events").insert({ contact_id: link.contact_id, link_id: link.id, event: "page_opened", metadata: { method: "explicit_page_call" } });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
