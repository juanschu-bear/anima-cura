import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  // TODO: Replace with real prediction tracking when predictions table exists
  return NextResponse.json({
    level: "Aufbauphase",
    level_progress: 35,
    next_level_events: 1200,
    accuracy: { hit_rate: 71, false_alarms: 18, missed: 11, avg_deviation_days: 2.4 },
    calibration: [
      { range: "30-40%", predicted: 35, actual: 25 },
      { range: "40-50%", predicted: 45, actual: 38 },
      { range: "50-60%", predicted: 55, actual: 54 },
      { range: "60-70%", predicted: 65, actual: 64 },
      { range: "70-80%", predicted: 75, actual: 73 },
      { range: "80-90%", predicted: 85, actual: 82 },
      { range: "90-100%", predicted: 95, actual: 96 },
    ],
    predictions: [
      { patient: "Lukas Mayer", text: "Rate 7 wird nicht pünktlich gezahlt", confidence: 78, result: "richtig" },
      { patient: "Sophie Klein", text: "Wird nach Erinnerung zahlen", confidence: 82, result: "richtig" },
      { patient: "Tim Bergmann", text: "Rate 4 wird verspätet (3-7 Tage)", confidence: 65, result: "falsch" },
      { patient: "Elena Vogt", text: "Zahlungsausfall in 30 Tagen", confidence: 54, result: "offen" },
      { patient: "Anna Richter", text: "Pünktliche Zahlung Rate 7", confidence: 96, result: "richtig" },
      { patient: "Jonas Weber", text: "Pünktliche Zahlung Rate 3", confidence: 91, result: "richtig" },
      { patient: "Max Hoffmann", text: "Wird Push ignorieren", confidence: 70, result: "richtig" },
    ],
    calibration_log: [
      { date: "15.05.2026", text: "Gewichtung Push-Öffnungsrate von 10% auf 15% erhöht. Korrelation mit Zahlungsverzögerung stärker als erwartet (r=0.68). Trefferquote stieg von 64% auf 71%." },
      { date: "01.05.2026", text: "Neues Muster entdeckt: GKV unter 30, Verzögerung ab Rate 4. Betrifft 71% der Zielgruppe. Als Profiling-Signal aufgenommen." },
      { date: "15.04.2026", text: "Initiale Gewichtungen gesetzt. Datenbasis: 1.200 Events von 8 Patienten. Erste Vorhersagen mit niedriger Konfidenz (40-55%)." },
    ],
  });
}
