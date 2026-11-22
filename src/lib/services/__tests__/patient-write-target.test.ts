import test from 'node:test';import assert from 'node:assert/strict';
import {patientWriteTarget} from '../../patient-write-target';
function db(rows:any[],error:any=null){const q:any={select(){return q},eq(){return q},ilike(){return q},limit:async()=>({data:rows,error})};return {from:()=>q};}
test('writes require exactly one patient and never first match',async()=>{
 assert.equal((await patientWriteTarget(db([{id:'a'},{id:'b'}]),{patient_name:'Bergmann'})).error,'patient_ambiguous');
 assert.equal((await patientWriteTarget(db([]),{patient_name:'Bergmann'})).error,'patient_not_found');
 assert.equal((await patientWriteTarget(db([{id:'a'}]),{patient_name:'Bergmann'})).patient.id,'a');
 assert.equal((await patientWriteTarget(db([],{message:'offline'}),{patient_name:'Bergmann'})).error,'patient_lookup_unavailable');
});
