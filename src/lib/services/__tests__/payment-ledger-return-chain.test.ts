import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildReturnChainReview, type ReturnChainInput} from '../payment-ledger-return-chain';

function fixture(): ReturnChainInput {
 const incoming={id:'raw-in',providerId:'bank-in',connectionId:'connection',accountId:'practice',amount:'67.81',date:'2026-10-01',currency:'EUR',purpose:'Rate',reference:'reference-1',counterpartIban:'SYNTHETIC'};
 const claim={patientId:'p',totalCents:10000,paidCents:6781,openCents:3219,dueDate:'2026-10-01',status:'teilbezahlt',dunningBlocked:false};
 return {snapshotId:'snapshot-1',complete:true,asOf:'2026-10-31',graceDays:5,patientControls:[{patientId:'p',dunningBlocked:false}],
  bank:[incoming,{...incoming,id:'raw-out',providerId:'bank-out',amount:'-67.81',date:'2026-10-03',purpose:'Rücklastschrift'}],
  working:[{id:'tx',providerId:'bank-in',connectionId:'connection',amount:'67.81',patientId:'p',matchingStatus:'auto'}],
  allocations:[{id:'pa',transactionId:'tx',patientId:'p',amountCents:6781,state:'confirmed_auto',reversalOf:null}],
  invoiceAllocations:[{id:'ia',patientAllocationId:'pa',invoiceId:'i',amountCents:6781,state:'allocated_auto',reversalOf:null}],
  invoices:[{...claim,id:'i'}],rates:[{...claim,id:'r',transactionId:'tx'}]};
}
const result=(f:ReturnChainInput)=>buildReturnChainReview(f);

test('complete chain previews only principal and never adds invoice and rate debt',()=>{
 const f=fixture(),before=structuredClone(f),r=result(f),p=r.patients[0];
 assert.equal(r.bookings[0].originalId,'raw-in');assert.equal(r.bookings[0].transactionId,'tx');
 assert.deepEqual(r.bookings[0].invoiceLinks,[{id:'i',principalCents:6781}]);
 assert.deepEqual(r.bookings[0].rateLinks,[{id:'r',principalCents:6781}]);
 assert.equal(p.invoices[0].currentOpenCents,3219);assert.equal(p.invoices[0].previewPaidCents,0);
 assert.equal(p.affectedInvoicesPreviewOpenCents,10000);assert.equal(p.affectedRatesPreviewOpenCents,10000);
 assert.equal(p.combinedOpenCents,null);assert.equal(p.dunning.status,'review_required');
 assert.equal(r.canApply,false);assert.equal(r.canSend,false);assert.equal(p.dunning.canSend,false);
 assert.deepEqual(f,before);assert.deepEqual(result(f),r);
});

test('larger debit preserves principal scenario but never turns the difference into a fee or dunning release',()=>{
 const f=fixture();f.bank[1].amount='-72.81';const r=result(f),b=r.bookings[0];
 assert.equal(b.originalCents,6781);assert.equal(b.debitedCents,7281);assert.equal(b.unresolvedDifferenceCents,500);
 assert.equal(b.bankFeeCents,null);assert.equal(b.patientFeeCents,null);
 assert.equal(r.patients[0].invoices[0].previewOpenCents,10000);
 assert.equal(r.patients[0].dunning.status,'blocked');assert.ok(b.reasons.includes('debit_difference_unresolved'));
});

test('partial return does not guess how to split a payment between invoice and rate',()=>{
 const f=fixture();f.bank[1].amount='-30.00';const r=result(f);
 assert.equal(r.bookings[0].principalPreviewCents,null);assert.equal(r.patients[0].invoices[0].previewOpenCents,null);
 assert.equal(r.patients[0].rates[0].previewOpenCents,null);assert.equal(r.patients[0].dunning.status,'blocked');
});

