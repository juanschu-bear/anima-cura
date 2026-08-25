import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PraxisActionLogRow = {
  date: string;
  patient: string;
  signal: string;
  action: "antwort" | "offen";
  result: "erfolg" | "offen";
  reaction_days: number | null;
  created_at: string;
};

function toDayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
}

function minutesBetween(start: string, end: string) {
  return Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  );
}

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const sc = createServerClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();

  const { data: messages, error } = await sc
    .from("patient_messages")
    .select("id, patient_id, sender_type, text, gelesen, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const patientIds = Array.from(
    new Set((messages || []).map((message) => message.patient_id).filter(Boolean))
  );

  const { data: patients } = patientIds.length
    ? await sc
        .from("patients")
        .select("id, vorname, nachname")
        .in("id", patientIds)
    : { data: [] as Array<{ id: string; vorname: string | null; nachname: string | null }> };

  const patientNameById = new Map(
    (patients || []).map((patient) => [
      patient.id,
      [patient.vorname, patient.nachname].filter(Boolean).join(" ").trim() || "Unbekannt",
    ])
  );

  const groupedByPatient = new Map<string, typeof messages>();
  for (const message of messages || []) {
    if (!message.patient_id) continue;
    if (!groupedByPatient.has(message.patient_id)) {
      groupedByPatient.set(message.patient_id, []);
    }
    groupedByPatient.get(message.patient_id)!.push(message);
  }

  const responseMinutes: number[] = [];
  let inboundPatientMessages = 0;
  let answeredPatientMessages = 0;
  let ignoredSignals = 0;
  let praxisActionsTaken = 0;
  const actionLog: PraxisActionLogRow[] = [];

  for (const [patientId, patientMessages] of Array.from(groupedByPatient.entries())) {
    for (let index = 0; index < patientMessages.length; index += 1) {
      const current = patientMessages[index];
      if (current.sender_type === "praxis") {
        praxisActionsTaken += 1;
        continue;
      }

      inboundPatientMessages += 1;
      const reply = patientMessages.find(
        (candidate, replyIndex) =>
          replyIndex > index &&
          candidate.sender_type === "praxis" &&
          new Date(candidate.created_at).getTime() >= new Date(current.created_at).getTime()
      );

      if (reply) {
        answeredPatientMessages += 1;
        const deltaMinutes = minutesBetween(current.created_at, reply.created_at);
        responseMinutes.push(deltaMinutes);
        actionLog.push({
          date: toDayLabel(current.created_at),
          patient: patientNameById.get(patientId) || "Unbekannt",
          signal: "Patienten-Nachricht eingegangen",
          action: "antwort",
          result: "erfolg",
          reaction_days: Number((deltaMinutes / 1440).toFixed(1)),
          created_at: current.created_at,
        });
      } else {
        const ageHours =
          (Date.now() - new Date(current.created_at).getTime()) / 36e5;
        if (ageHours >= 24) {
          ignoredSignals += 1;
        }
        actionLog.push({
          date: toDayLabel(current.created_at),
          patient: patientNameById.get(patientId) || "Unbekannt",
          signal: "Patienten-Nachricht noch unbeantwortet",
          action: "offen",
          result: "offen",
          reaction_days: null,
          created_at: current.created_at,
        });
      }
    }
  }

  const answeredPct =
    inboundPatientMessages > 0
      ? Math.round((answeredPatientMessages / inboundPatientMessages) * 100)
      : 0;

  const avgResponseMinutes =
    responseMinutes.length > 0
      ? Math.round(
          responseMinutes.reduce((sum, minutes) => sum + minutes, 0) /
            responseMinutes.length
        )
      : null;

  return NextResponse.json({
    live: true,
    notice:
      inboundPatientMessages === 0
        ? "Noch keine belastbaren Praxis-Chat-Reaktionsdaten im gewählten Zeitraum."
        : null,
    reaction_time_days:
      avgResponseMinutes !== null
        ? Number((avgResponseMinutes / 1440).toFixed(1))
        : null,
    success_rate_pct: answeredPct,
    actions_taken: praxisActionsTaken,
    signals_ignored: ignoredSignals,
    chat_response_time_min: avgResponseMinutes,
    messages_answered_pct: answeredPct,
    action_log: actionLog
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      )
      .slice(0, 25)
      .map(({ created_at, ...entry }) => entry),
  });
}
