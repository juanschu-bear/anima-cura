import assert from 'node:assert/strict';
import test from 'node:test';
import {cacheableInstructions,gatewayDollarAmount,type ModelCall} from '../animahost-chain-model';
import {measureReplyUsage,summarizeReplyUsage,usageMonthWindow} from '../animahost-usage';

const model='anthropic/claude-haiku-5.5';
const receipt=(over:Partial<ModelCall>={}):ModelCall=>({
 stage:'compose',reasoning:'low',promptChars:200,systemChars:1000,ms:50,finish:'stop',
 outputTokens:80,reasoningTokens:20,textChars:120,parts:'text',inputTokens:1100,
 failure:null,cacheReadTokens:1000,cacheWriteTokens:0,costUsd:0.0021,...over,
});

test('recorded costs include verification, retried invalid JSON and work without a reply',()=>{
 const answer=measureReplyUsage(model,[receipt(),receipt({stage:'verify',costUsd:0.0004}),receipt({failure:'no_object',costUsd:0.0008})],true);
 const withheld=measureReplyUsage(model,[receipt({costUsd:0.0007})],false);
 const result=summarizeReplyUsage([{timings:{usage:answer}},{timings:{usage:withheld}}],1);
 assert.equal(result.totalCostUsd,0.004);
 assert.equal(result.averageCostUsd,0.004);
 assert.equal(result.costedAnswerCount,1);
 assert.equal(result.cacheReadTokens,4000);
 assert.equal(result.outputTokens,320);
 assert.equal(result.complete,true);
});

test('unknown costs and old rows are visible without pretending they cost zero',()=>{
 const unpriced=measureReplyUsage(model,[receipt({costUsd:null,inputTokens:null})],true);
 assert.equal(unpriced.costUsd,null);
 const result=summarizeReplyUsage([{timings:{usage:unpriced}},{}],2);
 assert.equal(result.complete,false);
 assert.equal(result.unmeteredAnswers,2);
 assert.equal(result.unpricedCalls,1);
 assert.equal(result.averageCostUsd,null);
 assert.equal(measureReplyUsage(model,[],true).costUsd,0);
 assert.equal(gatewayDollarAmount(''),null);
 assert.equal(gatewayDollarAmount(undefined),null);
 assert.equal(gatewayDollarAmount('-0.01'),-0.01);
});

test('a usage month follows Berlin midnight and both prevailing UTC offsets',()=>{
 assert.deepEqual(usageMonthWindow(new Date('2026-04-30T22:30:00.000Z')),{
  month:'2026-05',timezone:'Europe/Berlin',from:'2026-04-30T22:00:00.000Z',to:'2026-05-31T22:00:00.000Z',asOf:'2026-04-30T22:30:00.000Z',
 });
 assert.equal(usageMonthWindow(new Date('2026-12-10T08:00:00.000Z')).from,'2026-11-30T23:00:00.000Z');
});

test('only opted-in stable Anthropic instructions carry an explicit cache marker',()=>{
 assert.deepEqual(cacheableInstructions(model,'Allgemeine Regel',true),{
  role:'system',content:'Allgemeine Regel',providerOptions:{anthropic:{cacheControl:{type:'ephemeral'}}},
 });
 assert.equal(cacheableInstructions(model,'Allgemeine Regel',false),'Allgemeine Regel');
 assert.equal(cacheableInstructions('other/model','Allgemeine Regel',true),'Allgemeine Regel');
});
