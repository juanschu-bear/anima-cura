import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { requirePraxisRole } from "@/lib/require-praxis";
import { normalizeEmail } from "@/lib/services/patient-outreach-audit";
import { requestPatientSelfActivation } from "@/lib/services/patient-self-activation";
import { sendPatientAccessCode } from "@/lib/services/patient-access-code-delivery";
import { findSupportPatientsByEmail, type SupportPatientMatch } from "@/lib/services/support-code-repair";
import {
  buildAccessCodeReissueNotice,
  HOSTINGER_SUPPORT_WORKFLOW_ID,
  sendHostingerSupportMessage,
} from "@/lib/services/hostinger-support-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resend_access_code") }),
  z.object({ action: z.literal("send_reply"), text: z.string().trim().min(2).max(4000) }),
  z.object({ action: z.literal("resolve") }),
]);

type CaseResult = Record<string, unknown> & {
  sender?: unknown;
  senderName?: unknown;
  subject?: unknown;
  excerpt?: unknown;
  sourceUid?: unknown;
  sourceFolder?: unknown;
  caseActions?: unknown;
};

function resultOf(value: unknown): CaseResult {
  return value && typeof value === "object" ? value as CaseResult : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function caseActions(result: CaseResult) {
  return Array.isArray(result.caseActions) ? result.caseActions.filter(item => item && typeof item === "object") : [];
}

async function loadRun(id: string) {
  const db = createServerClient();
  const query = await db.from("workflow_runs")
    .select("id,status,started_at,finished_at,error,result")
    .eq("id", id)
    .eq("workflow_id", HOSTINGER_SUPPORT_WORKFLOW_ID)
    .maybeSingle();
  if (query.error) throw new Error("support_case_load_failed");
  return query.data;
}

async function caseDetail(row: NonNullable<Awaited<ReturnType<typeof loadRun>>>) {
  const db = createServerClient();
  const result = resultOf(row.result);
  const sender = normalizeEmail(stringValue(result.sender));
  const patients: SupportPatientMatch[] = sender ? await findSupportPatientsByEmail(sender) : [];
  const patientIds = patients.map(patient => patient.id);
  const profiles = patientIds.length
    ? await db.from("user_profiles").select("id,email,patient_id,role").in("patient_id", patientIds).eq("role", "patient")
    : { data: [], error: null };
  if (profiles.error) throw new Error("support_profile_match_failed");
  const profileRows = profiles.data ?? [];
  const authUsers = await Promise.all(profileRows.map(async profile => {
    const auth = await db.auth.admin.getUserById(profile.id);
    return {
      patientId: profile.patient_id as string,
      loginEmail: profile.email as string,
      lastSignInAt: auth.data.user?.last_sign_in_at ?? null,
    };
  }));
  const deliveries = patientIds.length
    ? await db.from("communication_messages")
      .select("id,patient_id,campaign_key,status,created_at,sent_at,delivered_at")
      .in("patient_id", patientIds)
      .like("campaign_key", "patient_access_code_%")
      .order("created_at", { ascending: false })
      .limit(20)
    : { data: [], error: null };

  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: row.error,
    sender,
    senderName: stringValue(result.senderName),
    subject: stringValue(result.subject),
    message: stringValue(result.excerpt),
    category: stringValue(result.category) || "other",
    reason: stringValue(result.reason),
    autoReplied: result.autoReplied === true,
    manualReview: result.manualReview === true,
    replySubject: stringValue(result.replySubject),
    replyText: stringValue(result.replyText),
    caseStatus: stringValue(result.caseStatus) || (result.manualReview === true ? "open" : "observed"),
    caseActions: caseActions(result),
    patientMatches: patients.map(patient => ({
      id: patient.id,
      name: [patient.vorname, patient.nachname].filter(Boolean).join(" ") || "Patient",
      patientNumber: patient.ivoris_nummer,
      hasBirthDate: Boolean(patient.geburtsdatum),
      contactType: normalizeEmail(patient.email) === sender ? "patient" : "guardian",
      portal: authUsers.find(user => user.patientId === patient.id) ?? null,
    })),
    codeDeliveries: deliveries.error ? [] : deliveries.data ?? [],
    canResendCode: patients.length === 1 && Boolean(patients[0].ivoris_nummer && patients[0].geburtsdatum),
    matchState: patients.length === 1 ? "unique" : patients.length > 1 ? "ambiguous" : "missing",
  };
}

