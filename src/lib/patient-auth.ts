import { createServerClient } from "@/lib/db/supabase";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export interface AuthenticatedPatient {
  userId: string;
  patientId: string;
  email: string;
  name: string;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getAuthenticatedPatient(): Promise<AuthenticatedPatient | null> {
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const serviceClient = getServiceClient();
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
