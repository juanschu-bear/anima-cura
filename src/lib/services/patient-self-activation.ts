import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
import { sendPatientAccessCode } from "./patient-access-code-delivery";
import { contactEmailIssue, normalizeEmail } from "@/lib/services/patient-outreach-audit";

const CODE_TTL_MINUTES = 30;
const MAX_CODE_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 3;
const MAX_IP_REQUESTS_PER_HOUR = 10;
const MIN_GENERIC_RESPONSE_MS = 350;
const GENERIC_RESULT = { ok: true, expiresInMinutes: CODE_TTL_MINUTES } as const;
const STATE_KEY = "patient_self_activation";
type ActivationDb = ReturnType<typeof createServerClient>;

type ActivationState = {
  id: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  requestedAt: string;
  requestTimes: string[];
  contactHash: string;
};

type PatientIdentity = {
  id: string;
  ivoris_nummer: string | null;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  email: string | null;
  versicherter_email: string | null;
};

const ipRequestLog = new Map<string, number[]>();

function secret() {
  const value = process.env.PATIENT_PASSWORD_RECOVERY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("patient_activation_secret_missing");
  return value;
}

function keyedHash(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function activationCodeHash(id: string, code: string) {
  return keyedHash(`${id}:${code}`);
}

function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizePatientNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits || digits.length > 12) return null;
  return digits.padStart(8, "0");
}

function answerString(answers: Record<string, unknown> | null, key: string) {
  const value = answers?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function contactMatchesKnownAddresses(contactEmail: string, candidates: Array<string | null | undefined>) {
  const normalized = normalizeEmail(contactEmail);
  if (!normalized || contactEmailIssue(normalized, new Set())) return false;
  return candidates.some(candidate => normalizeEmail(candidate) === normalized);
}

function readState(value: unknown): ActivationState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.codeHash !== "string" ||
    typeof row.expiresAt !== "string" ||
    typeof row.attempts !== "number" ||
    typeof row.requestedAt !== "string" ||
    typeof row.contactHash !== "string" ||
    !Array.isArray(row.requestTimes)
  ) return null;
  return {
    id: row.id,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    attempts: row.attempts,
    requestedAt: row.requestedAt,
    contactHash: row.contactHash,
    requestTimes: row.requestTimes.filter((entry): entry is string => typeof entry === "string"),
  };
}

function recentRequestTimes(state: ActivationState | null, now: number) {
  const cutoff = now - 60 * 60 * 1000;
  return (state?.requestTimes || []).filter(value => Date.parse(value) >= cutoff);
}

function acceptIpRequest(ip: string, now: number) {
  const key = keyedHash(ip || "unknown");
  const recent = (ipRequestLog.get(key) || []).filter(value => value >= now - 60 * 60 * 1000);
  if (recent.length >= MAX_IP_REQUESTS_PER_HOUR) return false;
  recent.push(now);
  ipRequestLog.set(key, recent);
  return true;
}

async function genericResult(startedAt: number) {
  const remaining = MIN_GENERIC_RESPONSE_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  return GENERIC_RESULT;
}

async function resolvePatient(input: { patientNumber: string; birthDate: string; contactEmail: string }, db = createServerClient()) {
  const normalizedNumber = normalizePatientNumber(input.patientNumber);
  const contactEmail = normalizeEmail(input.contactEmail);
  if (!normalizedNumber || !contactEmail || contactEmailIssue(contactEmail, new Set())) return null;

  const numberVariants = Array.from(new Set([
    normalizedNumber,
    normalizedNumber.replace(/^0+/, "") || "0",
    input.patientNumber.trim(),
  ]));
  const patientResult = await db.from("patients")
    .select("id,ivoris_nummer,vorname,nachname,geburtsdatum,email,versicherter_email")
    .in("ivoris_nummer", numberVariants)
    .eq("geburtsdatum", input.birthDate)
    .limit(2);
  const patients = (patientResult.data || []) as PatientIdentity[];
  if (patientResult.error) throw new Error("patient_activation_identity_lookup_failed");
  if (patients.length !== 1) return null;
  const patient = patients[0];

  const submissions = await db.from("anamnese_submissions")
    .select("email,answers")
    .or(`patient_id.eq.${patient.id},matched_patient_id.eq.${patient.id}`)
    .order("created_at", { ascending: false })
    .limit(10);
  if (submissions.error) throw new Error("patient_activation_contact_lookup_failed");
  const candidateEmails: Array<string | null | undefined> = [patient.email, patient.versicherter_email];
  for (const row of submissions.data || []) {
    const answers = row.answers as Record<string, unknown> | null;
    candidateEmails.push(row.email, answerString(answers, "patient_email"), answerString(answers, "vp_email"));
  }
  if (!contactMatchesKnownAddresses(contactEmail, candidateEmails)) return null;
  return { patient, contactEmail };
}

