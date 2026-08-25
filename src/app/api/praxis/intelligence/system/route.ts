import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS = [
  { name: "Datensammlung", from: 0, to: 250 },
  { name: "Aufbauphase", from: 250, to: 1500 },
  { name: "Muster-Erkennung", from: 1500, to: 5000 },
  { name: "Vorhersage", from: 5000, to: 12000 },
  { name: "Kalibriert", from: 12000, to: Number.POSITIVE_INFINITY },
] as const;

function resolveLevel(totalEvents: number) {
  const level =
    LEVELS.find((entry) => totalEvents >= entry.from && totalEvents < entry.to) ||
    LEVELS[LEVELS.length - 1];

  if (!Number.isFinite(level.to)) {
    return {
      level: level.name,
      level_progress: 100,
      next_level_events: 0,
    };
  }

  const span = Math.max(1, level.to - level.from);
  const progress = Math.max(
    0,
    Math.min(100, Math.round(((totalEvents - level.from) / span) * 100))
  );

  return {
    level: level.name,
    level_progress: progress,
    next_level_events: Math.max(0, level.to - totalEvents),
  };
}

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const sc = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString();

  const [{ count: totalEvents }, { count: recentEvents }, { data: activePatientRows }] =
    await Promise.all([
      sc.from("patient_engagement").select("*", { count: "exact", head: true }),
      sc
        .from("patient_engagement")
        .select("*", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo),
      sc
        .from("patient_engagement")
        .select("patient_id")
        .gte("created_at", thirtyDaysAgo),
    ]);

  const total = totalEvents || 0;
  const levelMeta = resolveLevel(total);
  const activePatients = new Set(
    (activePatientRows || []).map((row) => row.patient_id).filter(Boolean)
  ).size;

  return NextResponse.json({
    live: false,
    notice:
      "Vorhersage-Tracking und Kalibrierung werden erst angezeigt, sobald echte Prediction- und Outcome-Daten vorhanden sind. Bis dahin zeigt dieser Bereich nur den realen System-Reifegrad.",
    level: levelMeta.level,
    level_progress: levelMeta.level_progress,
    next_level_events: levelMeta.next_level_events,
    total_events: total,
    recent_events: recentEvents || 0,
    active_patients_30d: activePatients,
    accuracy: {
      available: false,
      hit_rate: null,
      false_alarms: null,
      missed: null,
      avg_deviation_days: null,
    },
    calibration: [],
    predictions: [],
    calibration_log: [],
  });
}
