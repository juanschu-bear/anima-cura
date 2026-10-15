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
type Patient = { id: string; ivoris_nummer: string | null; geburtsdatum: string | null; email: string | null; versicherter_email: string | null };

export const missingCodeComplaintPattern = /(kein(?:en|e)?|nicht|nie).{0,45}(aktivierungs|sicherheits|zugangs)?code|code.{0,45}(nicht|nie).{0,25}(erhalten|angekommen|kommen|an\b)|passwort.{0,30}(falsch|funktioniert nicht)|anmeld(?:ung|en).{0,30}(nicht|fehler)/i;

function resultOf(run: SupportRun) {
  return run.result && typeof run.result === "object" ? run.result : {};
}

export function isMissingCodeComplaint(run: SupportRun) {
  const result = resultOf(run);
  if (result.reason === "security_code_not_received") return true;
  if (result.category === "login_password" && result.caseStatus !== "resolved") return true;
  const text = `${typeof result.subject === "string" ? result.subject : ""} ${typeof result.excerpt === "string" ? result.excerpt : ""}`;
  return missingCodeComplaintPattern.test(text);
}

async function findPatients(sender: string): Promise<Patient[]> {
  const db = createServerClient();
  const columns = "id,ivoris_nummer,geburtsdatum,email,versicherter_email";
  const [direct, guardian] = await Promise.all([
    db.from("patients").select(columns).ilike("email", sender).limit(10),
    db.from("patients").select(columns).ilike("versicherter_email", sender).limit(10),
  ]);
  if (direct.error || guardian.error) throw new Error("patient_match_failed");
  const unique = new Map<string, Patient>();
  for (const patient of [...(direct.data ?? []), ...(guardian.data ?? [])] as Patient[]) unique.set(patient.id, patient);
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

  const summary = { cases: candidates.length, contacts: grouped.size, eligible: 0, sent: 0, alreadySignedIn: 0, ambiguous: 0, missing: 0, incomplete: 0, blocked: 0, failed: 0, noticeFailed: 0 };
  for (const [sender, runs] of Array.from(grouped.entries())) {
    try {
      const patients = await findPatients(sender);
      if (patients.length === 0) { summary.missing++; continue; }
      if (patients.length !== 1) { summary.ambiguous++; continue; }
      const patient = patients[0];
      if (!patient.ivoris_nummer || !patient.geburtsdatum) { summary.incomplete++; continue; }
      const latestComplaint = runs.reduce((latest, run) => new Date(run.started_at) > new Date(latest.started_at) ? run : latest, runs[0]);
      if (await successfulLoginAfter(patient.id, latestComplaint.started_at)) { summary.alreadySignedIn++; continue; }
      summary.eligible++;
      if (!options.send) continue;

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
      if (!codeSent) { summary.blocked++; continue; }
      const notice = buildAccessCodeReissueNotice();
      let noticeSent = true;
      try {
        await sendHostingerSupportMessage({ to: sender, ...notice });
      } catch {
        noticeSent = false;
        summary.noticeFailed++;
      }
      await recordRepair(runs, patient.id, sender, noticeSent);
      summary.sent++;
    } catch {
      summary.failed++;
    }
  }
  return summary;
}
