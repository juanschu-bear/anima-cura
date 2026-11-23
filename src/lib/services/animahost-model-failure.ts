export type ModelFailureCode='model_budget_exhausted'|'model_timeout'|'model_invalid_json'|'model_provider_error';
export type ModelFailure={code:ModelFailureCode;stage:'compose'|'verify';httpStatus?:number};

/** Provider errors can be wrapped by the SDK. Keep classifications and HTTP status only. */
export function classifyModelFailure(error:unknown,stage:ModelFailure['stage']):ModelFailure{
 let candidate=error;
 let timeout=false,invalidJson=false,status:number|undefined;
 for(let level=0;level<8&&candidate&&typeof candidate==='object';level++){
  const value=candidate as {name?:unknown;statusCode?:unknown;status?:unknown;code?:unknown;cause?:unknown;lastError?:unknown};
  const http=value.statusCode??value.status;
  if(http===402||http===429)return {code:'model_budget_exhausted',stage,httpStatus:http};
  if(typeof http==='number'&&http>=400&&http<=599)status??=http;
  if(['TimeoutError','AbortError','GatewayTimeoutError','ConnectTimeoutError','HeadersTimeoutError'].includes(String(value.name))||
   value.code==='UND_ERR_CONNECT_TIMEOUT'||http===408||http===504)timeout=true;
  if(/NoObjectGenerated|NoOutputGenerated|TypeValidation|JSONParse|ZodError/.test(String(value.name)))invalidJson=true;
  candidate=value.cause??value.lastError;
 }
 return {code:timeout?'model_timeout':invalidJson?'model_invalid_json':'model_provider_error',stage,...(status?{httpStatus:status}:{})};
}
