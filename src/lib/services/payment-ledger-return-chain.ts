import {reviewBankReturns, type BankReturnReview, type ReturnRate} from '../payment-return-review';

/** Pure read model: no database, booking, mutation plan, scheduler or mail transport. */
export type ReturnChainSources = Parameters<typeof reviewBankReturns>[0];
export interface ReturnClaim {
  id: string;
  patientId: string;
  totalCents: number | null;
  paidCents: number | null;
  openCents: number | null;
  dueDate: string | null;
  status: string | null;
  dunningBlocked: boolean | null;
}
export interface ReturnChainInput extends Omit<ReturnChainSources, 'rates'> {
  rates: Array<ReturnRate & ReturnClaim>;
  invoices: ReturnClaim[];
  /** True only after all pages and related histories have been read successfully. */
  complete: boolean;
  snapshotId: string;
  asOf: string;
  graceDays: number;
  patientControls: Array<{patientId: string; dunningBlocked: boolean | null}>;
}
export interface ReturnClaimPreview {
  kind: 'invoice' | 'rate';
  id: string;
  patientId: string;
  returnIds: string[];
  currentPaidCents: number | null;
  currentOpenCents: number | null;
  returnedPrincipalCents: number | null;
  previewPaidCents: number | null;
  previewOpenCents: number | null;
  dueDate: string | null;
  reasons: string[];
  dunning: ReturnDunningReview;
}
export interface ReturnDunningReview {
  status: 'blocked' | 'settled' | 'not_due' | 'within_grace' | 'review_required';
  reasons: string[];
  daysPastDue: number | null;
  canSend: false;
}
export interface ReturnBookingChain {
  returnId: string;
  originalId: string | null;
  transactionId: string | null;
  patientId: string | null;
  evidenceReason: BankReturnReview['reason'];
  originalCents: number | null;
  debitedCents: number | null;
  principalPreviewCents: number | null;
  unresolvedDifferenceCents: number | null;
  bankFeeCents: null;
  patientFeeCents: null;
  invoiceLinks: Array<{id: string; principalCents: number}>;
  rateLinks: Array<{id: string; principalCents: number}>;
  unassignedInvoicePrincipalCents: number | null;
  reasons: string[];
  canApply: false;
}
export interface PatientReturnChain {
  patientId: string;
  returnIds: string[];
  invoices: ReturnClaimPreview[];
  rates: ReturnClaimPreview[];
  affectedInvoicesCurrentOpenCents: number | null;
  affectedInvoicesPreviewOpenCents: number | null;
  affectedRatesCurrentOpenCents: number | null;
  affectedRatesPreviewOpenCents: number | null;
  /** Invoice and instalment views may describe the same debt: never add them. */
  combinedOpenCents: null;
  dunning: ReturnDunningReview;
}
export interface ReturnChainReview {
  version: 1;
  mode: 'read_only_preview';
  snapshotId: string;
  asOf: string;
  complete: boolean;
  /** A scenario, not a bank-confirmed return or the persisted receivable. */
  assumption: 'full_original_principal_returned';
  bookings: ReturnBookingChain[];
  patients: PatientReturnChain[];
  reasons: string[];
  canApply: false;
  canSend: false;
}

