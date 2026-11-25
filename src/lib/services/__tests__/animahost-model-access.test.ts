import test from 'node:test';
import assert from 'node:assert/strict';
import {animahostLanguageModel,anthropicCostUsd,creditExhausted,directModelId,ModelAccessError} from '../animahost-model-access';
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
});

test('Leeres Guthaben der direkten API gilt als erschöpftes Budget', () => {
 assert.equal(creditExhausted({statusCode:400,message:'Your credit balance is too low to access the Anthropic API.'}),true);
 assert.equal(creditExhausted({statusCode:400,message:'max_tokens too large'}),false);
 const wrapped={name:'AI_RetryError',lastError:{name:'AI_APICallError',statusCode:400,responseBody:'{"error":{"message":"Your credit balance is too low"}}'}};
 assert.equal(classifyModelFailure(wrapped,'compose').code,'model_budget_exhausted');
});

