import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const sc = createServerClient();
  const { data: events } = await sc
    .from("patient_engagement")
    .select("id, patient_id, event_type, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!events || events.length === 0) return NextResponse.json({ events: [] });

  const patientIds = Array.from(new Set(events.map(e => e.patient_id)));
  const { data: patients } = await sc
    .from("patients")
    .select("id, vorname, nachname")
    .in("id", patientIds);

  const nameMap: Record<string, string> = {};
  for (const p of patients || []) {
    nameMap[p.id] = `${p.vorname} ${p.nachname}`;
  }

  return NextResponse.json({
    events: events.map(e => ({
      patient_name: nameMap[e.patient_id] || "Unbekannt",
      patient_id: e.patient_id,
      event_type: e.event_type,
      created_at: e.created_at,
    })),
  });
}
