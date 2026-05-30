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
  const days = Number(request.nextUrl.searchParams.get("days") || "30");
  const since = new Date(Date.now() - days * 864e5).toISOString();

  // Total events
  const { count: totalEvents } = await sc.from("patient_engagement").select("*", { count: "exact", head: true }).gte("created_at", since);

  // Unique active patients
  const { data: activeRaw } = await sc.from("patient_engagement").select("patient_id").gte("created_at", since);
  const activePatients = new Set((activeRaw || []).map(r => r.patient_id)).size;

  // Events by type
  const { data: allEvents } = await sc.from("patient_engagement").select("event_type, created_at, patient_id").gte("created_at", since).order("created_at", { ascending: false }).limit(500);

  const byType: Record<string, number> = {};
  for (const e of allEvents || []) {
    byType[e.event_type] = (byType[e.event_type] || 0) + 1;
  }

  // Daily activity (last 14 days)
  const daily: Record<string, number> = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    daily[d] = 0;
  }
  for (const e of allEvents || []) {
    const d = e.created_at.slice(0, 10);
    if (daily[d] !== undefined) daily[d]++;
  }

  // Most active patients
  const patientCounts: Record<string, number> = {};
  for (const e of allEvents || []) {
    patientCounts[e.patient_id] = (patientCounts[e.patient_id] || 0) + 1;
  }
  const topPatients = Object.entries(patientCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => ({ id, count }));

  // Fetch names for top patients
  if (topPatients.length > 0) {
    const { data: names } = await sc.from("patients").select("id, vorname, nachname").in("id", topPatients.map(p => p.id));
    for (const tp of topPatients) {
      const n = (names || []).find(n => n.id === tp.id);
      (tp as any).name = n ? `${n.vorname} ${n.nachname}` : "Unbekannt";
    }
  }

  return NextResponse.json({
    period_days: days,
    total_events: totalEvents || 0,
    active_patients: activePatients,
    by_type: byType,
    daily: Object.entries(daily).sort().map(([date, count]) => ({ date, count })),
    top_patients: topPatients,
  });
}
