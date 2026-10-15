import { createServerClient } from "@/lib/db/supabase";
import { normalizeEmail } from "@/lib/services/patient-outreach-audit";
import { requestPatientSelfActivation } from "@/lib/services/patient-self-activation";
import { sendPatientAccessCode } from "@/lib/services/patient-access-code-delivery";
import {
  buildAccessCodeReissueNotice,
  HOSTINGER_SUPPORT_WORKFLOW_ID,
  sendHostingerSupportMessage,
} from "@/lib/services/hostinger-support-mail";

type SupportRun = { id: string; started_at: string; result: Record<string, unknown> | null };
export type SupportPatientMatch = { id: string; ivoris_nummer: string | null; geburtsdatum: string | null; vorname: string | null; nachname: string | null; email: string | null; versicherter_email: string | null };

export const missingCodeComplaintPattern = /(kein(?:en|e)?|nicht|nie).{0,45}(aktivierungs|sicherheits|zugangs)?code|code.{0,45}(nicht|nie).{0,25}(erhalten|angekommen|kommen|an\b)|passwort.{0,30}(falsch|funktioniert nicht)|anmeld(?:ung|en).{0,30}(nicht|fehler)/i;

function resultOf(run: SupportRun) {
  return run.result && typeof run.result === "object" ? run.result : {};
}

export function isMissingCodeComplaint(run: SupportRun) {
  const result = resultOf(run);
  if (result.caseStatus === "resolved") return false;
  if (result.reason === "security_code_not_received") return true;
  const text = `${typeof result.subject === "string" ? result.subject : ""} ${typeof result.excerpt === "string" ? result.excerpt : ""}`;
  return missingCodeComplaintPattern.test(text);
}

export async function findSupportPatientsByEmail(sender: string): Promise<SupportPatientMatch[]> {
  const db = createServerClient();
  const columns = "id,ivoris_nummer,geburtsdatum,vorname,nachname,email,versicherter_email";
  const [direct, guardian, submissionDirect, submissionPatient, submissionGuardian] = await Promise.all([
    db.from("patients").select(columns).ilike("email", sender).limit(10),
    db.from("patients").select(columns).ilike("versicherter_email", sender).limit(10),
    db.from("anamnese_submissions").select("patient_id,matched_patient_id").ilike("email", sender).limit(20),
    db.from("anamnese_submissions").select("patient_id,matched_patient_id").eq("answers->>patient_email", sender).limit(20),
    db.from("anamnese_submissions").select("patient_id,matched_patient_id").eq("answers->>vp_email", sender).limit(20),
  ]);
  if (direct.error || guardian.error || submissionDirect.error || submissionPatient.error || submissionGuardian.error) throw new Error("patient_match_failed");
  const linkedIds = Array.from(new Set([
    ...(submissionDirect.data ?? []),
    ...(submissionPatient.data ?? []),
    ...(submissionGuardian.data ?? []),
  ].flatMap(row => [row.matched_patient_id, row.patient_id]).filter((id): id is string => typeof id === "string" && id.length > 0)));
  const linked = linkedIds.length ? await db.from("patients").select(columns).in("id", linkedIds) : { data: [], error: null };
  if (linked.error) throw new Error("patient_match_failed");
  const unique = new Map<string, SupportPatientMatch>();
  for (const patient of [...(direct.data ?? []), ...(guardian.data ?? []), ...(linked.data ?? [])] as SupportPatientMatch[]) unique.set(patient.id, patient);
  return Array.from(unique.values());
}

async function successfulLoginAfter(patientId: string, since: string) {
  const db = createServerClient();
  const profile = await db.from("user_profiles").select("id").eq("patient_id", patientId).eq("role", "patient").maybeSingle();
  if (profile.error || !profile.data?.id) return false;
  const auth = await db.auth.admin.getUserById(profile.data.id);
  const signedIn = auth.data.user?.last_sign_in_at;
  return Boolean(signedIn && new Date(signedIn).getTime() >= new Date(since).getTime());
}

