import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";
import { resolveOpenItemAmount, resolvePaidItemAmount, resolveOpenItemStatus } from "@/lib/open-items";
import { projectInvoicePaymentGuidance } from "@/lib/patient-payment-guidance";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  const [postenResult, patientResult, directDebitResult] = await Promise.all([
    supabase
      .from("offene_posten")
      .select("id, typ, rechnung_datum, rechnung_nr, unser_zeichen, betrag, offen, gezahlt, status, bezahlt_am, mahnung_datum")
      .eq("patient_id", patient.patientId)
      .or("nicht_mahnen.is.null,nicht_mahnen.eq.false")
      .order("rechnung_datum", { ascending: false })
      .limit(200),
    supabase
      .from("patients")
      .select("guthaben")
      .eq("id", patient.patientId)
      .single(),
    supabase
      .from("ratenplaene")
      .select("id")
      .eq("patient_id", patient.patientId)
      .eq("status", "aktiv")
      .eq("sepa_mandat", true)
      .limit(1),
  ]);

  const { data: posten, error } = postenResult;

  if (error || patientResult.error || directDebitResult.error) {
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }

  const normalized = (posten ?? []).map((item) => ({
      id: item.id,
      typ: item.typ,
      rechnung_datum: item.rechnung_datum,
      rechnung_nr: item.rechnung_nr,
      unser_zeichen: item.unser_zeichen,
      betrag: Number(item.betrag ?? 0),
      offen: resolveOpenItemAmount(item),
      gezahlt: resolvePaidItemAmount(item),
      status: resolveOpenItemStatus(item),
      bezahlt_am: item.bezahlt_am,
      mahnung_datum: item.mahnung_datum,
    }));
  const availableCredit = Number(patientResult.data?.guthaben ?? 0);
  const hasActiveDirectDebit = (directDebitResult.data?.length ?? 0) > 0;

  return NextResponse.json({
    rechnungen: projectInvoicePaymentGuidance(normalized, availableCredit, hasActiveDirectDebit).slice(0, 20),
    zahlungsprofil: {
      guthaben: Math.max(0, availableCredit),
      lastschrift_aktiv: hasActiveDirectDebit,
    },
  });
}
