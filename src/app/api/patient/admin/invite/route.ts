import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { resetPatientPortalPassword } from "@/lib/services/patient-portal-account";

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
      full_name: `${patient.vorname} ${patient.nachname}`,
      vorname: patient.vorname,
      nachname: patient.nachname,
      role: "patient",
      patient_id,
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

  await serviceClient
    .from("patients")
    .update({ portal_zugang: true })
    .eq("id", patient_id);

  await serviceClient
    .from("anamnese_submissions")
    .update({
      account_email: email,
      account_password: password,
    })
    .or(`patient_id.eq.${patient_id},matched_patient_id.eq.${patient_id}`);

  return NextResponse.json({
    success: true,
    patient: { vorname: patient.vorname, nachname: patient.nachname },
    portal: { email, user_id: authData.user.id },
  });
}

export async function PUT(request: NextRequest) {
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
  const patientId = typeof body.patient_id === "string" ? body.patient_id : "";
  const password = typeof body.password === "string" ? body.password : null;

  if (!patientId) {
    return NextResponse.json({ error: "patient_id ist erforderlich" }, { status: 400 });
  }

  if (password && password.trim().length < 8) {
    return NextResponse.json({ error: "Passwort muss mindestens 8 Zeichen haben" }, { status: 400 });
  }

  const result = await resetPatientPortalPassword({
    patientId,
    password,
  });

  if (result.status !== "reset") {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  await serviceClient
    .from("patients")
    .update({ portal_zugang: true })
    .eq("id", patientId);

  return NextResponse.json({
    success: true,
    portal: {
      email: result.login_email,
      password: result.password,
      has_logged_in: result.has_logged_in,
    },
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

  let hasLoggedIn = false;
  let hasShareablePassword = false;

  if (portalProfile?.id && portalProfile.email) {
    const { data: authUser } = await serviceClient.auth.admin.getUserById(portalProfile.id);
    hasLoggedIn = Boolean(authUser.user?.last_sign_in_at);

    const { data: knownPasswordRow } = await serviceClient
      .from("anamnese_submissions")
      .select("account_password, created_at")
      .eq("account_email", portalProfile.email)
      .not("account_password", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    hasShareablePassword = Boolean(
      typeof knownPasswordRow?.account_password === "string" &&
      knownPasswordRow.account_password.trim()
    );
  }

  return NextResponse.json({
    has_access: !!portalProfile,
    portal: portalProfile
      ? {
          ...portalProfile,
          has_logged_in: hasLoggedIn,
          has_shareable_password: hasShareablePassword,
        }
      : null,
  });
}
