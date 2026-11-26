import {zodSchema} from 'ai';import type {Generate} from './animahost-chain';
/** Local replay can use the test key inside Production, without exporting that API key. Live generation never calls this transport. */
export function remoteTestGenerate(secret:string,signal:AbortSignal):Generate{
 return async call=>{
  const response=await fetch('https://animacura.io/api/animahost/whatsapp/internal/model-probe',{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},cache:'no-store',redirect:'error',signal,
   body:JSON.stringify({system:call.system,prompt:call.prompt,plainText:call.plainText===true,...(call.plainText?{}:{schema:await zodSchema(call.schema).jsonSchema}),reasoning:call.reasoning??(call.stage==='verify'?'low':'none'),maxOutputTokens:Math.min(4000,call.maxOutputTokens),timeoutMs:Math.min(85000,Math.max(1000,call.timeoutMs))})});
  if(!response.ok)throw Error('remote_test_failed:'+response.status);
  const body=await response.json();return call.schema.parse(body.result);
 };
}
