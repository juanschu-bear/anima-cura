import { NextRequest, NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  const { data: notifs, error } = await supabase
    .from("patient_notifications")
    .select("id, typ, titel, text, gelesen, geoeffnet_am, bestaetigt_am, created_at")
    .eq("patient_id", patient.patientId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }

  // Kein Auto-Gelesen mehr: Lesen (geoeffnet) und Bestaetigen sind ab
  // jetzt bewusste, einzeln getrackte Handlungen des Patienten.
  const ungelesen = (notifs ?? []).filter(n => !n.bestaetigt_am).length;

  return NextResponse.json({ benachrichtigungen: notifs ?? [], ungelesen });
}

// Markiert eine Benachrichtigung als geoeffnet (aufgeklappt) oder
// bestaetigt (Haken). Beides mit Zeitstempel, beweisbar pro Nachricht.
export async function POST(request: NextRequest) {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const { id, aktion } = await request.json();
  if (!id || !["geoeffnet", "bestaetigt"].includes(aktion)) {
    return NextResponse.json({ error: "id und aktion (geoeffnet|bestaetigt) erforderlich" }, { status: 400 });
  }

  const supabase = createServerClient();
  const patch: Record<string, unknown> = aktion === "geoeffnet"
    ? { geoeffnet_am: new Date().toISOString(), gelesen: true }
    : { bestaetigt_am: new Date().toISOString(), gelesen: true };

  const { error } = await supabase
    .from("patient_notifications")
    .update(patch)
    .eq("id", id)
    .eq("patient_id", patient.patientId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
