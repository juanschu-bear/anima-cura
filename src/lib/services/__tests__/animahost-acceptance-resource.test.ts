import test from 'node:test';import assert from 'node:assert/strict';
import run from '../../../../docs/animahost/2026-11-23-acceptance-run.json';
test('full acceptance artifact separates approved and draft runs and never invents send times',()=>{
 for(const cases of [run.cases,run.approvedCases]){assert.equal(cases.length,239);assert.equal(new Set(cases.map(c=>c.ref)).size,239);
 for(const c of cases){assert.ok(c.at);assert.equal(c.sendDelaySeconds,null);assert.equal(c.sendStatus,'not_sent_dry_run');assert.deepEqual(Object.keys(c.retrieved).sort(),['gold','history','knowledge','rule']);assert.doesNotMatch(c.input+' '+c.answer,/@s\.whatsapp\.net|@lid|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/);}}
 assert.equal(run.mode,'draft_preview');assert.ok(run.cases.find(c=>c.ref==='L26'));
});

test('the rulebook 9 run records both coverage and the independent quality outcome',()=>{
 assert.equal(run.rulebookVersion,9);
 assert.equal(run.complete,true);
 assert.equal(run.validForAcceptance,run.technicalErrors===0&&run.qualityFindings===0);
 assert.deepEqual(run.cases.map(c=>c.ref),run.approvedCases.map(c=>c.ref));
 const cases=[...run.cases,...run.approvedCases];
 for(const c of cases){
  assert.ok(['du','Sie'].includes(c.anrede));
  assert.ok([null,1,2,3].includes(c.clarificationStage));
  assert.equal(Boolean(c.error),c.status==='technical_error');
  assert.equal(Boolean(c.quality),Boolean(c.answer.trim()));
 }
 assert.equal(cases.filter(c=>c.quality?.patterns.length).length,run.qualityFindings);
 assert.equal(cases.filter(c=>c.error).length,run.technicalErrors);
});
