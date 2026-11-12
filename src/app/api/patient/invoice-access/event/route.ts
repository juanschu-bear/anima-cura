import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { z } from "zod";
const schema = z.object({ event: z.enum(["app_read", "button_clicked"]), patientId: z.string().uuid().optional() });
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (request.headers.get("x-invoice-worker-secret") === process.env.INVOICE_ACCESS_WORKER_SECRET && process.env.INVOICE_ACCESS_WORKER_SECRET) {
    if (body?.event === "mail_sent" && typeof body.email === "string") {
      const db = createServerClient();
      const contact = await db.from("invoice_access_contacts").select("id").eq("normalized_email", body.email.trim().toLowerCase()).maybeSingle();
      if (contact.data?.id) await db.from("invoice_access_events").insert({ contact_id: contact.data.id, event: "mail_sent" });
      return NextResponse.json({ ok: true });
    }
  }
  const session = createServerComponentClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ code: "not_authenticated" }, { status: 401 });
  const input = schema.safeParse(body);
  if (!input.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  const db = createServerClient();
  const members = await db.from("patient_access_memberships").select("patient_id,contact_id").eq("user_id", user.id);
  const rows = (members.data ?? []).filter(row => !input.data.patientId || row.patient_id === input.data.patientId).map(row => ({ contact_id: row.contact_id, patient_id: row.patient_id, event: input.data.event }));
  if (rows.length) await db.from("invoice_access_events").insert(rows);
  return NextResponse.json({ ok: true });
}
