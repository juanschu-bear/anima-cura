import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  const { data: phasen, error } = await supabase
    .from("behandlungsphasen")
    .select("id, name, beschreibung, status, reihenfolge, start_datum, end_datum, video_url")
    .eq("patient_id", patient.patientId)
    .order("reihenfolge", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }

  return NextResponse.json({
    phasen: (phasen ?? []).map(p => ({
      id: p.id,
      name: p.name,
      beschreibung: p.beschreibung,
      status: p.status,
      reihenfolge: p.reihenfolge,
      start_datum: p.start_datum,
      end_datum: p.end_datum,
    })),
  });
}
