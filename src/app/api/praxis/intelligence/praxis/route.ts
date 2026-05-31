import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  // TODO: Replace with real tracking data when action-tracking tables exist
  // For now: demo structure showing what the APIs will return
  return NextResponse.json({
    reaction_time_days: 2.3,
    success_rate_pct: 67,
    actions_taken: 12,
    signals_ignored: 3,
    chat_response_time_min: 14,
    messages_answered_pct: 89,
    action_log: [
      { date: "28.05.", patient: "Lukas Mayer", signal: "2 Raten überfällig", action: "anruf", result: "offen", reaction_days: 1.5 },
      { date: "25.05.", patient: "Sophie Klein", signal: "18 Tage inaktiv", action: "nachricht", result: "erfolg", reaction_days: 0.5 },
      { date: "22.05.", patient: "Tim Bergmann", signal: "3x verspätet", action: "ratengespraech", result: "erfolg", reaction_days: 3 },
      { date: "20.05.", patient: "Elena Vogt", signal: "Nutzung sinkt", action: "nachricht", result: "erfolg", reaction_days: 1 },
      { date: "18.05.", patient: "Max Hoffmann", signal: "Push ignoriert", action: "mahnung", result: "kein", reaction_days: 5 },
    ],
  });
}
