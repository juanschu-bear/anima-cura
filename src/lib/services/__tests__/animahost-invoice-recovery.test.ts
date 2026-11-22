import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {recoverPatientInvoice} from '../animahost-invoice-recovery';
import {billingDocumentPath,billingDocumentUrl} from '@/lib/billing-document-access';

const patient='40000000-0000-4000-8000-000000000004';
const doc='60000000-0000-4000-8000-000000000006';
const pdf=Buffer.from('%PDF-1.7\nInternal fixture\n');
const issued={document_id:doc,invoice_number:'TEST-FOUR',issue_date:'2026-11-12',pdf_sha256:createHash('sha256').update(pdf).digest('hex'),
 storage_path:billingDocumentPath(patient,doc)};
const date={from:null,through:null};
function setup(options:{conflict?:boolean;none?:boolean;account?:boolean;imported?:boolean}={}){
 let linked=options.conflict?{patient_id:'someone-else',file_url:billingDocumentUrl(doc)}:null;
 const writes:string[]=[];
 const db={
  from(table:string){
   const chain={select:()=>chain,eq:()=>chain,not:()=>chain,or:()=>chain,order:()=>chain,
    async limit(){return {data:table==='offene_posten'&&options.account?[{id:doc}]:
      table==='billing_invoices'&&!options.none&&!options.imported?[issued]:[],error:null};},
    async maybeSingle(){assert.equal(table,'patient_documents');return {data:linked,error:null};},
    async upsert(row:NonNullable<typeof linked>,args:{ignoreDuplicates:boolean}){
     assert.equal(row.patient_id,patient);assert.equal(args.ignoreDuplicates,true);
     writes.push('document');linked=row;return {error:null};
    },
   };
   return chain;
  },
  async rpc(name:string,params:{p_patient:string;p_document:string|null}){
   assert.equal(name,'animahost_imported_invoice_documents');assert.equal(params.p_patient,patient);
   return {data:options.imported?[{id:doc,date:'2026-11-12',invoiceNumber:'TEST-FOUR',content:params.p_document?pdf.toString('base64'):null}]:[],error:null};
  },
  storage:{getBucket:async()=>({data:{public:false},error:null}),from:()=>({
   download:async()=>({data:options.imported?null:new Blob([new Uint8Array(pdf)]),error:null}),
   upload:async(path:string,bytes:Buffer,config:{upsert:boolean})=>{
    assert.equal(path,billingDocumentPath(patient,doc));assert.deepEqual(bytes,pdf);assert.equal(config.upsert,false);
    writes.push('pdf');return {error:null};
   },
  })},
 };
 return {db:db as never,writes};
}

test('restores a missing portal document using an existing issued file with the recorded hash',async()=>{
 const {db,writes}=setup();
 assert.deepEqual(await recoverPatientInvoice(db,patient,date),{cause:'document_restored',invoiceDate:'2026-11-12'});
 assert.deepEqual(writes,['document']);
 assert.deepEqual(await recoverPatientInvoice(db,patient,date),{cause:'already_available',invoiceDate:'2026-11-12'});
 assert.deepEqual(writes,['document']);
});

test('restores an exact imported original without overwriting storage',async()=>{
 const {db,writes}=setup({imported:true});
 assert.deepEqual(await recoverPatientInvoice(db,patient,date),{cause:'pdf_restored',invoiceDate:'2026-11-12'});
 assert.deepEqual(writes,['pdf','document']);
});

test('separates no issued invoice from an ownership conflict or unresolved ledger entry',async()=>{
 for(const options of [{conflict:true},{none:true,account:true},{none:true}]){
  const {db,writes}=setup(options);
  assert.equal((await recoverPatientInvoice(db,patient,date)).cause,
   options.conflict||options.account?'manual_review':'no_invoice');
  assert.deepEqual(writes,[]);
 }
});
