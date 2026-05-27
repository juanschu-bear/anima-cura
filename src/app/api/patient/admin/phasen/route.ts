import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkPraxisAuth(): Promise<{ ok: true } | NextResponse> {
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
  return { ok: true };
}

// GET - list phases for a patient
export async function GET(request: NextRequest) {
  const auth = await checkPraxisAuth();
  if (auth instanceof NextResponse) return auth;

  const patientId = request.nextUrl.searchParams.get("patient_id");
  if (!patientId) return NextResponse.json({ error: "patient_id erforderlich" }, { status: 400 });

  const serviceClient = createServerClient();
  const { data: phasen } = await serviceClient
    .from("behandlungsphasen")
    .select("id, name, beschreibung, status, reihenfolge, start_datum, end_datum")
    .eq("patient_id", patientId)
    .order("reihenfolge", { ascending: true });

  return NextResponse.json({ phasen: phasen || [] });
}

// POST - create a new phase
export async function POST(request: NextRequest) {
  const auth = await checkPraxisAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { patient_id, name, beschreibung, status, reihenfolge, start_datum, end_datum } = body;

  if (!patient_id || !name) {
    return NextResponse.json({ error: "patient_id und name sind erforderlich" }, { status: 400 });
  }

  const serviceClient = createServerClient();
  const { data: phase, error } = await serviceClient
    .from("behandlungsphasen")
    .insert({
      patient_id,
      name,
      beschreibung: beschreibung || null,
      status: status || "ausstehend",
      reihenfolge: reihenfolge || 1,
      start_datum: start_datum || null,
      end_datum: end_datum || null,
    })
    .select("id, name, beschreibung, status, reihenfolge, start_datum, end_datum")
    .single();

  if (error) {
    return NextResponse.json({ error: "Fehler: " + error.message }, { status: 500 });
  }

  return NextResponse.json({ phase });
}

// PUT - update an existing phase
export async function PUT(request: NextRequest) {
  const auth = await checkPraxisAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { id, name, beschreibung, status, reihenfolge, start_datum, end_datum } = body;

  if (!id) {
    return NextResponse.json({ error: "id ist erforderlich" }, { status: 400 });
  }

  const serviceClient = createServerClient();

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (beschreibung !== undefined) updateData.beschreibung = beschreibung;
  if (status !== undefined) updateData.status = status;
  if (reihenfolge !== undefined) updateData.reihenfolge = reihenfolge;
  if (start_datum !== undefined) updateData.start_datum = start_datum;
  if (end_datum !== undefined) updateData.end_datum = end_datum;

  const { data: phase, error } = await serviceClient
    .from("behandlungsphasen")
    .update(updateData)
    .eq("id", id)
    .select("id, name, beschreibung, status, reihenfolge, start_datum, end_datum")
    .single();

  if (error) {
    return NextResponse.json({ error: "Fehler: " + error.message }, { status: 500 });
  }

  return NextResponse.json({ phase });
}