function portalAlias(patient: PatientIdentity) {
  return `patient.${patient.id}@animacura.de`;
}

async function ensurePendingPortalUser(patient: PatientIdentity, db: ActivationDb) {
  const existing = await db.from("user_profiles")
    .select("id,email,patient_id,role")
    .eq("patient_id", patient.id)
    .eq("role", "patient")
    .limit(2);
  if (existing.error) throw new Error("patient_activation_profile_lookup_failed");
  if ((existing.data || []).length > 1) return null;
  if (existing.data?.[0]?.id && existing.data[0].email) {
    return { userId: existing.data[0].id as string, loginEmail: existing.data[0].email as string };
  }

  const loginEmail = portalAlias(patient);
  const displayName = `${patient.vorname} ${patient.nachname}`.trim();
  const created = await db.auth.admin.createUser({
    email: loginEmail,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    app_metadata: { role: "patient", activation_pending: true },
    user_metadata: {
      role: "patient",
      patient_id: patient.id,
      display_name: displayName,
      full_name: displayName,
      vorname: patient.vorname,
      nachname: patient.nachname,
    },
  });
  if (created.error || !created.data.user) {
    const retry = await db.from("user_profiles")
      .select("id,email")
      .eq("patient_id", patient.id)
      .eq("role", "patient")
      .limit(2);
    if (!retry.error && retry.data?.length === 1) return { userId: retry.data[0].id as string, loginEmail: retry.data[0].email as string };
    throw new Error("patient_activation_account_creation_failed");
  }

  // Auth can already have created this row through its profile trigger.
  // Only use columns present in the live schema; full_name belongs to Auth metadata.
  const profile = await db.from("user_profiles").upsert({
    id: created.data.user.id,
    email: loginEmail,
    display_name: displayName,
    role: "patient",
    patient_id: patient.id,
  }, { onConflict: "id" });
  if (profile.error) {
    await db.auth.admin.deleteUser(created.data.user.id);
    throw new Error("patient_activation_profile_store_failed");
  }
  return { userId: created.data.user.id, loginEmail };
}

async function sendCode(to: string, code: string, id: string, patientId: string) {
  await sendPatientAccessCode({ purpose: "activation", patientId, to, code, requestId: id });
}

