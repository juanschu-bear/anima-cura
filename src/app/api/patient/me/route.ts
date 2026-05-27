import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  const { data: record, error } = await supabase
    .from("patients")
    .select("id, vorname, nachname, behandlung, behandlung_start, behandlung_status, email, telefon")
    .eq("id", patient.patientId)
    .single();

  if (error || !record) {
    return NextResponse.json({ error: "Patient nicht gefunden" }, { status: 404 });
  }

  const { data: activePhase } = await supabase
    .from("behandlungsphasen")
    .select("name, status, reihenfolge")
    .eq("patient_id", patient.patientId)
    .eq("status", "aktiv")
    .maybeSingle();

  const { count: totalPhases } = await supabase
    .from("behandlungsphasen")
    .select("*", { count: "exact", head: true })
    .eq("patient_id", patient.patientId);

  return NextResponse.json({
    id: record.id,
    vorname: record.vorname,
    nachname: record.nachname,
    behandlung: record.behandlung,
    behandlung_start: record.behandlung_start,
    behandlung_status: record.behandlung_status,
    aktuelle_phase: activePhase?.name ?? null,
    aktuelle_phase_nr: activePhase?.reihenfolge ?? null,
    phasen_gesamt: totalPhases ?? 0,
  });
}
