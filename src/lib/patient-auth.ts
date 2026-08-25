import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { repairPatientPortalAccess } from "@/lib/services/patient-portal-access";

export interface AuthenticatedPatient {
  userId: string;
  patientId: string;
  email: string;
  name: string;
}

function readPatientAuthMetadata(user: User) {
  const role =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role
      : typeof user.user_metadata?.role === "string"
        ? user.user_metadata.role
        : null;

  const patientId =
    typeof user.user_metadata?.patient_id === "string" && user.user_metadata.patient_id.trim()
      ? user.user_metadata.patient_id.trim()
      : null;

  const displayName =
    typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()
      ? user.user_metadata.display_name.trim()
      : typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
        ? user.user_metadata.full_name.trim()
        : null;

  if (role !== "patient" || !patientId) {
    return null;
  }

  return {
    role,
    patientId,
    displayName,
  };
}

export async function getAuthenticatedPatient(): Promise<AuthenticatedPatient | null> {
  // SSR client with cookies - reads the user session
  const supabase = createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Service role client - bypasses RLS for profile lookup
  const serviceClient = createServerClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role, patient_id, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const metadataPatient = readPatientAuthMetadata(user);

  if (profile?.role === "patient" && profile.patient_id) {
    return {
      userId: user.id,
      patientId: profile.patient_id,
      email: user.email ?? "",
      name: profile.display_name || metadataPatient?.displayName || "Patient",
    };
  }

  if (readPatientAuthMetadata(user)?.role === "patient") {
    const repairResult = await repairPatientPortalAccess(user);
    if (repairResult.status === "already_ok" || repairResult.status === "repaired") {
      const { data: healedProfile } = await serviceClient
        .from("user_profiles")
        .select("role, patient_id, display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (healedProfile?.role === "patient" && healedProfile.patient_id) {
        return {
          userId: user.id,
          patientId: healedProfile.patient_id,
          email: user.email ?? "",
          name: healedProfile.display_name || metadataPatient?.displayName || "Patient",
        };
      }
    }
  }

  if (!metadataPatient) return null;

  // Self-heal missing or stale user_profiles rows for patient accounts.
  const { error: healError } = await serviceClient.from("user_profiles").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      display_name: metadataPatient.displayName ?? user.email ?? "Patient",
      role: "patient",
      patient_id: metadataPatient.patientId,
    },
    { onConflict: "id" }
  );

  if (healError) {
    console.error("[PATIENT AUTH] profile self-heal failed:", healError.message);
  }

  return {
    userId: user.id,
    patientId: metadataPatient.patientId,
    email: user.email ?? "",
    name: metadataPatient.displayName || "Patient",
  };
}

export async function requirePatient(): Promise<AuthenticatedPatient | NextResponse> {
  const patient = await getAuthenticatedPatient();
  if (!patient) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  return patient;
}
