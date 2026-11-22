import {generateText,NoObjectGeneratedError,Output} from 'ai';
import {gatewayOptions} from './animahost-whatsapp-conversation';
import type {Generate} from './animahost-chain';

/** Technische Spur eines Modellaufrufs: Dauer, Ende und Länge. Nie ein Inhalt. */
export type ModelCall={ms:number;finish:string;outputTokens:number|null;failure:string|null};

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
  let finish='none',outputTokens:number|null=null;
  try{
   const result=await generateText({model,providerOptions:gatewayOptions,maxRetries:0,temperature:call.temperature,maxOutputTokens:call.maxOutputTokens,
    abortSignal:AbortSignal.any([signal,AbortSignal.timeout(call.timeoutMs)]),output:Output.object({schema:call.schema}),
    system:call.system,prompt:call.prompt});
   finish=result.finishReason;outputTokens=result.usage.outputTokens??null;
   const output=result.output;
   onCall?.({ms:Date.now()-started,finish,outputTokens,failure:null});
   return output;
  }catch(error){onCall?.({ms:Date.now()-started,finish,outputTokens,failure:modelFailure(error)});throw error;}
 };
}