const validMoney = (n: number | null): n is number => Number.isSafeInteger(n) && n! >= 0;
const sum = (values: Array<number | null>): number | null => {
  if(values.some(n=>!validMoney(n)))return null;
  const total=values.reduce<number>((s,n)=>s+n!,0);
  return Number.isSafeInteger(total)?total:null;
};
const unique = (values: string[]) => Array.from(new Set(values)).sort();
function day(value: string | null): number | null {
  if(!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const n=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n/86400000:null;
}
function repeatedIds(rows: Array<{id: string}>) {return rows.some(r=>!r.id)||new Set(rows.map(r=>r.id)).size!==rows.length;}
const held = (reasons: string[]): ReturnDunningReview => ({status:'blocked',reasons:unique(reasons),daysPastDue:null,canSend:false});
function dunning(claim: ReturnClaim | undefined, open: number | null, reasons: string[], input: ReturnChainInput): ReturnDunningReview {
  const blocks=[...reasons];
  if(claim?.dunningBlocked!==false)blocks.push(claim?.dunningBlocked?'claim_dunning_block':'claim_dunning_control_unknown');
  const control=input.patientControls.filter(p=>p.patientId===claim?.patientId);
  if(control.length!==1||control[0].dunningBlocked!==false)blocks.push('patient_dunning_control');
  const due=day(claim?.dueDate??null),asOf=day(input.asOf);
  if(due===null)blocks.push('due_date_unknown');
  if(asOf===null||!Number.isSafeInteger(input.graceDays)||input.graceDays<0)blocks.push('dunning_policy_invalid');
  if(open===null)blocks.push('balance_unknown');
  if(blocks.length)return held(blocks);
  const days=asOf!-due!;
  return {status:open===0?'settled':days<=0?'not_due':days<=input.graceDays?'within_grace':'review_required',
    reasons:open!>0&&days>input.graceDays?['manual_return_and_dunning_review']:[],daysPastDue:Math.max(0,days),canSend:false};
}

export function buildReturnChainReview(input: ReturnChainInput): ReturnChainReview {
  const global: string[]=[];
  if(!input.complete)global.push('source_read_incomplete');
  if(!input.snapshotId.trim()||day(input.asOf)===null)global.push('snapshot_invalid');
  if([input.bank,input.working,input.allocations,input.invoiceAllocations,input.invoices,input.rates].some(repeatedIds))global.push('duplicate_source_id');
  const findings=reviewBankReturns(input);
  const byAllocation=new Map(input.allocations.map(a=>[a.id,a]));
  const byInvoiceAllocation=new Map(input.invoiceAllocations.map(a=>[a.id,a]));
  const bookings: ReturnBookingChain[]=findings.map((f): ReturnBookingChain=>{
    const reasons=[...global];
    const source=input.bank.find(b=>b.id===f.returnId);
    if(source?.date&&day(source.date)!>day(input.asOf)!)reasons.push('return_after_as_of');
    if(!['evidence_linked','amount_difference'].includes(f.reason))reasons.push(f.reason);
    if(f.amounts&&f.amounts.differenceCents<0)reasons.push('partial_return_requires_allocation');
    const eligible=reasons.length===0&&f.patientId!==null&&f.amounts!==null;
    const principal=eligible?f.amounts!.originalCents:null;
    // Explicit invoice allocations only. No FIFO, name, amount or date inference.
    const allocated=input.allocations.filter(a=>a.transactionId===f.transactionId);
    const ids=new Set(allocated.map(a=>a.id));
    const invoiceLinks=eligible?f.affectedInvoiceIds.map(id=>({id,principalCents:sum(input.invoiceAllocations.filter(a=>a.invoiceId===id&&ids.has(a.patientAllocationId)).map(a=>a.amountCents))!})):[];
    // raten.transaktion_id links a payment, but does not allocate its amount when
    // several rates or later/partial payments are involved. Never distribute it.
    const linkedRates=input.rates.filter(r=>r.transactionId===f.transactionId);
    const rateLinks: ReturnBookingChain['rateLinks']=[];
    if(eligible&&linkedRates.length){
      if(linkedRates.length===1&&linkedRates[0].paidCents===principal)rateLinks.push({id:linkedRates[0].id,principalCents:principal!});
      else reasons.push('rate_payment_amount_unproven');
    }
    if(eligible&&invoiceLinks.length===0&&linkedRates.length===0)reasons.push('claim_link_missing');
    const invoiceTotal=sum(invoiceLinks.map(l=>l.principalCents));
    const unassigned=principal===null||invoiceTotal===null?null:principal-invoiceTotal;
    if(eligible&&unassigned!>0)reasons.push('invoice_principal_unassigned');
    if(f.amounts&&f.amounts.differenceCents>0)reasons.push('debit_difference_unresolved');
    return {returnId:f.returnId,originalId:f.originalId,transactionId:f.transactionId,patientId:f.patientId,
      evidenceReason:f.reason,originalCents:f.amounts?.originalCents??null,debitedCents:f.returnCents,
      principalPreviewCents:principal,unresolvedDifferenceCents:f.amounts?.differenceCents??null,
      bankFeeCents:null,patientFeeCents:null,invoiceLinks,rateLinks,unassignedInvoicePrincipalCents:unassigned,
      reasons:unique(reasons),canApply:false};
  }).sort((a,b)=>a.returnId.localeCompare(b.returnId));

  function preview(kind: 'invoice'|'rate', id: string, patientId: string, affected: ReturnBookingChain[]): ReturnClaimPreview {
    const claim=(kind==='invoice'?input.invoices:input.rates).find(c=>c.id===id);
    const reasons=[...global];
    if(!claim)reasons.push('claim_missing');
    else {
      if(claim.patientId!==patientId)reasons.push('claim_patient_conflict');
      if(!['offen','teilbezahlt','bezahlt','überfällig','ueberfaellig'].includes(claim.status??''))reasons.push('claim_status_unconfirmed');
      if(!validMoney(claim.totalCents)||!validMoney(claim.paidCents)||!validMoney(claim.openCents)
        ||sum([claim.paidCents,claim.openCents])!==claim.totalCents)reasons.push('claim_amounts_inconsistent');
    }
    const links=affected.map(b=>(kind==='invoice'?b.invoiceLinks:b.rateLinks).find(l=>l.id===id)?.principalCents??null);
    const principal=sum(links);
    if(principal===null)reasons.push('claim_return_amount_unproven');
    if(claim&&principal!==null&&validMoney(claim.paidCents)&&principal>claim.paidCents)reasons.push('return_exceeds_paid');
    if(kind==='invoice'){
      const history=input.invoiceAllocations.filter(a=>a.invoiceId===id);
      const reversals=history.filter(a=>a.state==='reversed');
      const reversed=new Set(reversals.map(a=>a.reversalOf));
      if(reversed.size!==reversals.length)reasons.push('invoice_reversal_conflict');
      for(const r of reversals){const original=byInvoiceAllocation.get(r.reversalOf??'');
        if(!original||!['allocated_auto','allocated_manual'].includes(original.state)||original.invoiceId!==id||original.patientAllocationId!==r.patientAllocationId||original.amountCents!==r.amountCents)reasons.push('invoice_reversal_conflict');
      }
      if(history.some(a=>!['allocated_auto','allocated_manual','reversed'].includes(a.state)||(a.state!=='reversed'&&a.reversalOf)))reasons.push('invoice_history_invalid');
      const active=history.filter(a=>a.state!=='reversed'&&!reversed.has(a.id));
      if(history.some(a=>!validMoney(a.amountCents)||a.amountCents===0))reasons.push('invoice_history_invalid');
      for(const a of active){const owner=byAllocation.get(a.patientAllocationId);
        if(!owner||owner.patientId!==patientId||!['confirmed_auto','confirmed_manual'].includes(owner.state)||owner.reversalOf||input.allocations.some(r=>r.reversalOf===owner.id))reasons.push('invoice_payment_history_conflict');
        const used=sum(input.invoiceAllocations.filter(i=>i.patientAllocationId===owner?.id&&i.state!=='reversed'&&!input.invoiceAllocations.some(r=>r.reversalOf===i.id)).map(i=>i.amountCents));
        if(used===null||!owner||!validMoney(owner.amountCents)||used>owner.amountCents)reasons.push('invoice_payment_capacity_conflict');
      }
      // A legacy paid total is not proof that this source is still included.
      if(!history.length||sum(active.map(a=>a.amountCents))!==claim?.paidCents)reasons.push('invoice_paid_total_not_reconciled');
    }
    const usable=claim?.patientId===patientId;
    const valid=reasons.length===0;
    const paid=valid?claim!.paidCents!-principal!:null;
    const open=valid?sum([claim!.openCents,principal]):null;
    if(valid&&open===null)reasons.push('amount_overflow');
    const blockers=unique([...reasons,...affected.flatMap(b=>b.reasons)]);
    return {kind,id,patientId,returnIds:unique(affected.map(b=>b.returnId)),
      currentPaidCents:usable&&validMoney(claim!.paidCents)?claim!.paidCents:null,
      currentOpenCents:usable&&validMoney(claim!.openCents)?claim!.openCents:null,
      returnedPrincipalCents:valid?principal:null,previewPaidCents:paid,previewOpenCents:open,
      dueDate:usable?claim!.dueDate:null,reasons:unique(reasons),dunning:dunning(usable?claim:undefined,open,blockers,input)};
  }
  const patients=unique(bookings.flatMap(b=>b.patientId?[b.patientId]:[])).map(patientId=>{
    const patientBookings=bookings.filter(b=>b.patientId===patientId);
    // Include unresolved claim links as null projections, not silent omissions.
    const patientFindings=findings.filter(f=>f.patientId===patientId);
    const collect=(kind:'invoice'|'rate')=>unique(patientFindings.flatMap(f=>kind==='invoice'?f.affectedInvoiceIds:f.affectedRateIds)).map(id=>{
      const ids=new Set(patientFindings.filter(f=>(kind==='invoice'?f.affectedInvoiceIds:f.affectedRateIds).includes(id)).map(f=>f.returnId));
      return preview(kind,id,patientId,patientBookings.filter(b=>ids.has(b.returnId)));
    });
    const invoices=collect('invoice'),rates=collect('rate');
    const all=[...invoices,...rates];
    const blocks=unique([...patientBookings.flatMap(b=>b.reasons),...all.filter(p=>p.dunning.status==='blocked').flatMap(p=>p.dunning.reasons)]);
    if(!all.length)blocks.push('claim_link_missing');
    const review: ReturnDunningReview=blocks.length?held(blocks):{status:all.some(p=>p.dunning.status==='review_required')?'review_required':all.some(p=>p.dunning.status==='within_grace')?'within_grace':all.every(p=>p.dunning.status==='settled')?'settled':'not_due',reasons:['manual_review_only'],daysPastDue:null,canSend:false};
    const total=(claims:ReturnClaimPreview[],field:'currentOpenCents'|'previewOpenCents')=>claims.length?sum(claims.map(c=>c[field])):null;
    return {patientId,returnIds:unique(patientBookings.map(b=>b.returnId)),invoices,rates,
      affectedInvoicesCurrentOpenCents:total(invoices,'currentOpenCents'),affectedInvoicesPreviewOpenCents:total(invoices,'previewOpenCents'),
      affectedRatesCurrentOpenCents:total(rates,'currentOpenCents'),affectedRatesPreviewOpenCents:total(rates,'previewOpenCents'),
      combinedOpenCents:null,dunning:review};
  });
  return {version:1,mode:'read_only_preview',snapshotId:input.snapshotId,asOf:input.asOf,complete:input.complete,
    assumption:'full_original_principal_returned',bookings,patients,reasons:global,canApply:false,canSend:false};
}
