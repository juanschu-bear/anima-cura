import { createServerClient } from "@/lib/db/supabase";
import { NextResponse } from "next/server";

export interface AuthenticatedPatient {
  userId: string;
  patientId: string;
  email: string;
  name: string;
}

/**
 * Authenticate a patient from the request context.
 * Returns the patient info or null if not a patient.
 */
export async function getAuthenticatedPatient(): Promise<AuthenticatedPatient | null> {
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, patient_id, display_name, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "patient" || !profile.patient_id) return null;

  return {
    userId: user.id,
    patientId: profile.patient_id,
    email: user.email ?? "",
    name: profile.display_name || profile.full_name || "Patient",
  };
}

/**
 * Require patient auth - returns patient or 401 response.
 * Use in API routes: const patient = await requirePatient(); if (patient instanceof NextResponse) return patient;
 */
export async function requirePatient(): Promise<AuthenticatedPatient | NextResponse> {
  const patient = await getAuthenticatedPatient();
  if (!patient) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  return patient;
}