async function appendAction(id: string, result: CaseResult, action: Record<string, unknown>) {
  const db = createServerClient();
  const next = {
    ...result,
    caseActions: [...caseActions(result), action],
    caseStatus: action.type === "resolved" || action.type === "code_reissued" ? "resolved" : result.caseStatus,
  };
  const update = await db.from("workflow_runs").update({ result: next }).eq("id", id);
  if (update.error) throw new Error("support_case_update_failed");
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePraxisRole(["admin", "verwaltung"]);
  if (denied) return denied;
  const parsedId = z.string().uuid().safeParse(params.id);
  if (!parsedId.success) return NextResponse.json({ error: "Ungültige Fallnummer." }, { status: 400 });
  try {
    const row = await loadRun(parsedId.data);
    if (!row) return NextResponse.json({ error: "Fall wurde nicht gefunden." }, { status: 404 });
    return NextResponse.json(await caseDetail(row), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Falldetails konnten nicht geladen werden." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePraxisRole(["admin", "verwaltung"]);
  if (denied) return denied;
  const id = z.string().uuid().safeParse(params.id);
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Ungültige Fallaktion." }, { status: 400 });
  const row = await loadRun(id.data);
  if (!row) return NextResponse.json({ error: "Fall wurde nicht gefunden." }, { status: 404 });
  const result = resultOf(row.result);
  const sender = normalizeEmail(stringValue(result.sender));
  const auth = createServerComponentClient();
  const { data: { user } } = await auth.auth.getUser();
  const baseAction = { at: new Date().toISOString(), by: user?.id ?? null };

  try {
    if (parsed.data.action === "resend_access_code") {
    const patients = sender ? await findSupportPatientsByEmail(sender) : [];
      if (patients.length !== 1) return NextResponse.json({ error: patients.length ? "Kontakt ist mehreren Patienten zugeordnet." : "Kontakt konnte keinem Patienten eindeutig zugeordnet werden." }, { status: 409 });
      const patient = patients[0];
      if (!patient.ivoris_nummer || !patient.geburtsdatum) return NextResponse.json({ error: "Patientennummer oder Geburtsdatum fehlt." }, { status: 409 });
      let sent = false;
      const db = createServerClient();
      await requestPatientSelfActivation({
        patientNumber: patient.ivoris_nummer,
        birthDate: patient.geburtsdatum,
        contactEmail: sender,
        ip: `support-case:${id.data}`,
      }, {
        db,
        sendCode: async (to, code, requestId, patientId) => {
          await sendPatientAccessCode({ purpose: "activation", patientId, to, code, requestId });
          sent = true;
        },
      });
      if (!sent) return NextResponse.json({ error: "Der Sicherheitscode konnte nicht eindeutig erzeugt werden." }, { status: 409 });
      const notice = buildAccessCodeReissueNotice("activation");
      await sendHostingerSupportMessage({
        to: sender,
        ...notice,
        inReplyTo: result.sourceUid ? { folder: stringValue(result.sourceFolder) || "inbox", uid: result.sourceUid as string | number } : null,
      });
      await appendAction(id.data, result, { ...baseAction, type: "code_reissued", patientId: patient.id, recipient: sender });
    } else if (parsed.data.action === "send_reply") {
      await sendHostingerSupportMessage({
        to: sender,
        subject: `Re: ${stringValue(result.subject) || "Deine Anfrage an Anima Cura"}`,
        text: parsed.data.text,
        inReplyTo: result.sourceUid ? { folder: stringValue(result.sourceFolder) || "inbox", uid: result.sourceUid as string | number } : null,
      });
      await appendAction(id.data, result, { ...baseAction, type: "manual_reply", recipient: sender, text: parsed.data.text });
    } else {
      await appendAction(id.data, result, { ...baseAction, type: "resolved" });
    }
    const refreshed = await loadRun(id.data);
    return NextResponse.json(refreshed ? await caseDetail(refreshed) : { ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Fallaktion fehlgeschlagen." }, { status: 500 });
  }
}
