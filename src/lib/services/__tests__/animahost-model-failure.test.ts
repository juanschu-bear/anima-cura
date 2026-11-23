import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyModelFailure} from '../animahost-model-failure';

test('HTTP 402 and 429 map to an operations incident without retaining provider text',()=>{
 for(const statusCode of [402,429])assert.deepEqual(
  classifyModelFailure(new Error('SDK wrapper',{cause:{statusCode,message:'private provider payload'}}),'verify'),
  {code:'model_budget_exhausted',stage:'verify',httpStatus:statusCode});
});
test('timeouts and malformed structured output retain distinct reasons',()=>{
 assert.equal(classifyModelFailure({name:'TimeoutError'},'compose').code,'model_timeout');
 assert.equal(classifyModelFailure({name:'AI_NoObjectGeneratedError',cause:{name:'AI_JSONParseError'}},'compose').code,'model_invalid_json');
 assert.equal(classifyModelFailure({name:'ProviderError',statusCode:503},'compose').code,'model_provider_error');
});
