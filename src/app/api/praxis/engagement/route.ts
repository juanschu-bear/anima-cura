import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { buildProfile } from "@/lib/revenue-intelligence";

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

  // Structured breakdown matching the data architecture
  // Need metadata, so fetch it
  const { data: metaEvents } = await sc.from("patient_engagement").select("event_type, metadata, created_at").gte("created_at", since).limit(1000);

  // App-Nutzung: Frequenz, Tageszeit, Gerät
  const byDevice: Record<string, number> = {};
  const byTimeOfDay: Record<string, number> = { "Morgens (6-12)": 0, "Mittags (12-18)": 0, "Abends (18-24)": 0, "Nachts (0-6)": 0 };
  // Tab-Verhalten
  const byTab: Record<string, number> = {};

  for (const e of metaEvents || []) {
    if (e.event_type === "app_open") {
      const dev = e.metadata?.device || "Unbekannt";
      byDevice[dev] = (byDevice[dev] || 0) + 1;
      const hour = typeof e.metadata?.hour === "number" ? e.metadata.hour : new Date(e.created_at).getHours();
      if (hour >= 6 && hour < 12) byTimeOfDay["Morgens (6-12)"]++;
      else if (hour >= 12 && hour < 18) byTimeOfDay["Mittags (12-18)"]++;
      else if (hour >= 18) byTimeOfDay["Abends (18-24)"]++;
      else byTimeOfDay["Nachts (0-6)"]++;
    }
    if (e.event_type === "tab_view") {
      const tab = e.metadata?.tab || "Unbekannt";
      byTab[tab] = (byTab[tab] || 0) + 1;
    }
  }

  // Tab durations
  const tabDurations: Record<string, number[]> = {};
  for (const e of metaEvents || []) {
    if (e.event_type === "tab_view" && e.metadata?.duration_seconds && e.metadata.duration_seconds > 0) {
      const tab = e.metadata?.tab || "unknown";
      if (!tabDurations[tab]) tabDurations[tab] = [];
      tabDurations[tab].push(e.metadata.duration_seconds);
    }
  }
  const tabAvgDuration: Record<string, number> = {};
  for (const [tab, durations] of Object.entries(tabDurations)) {
    tabAvgDuration[tab] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  }

  // Tab sequence (most common navigation paths)
  const tabSequences: string[] = [];
  const seqEvents = (metaEvents || []).filter(e => e.event_type === "tab_view" && e.metadata?.tab).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  for (let i = 0; i < seqEvents.length - 1; i++) {
    tabSequences.push(seqEvents[i].metadata.tab + " → " + seqEvents[i + 1].metadata.tab);
  }
  const seqCounts: Record<string, number> = {};
  for (const s of tabSequences) seqCounts[s] = (seqCounts[s] || 0) + 1;
  const topSequences = Object.entries(seqCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Chat response times
  const responseTimes: number[] = [];
  for (const e of metaEvents || []) {
    if (e.event_type === "chat_response" && e.metadata?.response_time_seconds) {
      responseTimes.push(e.metadata.response_time_seconds);
    }
  }
  const avgResponseTime = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null;

  const breakdown = {
    app_nutzung: {
      frequenz: byType["app_open"] || 0,
      tageszeiten: byTimeOfDay,
      geraete: byDevice,
    },
    tab_verhalten: {
      tabs: byTab,
      avg_dauer_sekunden: tabAvgDuration,
      navigations_pfade: topSequences,
    },
    zahlungsinteraktion: {
      animapay_geoeffnet: byType["animapay_open"] || 0,
      qrcode_angesehen: byType["qrcode_view"] || 0,
      zahlung_angesehen: byType["payment_view"] || 0,
    },
    kommunikation: {
      nachrichten: byType["chat_message"] || 0,
      avg_antwortzeit_sekunden: avgResponseTime,
    },
    benachrichtigungen: {
      gelesen: (byType["notification_read"] || 0) + (byType["notification_clicked"] || 0),
      push_geklickt: byType["notification_clicked"] || 0,
    },
  };

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
  const patientDetails: Record<string, Record<string, number>> = {};
  for (const e of allEvents || []) {
    if (!patientDetails[e.patient_id]) patientDetails[e.patient_id] = {};
    patientDetails[e.patient_id][e.event_type] = (patientDetails[e.patient_id][e.event_type] || 0) + 1;
  }
  const topPatients = Object.entries(patientCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => ({ id, count, details: patientDetails[id] || {} }));

  // Fetch patient context (name, age, insurance) + compute scores
  if (topPatients.length > 0) {
    const ids = topPatients.map(p => p.id);
    const { data: names } = await sc.from("patients").select("id, vorname, nachname, geburtsdatum, versicherung_status, behandlung_status").in("id", ids);

    // Fetch full event timeline per patient for scoring
    const { data: patientEvents } = await sc.from("patient_engagement").select("patient_id, event_type, created_at").in("patient_id", ids).order("created_at", { ascending: false });

    for (const tp of topPatients) {
      const n = (names || []).find(n => n.id === tp.id);
      (tp as any).name = n ? `${n.vorname} ${n.nachname}` : "Unbekannt";
      if (n?.geburtsdatum) {
        const age = Math.floor((Date.now() - new Date(n.geburtsdatum).getTime()) / (365.25 * 864e5));
        (tp as any).age = age;
      }
      (tp as any).versicherung = (n as any)?.versicherung_status || null;

      // Build behavioral profile with payment context
      const evts = (patientEvents || []).filter(e => e.patient_id === tp.id);
      const age = (tp as any).age;

      // Fetch raten for payment profiling
      const { data: raten } = await sc.from("raten")
        .select("status, faellig_am, bezahlt_am")
        .eq("ratenplan_id", tp.id);
      // Also try via ratenplaene
      const { data: rp } = await sc.from("ratenplaene").select("id").eq("patient_id", tp.id).limit(1);
      let zahlungen: { status: string; faellig_am: string; bezahlt_am?: string }[] = [];
      if (rp && rp[0]) {
        const { data: rpRaten } = await sc.from("raten").select("status, faellig_am, bezahlt_am").eq("ratenplan_id", rp[0].id);
        zahlungen = (rpRaten || []).map(r => ({ status: r.status, faellig_am: r.faellig_am, bezahlt_am: r.bezahlt_am || undefined }));
      }

      const profile = buildProfile({
        events: evts,
        zahlungen,
        context: { age, versicherung: (n as any)?.versicherung_status, behandlung_status: (n as any)?.behandlung_status },
      });
      (tp as any).risk_level = profile.risk_level;
      (tp as any).signals = profile.signals;
      (tp as any).context_tags = profile.context_tags;
      (tp as any).activity_summary = profile.activity_summary;
      (tp as any).trend = profile.trend;
    }
  }

  return NextResponse.json({
    period_days: days,
    total_events: totalEvents || 0,
    active_patients: activePatients,
    by_type: byType,
    daily: Object.entries(daily).sort().map(([date, count]) => ({ date, count })),
    top_patients: topPatients,
    breakdown,
  });
}
