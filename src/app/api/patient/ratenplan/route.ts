import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  // Get active rate plan
  const { data: plan } = await supabase
    .from("ratenplaene")
    .select("id, gesamtbetrag, anzahl_raten, rate_betrag, start_datum, rhythmus, status")
    .eq("patient_id", patient.patientId)
    .eq("status", "aktiv")
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Kein aktiver Ratenplan" }, { status: 404 });
  }

  // Get all rates for this plan
  const { data: raten } = await supabase
    .from("raten")
    .select("id, rate_nummer, betrag, faellig_am, status, bezahlt_am, bezahlt_betrag")
    .eq("ratenplan_id", plan.id)
    .order("rate_nummer", { ascending: true });

  const allRates = raten ?? [];
  const bezahlt = allRates.filter(r => r.status === "bezahlt");
  const offen = allRates.filter(r => r.status === "offen");
  const ueberfaellig = allRates.filter(r => r.status === "überfällig");

  const investiert = bezahlt.reduce((sum, r) => sum + Number(r.bezahlt_betrag ?? r.betrag), 0);
  const offenBetrag = [...offen, ...ueberfaellig].reduce((sum, r) => sum + Number(r.betrag), 0);

  // Next due rate
  const naechsteRate = offen.length > 0 ? offen[0] : null;

  // Overdue info
  const aeltesteUeberfaellig = ueberfaellig.length > 0 ? ueberfaellig[0] : null;

  // Streak: consecutive paid rates from the end
  let streak = 0;
  for (let i = bezahlt.length - 1; i >= 0; i--) {
    const rate = bezahlt[i];
    if (rate.bezahlt_am && rate.faellig_am) {
      const bezahltDate = new Date(rate.bezahlt_am);
      const faelligDate = new Date(rate.faellig_am);
      // Paid within 5 days of due date counts as punctual
      const diffDays = (bezahltDate.getTime() - faelligDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 5) {
        streak++;
      } else {
        break;
      }
    }
  }

  return NextResponse.json({
    plan: {
      id: plan.id,
      gesamtbetrag: Number(plan.gesamtbetrag),
      anzahl_raten: plan.anzahl_raten,
      rate_betrag: Number(plan.rate_betrag),
      start_datum: plan.start_datum,
      rhythmus: plan.rhythmus,
    },
    investiert,
    offen_betrag: offenBetrag,
    raten_bezahlt: bezahlt.length,
    raten_gesamt: allRates.length,
    prozent: allRates.length > 0 ? Math.round((bezahlt.length / allRates.length) * 100) : 0,
    streak,
    naechste_rate: naechsteRate
      ? {
          betrag: Number(naechsteRate.betrag),
          faellig_am: naechsteRate.faellig_am,
        }
      : null,
    ueberfaellig: aeltesteUeberfaellig
      ? {
          betrag: Number(aeltesteUeberfaellig.betrag),
          faellig_am: aeltesteUeberfaellig.faellig_am,
          anzahl: ueberfaellig.length,
        }
      : null,
  });
}
