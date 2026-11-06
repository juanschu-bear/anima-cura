/** Patient API projection. Only the JWT-scoped RPC may supply these records. */
export type PatientInvoiceDocument = {
  id: string; invoiceNumber: string; date: string; reference: string | null;
  quarter: string; art: "BEMA" | "GOZ"; patientCents: number | null; grossCents: number | null;
  linkedOpenItemId: string | null;
  positions: Array<{date: string | null; code: string | null; text: string; region: string | null; jaw: string | null;
    quantity: number; quantityText: string; points: number | null; factor: number | null; cents: number | null;
    section: string; tariff: string; category: string | null; reasonRefs: string[]}>;
  reasons: Array<{key: string; text: string}>;
};
export function patientInvoiceProof(document: PatientInvoiceDocument) {
  return {id: document.id, quartal: document.quarter, art: document.art, pdf: true as const,
    positionen: document.positions.map(p => ({datum: p.date, nr: p.code ?? p.category, text: p.text,
      region: p.region ?? p.jaw, anzahl: p.quantity, anzahlText: p.quantityText,
      punkte: p.points, faktor: p.factor, eur: p.cents === null ? null : p.cents / 100,
      abschnitt: p.section, tarif: p.tariff, begruendungen: p.reasonRefs})),
    begruendungen: document.reasons.map(r => ({key: r.key, text: r.text})),
    pdfUrl: `/api/patient/rechnungen/${document.id}/pdf`};
}
export function attachPatientInvoiceDocuments<T extends {id:string;rechnung_nr?:string|null}>(items:T[],documents:PatientInvoiceDocument[]) {
  const linked=new Set<string>();
  const rechnungen=items.map(item=>{
    const matches=documents.filter(d=>d.linkedOpenItemId===item.id);
    if(matches.length!==1)return {...item,beleg:null};
    linked.add(matches[0].id);return {...item,beleg:patientInvoiceProof(matches[0])};
  });
  const separate=documents.filter(d=>!linked.has(d.id)).map(d=>({id:d.id,typ:"rechnungsbeleg",rechnung_datum:d.date,
    rechnung_nr:d.invoiceNumber,unser_zeichen:d.reference,betrag:(d.patientCents??d.grossCents??0)/100,
    offen:0,gezahlt:0,status:"beleg",bezahlt_am:null,mahnung_datum:null,
    paymentStatusKnown:false,paymentActionAllowed:false,beleg:patientInvoiceProof(d)}));
  // An original document without a matching open item is not a new receivable.
  return [...rechnungen,...separate];
}
