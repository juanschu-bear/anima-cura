import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceReadDenied,patientInvoiceAvailability} from '../../patient-invoice-availability';
import {resolvePatientInvoicePdf} from '../../patient-invoice-documents';
test('schema denial is an outage, explicit patient guard remains forbidden',async()=>{
 for(const [message,status] of [['permission denied for schema auth',503],['patient_invoice_forbidden',403]] as const){
  const result=await resolvePatientInvoicePdf(async()=>({data:null,error:{code:'42501',message}}),'test');
  assert.equal(result.status,status);
 }
 assert.equal(invoiceReadDenied({code:'42501'}),false);
});
test('membership failure cannot become a complete empty invoice list',()=>{
 assert.equal(patientInvoiceAvailability({documents:null,editions:null,memberships:{code:'42501'}}).status,'unavailable');
 const status=patientInvoiceAvailability({documents:null,editions:{code:'42501'},memberships:null},'test-time');
 assert.equal(status.status,'available');assert.equal(status.editionsStatus,'unavailable');assert.equal(status.checkedAt,'test-time');
});