test('multiple returned originals on the same invoice are aggregated once; later payment is preserved',()=>{
 const f=fixture();f.rates=[];
 f.bank.push({...f.bank[0],id:'in2',providerId:'in2',reference:'ref2',amount:'10.00'}, {...f.bank[1],id:'out2',providerId:'out2',reference:'ref2',amount:'-10.00'});
 f.working.push({...f.working[0],id:'tx2',providerId:'in2',amount:'10.00'});
 f.allocations.push({...f.allocations[0],id:'pa2',transactionId:'tx2',amountCents:1000}, {...f.allocations[0],id:'later',transactionId:'later',amountCents:2000});
 f.invoiceAllocations.push({...f.invoiceAllocations[0],id:'ia2',patientAllocationId:'pa2',amountCents:1000},{...f.invoiceAllocations[0],id:'ialater',patientAllocationId:'later',amountCents:2000});
 f.invoices[0].paidCents=9781;f.invoices[0].openCents=219;
 const p=result(f).patients[0];assert.equal(p.invoices.length,1);
 assert.deepEqual(p.invoices[0].returnIds,['out2','raw-out']);assert.equal(p.invoices[0].returnedPrincipalCents,7781);
 assert.equal(p.invoices[0].previewPaidCents,2000);assert.equal(p.affectedInvoicesPreviewOpenCents,8000);
});

test('split invoice allocations retain exact amounts, not one full principal per invoice',()=>{
 const f=fixture();f.rates=[];f.invoiceAllocations[0].amountCents=3000;
 f.invoiceAllocations.push({...f.invoiceAllocations[0],id:'ia2',invoiceId:'i2',amountCents:3781});
 f.invoices[0].paidCents=3000;f.invoices[0].openCents=7000;
 f.invoices.push({...f.invoices[0],id:'i2',paidCents:3781,openCents:6219});
 const r=result(f);assert.deepEqual(r.bookings[0].invoiceLinks,[{id:'i',principalCents:3000},{id:'i2',principalCents:3781}]);
 assert.equal(r.patients[0].affectedInvoicesPreviewOpenCents,20000);
});

test('unallocated patient credit is not invented as invoice debt',()=>{
 const f=fixture();f.invoiceAllocations[0].amountCents=3000;f.invoices[0].paidCents=3000;f.invoices[0].openCents=7000;
 const r=result(f);assert.equal(r.bookings[0].unassignedInvoicePrincipalCents,3781);
 assert.equal(r.patients[0].invoices[0].returnedPrincipalCents,3000);
 assert.equal(r.patients[0].dunning.status,'blocked');
});

test('missing invoice or missing monetary values are unknown, never zero',()=>{
 const f=fixture();f.invoices=[];let r=result(f);assert.equal(r.patients[0].invoices[0].currentOpenCents,null);
 assert.equal(r.patients[0].affectedInvoicesPreviewOpenCents,null);
 for(const change of [{paidCents:null},{totalCents:null},{openCents:null},{paidCents:NaN},{paidCents:67.81},{openCents:-1},{totalCents:Number.MAX_SAFE_INTEGER+1}]){
  const g=fixture();Object.assign(g.invoices[0],change);r=result(g);assert.equal(r.patients[0].invoices[0].previewOpenCents,null);
 }
});

test('legacy balance disagreement, already removed principal and cancelled claims never reopen automatically',()=>{
 for(const change of [{paidCents:0,openCents:10000},{paidCents:8000,openCents:2000},{status:'storniert'},{status:'erloesminderung'},{status:null}]){
  const f=fixture();Object.assign(f.invoices[0],change);assert.equal(result(f).patients[0].invoices[0].previewOpenCents,null);
 }
});

test('rate transaction reference alone cannot allocate partial or multi-rate payments',()=>{
 const f=fixture();f.rates.push({...f.rates[0],id:'r2'});
 assert.ok(result(f).patients[0].rates.every(r=>r.previewOpenCents===null));
 const g=fixture();g.rates[0].paidCents=3000;g.rates[0].openCents=7000;
 assert.equal(result(g).patients[0].rates[0].previewOpenCents,null);
 const h=fixture();h.rates[0].transactionId=null;assert.deepEqual(result(h).patients[0].rates,[]);
});

