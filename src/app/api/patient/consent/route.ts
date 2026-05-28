import { NextRequest, NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: Get current consent status
export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const sc = createServerClient();
  const { data } = await sc
    .from("patient_consents")
    .select("*")
    .eq("patient_id", patient.patientId)
    .single();

  return NextResponse.json({
    consent: data || {
      portal_nutzung: false,
      digitaler_rechnungsempfang: false,
      push_benachrichtigungen: false,
      datenschutz_akzeptiert: false,
      akzeptiert_am: null,
    },
  });
}

// POST: Accept consents
export async function POST(request: NextRequest) {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const body = await request.json();
  const sc = createServerClient();

  const consentData = {
    patient_id: patient.patientId,
    portal_nutzung: body.portal_nutzung === true,
    digitaler_rechnungsempfang: body.digitaler_rechnungsempfang === true,
    push_benachrichtigungen: body.push_benachrichtigungen === true,
    datenschutz_akzeptiert: body.datenschutz_akzeptiert === true,
    akzeptiert_am: new Date().toISOString(),
    ip_adresse: request.headers.get("x-forwarded-for") || "unbekannt",
    user_agent: request.headers.get("user-agent") || "unbekannt",
  };

  // Upsert - insert or update
  const { data, error } = await sc
    .from("patient_consents")
    .upsert(consentData, { onConflict: "patient_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Fehler beim Speichern der Einwilligung" }, { status: 500 });
  }

  return NextResponse.json({ consent: data });
}
