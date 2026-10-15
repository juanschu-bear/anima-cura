import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_EVENTS = ["app_open", "tab_view", "chat_message", "chat_response", "payment_view", "animapay_open", "qrcode_view", "notification_read", "notification_clicked", "document_view", "ratenplan_view", "negative_event", "session_end"];

export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { patient_id, event_type, metadata } = await request.json();
  if (!patient_id || !event_type) return NextResponse.json({ error: "patient_id + event_type required" }, { status: 400 });
  if (!VALID_EVENTS.includes(event_type)) return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });

  const sc = createServerClient();
  const profile = await sc.from("user_profiles").select("role,patient_id").eq("id", user.id).maybeSingle();
  if (profile.error || profile.data?.role !== "patient" || profile.data.patient_id !== patient_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const inserted = await sc.from("patient_engagement").insert({ patient_id, event_type, metadata: metadata || {} });
  if (inserted.error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
