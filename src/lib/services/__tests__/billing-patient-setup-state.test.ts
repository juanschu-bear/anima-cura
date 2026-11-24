import {test} from 'node:test';
import assert from 'node:assert/strict';
import {patientHasFinancialData} from '../../patient-setup-state';
const empty={reportedFinancialData:false,paymentCount:0,invoiceCount:0,invoiceHistoryCount:0};
test('invoice-only patients do not see the setup screen',()=>{
 assert.equal(patientHasFinancialData({...empty,invoiceCount:1}),true);
 assert.equal(patientHasFinancialData({...empty,invoiceHistoryCount:1}),true);
 assert.equal(patientHasFinancialData(empty),false);
 assert.equal(patientHasFinancialData({...empty,paymentCount:1}),true);
 assert.equal(patientHasFinancialData({...empty,reportedFinancialData:true}),true);
});
