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
  | { status: "created"; login_email: string; password: string; user_id: string }
  | { status: "existing"; login_email: string; user_id: string }
  | { status: "unavailable"; reason: string };

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
    return {
      status: "existing",
      login_email: existingProfile.email,
      user_id: existingProfile.id,
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
      };
    }

    const errorMessage = error?.message ?? "unknown";
    if (!errorMessage.includes("already") && !errorMessage.includes("exists")) {
      return { status: "unavailable", reason: `auth_create_failed:${errorMessage}` };
    }
  }

  return { status: "unavailable", reason: "email_attempts_exhausted" };
}
