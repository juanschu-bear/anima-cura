import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { resolveOpenItemAmount, resolvePaidItemAmount, resolveOpenItemStatus } from "@/lib/open-items";
import { projectInvoicePaymentGuidance } from "@/lib/patient-payment-guidance";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { attachPatientInvoiceDocuments, type PatientInvoiceDocument } from "@/lib/patient-invoice-documents";

export async function GET() {
  const session = createServerComponentClient();
  const {data:{user},error:authError}=await session.auth.getUser();
  if(authError||!user)return NextResponse.json({code:"sign_in_required"},{status:401});
  const {data:profile,error:profileError}=await session.from("user_profiles").select("role,patient_id").eq("id",user.id).maybeSingle();
  // Invoice reads never repair/reassign a profile from editable user metadata.
  if(profileError||profile?.role!=="patient"||!profile.patient_id)return NextResponse.json({code:"patient_invoice_forbidden"},{status:403});
  const patient={patientId:profile.patient_id as string};

  const supabase = createServerClient();

  const [postenResult, patientResult, directDebitResult, documentsResult, editionsResult] = await Promise.all([
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
    // Uses the patient's session. No service-role access to the billing module.
    session.rpc("patient_invoice_documents"),
    session.rpc("patient_invoice_document_editions"),
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

  const editions=new Map<string,{delivered:"original"|"typeset";typesetAvailable:boolean}>(!editionsResult.error&&Array.isArray(editionsResult.data)?editionsResult.data.map((e:{id:string;delivered:"original"|"typeset";typesetAvailable:boolean})=>[e.id,{delivered:e.delivered,typesetAvailable:e.typesetAvailable}]):[]);
  const documents:PatientInvoiceDocument[]=documentsResult.error?[]:((documentsResult.data??[]) as PatientInvoiceDocument[]).map(d=>({...d,edition:editions.get(d.id)}));
  return NextResponse.json({
    rechnungen: attachPatientInvoiceDocuments(projectInvoicePaymentGuidance(normalized, availableCredit, hasActiveDirectDebit), documents),
    belegeStatus: documentsResult.error ? "unavailable" : "available",
    zahlungsprofil: {
      guthaben: Math.max(0, availableCredit),
      lastschrift_aktiv: hasActiveDirectDebit,
    },
  }, {headers: {"Cache-Control":"private, no-store", "Vary":"Cookie", "X-Content-Type-Options":"nosniff"}});
}
