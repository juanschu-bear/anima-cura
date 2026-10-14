import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
import { PATIENT_EMAIL_FROM, PATIENT_EMAIL_REPLY_TO } from "@/lib/email/delivery";
import { buildPatientPortalActivationCodeEmail } from "@/lib/email/patient-password-recovery";
import { contactEmailIssue, normalizeEmail } from "@/lib/services/patient-outreach-audit";

const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 3;
const MAX_IP_REQUESTS_PER_HOUR = 10;
const MIN_GENERIC_RESPONSE_MS = 350;
const GENERIC_RESULT = { ok: true, expiresInMinutes: CODE_TTL_MINUTES } as const;
const STATE_KEY = "patient_self_activation";

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

async function resolvePatient(input: { patientNumber: string; birthDate: string; contactEmail: string }) {
  const db = createServerClient();
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
  if (patientResult.error || patients.length !== 1) return null;
  const patient = patients[0];

  const submissions = await db.from("anamnese_submissions")
    .select("email,answers")
    .or(`patient_id.eq.${patient.id},matched_patient_id.eq.${patient.id}`)
    .order("created_at", { ascending: false })
    .limit(10);
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

async function ensurePendingPortalUser(patient: PatientIdentity) {
  const db = createServerClient();
  const existing = await db.from("user_profiles")
    .select("id,email,patient_id,role")
    .eq("patient_id", patient.id)
    .eq("role", "patient")
    .limit(2);
  if (existing.error || (existing.data || []).length > 1) return null;
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
    return null;
  }

  const profile = await db.from("user_profiles").insert({
    id: created.data.user.id,
    email: loginEmail,
    display_name: displayName,
    full_name: displayName,
    role: "patient",
    patient_id: patient.id,
  });
  if (profile.error) {
    await db.auth.admin.deleteUser(created.data.user.id);
    return null;
  }
  return { userId: created.data.user.id, loginEmail };
}

async function sendCode(to: string, code: string, id: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("patient_activation_mail_unavailable");
  const email = buildPatientPortalActivationCodeEmail(code);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `patient-self-activation-${id}`,
    },
    body: JSON.stringify({
      from: PATIENT_EMAIL_FROM,
      to,
      reply_to: PATIENT_EMAIL_REPLY_TO,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!response.ok) throw new Error(`patient_activation_mail_rejected:${response.status}`);
}

export async function requestPatientSelfActivation(input: {
  patientNumber: string;
  birthDate: string;
  contactEmail: string;
  ip: string;
}) {
  const startedAt = Date.now();
  if (!acceptIpRequest(input.ip, startedAt)) return genericResult(startedAt);
  const identity = await resolvePatient(input);
  if (!identity) return genericResult(startedAt);
  const portal = await ensurePendingPortalUser(identity.patient);
  if (!portal) return genericResult(startedAt);
  const db = createServerClient();
  const authResult = await db.auth.admin.getUserById(portal.userId);
  const authUser = authResult.data.user;
  if (authResult.error || !authUser || authUser.app_metadata?.role !== "patient") return genericResult(startedAt);
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
    await sendCode(identity.contactEmail, code, id);
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
