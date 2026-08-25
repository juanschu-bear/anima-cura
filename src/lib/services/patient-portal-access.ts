import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/db/supabase";

type SubmissionAnswerMap = Record<string, unknown>;

type PortalSubmissionRow = {
  id: string;
  patient_id: string | null;
  matched_patient_id: string | null;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  email: string | null;
  account_email: string | null;
  created_at: string | null;
  answers: SubmissionAnswerMap | null;
};

type PatientRow = {
  id: string;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  email: string | null;
  created_at: string | null;
};

export type PatientPortalAccessRepairResult =
  | { status: "repaired"; patientId: string; reason: string }
  | { status: "already_ok"; patientId: string }
  | { status: "not_patient"; reason: string }
  | { status: "unresolved"; reason: string };

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNamePart(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function toIsoDateOnly(value: unknown): string | null {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const european = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (european) return `${european[3]}-${european[2]}-${european[1]}`;
  return null;
}

function readPatientRole(user: User): string | null {
  return asTrimmedString(user.app_metadata?.role) ?? asTrimmedString(user.user_metadata?.role);
}

function readPatientId(user: User): string | null {
  return asTrimmedString(user.user_metadata?.patient_id);
}

function collectUniqueIds(rows: PortalSubmissionRow[]): string[] {
  return Array.from(
    new Set(
      rows.flatMap((row) => [row.matched_patient_id, row.patient_id]).filter((value): value is string => !!asTrimmedString(value))
    )
  );
}

function buildIdentityHints(user: User, submissions: PortalSubmissionRow[]) {
  const latest = submissions[0] ?? null;
  const answers = (latest?.answers ?? {}) as SubmissionAnswerMap;

  return {
    vorname:
      asTrimmedString(user.user_metadata?.vorname) ??
      asTrimmedString(answers.patient_vorname) ??
      asTrimmedString(latest?.vorname),
    nachname:
      asTrimmedString(user.user_metadata?.nachname) ??
      asTrimmedString(answers.patient_nachname) ??
      asTrimmedString(latest?.nachname),
    geburtsdatum:
      toIsoDateOnly(user.user_metadata?.patient_geburtsdatum) ??
      toIsoDateOnly(answers.patient_geburtsdatum) ??
      toIsoDateOnly(latest?.geburtsdatum),
    patientEmail:
      asTrimmedString(user.user_metadata?.patient_email) ??
      asTrimmedString(answers.patient_email) ??
      asTrimmedString(latest?.email),
    displayName: (() => {
      const fallbackName = [
        asTrimmedString(user.user_metadata?.vorname),
        asTrimmedString(user.user_metadata?.nachname),
      ]
        .filter(Boolean)
        .join(" ");
      return (
        asTrimmedString(user.user_metadata?.display_name) ??
        asTrimmedString(user.user_metadata?.full_name) ??
        (fallbackName || null)
      );
    })(),
  };
}

function patientMatchesIdentity(
  patient: PatientRow,
  identity: { vorname: string | null; nachname: string | null; geburtsdatum: string | null; patientEmail: string | null }
) {
  if (identity.geburtsdatum && toIsoDateOnly(patient.geburtsdatum) !== identity.geburtsdatum) {
    return false;
  }

  const sameFirst = identity.vorname
    ? normalizeNamePart(patient.vorname) === normalizeNamePart(identity.vorname)
    : true;
  const sameLast = identity.nachname
    ? normalizeNamePart(patient.nachname) === normalizeNamePart(identity.nachname)
    : true;

  if (sameFirst && sameLast) return true;

  if (identity.patientEmail && patient.email) {
    return patient.email.trim().toLowerCase() === identity.patientEmail.trim().toLowerCase();
  }

  return false;
}

async function resolvePatientIdFromSubmissions(user: User, submissions: PortalSubmissionRow[]) {
  const explicitIds = collectUniqueIds(submissions);
  if (explicitIds.length === 1) {
    return { patientId: explicitIds[0], reason: "submission_patient_reference" };
  }

  const identity = buildIdentityHints(user, submissions);
  if (!identity.vorname || !identity.nachname) {
    return { patientId: null, reason: "missing_identity_hints" };
  }

  const admin = createAdminClient();
  let patientCandidates: PatientRow[] = [];

  if (identity.geburtsdatum) {
    const { data } = await admin
      .from("patients")
      .select("id, vorname, nachname, geburtsdatum, email, created_at")
      .eq("geburtsdatum", identity.geburtsdatum)
      .limit(50);
    patientCandidates = data ?? [];
  } else {
    const { data } = await admin
      .from("patients")
      .select("id, vorname, nachname, geburtsdatum, email, created_at")
      .or(`vorname.ilike.%${identity.vorname}%,nachname.ilike.%${identity.nachname}%`)
      .limit(100);
    patientCandidates = data ?? [];
  }

  const filtered = patientCandidates.filter((patient) => patientMatchesIdentity(patient, identity));
  const uniqueIds = Array.from(new Set(filtered.map((patient) => patient.id)));

  if (uniqueIds.length === 1) {
    return { patientId: uniqueIds[0], reason: "resolved_by_patient_identity" };
  }

  return { patientId: null, reason: uniqueIds.length > 1 ? "ambiguous_patient_identity" : "patient_not_found" };
}

export async function repairPatientPortalAccess(user: User): Promise<PatientPortalAccessRepairResult> {
  const admin = createAdminClient();

  const { data: existingProfile } = await admin
    .from("user_profiles")
    .select("role, patient_id")
    .eq("id", user.id)
    .maybeSingle();

  const currentPatientId = readPatientId(user) ?? asTrimmedString(existingProfile?.patient_id);

  if (currentPatientId && existingProfile?.role === "patient" && existingProfile.patient_id === currentPatientId) {
    return { status: "already_ok", patientId: currentPatientId };
  }

  const { data: submissions } = await admin
    .from("anamnese_submissions")
    .select("id, patient_id, matched_patient_id, vorname, nachname, geburtsdatum, email, account_email, created_at, answers")
    .eq("account_email", user.email ?? "")
    .order("created_at", { ascending: false })
    .limit(10);

  const userRole = readPatientRole(user);
  if (userRole !== "patient" && (!submissions || submissions.length === 0)) {
    return { status: "not_patient", reason: "auth_user_not_marked_as_patient" };
  }

  const resolved = await resolvePatientIdFromSubmissions(user, submissions ?? []);
  if (!resolved.patientId) {
    return { status: "unresolved", reason: resolved.reason };
  }

  const displayName =
    asTrimmedString(user.user_metadata?.display_name) ??
    asTrimmedString(user.user_metadata?.full_name) ??
    (`${asTrimmedString(user.user_metadata?.vorname) ?? ""} ${asTrimmedString(user.user_metadata?.nachname) ?? ""}`.trim() || user.email || "Patient");

  const { error: authRepairError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      role: "patient",
      patient_id: resolved.patientId,
      display_name: displayName,
      full_name: asTrimmedString(user.user_metadata?.full_name) ?? displayName,
    },
  });

  if (authRepairError) {
    return { status: "unresolved", reason: `auth_update_failed:${authRepairError.message}` };
  }

  const { error: profileRepairError } = await admin.from("user_profiles").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      display_name: displayName,
      role: "patient",
      patient_id: resolved.patientId,
    },
    { onConflict: "id" }
  );

  if (profileRepairError) {
    return { status: "unresolved", reason: `profile_upsert_failed:${profileRepairError.message}` };
  }

  return { status: "repaired", patientId: resolved.patientId, reason: resolved.reason };
}
