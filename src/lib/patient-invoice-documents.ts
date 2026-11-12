/** Patient API projection. Only the JWT-scoped RPC may supply these records. */
export type PatientInvoiceDocument = {
  patientId?: string;
  edition?: {delivered:"original"|"typeset";typesetAvailable:boolean};
  id: string; invoiceNumber: string; date: string; reference: string | null;
  quarter: string; art: "BEMA" | "GOZ"; patientCents: number | null; grossCents: number | null;
  linkedOpenItemId: string | null;
  positions: Array<{date: string | null; code: string | null; text: string; region: string | null; jaw: string | null;
    quantity: number; quantityText: string; points: number | null; factor: number | null; cents: number | null;
    section: string; tariff: string; category: string | null; reasonRefs: string[]}>;
  reasons: Array<{key: string; text: string}>;
};
export function patientInvoiceProof(document: PatientInvoiceDocument) {
  return {id: document.id, ...(document.patientId ? {patientId: document.patientId} : {}), quartal: document.quarter, art: document.art, pdf: true as const,
    positionen: document.positions.map(p => ({datum: p.date, nr: p.code ?? p.category, text: p.text,
      region: p.region ?? p.jaw, anzahl: p.quantity, anzahlText: p.quantityText,
      punkte: p.points, faktor: p.factor, eur: p.cents === null ? null : p.cents / 100,
      abschnitt: p.section, tarif: p.tariff, begruendungen: p.reasonRefs})),
    begruendungen: document.reasons.map(r => ({key: r.key, text: r.text})),
    pdfUrl: `/api/patient/rechnungen/${document.id}/pdf`,
    edition:{delivered:document.edition?.delivered??"original",typesetAvailable:document.edition?.typesetAvailable??false,
      pdfUrl:`/api/patient/rechnungen/${document.id}/pdf`,originalPdfUrl:`/api/patient/rechnungen/${document.id}/pdf?original=1`}};
}
/** Both calls use the authenticated patient client. Never retry with a privileged client. */
export async function resolvePatientInvoicePdf(rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>,id:string,originalOnly=false){
  if(!originalOnly){
    const result=await rpc("patient_invoice_document_edition",{document_id:id,original_only:false});
    if(result.error?.code==="42501")return {error:"patient_invoice_forbidden" as const,status:403};
    if(!result.error){
      if(result.data===null)return {error:"invoice_not_found" as const,status:404};
      const value=result.data as {edition?:string;pdf?:string};
      if((value.edition==="original"||value.edition==="typeset")&&typeof value.pdf==="string"){
        const bytes=Buffer.from(value.pdf,"base64");
        if(bytes.subarray(0,5).toString()==="%PDF-")return {bytes,edition:value.edition};
      }
    }
  }
  const result=await rpc("patient_invoice_document_pdf",{document_id:id});
  if(result.error)return {error:result.error.code==="42501"?"patient_invoice_forbidden":"invoice_source_unavailable",status:result.error.code==="42501"?403:503};
  if(typeof result.data!=="string"||!result.data)return {error:"invoice_not_found",status:404};
  const bytes=Buffer.from(result.data,"base64");
  if(bytes.subarray(0,5).toString()!=="%PDF-")return {error:"invoice_source_unavailable",status:503};
  return {bytes,edition:"original"};
}
export function attachPatientInvoiceDocuments<T extends {id:string;rechnung_nr?:string|null}>(items:T[],documents:PatientInvoiceDocument[]) {
  const linked=new Set<string>();
  const rechnungen=items.map(item=>{
    const matches=documents.filter(d=>d.linkedOpenItemId===item.id);
    if(matches.length!==1)return {...item,beleg:null};
    linked.add(matches[0].id);return {...item,beleg:patientInvoiceProof(matches[0])};
  });
  const separate=documents.filter(d=>!linked.has(d.id)).map(d=>({id:d.id,patientId:d.patientId,typ:"rechnungsbeleg",rechnung_datum:d.date,
    rechnung_nr:d.invoiceNumber,unser_zeichen:d.reference,betrag:(d.patientCents??d.grossCents??0)/100,
    offen:0,gezahlt:0,status:"beleg",bezahlt_am:null,mahnung_datum:null,
    paymentStatusKnown:false,paymentActionAllowed:false,beleg:patientInvoiceProof(d)}));
  // An original document without a matching open item is not a new receivable.
  return [...rechnungen,...separate];
}
