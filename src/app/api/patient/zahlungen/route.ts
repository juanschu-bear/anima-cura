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
    .select("id, rate_nummer, betrag, faellig_am, bezahlt_am, bezahlt_betrag, status, transaktion_id")
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

  const linkedTransactionIds = new Set(
    (bezahlt ?? [])
      .map((z) => z.transaktion_id)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );

  const { data: transaktionen } = await supabase
    .from("transaktionen")
    .select("id, betrag, datum, matching_status")
    .eq("matched_patient_id", patient.patientId)
    .gt("betrag", 0)
    .in("matching_status", ["auto", "manuell"])
    .order("datum", { ascending: false })
    .limit(20);

  const transaktionsZahlungen = (transaktionen ?? [])
    .filter((tx) => !linkedTransactionIds.has(tx.id))
    .map((tx) => ({
      id: `tx-${tx.id}`,
      rate_nummer: 0,
      betrag: Number(tx.betrag),
      faellig_am: tx.datum,
      bezahlt_am: tx.datum,
      status: "bezahlt" as const,
    }));

  return NextResponse.json({
    zahlungen: [
      ...(bezahlt ?? []).map(z => ({
        id: z.id,
        rate_nummer: z.rate_nummer,
        betrag: Number(z.bezahlt_betrag ?? z.betrag),
        faellig_am: z.faellig_am,
        bezahlt_am: z.bezahlt_am,
        status: "bezahlt" as const,
      })),
      ...transaktionsZahlungen,
    ].sort((a, b) => new Date(b.bezahlt_am ?? b.faellig_am).getTime() - new Date(a.bezahlt_am ?? a.faellig_am).getTime()),
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
