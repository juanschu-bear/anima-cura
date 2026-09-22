import crypto from "crypto";
import { createAdminClient } from "@/lib/db/supabase";

function normalizeForEmail(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/\.{2,}/g, ".");
}

function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

export type EnsuredPatientPortalAccount =
  | { status: "created"; login_email: string; password: string; user_id: string; has_logged_in: false }
  | {
      status: "existing";
      login_email: string;
      user_id: string;
      password: string | null;
      has_logged_in: boolean;
      password_source: "stored_submission" | "reissued" | "unavailable";
    }
  | { status: "unavailable"; reason: string };

type ResetPatientPortalPasswordResult =
  | {
      status: "reset";
      login_email: string;
      password: string;
      user_id: string;
      has_logged_in: boolean;
    }
  | { status: "unavailable"; reason: string };

async function loadLatestKnownSubmissionPassword(loginEmail: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("anamnese_submissions")
    .select("account_password, created_at")
    .eq("account_email", loginEmail)
    .not("account_password", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`submission_password_lookup_failed:${error.message}`);
  }

  return typeof data?.account_password === "string" && data.account_password.trim()
    ? data.account_password.trim()
    : null;
}

async function persistPasswordToLinkedSubmissions(params: {
  patientId: string;
  loginEmail: string;
  password: string;
}) {
  const admin = createAdminClient();
  const { patientId, loginEmail, password } = params;

  await admin
    .from("anamnese_submissions")
    .update({ account_email: loginEmail, account_password: password })
    .or(`patient_id.eq.${patientId},matched_patient_id.eq.${patientId}`);
}

async function readPortalAuthState(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    throw new Error(`auth_get_user_failed:${error.message}`);
  }
  return {
    hasLoggedIn: Boolean(data.user?.last_sign_in_at),
  };
}

async function issueTemporaryPassword(params: {
  userId: string;
  patientId: string;
  loginEmail: string;
  password?: string;
}) {
  const admin = createAdminClient();
  const password = params.password ?? generatePassword(10);
  const { error } = await admin.auth.admin.updateUserById(params.userId, { password });
  if (error) {
    throw new Error(`auth_update_failed:${error.message}`);
  }

  await persistPasswordToLinkedSubmissions({
    patientId: params.patientId,
    loginEmail: params.loginEmail,
    password,
  });

  return password;
}

export async function ensurePatientPortalAccount(params: {
  vorname: string | null;
  nachname: string | null;
  patientEmail: string | null;
  patientId: string | null;
}): Promise<EnsuredPatientPortalAccount> {
  const { vorname, nachname, patientEmail, patientId } = params;
  if (!vorname || !nachname || !patientId) {
    return { status: "unavailable", reason: "missing_required_fields" };
  }

  const admin = createAdminClient();

  const { data: existingProfile } = await admin
    .from("user_profiles")
    .select("id, email")
    .eq("patient_id", patientId)
    .eq("role", "patient")
    .maybeSingle();

  if (existingProfile?.id && existingProfile.email) {
    const authState = await readPortalAuthState(existingProfile.id);
    const knownPassword = await loadLatestKnownSubmissionPassword(existingProfile.email);

    if (knownPassword) {
      return {
        status: "existing",
        login_email: existingProfile.email,
        user_id: existingProfile.id,
        password: knownPassword,
        has_logged_in: authState.hasLoggedIn,
        password_source: "stored_submission",
      };
    }

    if (!authState.hasLoggedIn) {
      const reissuedPassword = await issueTemporaryPassword({
        userId: existingProfile.id,
        patientId,
        loginEmail: existingProfile.email,
      });
      return {
        status: "existing",
        login_email: existingProfile.email,
        user_id: existingProfile.id,
        password: reissuedPassword,
        has_logged_in: false,
        password_source: "reissued",
      };
    }

    return {
      status: "existing",
      login_email: existingProfile.email,
      user_id: existingProfile.id,
      password: null,
      has_logged_in: true,
      password_source: "unavailable",
    };
  }

  const base = `${normalizeForEmail(vorname)}.${normalizeForEmail(nachname)}`;
  const password = generatePassword(10);

  for (let attempt = 0; attempt < 10; attempt++) {
    const loginEmail =
      attempt === 0 ? `${base}@animacura.de` : `${base}${attempt + 1}@animacura.de`;

    const { data: authData, error } = await admin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      app_metadata: {
        role: "patient",
      },
      user_metadata: {
        display_name: `${vorname} ${nachname}`,
        full_name: `${vorname} ${nachname}`,
        vorname,
        nachname,
        patient_email: patientEmail,
        role: "patient",
        patient_id: patientId,
      },
    });

    if (!error && authData.user) {
      const { error: profileError } = await admin.from("user_profiles").upsert(
        {
          id: authData.user.id,
          email: loginEmail,
          display_name: `${vorname} ${nachname}`,
          role: "patient",
          patient_id: patientId,
        },
        { onConflict: "id" },
      );

      if (profileError) {
        await admin.auth.admin.deleteUser(authData.user.id);
        return { status: "unavailable", reason: `profile_upsert_failed:${profileError.message}` };
      }

      return {
        status: "created",
        login_email: loginEmail,
        password,
        user_id: authData.user.id,
        has_logged_in: false,
      };
    }

    const errorMessage = error?.message ?? "unknown";
    if (!errorMessage.includes("already") && !errorMessage.includes("exists")) {
      return { status: "unavailable", reason: `auth_create_failed:${errorMessage}` };
    }
  }

  return { status: "unavailable", reason: "email_attempts_exhausted" };
}

export async function resetPatientPortalPassword(params: {
  patientId: string;
  password?: string | null;
}): Promise<ResetPatientPortalPasswordResult> {
  const admin = createAdminClient();
  const { patientId } = params;

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("id, email")
    .eq("patient_id", patientId)
    .eq("role", "patient")
    .maybeSingle();

  if (profileError) {
    return { status: "unavailable", reason: `profile_lookup_failed:${profileError.message}` };
  }

  if (!profile?.id || !profile.email) {
    return { status: "unavailable", reason: "patient_portal_missing" };
  }

  let hasLoggedIn = false;
  try {
    const authState = await readPortalAuthState(profile.id);
    hasLoggedIn = authState.hasLoggedIn;
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "auth_state_unknown",
    };
  }

  const password =
    typeof params.password === "string" && params.password.trim().length >= 8
      ? params.password.trim()
      : generatePassword(10);

  try {
    const finalPassword = await issueTemporaryPassword({
      userId: profile.id,
      patientId,
      loginEmail: profile.email,
      password,
    });

    return {
      status: "reset",
      login_email: profile.email,
      password: finalPassword,
      user_id: profile.id,
      has_logged_in: hasLoggedIn,
    };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "password_reset_failed",
    };
  }
}
