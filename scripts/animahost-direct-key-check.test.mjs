import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkDirectKeys} from './animahost-direct-key-check.mjs';
test('checks separate keys without model generation or leaking credentials',async()=>{
 const seen=[];
 const result=await checkDirectKeys({ANIMAHOST_ANTHROPIC_LIVE_KEY:'live-secret',ANIMAHOST_ANTHROPIC_TEST_KEY:'test-secret'},async(url,options)=>{
  seen.push({url,options});return {ok:true,status:200,json:async()=>({data:[{id:'claude-haiku-5-5'},{id:'unrelated'}]})};
 });
 assert.equal(result.distinct,true);assert.equal(result.generationRequests,0);
 assert.deepEqual(seen.map(x=>x.options.headers['x-api-key']),['live-secret','test-secret']);
 assert.ok(seen.every(x=>x.options.method==='GET'&&!x.options.body&&x.options.redirect==='error'));
 assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.deepEqual(result.results[0].haikuModels,['claude-haiku-5-5']);
});
test('missing or failed credentials cannot be mistaken for verified access',async()=>{
 let calls=0;const missing=await checkDirectKeys({},async()=>{calls++;throw Error('secret');});
 assert.equal(calls,0);assert.equal(missing.distinct,false);
 const failed=await checkDirectKeys({ANIMAHOST_ANTHROPIC_LIVE_KEY:'same',ANIMAHOST_ANTHROPIC_TEST_KEY:'same'},async()=>{throw Error('secret');});
 assert.equal(failed.distinct,false);assert.ok(failed.results.every(x=>x.status==='unavailable'));
 assert.equal(JSON.stringify(failed).includes('secret'),false);
});
