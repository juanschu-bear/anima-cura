import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {t} from '../../i18n';
import {bankAmountCents,hasBankReturnIndication,reviewBankReturns,type ReturnBankRow} from '../../payment-return-review';
const incoming:ReturnBankRow={id:'raw-in',providerId:'bank-in',connectionId:'connection',accountId:'practice',amount:'67.81',date:'2026-10-01',currency:'EUR',purpose:'Rate',reference:'E2E-unique',counterpartIban:'DETEST001'};
const outgoing:ReturnBankRow={...incoming,id:'raw-out',providerId:'bank-out',amount:'-67.81',date:'2026-10-03',purpose:'Rücklastschrift'};
function fixture(){return {bank:[{...incoming},{...outgoing}],working:[{id:'tx',providerId:'bank-in',connectionId:'connection',amount:'67.81',patientId:'p',matchingStatus:'auto'}],allocations:[{id:'pa',transactionId:'tx',patientId:'p',amountCents:6781,state:'confirmed_auto',reversalOf:null as string|null}],invoiceAllocations:[{id:'ia',patientAllocationId:'pa',invoiceId:'invoice',amountCents:6781,state:'allocated_auto',reversalOf:null as string|null}],rates:[{id:'rate',patientId:'p',transactionId:'tx'}]};}
test('exact reference chain locates affected records but never authorizes a mutation',()=>{
 const input=fixture(), before=structuredClone(input), result=reviewBankReturns(input);
 assert.deepEqual(result,[{returnId:'raw-out',originalId:'raw-in',transactionId:'tx',patientId:'p',returnCents:6781,reason:'evidence_linked',canApply:false,affectedInvoiceIds:['invoice'],affectedRateIds:['rate'],amounts:{originalCents:6781,debitedCents:6781,differenceCents:0,bankFeeCents:null,patientFeeCents:null},relatedMandateOriginalIds:[]}]);
 assert.deepEqual(input,before);assert.deepEqual(reviewBankReturns(input),result);
});
test('ordinary outgoings, incoming text matches and explicit negation are not returns',()=>{
 for(const purpose of ['Miete','Lastschrift','Keine Rücklastschrift','Ohne Rücklastschrift','no direct debit return'])assert.equal(hasBankReturnIndication(purpose),false);
 for(const purpose of ['RÜCKLASTSCHRIFT','Ruecklastschrift','Lastschriftrückgabe','Rückgabe der Lastschrift','Direct debit return'])assert.equal(hasBankReturnIndication(purpose),true);
 const f=fixture();f.bank[1].purpose='Miete';assert.deepEqual(reviewBankReturns(f),[]);
 f.bank[1].purpose='Rücklastschrift';f.bank[1].amount='67.81';assert.deepEqual(reviewBankReturns(f),[]);
});
test('strict integer cents never rounds partial cents or malformed bank values',()=>{
 assert.equal(bankAmountCents(67.81),6781);assert.equal(bankAmountCents('-0.01'),-1);
 for(const value of [null,'','67,81','1.001','1e2',Infinity,NaN,'9007199254740993'])assert.equal(bankAmountCents(value),null);
 const f=fixture();f.bank[1].amount='-67.811';assert.equal(reviewBankReturns(f)[0].reason,'source_invalid');
});
test('name or equal amount, mandate-like placeholders and missing references cannot link',()=>{
 for(const value of [null,'','NOTPROVIDED','not provided','NONREF','000000']){
  const f=fixture();f.bank[0].reference=value;f.bank[1].reference=value;
  assert.equal(reviewBankReturns(f)[0].reason,'reference_missing');
 }
});
test('account, connection, currency, dates and counterpart mismatches fail closed',()=>{
 for(const change of [{accountId:'other'},{connectionId:'other'},{reference:'e2e-unique'},{date:'2026-10-04'}]){
  const f=fixture();Object.assign(f.bank[0],change);assert.equal(reviewBankReturns(f)[0].reason,'original_missing');
 }
 for(const change of [{currency:'USD'},{accountId:null},{connectionId:null},{date:'2026-02-30'},{potentialDuplicate:true},{adjustingEntry:true}]){
  const f=fixture();Object.assign(f.bank[1],change);assert.equal(reviewBankReturns(f)[0].reason,'source_invalid');
 }
 const f=fixture();f.bank[1].counterpartIban='DEOTHER';assert.equal(reviewBankReturns(f)[0].reason,'source_conflict');
});
test('reused references cannot be disambiguated by coincidentally equal amounts',()=>{
 const f=fixture();f.bank.push({...incoming,id:'second',providerId:'second',amount:'90.00'});
 assert.equal(reviewBankReturns(f)[0].reason,'original_ambiguous');
});
test('exact payment reference cannot override conflicting mandate or creditor evidence',()=>{
 for(const field of ['mandateReference','creditorId'] as const){
  const f=fixture();f.bank[0][field]='original';f.bank[1][field]='different';const r=reviewBankReturns(f)[0];
  assert.equal(r.reason,'source_conflict');assert.equal(r.amounts,null);assert.equal(r.patientId,null);
 }
});
test('partial return and larger debit including possible fees require separate evidence',()=>{
 for(const amount of ['-30.00','-71.31']){
  const f=fixture();f.bank[1].amount=amount;const before=structuredClone(f),r=reviewBankReturns(f)[0];
  assert.equal(r.reason,'amount_difference');assert.equal(r.patientId,'p');assert.equal(r.canApply,false);
  assert.deepEqual(r.affectedInvoiceIds,['invoice']);assert.deepEqual(r.affectedRateIds,['rate']);
  assert.deepEqual(r.amounts,{originalCents:6781,debitedCents:Math.abs(bankAmountCents(amount)!),differenceCents:Math.abs(bankAmountCents(amount)!)-6781,bankFeeCents:null,patientFeeCents:null});
  assert.deepEqual(f,before);
 }
});
test('amount differences do not bypass working source, allocation or invoice validation',()=>{
 const f=fixture();f.bank[1].amount='-72.81';f.working[0].amount='72.81';assert.equal(reviewBankReturns(f)[0].reason,'source_conflict');
 f.working[0].amount='67.81';f.allocations[0].amountCents=7281;assert.equal(reviewBankReturns(f)[0].reason,'allocation_missing_or_incomplete');
 f.allocations[0].amountCents=6781;f.invoiceAllocations[0].amountCents=7281;const r=reviewBankReturns(f)[0];
 assert.equal(r.reason,'invoice_allocation_conflict');assert.equal(r.patientId,null);assert.equal(r.amounts?.differenceCents,500);
});
test('amount comparison survives missing downstream data without claiming a patient chain',()=>{
 const f=fixture();f.bank[1].amount='-72.81';f.working=[];const r=reviewBankReturns(f)[0];
 assert.equal(r.reason,'working_source_missing');assert.equal(r.amounts?.differenceCents,500);assert.equal(r.patientId,null);assert.deepEqual(r.affectedInvoiceIds,[]);
});
test('one same-mandate candidate is context, never an original payment decision',()=>{
 const f=fixture();for(const r of f.bank){r.reference=null;r.mandateReference='MANDATE';r.creditorId='CREDITOR';}
 const before=structuredClone(f),r=reviewBankReturns(f)[0];
 assert.equal(r.reason,'reference_missing');assert.deepEqual(r.relatedMandateOriginalIds,['raw-in']);
 assert.equal(r.originalId,null);assert.equal(r.transactionId,null);assert.equal(r.patientId,null);assert.equal(r.amounts,null);assert.equal(r.canApply,false);assert.deepEqual(f,before);
});
test('same mandate across months never selects the latest or equal-amount instalment',()=>{
 const f=fixture();for(const r of f.bank){r.reference=null;r.mandateReference='MANDATE';r.creditorId='CREDITOR';}
 f.bank.push({...f.bank[0],id:'older',providerId:'older',date:'2026-09-01',amount:'125.00'});
 const r=reviewBankReturns(f)[0];assert.deepEqual(r.relatedMandateOriginalIds,['older','raw-in']);assert.equal(r.originalId,null);assert.equal(r.canApply,false);
});
test('mandate context requires same account, connection, creditor, mandate, IBAN and chronology',()=>{
 for(const change of [{accountId:'other'},{connectionId:'other'},{currency:'USD'},{creditorId:'other'},{creditorId:null},{mandateReference:'other'},{mandateReference:'NOTPROVIDED'},{counterpartIban:null},{counterpartIban:'OTHER'},{date:'2026-10-04'},{date:'2026-02-30'},{potentialDuplicate:true},{adjustingEntry:true},{amount:'-67.81'}]){
  const f=fixture();for(const r of f.bank){r.reference=null;r.mandateReference='MANDATE';r.creditorId='CREDITOR';}
  Object.assign(f.bank[0],change);assert.deepEqual(reviewBankReturns(f)[0].relatedMandateOriginalIds,[]);
 }
});
test('duplicate provider payload and repeated distinct returns cannot double reverse',()=>{
 const f=fixture();f.bank.push({...outgoing,id:'duplicate'});assert.ok(reviewBankReturns(f).every(r=>r.reason==='source_conflict'));
 const g=fixture();g.bank.push({...outgoing,id:'second-return',providerId:'second-return'});assert.ok(reviewBankReturns(g).every(r=>r.reason==='multiple_returns'&&!r.canApply));
 assert.ok(reviewBankReturns(g).every(r=>r.patientId===null&&r.affectedInvoiceIds.length===0&&r.affectedRateIds.length===0));
});
test('working-source changes or missing working source block projection',()=>{
 const f=fixture();f.working=[];assert.equal(reviewBankReturns(f)[0].reason,'working_source_missing');
 for(const change of [{amount:'1.00'},{connectionId:'other'}]){const g=fixture();Object.assign(g.working[0],change);assert.equal(reviewBankReturns(g)[0].reason,'source_conflict');}
 const g=fixture();g.working[0].matchingStatus='unklar';assert.equal(reviewBankReturns(g)[0].reason,'patient_assignment_unconfirmed');
});
test('family split, incomplete amounts and prior reversals never silently unwind payments',()=>{
 for(const change of [{amountCents:6000},{patientId:'other'},{amountCents:NaN}]){const f=fixture();Object.assign(f.allocations[0],change);assert.equal(reviewBankReturns(f)[0].reason,'allocation_missing_or_incomplete');}
 for(const state of ['reversed','candidate','rejected']){const f=fixture();f.allocations.push({...f.allocations[0],id:'decision',state,reversalOf:state==='reversed'?'pa':null});assert.equal(reviewBankReturns(f)[0].reason,'prior_decision');}
});
test('invoice and rate conflicts are reported without inferred amounts or fees',()=>{
 for(const change of [{state:'reversed',reversalOf:'ia'},{amountCents:6782},{amountCents:-1}]){const f=fixture();Object.assign(f.invoiceAllocations[0],change);assert.equal(reviewBankReturns(f)[0].reason,'invoice_allocation_conflict');}
 const f=fixture();f.rates[0].patientId='other';assert.equal(reviewBankReturns(f)[0].reason,'rate_patient_conflict');
});
test('several invoices may be affected; missing invoice/rate links are not invented',()=>{
 const f=fixture();f.invoiceAllocations[0].amountCents=3000;f.invoiceAllocations.push({...f.invoiceAllocations[0],id:'ia2',invoiceId:'second',amountCents:3781});
 assert.deepEqual(reviewBankReturns(f)[0].affectedInvoiceIds,['invoice','second']);
 f.invoiceAllocations=[];f.rates=[];const result=reviewBankReturns(f)[0];assert.equal(result.reason,'evidence_linked');assert.deepEqual(result.affectedInvoiceIds,[]);assert.deepEqual(result.affectedRateIds,[]);assert.equal(result.canApply,false);
});
test('review UI never invents a bank fee or presents an unconnected check as all-clear',()=>{
 const page=readFileSync('src/app/(dashboard)/zahlungen/page.tsx','utf8');
 assert.doesNotMatch(page,/\+3[,.]50/);
 assert.match(page,/t\("payments\.chargebacks\.unverifiedFee", locale\)/);
 assert.match(page,/t\("payments\.chargebackReview", locale\)/);
 assert.match(t('payments.noChargebacks','de'),/bestätigt nicht/);
 assert.match(t('payments.noChargebacks','en'),/does not confirm/);
 assert.match(t('dunning.chargebackInfo','de'),/noch nicht vollständig/);
 assert.match(t('dunning.chargebackInfo','en'),/not yet fully/);
});
test('operator audit has no apply path, queries the selected account and emits no raw case data',()=>{
 const script=readFileSync('scripts/audit-bank-returns.ts','utf8');
 assert.doesNotMatch(script,/\.(?:insert|update|upsert|delete|rpc)\(/);
 assert.match(script,/q\.eq\('raw->>accountId',args\[1\]\)/);
 assert.match(script,/--apply is not supported/);
 assert.doesNotMatch(script,/console\.log\([^]*?(?:JSON\.stringify\(results|JSON\.stringify\(bankRows)/);
 assert.match(script,/atomicSnapshot:false/);
});
