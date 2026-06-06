import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

// Anima Balance des eingeloggten Patienten: Saldo + Bewegungen.
// Liefert auch ivoris-Nummer und Nachname fuer den Aufladungs-
// GiroCode (Zweck: AUFLADUNG <nummer> <nachname>).
export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  const [buchungenRes, stammRes] = await Promise.all([
    supabase
      .from("anima_balance_buchungen")
      .select("id, betrag, typ, beschreibung, created_at")
      .eq("patient_id", patient.patientId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("patients")
      .select("ivoris_nummer, nachname")
      .eq("id", patient.patientId)
      .single(),
  ]);

  const buchungen = buchungenRes.data || [];
  const saldo = buchungen.length
    ? (await supabase
        .from("anima_balance_salden")
        .select("saldo")
        .eq("patient_id", patient.patientId)
        .maybeSingle()).data?.saldo ?? 0
    : 0;

  return NextResponse.json({
    saldo: Number(saldo),
    buchungen,
    ivoris_nummer: stammRes.data?.ivoris_nummer || "",
    nachname: stammRes.data?.nachname || "",
  });
}
