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
