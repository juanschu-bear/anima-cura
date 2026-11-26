import test from 'node:test';import assert from 'node:assert/strict';import {z}from'zod';import {remoteTestGenerate}from'../animahost-test-transport';import {POST}from'../../../app/api/animahost/whatsapp/internal/model-probe/route';
test('remote replay serializes only model input and validates structured result locally',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://animacura.io/api/animahost/whatsapp/internal/model-probe');const b=JSON.parse(String(init?.body));assert.equal(b.schema.type,'object');assert.equal(b.maxOutputTokens,4000);assert.equal(b.timeoutMs,85000);assert.equal(b.patientId,undefined);return Response.json({result:{passed:true}});};
 const out=await remoteTestGenerate('synthetic',AbortSignal.timeout(1000))({stage:'verify',system:'',prompt:'synthetic',schema:z.object({passed:z.boolean()}),maxOutputTokens:9000,timeoutMs:90000,temperature:0});assert.equal(out.passed,true);
 }finally{globalThis.fetch=original;}
});
test('model probe rejects absent authentication before database or model access',async()=>{
 const old=process.env.ANIMAHOST_LINE_SECRET;delete process.env.ANIMAHOST_LINE_SECRET;
 try{assert.equal((await POST(new Request('https://example.test',{method:'POST'}) as never)).status,401);}finally{if(old===undefined)delete process.env.ANIMAHOST_LINE_SECRET;else process.env.ANIMAHOST_LINE_SECRET=old;}
});
