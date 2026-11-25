import {createAnthropic} from '@ai-sdk/anthropic';
import type {LanguageModel} from 'ai';

/**
 * Direkter Anthropic-Zugang für AnimaHost (Juan, 25.11.2026).
 * Live-Antworten laufen ausschließlich über ANIMAHOST_ANTHROPIC_LIVE_KEY, Qualitätsläufe, Probelauf und Proben ausschließlich
 * über ANIMAHOST_ANTHROPIC_TEST_KEY. Es gibt keinen gegenseitigen Ersatz und keinen Rückgriff auf ANTHROPIC_API_KEY:
 * fehlt der passende Schlüssel, scheitert der Aufruf sichtbar.
 * Verarbeitung: Anthropic-Standard „global“ (keine EU-only-Option bei der direkten API), bewusst so entschieden von Juan.
 */
export type ModelPurpose='live'|'test';
export const MODEL_KEY_ENV={live:'ANIMAHOST_ANTHROPIC_LIVE_KEY',test:'ANIMAHOST_ANTHROPIC_TEST_KEY'} as const;

export class ModelAccessError extends Error{
 code:string;
 constructor(code:string){super(code);this.name='ModelAccessError';this.code=code;}
}

/** „anthropic/claude-haiku-5.5“ (bisherige Einstellung) wird zu „claude-haiku-5-5“ (Modell-ID der direkten API). */
export function directModelId(model:string):string{
 const id=model.trim().replace(/^anthropic\//,'');
 if(!/^claude-[a-z]+-\d+(?:[.-]\d+)*$/.test(id))throw new ModelAccessError('model_not_anthropic');
 return id.replace(/\./g,'-');
}

const providers=new Map<string,ReturnType<typeof createAnthropic>>();
export function animahostLanguageModel(model:string,purpose:ModelPurpose,env:Record<string,string|undefined>=process.env):LanguageModel{
 const key=env[MODEL_KEY_ENV[purpose]]?.trim();
 if(!key)throw new ModelAccessError(`model_key_missing:${purpose}`);
 const cacheKey=purpose+':'+key.slice(-6);
 let provider=providers.get(cacheKey);
 if(!provider){provider=createAnthropic({apiKey:key});providers.set(cacheKey,provider);}
 return provider(directModelId(model));
}

/**
 * Listenpreise der direkten API in USD je 1 Mio. Token, Stand 25.11.2026, globale Verarbeitung (platform.claude.com/docs/en/about-claude/pricing).
 * Haiku 5.5 wird nach Promptlänge abgerechnet: über 100.000 Token kostet jede Position das 5-Fache.
 */
const PRICES:Record<string,{input:number;output:number;cacheRead:number;cacheWrite:number;longPromptFrom?:number;longFactor?:number}>={
 'claude-haiku-5-5':{input:0.10,output:0.50,cacheRead:0.01,cacheWrite:0.125,longPromptFrom:100_000,longFactor:5},
};
export type TokenUsage={inputTokens?:number|null;outputTokens?:number|null;noCacheTokens?:number|null;cacheReadTokens?:number|null;cacheWriteTokens?:number|null};

/** Kosten eines Aufrufs aus den Token-Zahlen. Unbekanntes Modell oder fehlende Zahlen: null, nie geraten. */
export function anthropicCostUsd(model:string,usage:TokenUsage):number|null{
 let id:string;try{id=directModelId(model);}catch{return null;}
 const price=PRICES[id];
 if(!price||usage.outputTokens==null||usage.inputTokens==null)return null;
 const read=usage.cacheReadTokens??0,write=usage.cacheWriteTokens??0;
 const plain=usage.noCacheTokens??Math.max(0,usage.inputTokens-read-write);
 const factor=price.longPromptFrom&&usage.inputTokens>price.longPromptFrom?price.longFactor??1:1;
 const usd=(plain*price.input+read*price.cacheRead+write*price.cacheWrite+usage.outputTokens*price.output)*factor/1_000_000;
 return Math.round(usd*1e9)/1e9;
}

/** Leeres Guthaben meldet die direkte API als HTTP 400 mit „credit balance is too low“, nicht als 402. */
export function creditExhausted(value:{statusCode?:unknown;status?:unknown;message?:unknown;responseBody?:unknown}):boolean{
 const http=value.statusCode??value.status;
 if(http!==400&&http!==402)return false;
 return /credit balance is too low/i.test(String(value.message??'')+' '+String(value.responseBody??''));
}
