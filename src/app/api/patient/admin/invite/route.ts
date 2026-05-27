import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Auth check - must be praxis admin/verwaltung
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const serviceClient = createServerClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin", "verwaltung"].includes(profile.role)) {
    return NextResponse.json({ error: "Nur für Praxis-Mitarbeiter" }, { status: 403 });
  }

  const body = await request.json();
  const { patient_id, email, password } = body;

  if (!patient_id || !email || !password) {
    return NextResponse.json({ error: "patient_id, email und password sind erforderlich" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Passwort muss mindestens 8 Zeichen haben" }, { status: 400 });
  }

  // Check patient exists
  const { data: patient } = await serviceClient
    .from("patients")
    .select("id, vorname, nachname")
    .eq("id", patient_id)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json({ error: "Patient nicht gefunden" }, { status: 404 });
  }

  // Check if patient already has portal access
  const { data: existingProfile } = await serviceClient
    .from("user_profiles")
    .select("id")
    .eq("patient_id", patient_id)
    .eq("role", "patient")
    .maybeSingle();

  if (existingProfile) {
    return NextResponse.json({ error: "Dieser Patient hat bereits einen Portal-Zugang" }, { status: 409 });
  }

  // Check if email is already in use
  const { data: existingEmail } = await serviceClient
    .from("user_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingEmail) {
    return NextResponse.json({ error: "Diese E-Mail wird bereits verwendet" }, { status: 409 });
  }

  // Create auth user via Supabase Admin API
  const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "patient" },
    user_metadata: {
      display_name: `${patient.vorname} ${patient.nachname}`,
      role: "patient",
    },
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Fehler beim Erstellen des Accounts: " + (authError?.message || "Unbekannt") }, { status: 500 });
  }

  // Create user profile linked to patient
  const { error: profileError } = await serviceClient
    .from("user_profiles")
    .insert({
      id: authData.user.id,
      email,
      display_name: `${patient.vorname} ${patient.nachname}`,
      role: "patient",
      patient_id,
    });

  if (profileError) {
    // Rollback: delete auth user
    await serviceClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: "Fehler beim Erstellen des Profils: " + profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    patient: { vorname: patient.vorname, nachname: patient.nachname },
    portal: { email, user_id: authData.user.id },
  });
}

// GET - check if a patient has portal access
export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const patientId = request.nextUrl.searchParams.get("patient_id");
  if (!patientId) return NextResponse.json({ error: "patient_id erforderlich" }, { status: 400 });

  const serviceClient = createServerClient();
  const { data: portalProfile } = await serviceClient
    .from("user_profiles")
    .select("id, email, created_at")
    .eq("patient_id", patientId)
    .eq("role", "patient")
    .maybeSingle();

  return NextResponse.json({
    has_access: !!portalProfile,
    portal: portalProfile || null,
  });
}
