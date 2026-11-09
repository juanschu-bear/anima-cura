import test from 'node:test';import assert from 'node:assert/strict';
import {patientSyncMode,isPatientSyncCron,discoveryRows} from '../patient-sync-schedule';
import {readFileSync} from 'node:fs';
test('15 minute discovery preserves five full-refresh windows, without AI',()=>{
 const cron=JSON.parse(readFileSync('vercel.json','utf8')).crons.find((c:{path:string})=>c.path==='/api/cron/patients');assert.equal(cron.schedule,'*/15 * * * *');
 assert.equal(patientSyncMode(new Date('2026-11-09T10:00:00Z')),'full');
 assert.equal(patientSyncMode(new Date('2026-11-09T10:15:00Z')),'discover');
 assert.equal(patientSyncMode(new Date('2026-11-09T11:00:00Z')),'discover');
});
test('unconfigured scheduler secret never authorizes a request',()=>{
 assert.equal(isPatientSyncCron(new Request('https://test',{headers:{authorization:'Bearer undefined'}}),undefined),false);
 assert.equal(isPatientSyncCron(new Request('https://test',{headers:{authorization:'Bearer test-secret'}}),'test-secret'),true);
});

test('discovery keeps only unknown patients and preserves alias matches without rewriting',()=>{
 const rows=[{ivoris_id:'existing',value:'keep local'},{ivoris_id:'alias',value:'keep local'},{ivoris_id:'new',value:'new data'}];
 assert.deepEqual(discoveryRows(rows,new Set(['existing']),new Set(['alias'])),[rows[2]]);
});
