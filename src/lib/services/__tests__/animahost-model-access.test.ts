import test from 'node:test';
import assert from 'node:assert/strict';
import {animahostLanguageModel,anthropicCostUsd,creditExhausted,directModelId,maxCallCostUsd,ModelAccessError} from '../animahost-model-access';
import {budgetDay,reserveTestBudget,settleTestBudget} from '../animahost-model-budget';
import {classifyModelFailure} from '../animahost-model-failure';

test('Modell-ID der direkten API aus der bisherigen Einstellung', () => {
 assert.equal(directModelId('anthropic/claude-haiku-5.5'),'claude-haiku-5-5');
 assert.equal(directModelId('claude-sonnet-5-5'),'claude-sonnet-5-5');
 assert.throws(()=>directModelId('openai/gpt-6'),ModelAccessError);
});

test('Live und Test nur mit dem eigenen Schlüssel, ohne Ersatz und ohne ANTHROPIC_API_KEY', () => {
 const both={ANIMAHOST_ANTHROPIC_LIVE_KEY:'sk-ant-live-aaaaaa',ANIMAHOST_ANTHROPIC_TEST_KEY:'sk-ant-test-bbbbbb'};
 assert.equal((animahostLanguageModel('anthropic/claude-haiku-5.5','live',both) as {modelId:string}).modelId,'claude-haiku-5-5');
 assert.throws(()=>animahostLanguageModel('anthropic/claude-haiku-5.5','test',{ANIMAHOST_ANTHROPIC_LIVE_KEY:'sk-ant-live-aaaaaa',ANTHROPIC_API_KEY:'sk-ant-x'}),/model_key_missing:test/);
 assert.throws(()=>animahostLanguageModel('anthropic/claude-haiku-5.5','live',{ANIMAHOST_ANTHROPIC_TEST_KEY:'sk-ant-test-bbbbbb',ANTHROPIC_API_KEY:'sk-ant-x'}),/model_key_missing:live/);
});

test('Kosten aus Token-Zahlen nach Listenpreis Haiku 5.5', () => {
 // 10.000 Eingabe (davon 6.000 aus dem Cache gelesen), 400 Ausgabe
 assert.equal(anthropicCostUsd('anthropic/claude-haiku-5.5',{inputTokens:10_000,cacheReadTokens:6_000,cacheWriteTokens:0,outputTokens:400}),0.00066);
 // Über 100.000 Token kostet alles das 5-Fache
 assert.equal(anthropicCostUsd('anthropic/claude-haiku-5.5',{inputTokens:120_000,outputTokens:0}),0.06);
 assert.equal(anthropicCostUsd('anthropic/claude-sonnet-5.5',{inputTokens:10,outputTokens:10}),null);
 assert.equal(anthropicCostUsd('anthropic/claude-haiku-5.5',{inputTokens:null,outputTokens:10}),null);
 assert.ok((maxCallCostUsd('anthropic/claude-haiku-5.5',20_000,440)??0)>0.001);
});

test('Leeres Guthaben der direkten API gilt als erschöpftes Budget', () => {
 assert.equal(creditExhausted({statusCode:400,message:'Your credit balance is too low to access the Anthropic API.'}),true);
 assert.equal(creditExhausted({statusCode:400,message:'max_tokens too large'}),false);
 const wrapped={name:'AI_RetryError',lastError:{name:'AI_APICallError',statusCode:400,responseBody:'{"error":{"message":"Your credit balance is too low"}}'}};
 assert.equal(classifyModelFailure(wrapped,'compose').code,'model_budget_exhausted');
 assert.equal(classifyModelFailure(new ModelAccessError('test_budget_exhausted'),'compose').code,'model_budget_exhausted');
});

test('Testbudget: ohne eingespielte Tagesgrenze laufen keine Testaufrufe', async () => {
 const now=new Date('2026-11-25T23:30:00Z');
 assert.equal(budgetDay(now),'2026-11-26');
 await assert.rejects(()=>reserveTestBudget(0.01,now),/test_budget_not_ready/);
 await settleTestBudget({day:'2026-11-26',amountUsd:0.01},0.005);
});

test('Testaufrufe senden nichts, solange keine Tagesgrenze eingerichtet ist', async () => {
 const {testModelGenerate}=await import('../animahost-chain-model');
 const {z}=await import('zod');
 const previous=process.env.ANIMAHOST_ANTHROPIC_TEST_KEY;
 process.env.ANIMAHOST_ANTHROPIC_TEST_KEY='sk-ant-test-cccccc';
 let fetched=false;const realFetch=globalThis.fetch;globalThis.fetch=(async()=>{fetched=true;throw Error('no network in tests');}) as typeof fetch;
 try{
  const generate=testModelGenerate('anthropic/claude-haiku-5.5',AbortSignal.timeout(5000));
  await assert.rejects(()=>generate({system:'S',prompt:'P',schema:z.object({a:z.string()}),maxOutputTokens:100,timeoutMs:3000,temperature:0} as never),/test_budget_not_ready/);
  assert.equal(fetched,false);
 }finally{globalThis.fetch=realFetch;if(previous===undefined)delete process.env.ANIMAHOST_ANTHROPIC_TEST_KEY;else process.env.ANIMAHOST_ANTHROPIC_TEST_KEY=previous;}
});
