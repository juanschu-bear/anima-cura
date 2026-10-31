/** Read-only operator audit. No patient data, bank references or IDs in stdout. */
import {createClient} from '@supabase/supabase-js';
import {reviewBankReturns,hasBankReturnIndication,type ReturnBankRow} from '../src/lib/payment-return-review';

async function main(){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--account'||!/^\d+$/.test(args[1]))throw Error('Usage: audit-bank-returns.ts --account <practice-bank-account-id>. Read-only; --apply is not supported.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Missing server configuration.');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const startedAt=new Date().toISOString();
 async function all(table:string,columns:string,configure:(query:any)=>any=(q)=>q){
  const rows:any[]=[];
  for(let start=0;;start+=500){
   const {data,error}=await configure(db.from(table).select(columns).order('id').range(start,start+499));
   if(error)throw Error(`Read unavailable: ${table} (${error.code}). Audit incomplete.`);
   rows.push(...(data||[]));if((data||[]).length<500)return rows;
  }
 }
 // Only this practice account. Never query a different account to resolve a match.
 const bankRows=await all('bank_transactions_raw','id,finapi_id,bank_connection_id,amount,booking_date,purpose,counterpart_iban,account_id:raw->>accountId,currency:raw->>currency,reference:raw->>endToEndReference,potential_duplicate:raw->>isPotentialDuplicate,adjusting_entry:raw->>isAdjustingEntry',q=>q.eq('raw->>accountId',args[1]));
 const bank:ReturnBankRow[]=bankRows.map(r=>({id:r.id,providerId:r.finapi_id,connectionId:r.bank_connection_id,accountId:r.account_id,amount:r.amount,date:r.booking_date,currency:r.currency,purpose:r.purpose,reference:r.reference,counterpartIban:r.counterpart_iban,potentialDuplicate:r.potential_duplicate==='true',adjustingEntry:r.adjusting_entry==='true'}));
 const preliminary=reviewBankReturns({bank,working:[],allocations:[],invoiceAllocations:[],rates:[]});
 const originalIds=new Set(preliminary.filter(r=>r.reason==='working_source_missing').map(r=>r.originalId));
 const incomingIds=bank.filter(r=>originalIds.has(r.id)).map(r=>r.providerId);
 // Chunk explicit IDs: avoid reading other accounts' working records or histories.
 async function forIds(table:string,columns:string,column:string,ids:string[]){const rows:any[]=[];const unique=Array.from(new Set(ids));for(let i=0;i<unique.length;i+=100)rows.push(...await all(table,columns,q=>q.in(column,unique.slice(i,i+100))));return rows;}
 const workingRows=await forIds('transaktionen','id,finapi_id,bank_connection_id,betrag,matched_patient_id,matching_status','finapi_id',incomingIds);
 const transactionIds=workingRows.map(r=>r.id);
 const allocations=await forIds('payment_patient_allocations','id,transaction_id,patient_id,amount_cents,state,reversal_of_allocation_id','transaction_id',transactionIds);
 const invoiceAllocations=await forIds('payment_invoice_allocations','id,patient_allocation_id,invoice_id,amount_cents,state,reversal_of_allocation_id','patient_allocation_id',allocations.map(r=>r.id));
 const rates=await forIds('raten','id,patient_id,transaktion_id','transaktion_id',transactionIds);
 const results=reviewBankReturns({bank,working:workingRows.map(r=>({id:r.id,providerId:String(r.finapi_id),connectionId:r.bank_connection_id,amount:r.betrag,patientId:r.matched_patient_id,matchingStatus:r.matching_status})),allocations:allocations.map(r=>({id:r.id,transactionId:r.transaction_id,patientId:r.patient_id,amountCents:Number(r.amount_cents),state:r.state,reversalOf:r.reversal_of_allocation_id})),invoiceAllocations:invoiceAllocations.map(r=>({id:r.id,patientAllocationId:r.patient_allocation_id,invoiceId:r.invoice_id,amountCents:Number(r.amount_cents),state:r.state,reversalOf:r.reversal_of_allocation_id})),rates:rates.map(r=>({id:r.id,patientId:r.patient_id,transactionId:r.transaktion_id}))});
 const reasons:Record<string,number>={};for(const r of results)reasons[r.reason]=(reasons[r.reason]||0)+1;
 console.log(JSON.stringify({mode:'read-only',startedAt,finishedAt:new Date().toISOString(),atomicSnapshot:false,archiveRows:bank.length,negativeRows:bank.filter(r=>Number(r.amount)<0).length,textIndications:bank.filter(r=>Number(r.amount)<0&&hasBankReturnIndication(r.purpose)).length,reasons,linkedAffectedInvoices:results.filter(r=>r.reason==='evidence_linked').reduce((s,r)=>s+r.affectedInvoiceIds.length,0),linkedAffectedRates:results.filter(r=>r.reason==='evidence_linked').reduce((s,r)=>s+r.affectedRateIds.length,0),writeOperations:0,automaticReversalsEnabled:false,limitations:['Text indications are not bank-confirmed returns; unsupported formats may be missed.','Sequential read, not a transactional snapshot. Never use this output as a mutation manifest.','No invoice/rate balance or fee calculated; no dunning or mail executed.']},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Audit failed; no complete result.');process.exitCode=1;});