test('same debt shown in both views remains separate; a rate-only chain is not a confirmed invoice balance',()=>{
 const f=fixture();f.invoiceAllocations=[];f.invoices=[];
 const r=result(f);assert.equal(r.patients[0].affectedInvoicesPreviewOpenCents,null);
 assert.equal(r.patients[0].affectedRatesPreviewOpenCents,10000);assert.equal(r.patients[0].combinedOpenCents,null);
 assert.equal(r.patients[0].dunning.status,'blocked');
});

test('duplicate returns and prior reversal history do not re-increase a receivable',()=>{
 const f=fixture();f.bank.push({...f.bank[1],id:'return2',providerId:'return2'});
 assert.ok(result(f).bookings.every(b=>b.principalPreviewCents===null));assert.deepEqual(result(f).patients,[]);
 const g=fixture();g.allocations.push({...g.allocations[0],id:'reversal',state:'reversed',reversalOf:'pa'});
 assert.equal(result(g).bookings[0].evidenceReason,'prior_decision');assert.deepEqual(result(g).patients,[]);
});

test('incomplete reads and duplicate rows block all preview balances without mutating the source',()=>{
 for(const list of ['bank','working','allocations','invoiceAllocations','invoices','rates'] as const){
  const f=fixture();(f[list] as any[]).push({...f[list][0]});const r=result(f);
  assert.ok(r.reasons.includes('duplicate_source_id'));assert.ok(r.patients.every(p=>p.invoices.every(i=>i.previewOpenCents===null)));
 }
 const f=fixture();f.complete=false;assert.equal(result(f).patients[0].affectedInvoicesPreviewOpenCents,null);
 f.complete=true;f.snapshotId='';assert.equal(result(f).patients[0].affectedInvoicesPreviewOpenCents,null);
});

test('cross-patient invoice does not expose its balance, due date or dunning state',()=>{
 const f=fixture();f.invoices[0].patientId='someone-else';const p=result(f).patients[0];
 assert.equal(p.invoices[0].currentPaidCents,null);assert.equal(p.invoices[0].currentOpenCents,null);
 assert.equal(p.invoices[0].dueDate,null);assert.equal(p.invoices[0].previewOpenCents,null);
 assert.ok(p.invoices[0].reasons.includes('claim_patient_conflict'));
});

test('dunning checks unknown controls, blocks, invalid due dates and business-calendar grace without sending',()=>{
 for(const change of [{dunningBlocked:true},{dunningBlocked:null},{dueDate:null},{dueDate:'2026-02-30'}]){
  const f=fixture();Object.assign(f.invoices[0],change);assert.equal(result(f).patients[0].dunning.status,'blocked');
 }
 for(const blocked of [true,null]){const f=fixture();f.patientControls[0].dunningBlocked=blocked;assert.equal(result(f).patients[0].dunning.status,'blocked');}
 const missing=fixture();missing.patientControls=[];assert.equal(result(missing).patients[0].dunning.status,'blocked');
 for(const graceDays of [-1,NaN,1.2]){const f=fixture();f.graceDays=graceDays;assert.equal(result(f).patients[0].dunning.status,'blocked');}
 for(const [asOf,status] of [['2026-10-01','not_due'],['2026-10-06','within_grace'],['2026-10-07','review_required']]){
  const f=fixture();f.bank[1].date='2026-10-01';f.asOf=asOf;
  assert.equal(result(f).patients[0].dunning.status,status);assert.equal(result(f).patients[0].dunning.canSend,false);
 }
 const dst=fixture();dst.asOf='2026-10-26';dst.invoices[0].dueDate='2026-10-24';
 assert.equal(result(dst).patients[0].invoices[0].dunning.daysPastDue,2);
});

