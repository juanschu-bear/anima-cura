import type {Generate} from './animahost-chain';
export type ModelFailureCode='model_budget_exhausted'|'model_timeout'|'model_invalid_json'|'model_provider_error';
export type ModelFailure={code:ModelFailureCode;stage:'compose'|'verify';httpStatus?:number};

/** Provider errors can be wrapped by the SDK. Keep classifications and HTTP status only. */
export function classifyModelFailure(error:unknown,stage:ModelFailure['stage']):ModelFailure{
 let candidate=error;
 let timeout=false,invalidJson=false,status:number|undefined;
 for(let level=0;level<8&&candidate&&typeof candidate==='object';level++){
  const value=candidate as {name?:unknown;statusCode?:unknown;status?:unknown;code?:unknown;cause?:unknown;lastError?:unknown};
  if(value.code==='model_budget_exhausted')return {code:'model_budget_exhausted',stage};
  const http=value.statusCode??value.status;
  if(http===402)return {code:'model_budget_exhausted',stage,httpStatus:http};
  if(typeof http==='number'&&http>=400&&http<=599)status??=http;
  if(['TimeoutError','AbortError','GatewayTimeoutError','ConnectTimeoutError','HeadersTimeoutError'].includes(String(value.name))||
   value.code==='UND_ERR_CONNECT_TIMEOUT'||http===408||http===504)timeout=true;
  if(/NoObjectGenerated|NoOutputGenerated|TypeValidation|JSONParse|ZodError/.test(String(value.name)))invalidJson=true;
  candidate=value.cause??value.lastError;
 }
 return {code:timeout?'model_timeout':invalidJson?'model_invalid_json':'model_provider_error',stage,...(status?{httpStatus:status}:{})};
}

/** Exactly one technical retry, independent of content correction. Never retry exhausted credit. */
export async function withGatewayRetry<T>(run:()=>Promise<T>,options:{signal:AbortSignal;stage:ModelFailure['stage'];balance?:()=>Promise<number|null>;pause?:(ms:number)=>Promise<void>;onRetry?:()=>void}):Promise<T>{
 for(let attempt=0;;attempt++){
  options.signal.throwIfAborted();
  try{return await run();}catch(error){
   let failure=classifyModelFailure(error,options.stage);
   if(failure.code==='model_provider_error'&&options.balance){
    const balance=await options.balance().catch(()=>null);
    if(balance!==null&&balance<=0){
     const exhausted=new Error('model_budget_exhausted',{cause:error});
     Object.assign(exhausted,{code:'model_budget_exhausted'});throw exhausted;
    }
   }
   const transient=failure.code==='model_timeout'||failure.code==='model_provider_error'&&
    (failure.httpStatus===429||Boolean(failure.httpStatus&&failure.httpStatus>=500)||/GatewayInternalServerError|ECONNRESET|ECONNREFUSED|fetch failed/i.test(String((error as Error)?.name)+' '+String((error as Error)?.message)));
   if(attempt||!transient||options.signal.aborted)throw error;
   options.onRetry?.();
   if(options.pause)await options.pause(750);
   else await new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(options.signal.reason);};
    const timer=setTimeout(()=>{options.signal.removeEventListener('abort',abort);resolve();},750);
    options.signal.addEventListener('abort',abort,{once:true});
   });
  }
 }
}

/** Keep an exhausted transport from being retried again by the content-repair loop. */
export async function captureModelFailure<T extends {checks?:unknown[];error?:ModelFailure}>(generate:Generate,run:(generate:Generate)=>Promise<T>):Promise<T>{
 let failure:ModelFailure|undefined,original:unknown;
 const guarded:Generate=async call=>{
  if(failure)throw original;
  try{return await generate(call);}catch(error){failure=classifyModelFailure(error,call.stage??'compose');original=error;throw error;}
 };
 const result=await run(guarded);
 if(failure){result.error=failure;result.checks?.push({modelFailure:failure});}
 return result;
}
