import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceNotificationDeliveryPatients,invoiceNotificationRows} from '../invoice-notification-persistence';
const primary='00000000-0000-4000-8000-000000000001',child='00000000-0000-4000-8000-000000000002',foreign='00000000-0000-4000-8000-000000000003';
test('sibling invoice targets the verified family login notification list and device, naming the invoiced child',()=>{
 const ids=invoiceNotificationDeliveryPatients([child],{role:'patient',patientId:primary,memberPatientIds:[child]});
 const rows=invoiceNotificationRows({patientIds:ids,jobId:'00000000-0000-4000-8000-000000000004',title:'Rechnung',text:'Rechnung für Kind Zwei'});
 assert.equal(rows.length,1);assert.equal(rows[0].patient_id,primary);assert.match(rows[0].text,/Kind Zwei/);
});
test('a revoked membership or staff profile cannot receive a patient invoice notification',()=>{
 for(const account of [{role:'patient',patientId:primary,memberPatientIds:[]},{role:'admin',patientId:primary,memberPatientIds:[child]},{role:'patient',patientId:null,memberPatientIds:[child]}])
  assert.throws(()=>invoiceNotificationDeliveryPatients([child],account),/account_scope_mismatch/);
 assert.throws(()=>invoiceNotificationDeliveryPatients([foreign],{role:'patient',patientId:primary,memberPatientIds:[child]}),/account_scope_mismatch/);
});
