import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { NextResponse } from "next/server";

export interface AuthenticatedPatient {
  userId: string;
  patientId: string;
  email: string;
  name: string;
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

  if (!profile || profile.role !== "patient" || !profile.patient_id) return null;

  return {
    userId: user.id,
    patientId: profile.patient_id,
    email: user.email ?? "",
    name: profile.display_name || "Patient",
  };
}

export async function requirePatient(): Promise<AuthenticatedPatient | NextResponse> {
  const patient = await getAuthenticatedPatient();
  if (!patient) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  return patient;
}
