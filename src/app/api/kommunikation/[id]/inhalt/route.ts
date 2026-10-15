import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisRole } from "@/lib/require-praxis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePraxisRole(["admin", "verwaltung"]);
  if (denied) return denied;
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: "invalid_id" }, { status: 400, headers });
  const db = createServerClient();
  const result = await db.from("communication_messages").select("provider,provider_message_id,recipient,metadata").eq("id", params.id).maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ error: "unavailable" }, { status: result.error ? 503 : 404, headers });
  const row = result.data;
  if (row.metadata?.contentRestricted === true) return NextResponse.json({ available: false, contentRestricted: true }, { headers });
  const snapshot = row.metadata?.emailSnapshot;
  if (snapshot && typeof snapshot.html === "string") return NextResponse.json({ available: true, ...snapshot, source: "archive" }, { headers });
  // Retrieve the actual historical email; never substitute today's template.
  if (row.provider === "resend" && row.provider_message_id && process.env.RESEND_API_KEY) {
    try {
      const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(row.provider_message_id)}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      const email = response.ok ? await response.json() : null;
      if (email && Array.isArray(email.to) && email.to.some((to: string) => to.toLowerCase() === row.recipient.toLowerCase())) {
        return NextResponse.json({ available: Boolean(email.html || email.text), html: email.html ?? "", text: email.text ?? "",
          from: email.from, replyTo: email.reply_to ?? [], source: "original", transportStatus: email.last_event ?? null, checkedAt: new Date().toISOString() }, { headers });
      }
    } catch { /* Keep the patient history usable when the transport archive cannot be reached. */ }
  }
  return NextResponse.json({ available: false }, { headers });
}
