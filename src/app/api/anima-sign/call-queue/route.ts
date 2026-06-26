import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import {
  asNonEmptyString,
  extractCallPhone,
  isCallAgentAuthorized,
  normalizeCallLanguage,
} from "@/lib/anima-sign/call-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubmissionRow = {
  id: string;
  patient_id: string | null;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  answers: Record<string, unknown> | null;
  created_at: string;
  status: string;
  call_status: string | null;
  call_attempts: number | null;
  call_attempted_at: string | null;
};

export async function GET(request: Request) {
  if (!isCallAgentAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const maxAttempts = Math.max(1, Number(process.env.CALL_AGENT_MAX_ATTEMPTS ?? "3"));
  const retryAfterMinutes = Math.max(1, Number(process.env.CALL_AGENT_RETRY_AFTER_MINUTES ?? "240"));
  const retryBeforeIso = new Date(Date.now() - retryAfterMinutes * 60_000).toISOString();

  const { data: submissions, error } = await supabase
    .from("anamnese_submissions")
    .select(
      "id, patient_id, vorname, nachname, email, answers, created_at, status, call_status, call_attempts, call_attempted_at"
    )
    .neq("status", "fehler")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (submissions ?? []) as SubmissionRow[];
  const patientIds = Array.from(
    new Set(rows.map((row) => row.patient_id).filter((value): value is string => typeof value === "string" && value !== ""))
  );

  const portalUsage = new Map<string, boolean>();
  if (patientIds.length > 0) {
    const { data: consents, error: consentError } = await supabase
      .from("patient_consents")
      .select("patient_id, portal_nutzung")
      .in("patient_id", patientIds);

    if (consentError) {
      return NextResponse.json({ error: consentError.message }, { status: 500 });
    }

    for (const consent of consents ?? []) {
      if (typeof consent.patient_id === "string") {
        portalUsage.set(consent.patient_id, consent.portal_nutzung === true);
      }
    }
  }

  const queue = rows
    .filter((row) => {
      const answers = row.answers ?? {};
      const phone = extractCallPhone(answers);
      if (!phone) return false;

      if (row.patient_id && portalUsage.get(row.patient_id) === true) {
        return false;
      }

      const attempts = row.call_attempts ?? 0;
      const status = (row.call_status ?? "pending").trim().toLowerCase();

      if (status === "reached" || status === "completed" || status === "skipped") {
        return false;
      }

      if (attempts >= maxAttempts) {
        return false;
      }

      if (status === "not_reached" && row.call_attempted_at && row.call_attempted_at > retryBeforeIso) {
        return false;
      }

      return true;
    })
    .map((row) => {
      const answers = row.answers ?? {};
      return {
        submission_id: row.id,
        patient_id: row.patient_id,
        vorname: asNonEmptyString(row.vorname) ?? "Patient",
        nachname: asNonEmptyString(row.nachname) ?? "",
        email: asNonEmptyString(row.email),
        phone: extractCallPhone(answers),
        lang: normalizeCallLanguage(answers["locale"]),
        created_at: row.created_at,
        call_attempts: row.call_attempts ?? 0,
      };
    });

  return NextResponse.json({
    queue,
    meta: {
      total: queue.length,
      maxAttempts,
      retryAfterMinutes,
    },
  });
}
