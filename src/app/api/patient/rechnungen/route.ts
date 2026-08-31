import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";
import { resolveOpenItemAmount, resolvePaidItemAmount, resolveOpenItemStatus } from "@/lib/open-items";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  const { data: posten, error } = await supabase
    .from("offene_posten")
    .select("id, typ, rechnung_datum, rechnung_nr, unser_zeichen, betrag, offen, gezahlt, status, bezahlt_am, mahnung_datum")
    .eq("patient_id", patient.patientId)
    .order("rechnung_datum", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }

  return NextResponse.json({
    rechnungen: (posten ?? []).map((item) => ({
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
    })),
  });
}
