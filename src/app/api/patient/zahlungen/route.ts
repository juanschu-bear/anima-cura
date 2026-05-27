import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  // Get paid rates
  const { data: bezahlt } = await supabase
    .from("raten")
    .select("id, rate_nummer, betrag, faellig_am, bezahlt_am, bezahlt_betrag, status")
    .eq("patient_id", patient.patientId)
    .eq("status", "bezahlt")
    .order("bezahlt_am", { ascending: false })
    .limit(20);

  // Get overdue rates
  const { data: ueberfaellig } = await supabase
    .from("raten")
    .select("id, rate_nummer, betrag, faellig_am, status, mahnstufe")
    .eq("patient_id", patient.patientId)
    .eq("status", "überfällig")
    .order("faellig_am", { ascending: false });

  return NextResponse.json({
    zahlungen: (bezahlt ?? []).map(z => ({
      id: z.id,
      rate_nummer: z.rate_nummer,
      betrag: Number(z.bezahlt_betrag ?? z.betrag),
      faellig_am: z.faellig_am,
      bezahlt_am: z.bezahlt_am,
      status: "bezahlt" as const,
    })),
    ueberfaellige: (ueberfaellig ?? []).map(z => ({
      id: z.id,
      rate_nummer: z.rate_nummer,
      betrag: Number(z.betrag),
      faellig_am: z.faellig_am,
      status: "überfällig" as const,
      mahnstufe: z.mahnstufe,
    })),
  });
}
