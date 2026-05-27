import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

interface Badge {
  id: string;
  icon: string;
  titel: string;
  beschreibung: string;
  freigeschaltet: boolean;
}

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  // Get rate plan
  const { data: plan } = await supabase
    .from("ratenplaene")
    .select("id, gesamtbetrag, anzahl_raten")
    .eq("patient_id", patient.patientId)
    .eq("status", "aktiv")
    .maybeSingle();

  // Get all rates
  const { data: raten } = await supabase
    .from("raten")
    .select("status, faellig_am, bezahlt_am, bezahlt_betrag, betrag")
    .eq("patient_id", patient.patientId)
    .order("rate_nummer", { ascending: true });

  // Get completed phases
  const { data: phasen } = await supabase
    .from("behandlungsphasen")
    .select("status")
    .eq("patient_id", patient.patientId);

  const allRates = raten ?? [];
  const bezahlt = allRates.filter(r => r.status === "bezahlt");
  const allPhases = phasen ?? [];
  const donePhases = allPhases.filter(p => p.status === "abgeschlossen");

  // Calculate punctual streak
  let streak = 0;
  for (let i = bezahlt.length - 1; i >= 0; i--) {
    const rate = bezahlt[i];
    if (rate.bezahlt_am && rate.faellig_am) {
      const diff = (new Date(rate.bezahlt_am).getTime() - new Date(rate.faellig_am).getTime()) / (1000 * 60 * 60 * 24);
      if (diff <= 5) {
        streak++;
      } else {
        break;
      }
    }
  }

  const investiert = bezahlt.reduce((s, r) => s + Number(r.bezahlt_betrag ?? r.betrag), 0);
  const gesamt = plan ? Number(plan.gesamtbetrag) : 0;
  const pctPaid = gesamt > 0 ? (investiert / gesamt) * 100 : 0;

  const badges: Badge[] = [
    {
      id: "puenktlich-3",
      icon: "🎯",
      titel: "3 Monate pünktlich",
      beschreibung: "Drei Raten ohne Verzögerung",
      freigeschaltet: streak >= 3,
    },
    {
      id: "puenktlich-6",
      icon: "🔥",
      titel: "6 Monate pünktlich",
      beschreibung: "Sechs Raten ohne Verzögerung",
      freigeschaltet: streak >= 6,
    },
    {
      id: "puenktlich-12",
      icon: "💪",
      titel: "12 Monate pünktlich",
      beschreibung: "Zwölf Raten ohne Verzögerung",
      freigeschaltet: streak >= 12,
    },
    {
      id: "halbzeit",
      icon: "🚀",
      titel: "Halbzeit!",
      beschreibung: "Mehr als 50% investiert",
      freigeschaltet: pctPaid >= 50,
    },
    {
      id: "phase-1",
      icon: "⭐",
      titel: "Phase 1 geschafft",
      beschreibung: "Erste Behandlungsphase abgeschlossen",
      freigeschaltet: donePhases.length >= 1,
    },
    {
      id: "zielgerade",
      icon: "💎",
      titel: "Zielgerade",
      beschreibung: "75% investiert",
      freigeschaltet: pctPaid >= 75,
    },
    {
      id: "geschafft",
      icon: "🏆",
      titel: "Geschafft!",
      beschreibung: "Behandlung komplett",
      freigeschaltet: pctPaid >= 100 && bezahlt.length === allRates.length,
    },
  ];

  return NextResponse.json({
    badges,
    stats: {
      streak,
      investiert,
      gesamt,
      prozent: Math.round(pctPaid),
      raten_bezahlt: bezahlt.length,
      raten_gesamt: allRates.length,
      phasen_abgeschlossen: donePhases.length,
      phasen_gesamt: allPhases.length,
    },
  });
}
