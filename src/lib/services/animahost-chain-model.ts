import {generateText,NoObjectGeneratedError,Output} from 'ai';
import type {SystemModelMessage} from 'ai';
import {gatewayOptions} from './animahost-whatsapp-conversation';
import type {Generate} from './animahost-chain';

/** Technische Spur eines Modellaufrufs: Dauer, Ende und Länge. Nie ein Inhalt. */
export type ModelCall={stage:'compose'|'verify';reasoning:'none'|'low';promptChars:number;systemChars:number;ms:number;finish:string;outputTokens:number|null;reasoningTokens:number|null;textChars:number|null;parts:string|null;inputTokens:number|null;failure:string|null;
 cacheReadTokens:number|null;cacheWriteTokens:number|null;costUsd:number|null};

export function cacheableInstructions(model:string,system:string,cacheStatic:boolean):string|SystemModelMessage{
 return cacheStatic&&model.startsWith('anthropic/')?{role:'system',content:system,
  providerOptions:{anthropic:{cacheControl:{type:'ephemeral'}}}}:system;
}

export function gatewayDollarAmount(value:unknown):number|null{
 if(typeof value!=='number'&&(typeof value!=='string'||!value.trim()))return null;
 const amount=Number(value);
 return Number.isFinite(amount)?amount:null;
}

/** Warum ein Modellaufruf scheiterte: nur Art und technische Kennzahlen, nie ein Inhalt. */
export function modelFailure(error:unknown):string{
 if(NoObjectGeneratedError.isInstance(error)){
  const cause=error.cause instanceof Error?error.cause.name:'none';
  return `no_object:${error.finishReason??'unknown'}:${cause}`.slice(0,120);
 }
 const status=(error as {statusCode?:unknown})?.statusCode;
 const http=typeof status==='number'&&status>=400&&status<=599?':http_'+status:'';
 return ((error instanceof Error?error.name:'unknown')+http).slice(0,80);
}

/** Die Kette spricht mit demselben Modellzugang wie der Rest von AnimaHost: Verarbeitung in der EU, ohne Speicherung beim Anbieter. */
export function gatewayGenerate(model:string,signal:AbortSignal,onCall?:(call:ModelCall)=>void,options:{cacheStatic?:boolean;tags?:string[]}={}):Generate{
 return async call=>{
  const started=Date.now();
  const stage=call.stage??'compose';
  // The replay of the previous core retains its original settings.
  const reasoning=call.reasoning??(stage==='verify'?'low':'none');
  const metrics={stage,reasoning,promptChars:call.prompt.length,systemChars:call.system.length};
  let finish='none',outputTokens:number|null=null,reasoningTokens:number|null=null,textChars:number|null=null,parts:string|null=null,inputTokens:number|null=null;
  let cacheReadTokens:number|null=null,cacheWriteTokens:number|null=null,costUsd:number|null=null;
  const record=(failure:string|null)=>onCall?.({...metrics,ms:Date.now()-started,finish,outputTokens,reasoningTokens,textChars,parts,inputTokens,
   cacheReadTokens,cacheWriteTokens,costUsd,failure});
  try{
   const result=await generateText({model,reasoning,providerOptions:{gateway:{...gatewayOptions.gateway,...(options.tags?.length?{tags:options.tags}:{})}},
    maxRetries:0,...(/^anthropic\/claude-(haiku|sonnet|opus)-5\.5$/.test(model)?{}:{temperature:call.temperature}),maxOutputTokens:call.maxOutputTokens,
    abortSignal:AbortSignal.any([signal,AbortSignal.timeout(call.timeoutMs)]),output:Output.object({schema:call.schema}),
    system:cacheableInstructions(model,call.system,options.cacheStatic===true),prompt:call.prompt,
    onStepFinish(step){
     finish=step.finishReason;outputTokens=step.usage.outputTokens??null;inputTokens=step.usage.inputTokens??null;
     reasoningTokens=step.usage.outputTokenDetails?.reasoningTokens??null;textChars=step.text.length;
     cacheReadTokens=step.usage.inputTokenDetails?.cacheReadTokens??null;
     cacheWriteTokens=step.usage.inputTokenDetails?.cacheWriteTokens??null;
     costUsd=gatewayDollarAmount(step.providerMetadata?.gateway?.cost);
     parts=step.content.map(part=>part.type).join(',').slice(0,120);
    }});
   const output=result.output;
   record(null);
   return output;
  }catch(error){record(modelFailure(error));throw error;}
 };
}
