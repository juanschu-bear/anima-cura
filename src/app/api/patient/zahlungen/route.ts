import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  const { data: zahlungen, error } = await supabase
    .from("raten")
    .select("id, rate_nummer, betrag, faellig_am, bezahlt_am, bezahlt_betrag")
    .eq("patient_id", patient.patientId)
    .eq("status", "bezahlt")
    .order("bezahlt_am", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }

  return NextResponse.json({
    zahlungen: (zahlungen ?? []).map(z => ({
      id: z.id,
      rate_nummer: z.rate_nummer,
      betrag: Number(z.bezahlt_betrag ?? z.betrag),
      faellig_am: z.faellig_am,
      bezahlt_am: z.bezahlt_am,
    })),
  });
}
