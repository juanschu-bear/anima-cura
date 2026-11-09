import test from 'node:test';
import assert from 'node:assert/strict';
import {attachPatientInvoiceDocuments,type PatientInvoiceDocument} from '../../patient-invoice-documents';
const doc:PatientInvoiceDocument={id:'doc-1',invoiceNumber:'000123',date:'2026-09-30',reference:'TEST',quarter:'2026-Q3',art:'GOZ',patientCents:12345,grossCents:12345,linkedOpenItemId:'open-1',positions:[{date:'2026-09-01',code:'6030',text:'Synthetic service',region:'OK',jaw:'OK',quantity:.25,quantityText:'1/4',points:null,factor:2.3,cents:4366,section:'goz',tariff:'GOZ',category:null,reasonRefs:['1)']}],reasons:[{key:'1)',text:'Synthetic reason'}]};
test('Existing receivable is enriched without changing amounts or adding debt',()=>{
 const result=attachPatientInvoiceDocuments([{id:'open-1',rechnung_nr:'123',offen:10}], [doc]);assert.equal(result.length,1);assert.equal(result[0].offen,10);assert.equal(result[0].beleg?.id,'doc-1');assert.equal(result[0].beleg?.positionen[0].anzahl,.25);assert.equal(result[0].beleg?.positionen[0].eur,43.66);
});
test('Every original is returned; unmatched invoices have unknown payment status and no payment action',()=>{
 const docs=Array.from({length:25},(_,i)=>({...doc,id:'doc-'+i,linkedOpenItemId:null}));
 const result=attachPatientInvoiceDocuments([],docs);assert.equal(result.length,25);assert.ok(result.every(r=>'paymentStatusKnown' in r&&r.paymentStatusKnown===false&&r.offen===0&&r.status==='beleg'&&r.paymentActionAllowed===false));
});
test('No loose invoice-number fallback can attach an unrelated patient document',()=>{
 const result=attachPatientInvoiceDocuments([{id:'other-open-item',rechnung_nr:'000123'}],[doc]);assert.equal(result[0].beleg,null);assert.equal(result.length,2);
});

test('Verified selection, explicit original and missing-migration fallback use only the patient RPC',async()=>{
 const {resolvePatientInvoicePdf}=await import('../../patient-invoice-documents');
 const original=Buffer.from('%PDF-original'),typeset=Buffer.from('%PDF-typeset'),calls:string[]=[];
 const rpc=async(name:string)=>{calls.push(name);return {data:name==='patient_invoice_document_edition'?{edition:'typeset',pdf:typeset.toString('base64')}:original.toString('base64'),error:null};};
 assert.equal((await resolvePatientInvoicePdf(rpc,'id')).edition,'typeset');
 assert.equal((await resolvePatientInvoicePdf(rpc,'id',true)).edition,'original');
 assert.deepEqual(calls,['patient_invoice_document_edition','patient_invoice_document_pdf']);
 assert.equal((await resolvePatientInvoicePdf(async(name)=>name==='patient_invoice_document_edition'?{data:null,error:{code:'PGRST202'}}:{data:original.toString('base64'),error:null},'id')).edition,'original');
 assert.equal((await resolvePatientInvoicePdf(async(name)=>name==='patient_invoice_document_edition'?{data:{edition:'typeset',pdf:'broken'},error:null}:{data:original.toString('base64'),error:null},'id')).edition,'original');
});
test('Forbidden and foreign/withdrawn invoice results never fall through to another access path',async()=>{
 const {resolvePatientInvoicePdf}=await import('../../patient-invoice-documents');
 for(const response of [{data:null,error:{code:'42501'}},{data:null,error:null}]){
  let calls=0;const result=await resolvePatientInvoicePdf(async()=>{calls++;return response;},'id');
  assert.equal(calls,1);assert.equal(result.status,response.error?403:404);assert.equal(result.bytes,undefined);
 }
 const result=attachPatientInvoiceDocuments([],[{...doc,edition:{delivered:'typeset',typesetAvailable:true}}]);
 assert.equal(result[0].beleg?.edition.delivered,'typeset');assert.ok(result[0].beleg?.edition.originalPdfUrl.endsWith('?original=1'));
});
