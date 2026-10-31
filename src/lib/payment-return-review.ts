/** Read-only evidence review. Never a payment/fee decision or an executable mutation plan. */
export interface ReturnBankRow {
  id: string; providerId: string; connectionId: string | null; accountId: string | null;
  amount: number | string | null; date: string | null; currency: string | null;
  purpose: string | null; reference: string | null; counterpartIban: string | null;
  potentialDuplicate?: boolean; adjustingEntry?: boolean;
}
export interface ReturnWorkingRow {
  id: string; providerId: string; connectionId: string | null;
  amount: number | string | null; patientId: string | null; matchingStatus: string | null;
}
export interface ReturnAllocation {
  id: string; transactionId: string; patientId: string; amountCents: number;
  state: string; reversalOf: string | null;
}
export interface ReturnInvoiceAllocation {
  id: string; patientAllocationId: string; invoiceId: string;
  amountCents: number; state: string; reversalOf: string | null;
}
export interface ReturnRate { id: string; patientId: string; transactionId: string | null }
export type ReturnReviewReason = 'source_invalid'|'reference_missing'|'original_missing'|'original_ambiguous'|
  'source_conflict'|'amount_difference'|'working_source_missing'|'patient_assignment_unconfirmed'|
  'allocation_missing_or_incomplete'|'prior_decision'|'invoice_allocation_conflict'|'rate_patient_conflict'|
  'multiple_returns'|'evidence_linked';
export interface BankReturnReview {
  returnId: string; originalId: string | null; transactionId: string | null;
  patientId: string | null; returnCents: number | null;
  reason: ReturnReviewReason; canApply: false;
  affectedInvoiceIds: string[]; affectedRateIds: string[];
}

// Do not round uncertain input into a financially valid amount.
export function bankAmountCents(value: number | string | null): number | null {
  if(value===null || !/^-?\d+(?:\.\d{1,2})?$/.test(String(value)))return null;
  const [whole, fraction='']=String(value).replace('-','').split('.');
  const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return Number.isSafeInteger(cents)?(String(value).startsWith('-')?-cents:cents):null;
}

