import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("pid") || "f3202533-6032-4c74-b9e1-869c1c05e259";
  
  const supabase = createServerClient();

  const { data: plans } = await supabase
    .from("ratenplaene")
    .select("id, gesamtbetrag, anzahl_raten, rate_betrag, start_datum, status, created_at")
    .eq("patient_id", patientId);

  const { data: patient } = await supabase
    .from("patients")
    .select("id, vorname, nachname, portal_zugang, behandlungsart")
    .eq("id", patientId)
    .maybeSingle();

  let raten = null;
  if (plans && plans.length > 0) {
    const { data } = await supabase
      .from("raten")
      .select("rate_nummer, betrag, faellig_am, status, bezahlt_am, created_at")
      .eq("ratenplan_id", plans[0].id)
      .order("rate_nummer", { ascending: true })
      .limit(5);
    raten = data;
  }

  return NextResponse.json({ patient, plans, raten_sample: raten });
}
