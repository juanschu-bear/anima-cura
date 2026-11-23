import {generateText,NoObjectGeneratedError,Output} from 'ai';
import {gatewayOptions} from './animahost-whatsapp-conversation';
import type {Generate} from './animahost-chain';

/** Technische Spur eines Modellaufrufs: Dauer, Ende und Länge. Nie ein Inhalt. */
export type ModelCall={stage:'compose'|'verify';reasoning:'none'|'low';promptChars:number;systemChars:number;ms:number;finish:string;outputTokens:number|null;reasoningTokens:number|null;textChars:number|null;parts:string|null;inputTokens:number|null;failure:string|null};

/** Warum ein Modellaufruf scheiterte: nur Art und technische Kennzahlen, nie ein Inhalt. */
export function modelFailure(error:unknown):string{
 if(NoObjectGeneratedError.isInstance(error)){
  const cause=error.cause instanceof Error?error.cause.name:'none';
  return `no_object:${error.finishReason??'unknown'}:${cause}`.slice(0,120);
 }
 return (error instanceof Error?error.name:'unknown').slice(0,60);
}

/** Die Kette spricht mit demselben Modellzugang wie der Rest von AnimaHost: Verarbeitung in der EU, ohne Speicherung beim Anbieter. */
export function gatewayGenerate(model:string,signal:AbortSignal,onCall?:(call:ModelCall)=>void):Generate{
 return async call=>{
  const started=Date.now();
  const stage=call.stage??'compose';
  // The replay of the previous core retains its original settings.
  const reasoning=call.reasoning??(stage==='verify'?'low':'none');
  const metrics={stage,reasoning,promptChars:call.prompt.length,systemChars:call.system.length};
  let finish='none',outputTokens:number|null=null,reasoningTokens:number|null=null,textChars:number|null=null,parts:string|null=null,inputTokens:number|null=null;
  try{
   const result=await generateText({model,reasoning,providerOptions:gatewayOptions,maxRetries:0,temperature:call.temperature,maxOutputTokens:call.maxOutputTokens,
    abortSignal:AbortSignal.any([signal,AbortSignal.timeout(call.timeoutMs)]),output:Output.object({schema:call.schema}),
    system:call.system,prompt:call.prompt});
   finish=result.finishReason;outputTokens=result.usage.outputTokens??null;inputTokens=result.usage.inputTokens??null;
   reasoningTokens=result.usage.outputTokenDetails?.reasoningTokens??null;textChars=result.text.length;
   parts=result.content.map(part=>part.type).join(',').slice(0,120);
   const output=result.output;
   onCall?.({...metrics,ms:Date.now()-started,finish,outputTokens,reasoningTokens,textChars,parts,inputTokens,failure:null});
   return output;
  }catch(error){onCall?.({...metrics,ms:Date.now()-started,finish,outputTokens,reasoningTokens,textChars,parts,inputTokens,failure:modelFailure(error)});throw error;}
 };
}
