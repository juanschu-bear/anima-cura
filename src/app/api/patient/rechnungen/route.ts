import {patientInvoiceAvailability} from "@/lib/patient-invoice-availability";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { resolveOpenItemAmount, resolvePaidItemAmount, resolveOpenItemStatus } from "@/lib/open-items";
import { projectInvoicePaymentGuidance } from "@/lib/patient-payment-guidance";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { attachPatientInvoiceDocuments, type PatientInvoiceDocument } from "@/lib/patient-invoice-documents";
import {loadUploadedPatientInvoices} from "@/lib/patient-uploaded-invoices";
import { loadPatientImmediateInvoices } from "@/lib/patient-immediate-invoices";

export async function GET() {
  const session = createServerComponentClient();
  const {data:{user},error:authError}=await session.auth.getUser();
  if(authError||!user)return NextResponse.json({code:"sign_in_required"},{status:401});
  const {data:profile,error:profileError}=await session.from("user_profiles").select("role,patient_id").eq("id",user.id).maybeSingle();
  // Invoice reads never repair/reassign a profile from editable user metadata.
  if(profileError||profile?.role!=="patient"||!profile.patient_id)return NextResponse.json({code:"patient_invoice_forbidden"},{status:403});
  const patient={patientId:profile.patient_id as string};

  const supabase = createServerClient();

  const { data: memberships,error:membershipsError } = await supabase.from("patient_access_memberships").select("patient_id").eq("user_id", user.id);
  const patientIds = Array.from(new Set([patient.patientId, ...(memberships ?? []).map(row => row.patient_id)]));
  const [postenResult, patientResult, directDebitResult, documentsResult, editionsResult, immediateResult] = await Promise.all([
    supabase
      .from("offene_posten")
      .select("id, patient_id, typ, rechnung_datum, rechnung_nr, unser_zeichen, betrag, offen, gezahlt, status, bezahlt_am, mahnung_datum")
      .in("patient_id", patientIds)
      .or("nicht_mahnen.is.null,nicht_mahnen.eq.false")
      .order("rechnung_datum", { ascending: false })
      .limit(200),
    supabase
      .from("patients")
      .select("id,guthaben")
      .in("id", patientIds),
    supabase
      .from("ratenplaene")
      .select("id,patient_id")
      .in("patient_id", patientIds)
      .eq("status", "aktiv")
      .eq("sepa_mandat", true)
      .limit(1),
    // Uses the patient's session. No service-role access to the billing module.
    session.rpc("patient_invoice_documents_for_access"),
    session.rpc("patient_invoice_document_editions"),
    loadPatientImmediateInvoices(patientIds).then(items => ({items,status:"available" as const}))
      .catch(() => ({items:[],status:"unavailable" as const})),
  ]);

  const { data: posten, error } = postenResult;

  const paymentUnavailable=Boolean(error||patientResult.error||directDebitResult.error||membershipsError);

  const normalized = (paymentUnavailable?[]:posten??[]).map((item) => ({
      patientId: item.patient_id,
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
  const credits = new Map((patientResult.data ?? []).map(row => [row.id, Number(row.guthaben ?? 0)]));
  const directDebitPatients = new Set((directDebitResult.data ?? []).map(row => row.patient_id));
  const guided = patientIds.flatMap(patientId => projectInvoicePaymentGuidance(
    normalized.filter(item => item.patientId === patientId),
    credits.get(patientId) ?? 0,
    directDebitPatients.has(patientId),
  ));

  const editions=new Map<string,{delivered:"original"|"typeset";typesetAvailable:boolean}>(!editionsResult.error&&Array.isArray(editionsResult.data)?editionsResult.data.map((e:{id:string;delivered:"original"|"typeset";typesetAvailable:boolean})=>[e.id,{delivered:e.delivered,typesetAvailable:e.typesetAvailable}]):[]);
  const documents:PatientInvoiceDocument[]=documentsResult.error?[]:((documentsResult.data??[]) as PatientInvoiceDocument[]).map(d=>({...d,edition:editions.get(d.id)}));
  const uploads=await loadUploadedPatientInvoices(supabase,patientIds,new Set(documents.map(d=>d.id)))
    .then(items=>({items,status:"available" as const}))
    .catch(()=>({items:[],status:"unavailable" as const}));
  const availability=patientInvoiceAvailability({documents:documentsResult.error,editions:editionsResult.error,memberships:membershipsError});
  if(availability.status==="unavailable"){
    // Operational evidence only: no patient, invoice, JWT or database error text.
    const recorded=await supabase.from("audit_log").insert({id:crypto.randomUUID(),tabelle:"patient_invoice_read",
      datensatz_id:crypto.randomUUID(),aktion:"INSERT",neue_werte:{code:availability.code,checkedAt:availability.checkedAt}});
    if(recorded.error)console.error("patient_invoice_read_alert_unavailable");
  }
  return NextResponse.json({
    belegVerfuegbarkeit:availability,
    rechnungen: [...attachPatientInvoiceDocuments(guided, documents),...uploads.items],
    hochgeladeneRechnungenStatus: uploads.status,
    zahlungsdatenStatus: paymentUnavailable?"unavailable":"available",
    sofortrechnungen: immediateResult.items,
    sofortrechnungenStatus: immediateResult.status,
    belegeStatus: availability.status,
    zahlungsprofil: {
      guthaben: Math.max(0, credits.get(patient.patientId) ?? 0),
      lastschrift_aktiv: directDebitPatients.has(patient.patientId),
    },
  }, {headers: {"Cache-Control":"private, no-store", "Vary":"Cookie", "X-Content-Type-Options":"nosniff"}});
}