test('unrelated reversed payments are excluded, malformed reversal chains block calculation',()=>{
 const f=fixture();f.allocations.push({...f.allocations[0],id:'other',transactionId:'other',amountCents:1000});
 f.invoiceAllocations.push({...f.invoiceAllocations[0],id:'old',patientAllocationId:'other',amountCents:1000},
  {...f.invoiceAllocations[0],id:'rev',patientAllocationId:'other',amountCents:1000,state:'reversed',reversalOf:'old'});
 assert.equal(result(f).patients[0].invoices[0].previewOpenCents,10000);
 f.invoiceAllocations[2].amountCents=900;assert.equal(result(f).patients[0].invoices[0].previewOpenCents,null);
});

test('unrelated active invoice payments require confirmed matching patient allocation and sufficient capacity',()=>{
 const f=fixture();f.allocations.push({...f.allocations[0],id:'other',transactionId:'other',amountCents:1000,patientId:'wrong'});
 f.invoiceAllocations.push({...f.invoiceAllocations[0],id:'other',patientAllocationId:'other',amountCents:1000});
 f.invoices[0].paidCents=7781;f.invoices[0].openCents=2219;
 assert.equal(result(f).patients[0].invoices[0].previewOpenCents,null);
 f.allocations[1].patientId='p';f.allocations[1].amountCents=500;
 assert.equal(result(f).patients[0].invoices[0].previewOpenCents,null);
});

test('unreferenced return stays unassigned; no debt is guessed from patient identity or equal amount',()=>{
 const f=fixture();f.bank[1].reference=null;const r=result(f);
 assert.equal(r.bookings[0].patientId,null);assert.deepEqual(r.patients,[]);
 assert.equal(r.bookings[0].principalPreviewCents,null);assert.equal(r.bookings[0].canApply,false);
});

test('return after the requested business day cannot alter an earlier balance',()=>{
 const f=fixture();f.asOf='2026-10-02';const r=result(f);
 assert.ok(r.bookings[0].reasons.includes('return_after_as_of'));
 assert.equal(r.bookings[0].principalPreviewCents,null);assert.equal(r.patients[0].invoices[0].previewOpenCents,null);
});

test('separate patients and shuffled input produce independent deterministic projections',()=>{
 const f=fixture(),second=fixture();
 second.bank.forEach(b=>{b.id+='2';b.providerId+='2';b.reference+='2';});
 second.working.forEach(w=>{w.id+='2';w.providerId+='2';w.patientId='p2';});
 second.allocations.forEach(a=>{a.id+='2';a.transactionId+='2';a.patientId='p2';});
 second.invoiceAllocations.forEach(a=>{a.id+='2';a.patientAllocationId+='2';a.invoiceId+='2';});
 second.invoices.forEach(i=>{i.id+='2';i.patientId='p2';});
 second.rates.forEach(r=>{r.id+='2';r.transactionId+='2';r.patientId='p2';});
 second.patientControls[0].patientId='p2';
 for(const key of ['bank','working','allocations','invoiceAllocations','invoices','rates','patientControls'] as const)(f[key] as any[]).push(...second[key]);
 const r=result(f);assert.deepEqual(r.patients.map(p=>p.patientId),['p','p2']);
 assert.deepEqual(r.patients.map(p=>p.affectedInvoicesPreviewOpenCents),[10000,10000]);
 assert.deepEqual(r.patients[1].returnIds,['raw-out2']);
 for(const key of ['bank','working','allocations','invoiceAllocations','invoices','rates','patientControls'] as const)f[key].reverse();
 assert.deepEqual(result(f),r);
});

test('service has no mutation, mail, automatic dunning, credentials or runtime UI dependency',()=>{
 const source=readFileSync('src/lib/services/payment-ledger-return-chain.ts','utf8');
 assert.doesNotMatch(source,/\.(insert|update|upsert|delete|rpc)\(|fetch\(|sendEmail|runDunningEngine|process\.env|\.tsx|\.css/);
});