// Text is only a return INDICATION, not a confirmed banking event. Bank codes are
// deliberately not guessed. Unknown formats remain outside this narrow detector.
export function hasBankReturnIndication(purpose: string | null): boolean {
  const text=(purpose||'').normalize('NFKC').toLowerCase();
  if(/\b(?:keine?|ohne|not|no)\s+(?:eine?\s+)?(?:rücklastschrift|ruecklastschrift|lastschriftrückgabe|direct debit return)\b/i.test(text))return false;
  return /(?:\b(?:rücklastschrift|ruecklastschrift|lastschriftrückgabe|lastschriftrueckgabe)\b|\b(?:rückgabe|rueckgabe)\b[^\n]{0,40}\blastschrift\b|\bdirect debit return\b)/i.test(text);
}
function reference(value: string | null): string | null {
  const result=value?.trim();
  if(!result||/^(?:notprovided|not provided|nonref|noref|none|unknown|null|n\/a|-|0+)$/i.test(result))return null;
  // References remain case-sensitive: never fuzzy-match transaction identifiers.
  return result;
}
function dateValid(value: string | null): value is string {
  return !!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
function scope(row: ReturnBankRow) {return JSON.stringify([row.connectionId,row.accountId,row.currency,reference(row.reference)]);}

export function reviewBankReturns(input: {
  bank: ReturnBankRow[]; working: ReturnWorkingRow[]; allocations: ReturnAllocation[];
  invoiceAllocations: ReturnInvoiceAllocation[]; rates: ReturnRate[];
}): BankReturnReview[] {
  const {bank,working,allocations,invoiceAllocations,rates}=input;
  const incoming=new Map<string,ReturnBankRow[]>();
  for(const row of bank){if((bankAmountCents(row.amount)??0)>0){const key=scope(row);incoming.set(key,[...(incoming.get(key)||[]),row]);}}
  const findings=bank.filter(row=>Number(row.amount)<0&&hasBankReturnIndication(row.purpose)).map(row=>{
    const cents=bankAmountCents(row.amount);
    const result:BankReturnReview={returnId:row.id,originalId:null,transactionId:null,patientId:null,
      returnCents:cents===null?null:Math.abs(cents),reason:'source_invalid',canApply:false,affectedInvoiceIds:[],affectedRateIds:[]};
    const finish=(reason:ReturnReviewReason)=>({...result,reason});
    if(cents===null||!row.id||!row.providerId||!row.connectionId||!row.accountId||row.currency!=='EUR'||!dateValid(row.date)||row.potentialDuplicate||row.adjustingEntry)return finish('source_invalid');
    if(bank.filter(r=>r.providerId===row.providerId).length!==1)return finish('source_conflict');
    if(!reference(row.reference))return finish('reference_missing');
    const originals=(incoming.get(scope(row))||[]).filter(r=>dateValid(r.date)&&r.date<=row.date!);
    if(!originals.length)return finish('original_missing');
    if(originals.length!==1)return finish('original_ambiguous');
    const original=originals[0];result.originalId=original.id;
    if(bank.filter(r=>r.providerId===original.providerId).length!==1||original.potentialDuplicate||original.adjustingEntry)return finish('source_conflict');
    const cleanIban=(v:string|null)=>v?.replace(/\s/g,'').toUpperCase();
    if(row.counterpartIban&&original.counterpartIban&&cleanIban(row.counterpartIban)!==cleanIban(original.counterpartIban))return finish('source_conflict');
    // Partial returns and combined fees cannot be represented by mirroring the
    // existing full-allocation reversals. Never derive a fee from the difference.
    if(bankAmountCents(original.amount)!==result.returnCents)return finish('amount_difference');
    const sources=working.filter(w=>w.providerId===original.providerId);
    if(sources.length!==1)return finish('working_source_missing');
    const tx=sources[0];result.transactionId=tx.id;
    if(tx.connectionId!==original.connectionId||bankAmountCents(tx.amount)!==result.returnCents)return finish('source_conflict');
    if(!tx.patientId||!['auto','manuell'].includes(tx.matchingStatus||''))return finish('patient_assignment_unconfirmed');
    const history=allocations.filter(a=>a.transactionId===tx.id);
    if(history.some(a=>!['confirmed_auto','confirmed_manual'].includes(a.state)||a.reversalOf))return finish('prior_decision');
    if(!history.length||history.some(a=>a.patientId!==tx.patientId||!Number.isSafeInteger(a.amountCents)||a.amountCents<=0)||history.reduce((s,a)=>s+a.amountCents,0)!==result.returnCents)return finish('allocation_missing_or_incomplete');
    if(new Set(history.map(a=>a.id)).size!==history.length)return finish('source_conflict');
    const allocationIds=new Set(history.map(a=>a.id));
    const invoiceHistory=invoiceAllocations.filter(a=>allocationIds.has(a.patientAllocationId));
    if(invoiceHistory.some(a=>!['allocated_auto','allocated_manual'].includes(a.state)||a.reversalOf||!Number.isSafeInteger(a.amountCents)||a.amountCents<=0))return finish('invoice_allocation_conflict');
    if(new Set(invoiceHistory.map(a=>a.id)).size!==invoiceHistory.length)return finish('invoice_allocation_conflict');
    for(const allocation of history){if(invoiceHistory.filter(a=>a.patientAllocationId===allocation.id).reduce((s,a)=>s+a.amountCents,0)>allocation.amountCents)return finish('invoice_allocation_conflict');}
    const linkedRates=rates.filter(r=>r.transactionId===tx.id);
    if(linkedRates.some(r=>r.patientId!==tx.patientId))return finish('rate_patient_conflict');
    result.patientId=tx.patientId;
    result.affectedInvoiceIds=Array.from(new Set(invoiceHistory.map(a=>a.invoiceId))).sort();
    result.affectedRateIds=Array.from(new Set(linkedRates.map(r=>r.id))).sort();
    return finish('evidence_linked');
  });
  // Two distinct return bookings must never each reverse the same incoming payment.
  for(const finding of findings){if(finding.originalId&&findings.filter(f=>f.originalId===finding.originalId).length>1){finding.reason='multiple_returns';}}
  return findings;
}
