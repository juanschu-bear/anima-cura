import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisRole } from "@/lib/require-praxis";
import { linkedPatientIds, inboundContact, invoiceOpenedAt, type DispatchMessage, type PatientDossier, type PortalTouchpoint } from "@/lib/communication-insights";
import { HOSTINGER_SUPPORT_WORKFLOW_ID } from "@/lib/services/hostinger-support-mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const columns = "id,patient_id,campaign_key,channel,provider,recipient,subject,status,sent_at,delivered_at,first_opened_at,first_clicked_at,created_at,metadata";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePraxisRole(["admin", "verwaltung"]);
  if (denied) return denied;
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: "invalid_id" }, { status: 400, headers });
  const db = createServerClient();
  const seed = await db.from("communication_messages").select(columns).eq("id", params.id).maybeSingle();
  if (seed.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  if (!seed.data) return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  const ids = linkedPatientIds(seed.data);
  const related = ids.length
    ? await Promise.all(ids.map(id => db.from("communication_messages").select(columns)
      .or(`patient_id.eq.${id},metadata->patientIds.cs.["${id}"]`).order("created_at", { ascending: false }).limit(500)))
    : [await db.from("communication_messages").select(columns).is("patient_id", null).eq("recipient", seed.data.recipient).order("created_at", { ascending: false }).limit(500)];
  if (related.some(result => result.error)) return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  const messages = Array.from(new Map([seed.data, ...related.flatMap(result => result.data ?? [])].map(row => [row.id, row])).values());
  const addresses = Array.from(new Set(messages.map(row => row.recipient.trim().toLowerCase())));
  const [patients, profiles, portal, documents, inbound, events] = await Promise.all([
    ids.length ? db.from("patients").select("id,vorname,nachname,ivoris_nummer").in("id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from("user_profiles").select("id,patient_id").eq("role", "patient").in("patient_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from("patient_engagement").select("id,patient_id,event_type,created_at,metadata").in("patient_id", ids)
      .in("event_type", ["app_open", "notification_clicked", "document_view", "invoice_document_opened", "payment_view", "qrcode_view", "ratenplan_view"])
      .order("created_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from("patient_documents").select("id,patient_id,name").in("patient_id", ids).ilike("name", "%Rechnung%").limit(500) : Promise.resolve({ data: [], error: null }),
    db.from("workflow_runs").select("id,status,started_at,result").eq("workflow_id", HOSTINGER_SUPPORT_WORKFLOW_ID)
      .in("result->>sender", addresses).order("started_at", { ascending: false }).limit(500),
    db.from("communication_events").select("id,message_id,event_type,source,occurred_at")
      .in("message_id", messages.map(row => row.id)).order("occurred_at", { ascending: false }).limit(1000),
  ]);
  if (patients.error || events.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  const authRows = await Promise.all((profiles.data ?? []).map(async profile => {
    const result = await db.auth.admin.getUserById(profile.id);
    return { patientId: profile.patient_id, at: result.data.user?.last_sign_in_at ?? null, error: Boolean(result.error || !result.data.user) };
  }));
  const portalEvents = (portal.data ?? []) as PortalTouchpoint[];
  const payload: PatientDossier = {
    patients: (patients.data ?? []).map(patient => {
      const accounts = authRows.filter(row => row.patientId === patient.id);
      const lastAt = accounts.map(row => row.at).filter((at): at is string => Boolean(at)).sort().at(-1) ?? null;
      return { id: patient.id, name: [patient.vorname, patient.nachname].filter(Boolean).join(" "), number: patient.ivoris_nummer,
        login: { state: lastAt ? "used" : profiles.error || accounts.some(row => row.error) ? "unknown" : accounts.length ? "never" : "missing", lastAt } };
    }),
    messages: messages.map(({ metadata, ...row }) => ({ ...row, metadata: { patientIds: linkedPatientIds({ patient_id: row.patient_id, metadata }), documentIds: metadata?.documentIds ?? [] },
      events: (events.data ?? []).filter(event => event.message_id === row.id), portalEvents: [] } as DispatchMessage))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    documents: (documents.data ?? []).map(document => ({ ...document, openedAt: invoiceOpenedAt(document.id, portalEvents) })),
    portalEvents,
    inbound: (inbound.data ?? []).map(inboundContact).filter((row): row is NonNullable<typeof row> => row !== null),
    availability: { replies: !inbound.error, portal: !portal.error, documents: !documents.error },
    truncated: related.some(result => (result.data?.length ?? 0) >= 500) || (portal.data?.length ?? 0) >= 1000 || (events.data?.length ?? 0) >= 1000 || (inbound.data?.length ?? 0) >= 500,
  };
  return NextResponse.json(payload, { headers });
}
