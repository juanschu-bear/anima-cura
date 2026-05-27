import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  // Get current active phase
  const { data: activePhase } = await supabase
    .from("behandlungsphasen")
    .select("name")
    .eq("patient_id", patient.patientId)
    .eq("status", "aktiv")
    .maybeSingle();

  if (!activePhase) {
    return NextResponse.json({ tipps: [], phase: null });
  }

  // Get tips for this phase
  const { data: tipps, error } = await supabase
    .from("pflegetipps")
    .select("id, titel, text, reihenfolge")
    .eq("behandlungsphase", activePhase.name)
    .eq("aktiv", true)
    .order("reihenfolge", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }

  return NextResponse.json({
    phase: activePhase.name,
    tipps: (tipps ?? []).map(t => ({
      id: t.id,
      titel: t.titel,
      text: t.text,
    })),
  });
}
