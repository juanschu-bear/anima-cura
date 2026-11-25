import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyModelFailure,withGatewayRetry} from '../animahost-model-failure';

test('HTTP 402 maps to an operations incident without retaining provider text',()=>{
 for(const statusCode of [402])assert.deepEqual(
  classifyModelFailure(new Error('SDK wrapper',{cause:{statusCode,message:'private provider payload'}}),'verify'),
  {code:'model_budget_exhausted',stage:'verify',httpStatus:statusCode});
});
test('timeouts and malformed structured output retain distinct reasons',()=>{
 assert.equal(classifyModelFailure({name:'TimeoutError'},'compose').code,'model_timeout');
 assert.equal(classifyModelFailure({name:'AI_NoObjectGeneratedError',cause:{name:'AI_JSONParseError'}},'compose').code,'model_invalid_json');
 assert.equal(classifyModelFailure({name:'ProviderError',statusCode:503},'compose').code,'model_provider_error');
});

test('transient errors retry once, 429 is not an empty balance',async()=>{
 assert.equal(classifyModelFailure({statusCode:429},'verify').code,'model_provider_error');
 for(const statusCode of [429,500,503]){
  let calls=0,pauses=0;
  assert.equal(await withGatewayRetry(async()=>{if(!calls++)throw {statusCode};return 'ok';},{signal:new AbortController().signal,stage:'verify',pause:async ms=>{assert.equal(ms,750);pauses++;}}),'ok');
  assert.equal(calls,2);assert.equal(pauses,1);
 }
 let calls=0;await assert.rejects(withGatewayRetry(async()=>{calls++;throw Object.assign(new Error('temporary'),{statusCode:500});},{signal:new AbortController().signal,stage:'verify',pause:async()=>{}}));assert.equal(calls,2);
});
test('empty credit behind an internal gateway error is explicit and never retried',async()=>{
 let calls=0;
 await assert.rejects(withGatewayRetry(async()=>{calls++;throw Object.assign(new Error(),{name:'GatewayInternalServerError'});},{signal:new AbortController().signal,stage:'verify',balance:async()=>-0.001,pause:async()=>{throw Error('must not retry');}}),e=>classifyModelFailure(e,'verify').code==='model_budget_exhausted');assert.equal(calls,1);
});
test('authorization failures and aborted requests are not retried',async()=>{
 let calls=0;await assert.rejects(withGatewayRetry(async()=>{calls++;throw Object.assign(new Error(),{statusCode:401});},{signal:new AbortController().signal,stage:'compose'}));assert.equal(calls,1);
 const controller=new AbortController();controller.abort();await assert.rejects(withGatewayRetry(async()=>{calls++;return 1;},{signal:controller.signal,stage:'compose'}));assert.equal(calls,1);
});

test('repair loop cannot restart exhausted transport; incident retains verifier stage',async()=>{
 const {captureModelFailure}=await import('../animahost-model-failure');
 const {z}=await import('zod');let calls=0;
 const result=await captureModelFailure(async()=>{calls++;throw Object.assign(new Error(),{statusCode:402});},async generate=>{
  for(let i=0;i<2;i++)try{await generate({stage:'verify',system:'',prompt:'synthetic',schema:z.string(),maxOutputTokens:10,temperature:0,timeoutMs:1000});}catch{}
  return {text:'',checks:[] as unknown[],error:undefined as ReturnType<typeof classifyModelFailure>|undefined};
 });
 assert.equal(calls,1);assert.deepEqual(result.error,{code:'model_budget_exhausted',stage:'verify',httpStatus:402});assert.equal(result.checks.length,1);
});
