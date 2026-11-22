import {generateText,Output} from 'ai';
import {gatewayOptions} from './animahost-whatsapp-conversation';
import type {Generate} from './animahost-chain';

/** Die Kette spricht mit demselben Modellzugang wie der Rest von AnimaHost: Verarbeitung in der EU, ohne Speicherung beim Anbieter. */
export function gatewayGenerate(model:string,signal:AbortSignal):Generate{
 return async call=>{
  const result=await generateText({model,providerOptions:gatewayOptions,maxRetries:0,temperature:call.temperature,maxOutputTokens:call.maxOutputTokens,
   abortSignal:AbortSignal.any([signal,AbortSignal.timeout(call.timeoutMs)]),output:Output.object({schema:call.schema}),
   system:call.system,prompt:call.prompt});
  return result.output;
 };
}
