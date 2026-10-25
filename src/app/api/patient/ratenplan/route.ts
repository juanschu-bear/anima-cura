import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";
import { resolveRateAmounts, summarizeOpenItems, summarizeRates as summarizeRateFinance } from "@/lib/patient-finance";

export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ error: "Finanzdaten konnten nicht geladen werden." }, { status: 503 });
}

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  // Get active rate plan
  const { data: plan, error: planError } = await supabase
    .from("ratenplaene")
    .select("id, gesamtbetrag, anzahl_raten, rate_betrag, start_datum, rhythmus, status, sepa_mandat")
    .eq("patient_id", patient.patientId)
    .eq("status", "aktiv")
    .limit(1)
    .maybeSingle();
  if (planError) return unavailable();

  const summarizeRates = (
    rates: Array<{
      betrag: number | string | null;
      status: string | null;
      bezahlt_betrag?: number | string | null;
      bezahlt_am?: string | null;
      faellig_am?: string | null;
    }>,
  ) => {
    rates = rates.filter(r => r.status !== "storniert" && r.status !== "erloesminderung");
    const finance = summarizeRateFinance(rates);
    const bezahlt = rates.filter(r => r.status === "bezahlt");
    const offen = rates.filter(r => r.status === "offen");
    const ueberfaellig = rates.filter(r => (r.status === "überfällig" || r.status === "ueberfaellig") && resolveRateAmounts(r).open > 0);
    const teilbezahlt = rates.filter(r => r.status === "teilbezahlt");

    const naechsteRate = [...offen, ...teilbezahlt]
      .filter(r => r.faellig_am && resolveRateAmounts(r).open > 0)
      .sort((a, b) => new Date(a.faellig_am!).getTime() - new Date(b.faellig_am!).getTime())[0] ?? null;
    const aeltesteUeberfaellig = ueberfaellig
      .filter(r => r.faellig_am)
      .sort((a, b) => new Date(a.faellig_am!).getTime() - new Date(b.faellig_am!).getTime())[0] ?? null;

    let streak = 0;
    const bezahltChronologisch = [...bezahlt].sort((a, b) => new Date(a.faellig_am ?? 0).getTime() - new Date(b.faellig_am ?? 0).getTime());
    for (let i = bezahltChronologisch.length - 1; i >= 0; i--) {
      const rate = bezahltChronologisch[i];
      if (rate.bezahlt_am && rate.faellig_am) {
        const bezahltDate = new Date(rate.bezahlt_am);
        const faelligDate = new Date(rate.faellig_am);
        const diffDays = (bezahltDate.getTime() - faelligDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays <= 5) streak++;
        else break;
      }
    }

    return {
      investiert: finance.bezahltBetrag,
      offen_betrag: finance.restschuld,
      raten_bezahlt: bezahlt.length,
      raten_gesamt: rates.length,
      prozent: rates.length > 0 ? Math.round((bezahlt.length / rates.length) * 100) : 0,
      streak,
      naechste_rate: naechsteRate
        ? {
            betrag: resolveRateAmounts(naechsteRate).open,
            faellig_am: naechsteRate.faellig_am!,
          }
        : null,
      ueberfaellig: aeltesteUeberfaellig
        ? {
            betrag: resolveRateAmounts(aeltesteUeberfaellig).open,
            faellig_am: aeltesteUeberfaellig.faellig_am!,
            anzahl: ueberfaellig.length,
          }
        : null,
    };
  };

  if (!plan) {
    const [{ data: patientRates, error: ratesError }, { data: offenePosten, error: itemsError }, { data: transaktionen, error: transactionsError }] = await Promise.all([
      supabase
        .from("raten")
        .select("id, rate_nummer, betrag, faellig_am, status, bezahlt_am, bezahlt_betrag")
        .eq("patient_id", patient.patientId)
        .order("faellig_am", { ascending: true }),
      supabase
        .from("offene_posten")
        .select("id, betrag, gezahlt, offen, status, rechnung_datum")
        .eq("patient_id", patient.patientId)
        .or("nicht_mahnen.is.null,nicht_mahnen.eq.false")
        .in("status", ["offen", "teilbezahlt"]),
      supabase
        .from("transaktionen")
        .select("id, betrag, datum")
        .eq("matched_patient_id", patient.patientId)
        .gt("betrag", 0)
        .in("matching_status", ["auto", "manuell"]),
    ]);
    if (ratesError || itemsError || transactionsError) return unavailable();

    const rates = patientRates ?? [];
    if (rates.length > 0) {
      return NextResponse.json({
        plan: null,
        has_financial_data: true,
        financial_source: "patient_rates",
        ...summarizeRates(rates),
      });
    }

    const offene = offenePosten ?? [];
    const zahlungen = transaktionen ?? [];
    const openItemsSummary = summarizeOpenItems(offene);
    const offenBetrag = openItemsSummary.restschuld;
    const investiert = zahlungen.reduce((sum, tx) => sum + Number(tx.betrag ?? 0), 0);
    const total = investiert + offenBetrag;

    return NextResponse.json({
      plan: null,
      has_financial_data: investiert > 0 || offenBetrag > 0,
      financial_source: (investiert > 0 || offenBetrag > 0) ? "open_items" : "none",
      investiert,
      offen_betrag: offenBetrag,
      raten_bezahlt: zahlungen.length,
      raten_gesamt: zahlungen.length + offene.length,
      prozent: total > 0 ? Math.round((investiert / total) * 100) : 0,
      streak: 0,
      naechste_rate: null,
      ueberfaellig: null,
    });
  }

  // Get all rates for this plan
  const { data: raten, error: ratesError } = await supabase
    .from("raten")
    .select("id, rate_nummer, betrag, faellig_am, status, bezahlt_am, bezahlt_betrag")
    .eq("ratenplan_id", plan.id)
    .order("rate_nummer", { ascending: true });
  if (ratesError) return unavailable();

  const summary = summarizeRates(raten ?? []);

  return NextResponse.json({
    plan: {
      id: plan.id,
      gesamtbetrag: Number(plan.gesamtbetrag),
      anzahl_raten: plan.anzahl_raten,
      rate_betrag: Number(plan.rate_betrag),
      start_datum: plan.start_datum,
      rhythmus: plan.rhythmus,
      sepa_mandat: Boolean(plan.sepa_mandat),
    },
    has_financial_data: true,
    financial_source: "plan",
    ...summary,
  });
}
