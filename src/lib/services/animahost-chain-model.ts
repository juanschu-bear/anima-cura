import {remoteTestGenerate} from './animahost-test-transport';
import {withGatewayRetry} from './animahost-model-failure';
import {generateText,NoObjectGeneratedError,Output} from 'ai';
import type {SystemModelMessage} from 'ai';
import type {Generate} from './animahost-chain';
import {animahostLanguageModel,anthropicCostUsd,type ModelPurpose} from './animahost-model-access';

/** Technische Spur eines Modellaufrufs: Dauer, Ende und Länge. Nie ein Inhalt. */
export type ModelCall={stage:'compose'|'verify';reasoning:'none'|'low';promptChars:number;systemChars:number;ms:number;finish:string;outputTokens:number|null;reasoningTokens:number|null;textChars:number|null;parts:string|null;inputTokens:number|null;failure:string|null;
 cacheReadTokens:number|null;cacheWriteTokens:number|null;costUsd:number|null;technicalRetries?:number};

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

/**
 * Modellaufruf für AnimaHost über den direkten Anthropic-Zugang. purpose entscheidet den Schlüssel: 'live' für Patientenantworten,
 * 'test' für Qualitätsläufe, Probelauf und Proben.
 */
export function modelGenerate(model:string,signal:AbortSignal,onCall?:(call:ModelCall)=>void,options:{cacheStatic?:boolean;tags?:string[];purpose?:ModelPurpose}={}):Generate{
 const purpose=options.purpose??'live';
 if(purpose==='test'&&process.env.ANIMAHOST_TEST_TRANSPORT_SECRET)return remoteTestGenerate(process.env.ANIMAHOST_TEST_TRANSPORT_SECRET,signal);
 return async call=>{
  const started=Date.now();
  const stage=call.stage??'compose';
  // The replay of the previous core retains its original settings.
  const reasoning=call.reasoning??(stage==='verify'?'low':'none');
  const metrics={stage,reasoning,promptChars:call.prompt.length,systemChars:call.system.length};
  let technicalRetries=0;
  const callSignal=AbortSignal.any([signal,AbortSignal.timeout(call.timeoutMs)]);
  let finish='none',outputTokens:number|null=null,reasoningTokens:number|null=null,textChars:number|null=null,parts:string|null=null,inputTokens:number|null=null;
  let cacheReadTokens:number|null=null,cacheWriteTokens:number|null=null,costUsd:number|null=null,spentUsd=0,priced=true;
  const record=(failure:string|null)=>onCall?.({...metrics,ms:Date.now()-started,finish,outputTokens,reasoningTokens,textChars,parts,inputTokens,
   cacheReadTokens,cacheWriteTokens,costUsd,failure,technicalRetries});
  try{
   const languageModel=animahostLanguageModel(model,purpose);
   const result=await withGatewayRetry(()=>generateText({model:languageModel,reasoning,
    maxRetries:0,...(/^anthropic\/claude-(haiku|sonnet|opus)-5\.5$/.test(model)?{}:{temperature:call.temperature}),maxOutputTokens:call.maxOutputTokens,
    abortSignal:callSignal,...(call.plainText?{}:{output:Output.object({schema:call.schema})}),
    ...(call.system?{system:cacheableInstructions(model,call.system,options.cacheStatic===true)}:{}),prompt:call.prompt,
    onStepFinish(step){
     finish=step.finishReason;outputTokens=step.usage.outputTokens??null;inputTokens=step.usage.inputTokens??null;
     reasoningTokens=step.usage.outputTokenDetails?.reasoningTokens??null;textChars=step.text.length;
     cacheReadTokens=step.usage.inputTokenDetails?.cacheReadTokens??null;
     cacheWriteTokens=step.usage.inputTokenDetails?.cacheWriteTokens??null;
     const stepCost=anthropicCostUsd(model,{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,noCacheTokens:step.usage.inputTokenDetails?.noCacheTokens??null});
     if(stepCost==null)priced=false;else spentUsd+=stepCost;
     costUsd=priced?Math.round(spentUsd*1e9)/1e9:null;
     parts=step.content.map(part=>part.type).join(',').slice(0,120);
    }}),{signal:callSignal,stage,onRetry:()=>{technicalRetries++;}});
   const output=call.plainText?call.schema.parse(result.text):result.output;
   record(null);
   return output;
  }catch(error){record(modelFailure(error));throw error;}
 };
}

/** Für Skripte (Qualitätsläufe, Benchmarks, Proben): immer Test-Schlüssel. Patientenantworten nutzen modelGenerate mit 'live'. */
export function testModelGenerate(model:string,signal:AbortSignal,onCall?:(call:ModelCall)=>void,options:{cacheStatic?:boolean;tags?:string[]}={}):Generate{
 return modelGenerate(model,signal,onCall,{...options,purpose:'test'});
}
/** Früherer Name, von den Skripten noch verwendet. Läuft ausschließlich als Test. */
export const gatewayGenerate=testModelGenerate;
