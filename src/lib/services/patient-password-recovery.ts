import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
import { sendPatientAccessCode } from "./patient-access-code-delivery";
import { contactEmailIssue, normalizeEmail } from "@/lib/services/patient-outreach-audit";

const CODE_TTL_MINUTES = 30;
const MAX_REQUESTS_PER_HOUR = 3;
const MAX_CODE_ATTEMPTS = 5;
const MAX_IP_REQUESTS_PER_HOUR = 10;
const MIN_GENERIC_RESPONSE_MS = 350;
const GENERIC_REQUEST_RESULT = { ok: true, expiresInMinutes: CODE_TTL_MINUTES } as const;

type RecoveryState = {
  id: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  requestedAt: string;
  requestTimes: string[];
};

const ipRequestLog = new Map<string, number[]>();

type SubmissionContact = {
  email: string | null;
  answers: Record<string, unknown> | null;
  created_at: string;
};

type PortalProfile = {
  id: string;
  patient_id: string;
  email: string;
  role: string;
};

function secret() {
  const value = process.env.PATIENT_PASSWORD_RECOVERY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("password_recovery_secret_missing");
  return value;
}

function keyedHash(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function codeHash(id: string, code: string) {
  return keyedHash(`${id}:${code}`);
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function answerString(answers: Record<string, unknown> | null, key: string) {
  const value = answers?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function selectRecoveryContactEmail(
  portalEmail: string,
  submissions: SubmissionContact[],
  patientEmail: string | null,
  guardianEmail: string | null,
) {
  const portalAliases = new Set([portalEmail]);
  const candidates = submissions.flatMap(row => [
    row.email,
    answerString(row.answers, "patient_email"),
    answerString(row.answers, "vp_email"),
  ]).concat(patientEmail || "", guardianEmail || "");
  for (const candidate of candidates) {
    const normalized = normalizeEmail(candidate);
    if (normalized && !contactEmailIssue(normalized, portalAliases)) return normalized;
  }
  return null;
}

async function patientIdsForContact(contactEmail: string) {
  const db = createServerClient();
  const [direct, guardian, submissionDirect, submissionPatient, submissionGuardian] = await Promise.all([
    db.from("patients").select("id").ilike("email", contactEmail).limit(10),
    db.from("patients").select("id").ilike("versicherter_email", contactEmail).limit(10),
    db.from("anamnese_submissions").select("patient_id,matched_patient_id").ilike("email", contactEmail).limit(20),
    db.from("anamnese_submissions").select("patient_id,matched_patient_id").eq("answers->>patient_email", contactEmail).limit(20),
    db.from("anamnese_submissions").select("patient_id,matched_patient_id").eq("answers->>vp_email", contactEmail).limit(20),
  ]);
  if (direct.error || guardian.error || submissionDirect.error || submissionPatient.error || submissionGuardian.error) {
    throw new Error("password_recovery_contact_lookup_failed");
  }
  return Array.from(new Set([
    ...(direct.data ?? []).map(row => row.id),
    ...(guardian.data ?? []).map(row => row.id),
    ...(submissionDirect.data ?? []).flatMap(row => [row.patient_id, row.matched_patient_id]),
    ...(submissionPatient.data ?? []).flatMap(row => [row.patient_id, row.matched_patient_id]),
    ...(submissionGuardian.data ?? []).flatMap(row => [row.patient_id, row.matched_patient_id]),
  ].filter((id): id is string => typeof id === "string" && id.length > 0)));
}

async function canonicalPortalProfile(profiles: PortalProfile[]) {
  if (profiles.length === 1) return profiles[0];
  if (!profiles.length) return null;
  const db = createServerClient();
  const candidates = await Promise.all(profiles.map(async profile => {
    const auth = await db.auth.admin.getUserById(profile.id);
    return { profile, lastSignInAt: auth.data.user?.last_sign_in_at ?? null };
  }));
  const previouslyUsed = candidates
    .filter(candidate => candidate.lastSignInAt)
    .sort((left, right) => Date.parse(right.lastSignInAt!) - Date.parse(left.lastSignInAt!));
  return previouslyUsed[0]?.profile ?? null;
}

async function resolveIdentity(recoveryEmail: string) {
  const db = createServerClient();
  const exactProfileResult = await db.from("user_profiles")
    .select("id,patient_id,email,role")
    .eq("email", recoveryEmail)
    .eq("role", "patient")
    .limit(2);
  if (exactProfileResult.error) throw new Error("password_recovery_profile_lookup_failed");
  let profile = (exactProfileResult.data?.length === 1 ? exactProfileResult.data[0] : null) as PortalProfile | null;

  if (!profile) {
    const patientIds = await patientIdsForContact(recoveryEmail);
    if (patientIds.length !== 1) return null;
    const profiles = await db.from("user_profiles")
      .select("id,patient_id,email,role")
      .eq("patient_id", patientIds[0])
      .eq("role", "patient")
      .limit(10);
    if (profiles.error) throw new Error("password_recovery_profile_lookup_failed");
    profile = await canonicalPortalProfile((profiles.data ?? []) as PortalProfile[]);
  }
  if (!profile?.id || !profile.patient_id || !normalizeEmail(profile.email)) return null;
  const portalEmail = normalizeEmail(profile.email)!;

  const [authResult, patientResult, submissionResult] = await Promise.all([
    db.auth.admin.getUserById(profile.id),
    db.from("patients").select("email,versicherter_email").eq("id", profile.patient_id).maybeSingle(),
    db.from("anamnese_submissions")
      .select("email,answers,created_at")
      .or(`patient_id.eq.${profile.patient_id},matched_patient_id.eq.${profile.patient_id}`)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const authUser = authResult.data.user;
  if (authResult.error || patientResult.error || submissionResult.error) throw new Error("password_recovery_identity_lookup_failed");
  if (!authUser || (authUser.app_metadata?.role && authUser.app_metadata.role !== "patient")) return null;
  const contactEmail = selectRecoveryContactEmail(
    portalEmail,
    (submissionResult.data || []) as SubmissionContact[],
    typeof patientResult.data?.email === "string" ? patientResult.data.email : null,
    typeof patientResult.data?.versicherter_email === "string" ? patientResult.data.versicherter_email : null,
  );
  if (!contactEmail) return null;
  return { authUserId: profile.id as string, patientId: profile.patient_id as string, contactEmail, portalEmail };
}

function recoveryState(value: unknown): RecoveryState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.codeHash !== "string" ||
    typeof row.expiresAt !== "string" ||
    typeof row.requestedAt !== "string" ||
    typeof row.attempts !== "number" ||
    !Array.isArray(row.requestTimes)
  ) return null;
  return {
    id: row.id,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    requestedAt: row.requestedAt,
    attempts: row.attempts,
    requestTimes: row.requestTimes.filter((entry): entry is string => typeof entry === "string"),
  };
}

function withoutRecoveryState(metadata: Record<string, unknown>) {
  const clean = { ...metadata };
  delete clean.patient_password_recovery;
  return clean;
}

function recentRequestTimes(state: RecoveryState | null, now: number) {
  const cutoff = now - 60 * 60 * 1000;
  return (state?.requestTimes || []).filter(value => Date.parse(value) >= cutoff);
}

function acceptIpRequest(ipHash: string, now: number) {
  const recent = (ipRequestLog.get(ipHash) || []).filter(value => value >= now - 60 * 60 * 1000);
  if (recent.length >= MAX_IP_REQUESTS_PER_HOUR) return false;
  recent.push(now);
  ipRequestLog.set(ipHash, recent);
  return true;
}

async function genericResult(startedAt: number) {
  const remaining = MIN_GENERIC_RESPONSE_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  return GENERIC_REQUEST_RESULT;
}

async function sendCode(to: string, code: string, id: string, patientId: string, portalEmail: string) {
  await sendPatientAccessCode({ purpose: "recovery", patientId, to, code, requestId: id, loginEmail: portalEmail });
}

export async function requestPatientPasswordRecovery(input: { portalEmail: string; ip: string }) {
  const startedAt = Date.now();
  const portalEmail = normalizeEmail(input.portalEmail);
  if (!portalEmail) return genericResult(startedAt);
  const db = createServerClient();
  const ipHash = keyedHash(input.ip || "unknown");
  if (!acceptIpRequest(ipHash, startedAt)) return genericResult(startedAt);

  const identity = await resolveIdentity(portalEmail);
  if (!identity) return genericResult(startedAt);

  const authResult = await db.auth.admin.getUserById(identity.authUserId);
  const authUser = authResult.data.user;
  if (authResult.error || !authUser) return genericResult(startedAt);
  const previousState = recoveryState(authUser.app_metadata?.patient_password_recovery);
  const requestTimes = recentRequestTimes(previousState, startedAt);
  if (requestTimes.length >= MAX_REQUESTS_PER_HOUR) return genericResult(startedAt);

  const id = randomUUID();
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
  const state: RecoveryState = {
    id,
    codeHash: codeHash(id, code),
    expiresAt,
    attempts: 0,
    requestedAt: new Date(startedAt).toISOString(),
    requestTimes: [...requestTimes, new Date(startedAt).toISOString()],
  };
  const appMetadata = { ...authUser.app_metadata, patient_password_recovery: state };
  const stored = await db.auth.admin.updateUserById(identity.authUserId, { app_metadata: appMetadata });
  if (stored.error) throw new Error(`password_recovery_store_failed:${stored.error.message}`);
  try {
    await sendCode(identity.contactEmail, code, id, identity.patientId, identity.portalEmail);
  } catch (error) {
    await db.auth.admin.updateUserById(identity.authUserId, {
      app_metadata: { ...authUser.app_metadata, patient_password_recovery: previousState },
    });
    throw error;
  }
  return genericResult(startedAt);
}

export async function confirmPatientPasswordRecovery(input: {
  portalEmail: string;
  code: string;
  password: string;
}) {
  const portalEmail = normalizeEmail(input.portalEmail);
  if (!portalEmail) return { ok: false as const, reason: "invalid_or_expired" as const };
  const db = createServerClient();
  const identity = await resolveIdentity(portalEmail);
  if (!identity) return { ok: false as const, reason: "invalid_or_expired" as const };
  const authResult = await db.auth.admin.getUserById(identity.authUserId);
  const authUser = authResult.data.user;
  const state = recoveryState(authUser?.app_metadata?.patient_password_recovery);
  if (authResult.error || !authUser || !state || state.attempts >= MAX_CODE_ATTEMPTS || Date.parse(state.expiresAt) <= Date.now()) {
    return { ok: false as const, reason: "invalid_or_expired" as const };
  }
  if (!safeEqual(state.codeHash, codeHash(state.id, input.code))) {
    await db.auth.admin.updateUserById(identity.authUserId, {
      app_metadata: {
        ...authUser.app_metadata,
        patient_password_recovery: { ...state, attempts: Math.min(state.attempts + 1, MAX_CODE_ATTEMPTS) },
      },
    });
    return { ok: false as const, reason: "invalid_or_expired" as const };
  }
  const cleanAppMetadata = withoutRecoveryState(authUser.app_metadata || {});
  const authUpdate = await db.auth.admin.updateUserById(identity.authUserId, {
    password: input.password,
    app_metadata: cleanAppMetadata,
  });
  if (authUpdate.error) throw new Error(`password_recovery_update_failed:${authUpdate.error.message}`);

  // Remove legacy readable copies. The final password must exist only in Auth.
  await db.from("anamnese_submissions")
    .update({ account_password: null })
    .eq("account_email", portalEmail);
  return { ok: true as const };
}
