import assert from 'node:assert/strict';
import test from 'node:test';
import {recoverPatientInvoice} from '../animahost-invoice-recovery';
import {decodePatientDocumentRecord,isInvoiceDocumentType} from '@/lib/patient-document-types';
import {resolvePatientInvoicePdf} from '@/lib/patient-invoice-documents';

test('WhatsApp never claims that a privileged copy proves patient access',async()=>{
 const db=new Proxy({},{get(){throw Error('Must not inspect or write privileged documents');}}) as never;
 assert.deepEqual(await recoverPatientInvoice(db,'patient',{from:null,through:null}),{cause:'manual_review',invoiceDate:null});
});

test('only explicitly typed invoices move out of Documents',()=>{
 assert.equal(isInvoiceDocumentType(decodePatientDocumentRecord({name:'[[typ:rechnung]] Rechnung',typ:'ratenzahlung'}).typ),true);
 assert.equal(isInvoiceDocumentType(decodePatientDocumentRecord({name:'[[typ:erste_rechnung]] Erste',typ:'ratenzahlung'}).typ),true);
 assert.equal(isInvoiceDocumentType(decodePatientDocumentRecord({name:'Ratenzahlungsvereinbarung Rechnung 12',typ:'ratenzahlung'}).typ),false);
 assert.equal(isInvoiceDocumentType(decodePatientDocumentRecord({name:'Heil- und Kostenplan',typ:'kostenplan'}).typ),false);
});

test('a missing edition falls back to the original through the same patient RPC',async()=>{
 const calls:string[]=[];
 const pdf=Buffer.from('%PDF-1.7\nFixture');
 const result=await resolvePatientInvoicePdf(async name=>{
  calls.push(name);
  return {data:name==='patient_invoice_document_edition'?null:pdf.toString('base64'),error:null};
 },'invoice');
 assert.deepEqual(calls,['patient_invoice_document_edition','patient_invoice_document_pdf']);
 assert.deepEqual(result.bytes,pdf);
});

test('a patient denial never falls back to another document source',async()=>{
 const calls:string[]=[];
 const result=await resolvePatientInvoicePdf(async name=>{
  calls.push(name);
  return {data:null,error:{code:'42501',message:'patient_invoice_forbidden'}};
 },'invoice');
 assert.deepEqual(calls,['patient_invoice_document_edition']);
 assert.equal(result.status,403);
});