export async function requestPatientSelfActivation(input: {
  patientNumber: string;
  birthDate: string;
  contactEmail: string;
  ip: string;
}, dependencies?: { db: ActivationDb; sendCode: typeof sendCode }) {
  const startedAt = Date.now();
  if (!acceptIpRequest(input.ip, startedAt)) return genericResult(startedAt);
  const db = dependencies?.db ?? createServerClient();
  const identity = await resolvePatient(input, db);
  if (!identity) return genericResult(startedAt);
  const portal = await ensurePendingPortalUser(identity.patient, db);
  if (!portal) return genericResult(startedAt);
  const authResult = await db.auth.admin.getUserById(portal.userId);
  const authUser = authResult.data.user;
  if (authResult.error) throw new Error("patient_activation_auth_lookup_failed");
  // Server-owned user_profiles establishes the role. Older accounts can lack
  // redundant Auth metadata, but an explicit conflicting role must fail closed.
  if (!authUser || (authUser.app_metadata?.role && authUser.app_metadata.role !== "patient")) return genericResult(startedAt);
  const previousState = readState(authUser.app_metadata?.[STATE_KEY]);
  const requestTimes = recentRequestTimes(previousState, startedAt);
  if (requestTimes.length >= MAX_REQUESTS_PER_HOUR) return genericResult(startedAt);

  const id = randomUUID();
  const code = String(randomInt(100000, 1000000));
  const state: ActivationState = {
    id,
    codeHash: activationCodeHash(id, code),
    expiresAt: new Date(startedAt + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
    attempts: 0,
    requestedAt: new Date(startedAt).toISOString(),
    requestTimes: [...requestTimes, new Date(startedAt).toISOString()],
    contactHash: keyedHash(identity.contactEmail),
  };
  const stored = await db.auth.admin.updateUserById(portal.userId, {
    app_metadata: { ...authUser.app_metadata, [STATE_KEY]: state },
  });
  if (stored.error) throw new Error(`patient_activation_store_failed:${stored.error.message}`);
  try {
    await (dependencies?.sendCode ?? sendCode)(identity.contactEmail, code, id, identity.patient.id);
  } catch (error) {
    await db.auth.admin.updateUserById(portal.userId, {
      app_metadata: { ...authUser.app_metadata, [STATE_KEY]: previousState },
    });
    throw error;
  }
  return genericResult(startedAt);
}

export async function confirmPatientSelfActivation(input: {
  patientNumber: string;
  birthDate: string;
  contactEmail: string;
  code: string;
  password: string;
}) {
  const identity = await resolvePatient(input);
  if (!identity) return { ok: false as const, reason: "invalid_or_expired" as const };
  const db = createServerClient();
  const profile = await db.from("user_profiles")
    .select("id,email")
    .eq("patient_id", identity.patient.id)
    .eq("role", "patient")
    .maybeSingle();
  if (profile.error || !profile.data?.id || !profile.data.email) return { ok: false as const, reason: "invalid_or_expired" as const };
  const authResult = await db.auth.admin.getUserById(profile.data.id);
  const authUser = authResult.data.user;
  const state = readState(authUser?.app_metadata?.[STATE_KEY]);
  if (
    authResult.error || !authUser || !state || state.attempts >= MAX_CODE_ATTEMPTS ||
    Date.parse(state.expiresAt) <= Date.now() ||
    !safeEqualHex(state.contactHash, keyedHash(identity.contactEmail))
  ) return { ok: false as const, reason: "invalid_or_expired" as const };

  if (!safeEqualHex(state.codeHash, activationCodeHash(state.id, input.code))) {
    await db.auth.admin.updateUserById(profile.data.id, {
      app_metadata: {
        ...authUser.app_metadata,
        [STATE_KEY]: { ...state, attempts: Math.min(state.attempts + 1, MAX_CODE_ATTEMPTS) },
      },
    });
    return { ok: false as const, reason: "invalid_or_expired" as const };
  }

  const appMetadata: Record<string, unknown> = { ...authUser.app_metadata, role: "patient", activation_pending: false };
  delete appMetadata[STATE_KEY];
  const displayName = `${identity.patient.vorname} ${identity.patient.nachname}`.trim();
  const updated = await db.auth.admin.updateUserById(profile.data.id, {
    password: input.password,
    app_metadata: appMetadata,
    user_metadata: {
      ...authUser.user_metadata,
      role: "patient",
      patient_id: identity.patient.id,
      display_name: displayName,
      full_name: displayName,
      vorname: identity.patient.vorname,
      nachname: identity.patient.nachname,
      patient_email: identity.contactEmail,
    },
  });
  if (updated.error) throw new Error(`patient_activation_update_failed:${updated.error.message}`);

  await Promise.all([
    db.from("patients").update({ portal_zugang: true }).eq("id", identity.patient.id),
    db.from("anamnese_submissions")
      .update({ account_email: profile.data.email, account_password: null })
      .or(`patient_id.eq.${identity.patient.id},matched_patient_id.eq.${identity.patient.id}`),
  ]);
  return { ok: true as const, loginEmail: profile.data.email as string };
}
