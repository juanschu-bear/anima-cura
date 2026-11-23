import test from 'node:test';import assert from 'node:assert/strict';
import run from '../../../../docs/animahost/2026-11-23-acceptance-run.json';
test('full acceptance artifact separates approved and draft runs and never invents send times',()=>{
 for(const cases of [run.cases,run.approvedCases]){assert.equal(cases.length,239);assert.equal(new Set(cases.map(c=>c.ref)).size,239);
 for(const c of cases){assert.ok(c.at);assert.equal(c.sendDelaySeconds,null);assert.equal(c.sendStatus,'not_sent_dry_run');assert.deepEqual(Object.keys(c.retrieved).sort(),['gold','history','knowledge','rule']);assert.doesNotMatch(c.input+' '+c.answer,/@s\.whatsapp\.net|@lid|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/);}}
 assert.equal(run.mode,'draft_preview');assert.ok(run.cases.find(c=>c.ref==='L26'));
});
