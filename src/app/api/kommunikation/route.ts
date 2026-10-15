import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBLEM_STATUSES = new Set(["failed", "bounced", "complained", "suppressed"]);
const chunk = <T,>(rows: T[], size = 100) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

export async function GET(request: NextRequest) {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days") || "30")));
  const status = request.nextUrl.searchParams.get("status")?.trim() || "all";
  const query = request.nextUrl.searchParams.get("q")?.trim().toLocaleLowerCase("de-DE") || "";
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = createServerClient();

  let messageQuery = db.from("communication_messages")
    .select("id,patient_id,campaign_key,channel,provider,recipient,subject,status,sent_at,delivered_at,first_opened_at,first_clicked_at,last_event_at,created_at,metadata")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1500);
  if (status !== "all" && status !== "problem") messageQuery = messageQuery.eq("status", status);
  if (status === "problem") messageQuery = messageQuery.in("status", Array.from(PROBLEM_STATUSES));
  const messagesResult = await messageQuery;

  if (messagesResult.error) {
    const schemaMissing = messagesResult.error.code === "42P01" || messagesResult.error.message.includes("communication_messages");
    return NextResponse.json({
      ready: false,
      schemaMissing,
      summary: { total: 0, accepted: 0, delivered: 0, opened: 0, clicked: 0, problems: 0 },
      messages: [],
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const rawMessages = messagesResult.data ?? [];
  const patientIds = Array.from(new Set(rawMessages.map(row => row.patient_id).filter(Boolean))) as string[];
  const messageIds = rawMessages.map(row => row.id);
  const [patientBatches, eventBatches, engagementBatches] = await Promise.all([
    Promise.all(chunk(patientIds).map(ids => db.from("patients").select("id,vorname,nachname,ivoris_nummer").in("id", ids))),
    Promise.all(chunk(messageIds).map(ids => db.from("communication_events")
      .select("id,message_id,event_type,source,occurred_at,metadata")
      .in("message_id", ids).order("occurred_at", { ascending: false }).limit(1000))),
    Promise.all(chunk(patientIds).map(ids => db.from("patient_engagement")
      .select("patient_id,event_type,created_at,metadata").in("patient_id", ids)
      .in("event_type", ["app_open", "notification_clicked", "document_view", "payment_view", "qrcode_view"])
      .gte("created_at", since).order("created_at", { ascending: false }).limit(1000))),
  ]);
  const failedLookup = [...patientBatches, ...eventBatches, ...engagementBatches].find(result => result.error);
  if (failedLookup?.error) {
    return NextResponse.json({ error: "communication_history_unavailable" }, { status: 503 });
  }
  const patientRows = patientBatches.flatMap(result => result.data ?? []);
  const eventRows = eventBatches.flatMap(result => result.data ?? []);
  const engagementRows = engagementBatches.flatMap(result => result.data ?? []);

  const patients = new Map(patientRows.map(row => [row.id, row]));
  const eventsByMessage = new Map<string, typeof eventRows>();
  for (const event of eventRows) {
    const current = eventsByMessage.get(event.message_id) ?? [];
    current.push(event);
    eventsByMessage.set(event.message_id, current);
  }
  const engagementByPatient = new Map<string, typeof engagementRows>();
  for (const event of engagementRows) {
    const current = engagementByPatient.get(event.patient_id) ?? [];
    current.push(event);
    engagementByPatient.set(event.patient_id, current);
  }

  const enriched = rawMessages.map((row) => {
    const patient = row.patient_id ? patients.get(row.patient_id) : null;
    const patientName = patient ? [patient.vorname, patient.nachname].filter(Boolean).join(" ") : null;
    return {
      ...row,
      patientName,
      patientNumber: patient?.ivoris_nummer ?? null,
      events: eventsByMessage.get(row.id) ?? [],
      portalEvents: row.patient_id ? (engagementByPatient.get(row.patient_id) ?? []).slice(0, 8) : [],
    };
  });
  const messages = query
    ? enriched.filter(row => `${row.patientName ?? ""} ${row.patientNumber ?? ""} ${row.recipient} ${row.subject}`.toLocaleLowerCase("de-DE").includes(query))
    : enriched;

  const allStatuses = rawMessages.map(row => row.status);
  const summary = {
    total: rawMessages.length,
    accepted: allStatuses.filter(value => ["accepted", "delivered", "opened", "clicked"].includes(value)).length,
    delivered: allStatuses.filter(value => ["delivered", "opened", "clicked"].includes(value)).length,
    opened: allStatuses.filter(value => ["opened", "clicked"].includes(value)).length,
    clicked: allStatuses.filter(value => value === "clicked").length,
    problems: allStatuses.filter(value => PROBLEM_STATUSES.has(value)).length,
  };

  return NextResponse.json({ ready: true, summary, messages }, { headers: { "Cache-Control": "no-store" } });
}