async function recordRepair(runs: SupportRun[], patientId: string, sender: string, noticeSent: boolean) {
  const db = createServerClient();
  for (const run of runs) {
    const result = resultOf(run);
    const actions = Array.isArray(result.caseActions) ? result.caseActions : [];
    const updated = await db.from("workflow_runs").update({
      result: {
        ...result,
        caseStatus: "resolved",
        caseActions: [...actions, { type: "code_reissued", at: new Date().toISOString(), by: "system_repair", patientId, recipient: sender, noticeSent }],
      },
    }).eq("id", run.id);
    if (updated.error) throw new Error("support_case_update_failed");
  }
}

export async function repairMissingSupportCodes(options: { send: boolean }) {
  const db = createServerClient();
  const runsQuery = await db.from("workflow_runs")
    .select("id,started_at,result")
    .eq("workflow_id", HOSTINGER_SUPPORT_WORKFLOW_ID)
    .order("started_at", { ascending: false })
    .limit(1000);
  if (runsQuery.error) throw new Error(`support_runs_failed:${runsQuery.error.message}`);
  const candidates = ((runsQuery.data ?? []) as SupportRun[]).filter(isMissingCodeComplaint);
  const grouped = new Map<string, SupportRun[]>();
  for (const run of candidates) {
    const sender = normalizeEmail(String(resultOf(run).sender || ""));
    if (!sender) continue;
    grouped.set(sender, [...(grouped.get(sender) ?? []), run]);
  }

  const items: Array<{ sender: string; patientNames: string[]; outcome: string }> = [];
  const summary = { cases: candidates.length, contacts: grouped.size, eligible: 0, sent: 0, alreadySignedIn: 0, ambiguous: 0, missing: 0, incomplete: 0, blocked: 0, failed: 0, noticeFailed: 0, items };
  for (const [sender, runs] of Array.from(grouped.entries())) {
    try {
      const patients = await findSupportPatientsByEmail(sender);
      const patientNames = patients.map(patient => [patient.vorname, patient.nachname].filter(Boolean).join(" ") || patient.ivoris_nummer || "Patient");
      if (patients.length === 0) { summary.missing++; items.push({ sender, patientNames, outcome: "missing" }); continue; }
      if (patients.length !== 1) { summary.ambiguous++; items.push({ sender, patientNames, outcome: "ambiguous" }); continue; }
      const patient = patients[0];
      if (!patient.ivoris_nummer || !patient.geburtsdatum) { summary.incomplete++; items.push({ sender, patientNames, outcome: "incomplete" }); continue; }
      const latestComplaint = runs.reduce((latest, run) => new Date(run.started_at) > new Date(latest.started_at) ? run : latest, runs[0]);
      if (await successfulLoginAfter(patient.id, latestComplaint.started_at)) { summary.alreadySignedIn++; items.push({ sender, patientNames, outcome: "signed_in" }); continue; }
      summary.eligible++;
      if (!options.send) { items.push({ sender, patientNames, outcome: "eligible" }); continue; }

      let codeSent = false;
      await requestPatientSelfActivation({
        patientNumber: patient.ivoris_nummer,
        birthDate: patient.geburtsdatum,
        contactEmail: sender,
        ip: `support-repair:${latestComplaint.id}`,
      }, {
        db,
        sendCode: async (to, code, requestId, patientId) => {
          await sendPatientAccessCode({ purpose: "activation", patientId, to, code, requestId });
          codeSent = true;
        },
      });
      if (!codeSent) { summary.blocked++; items.push({ sender, patientNames, outcome: "blocked" }); continue; }
      const notice = buildAccessCodeReissueNotice("activation");
      let noticeSent = true;
      try {
        await sendHostingerSupportMessage({ to: sender, ...notice });
      } catch {
        noticeSent = false;
        summary.noticeFailed++;
      }
      await recordRepair(runs, patient.id, sender, noticeSent);
      summary.sent++;
      items.push({ sender, patientNames, outcome: noticeSent ? "sent" : "sent_notice_failed" });
    } catch {
      summary.failed++;
      items.push({ sender, patientNames: [], outcome: "failed" });
    }
  }
  return summary;
}
