import {createGateway} from 'ai';
import type {createServerClient} from '@/lib/db/supabase';
import {gatewayDollarAmount,type ModelCall} from './animahost-chain-model';

type Db=ReturnType<typeof createServerClient>;
const timezone='Europe/Berlin';
const roundUsd=(value:number)=>Number(value.toFixed(12));

export function measureReplyUsage(model:string,calls:ModelCall[],answered:boolean){
 const priced=calls.filter(call=>call.costUsd!==null);
 const missing=calls.length-priced.length;
 return {
  model,answered,modelCalls:calls.length,pricedCalls:priced.length,unpricedCalls:missing,
  inputTokens:calls.reduce((sum,call)=>sum+(call.inputTokens??0),0),
  outputTokens:calls.reduce((sum,call)=>sum+(call.outputTokens??0),0),
  cacheReadTokens:calls.reduce((sum,call)=>sum+(call.cacheReadTokens??0),0),
  cacheWriteTokens:calls.reduce((sum,call)=>sum+(call.cacheWriteTokens??0),0),
  costUsd:priced.length||!calls.length?roundUsd(priced.reduce((sum,call)=>sum+(call.costUsd??0),0)):null,
 };
}
type ReplyUsage=ReturnType<typeof measureReplyUsage>;

function berlinOffset(date:Date){
 const offset=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,timeZoneName:'longOffset'}).formatToParts(date)
  .find(part=>part.type==='timeZoneName')?.value.replace('GMT','');
 return offset||'+00:00';
}

export function usageMonthWindow(now:Date){
 const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit'}).formatToParts(now);
 const year=Number(dateParts.find(part=>part.type==='year')?.value);
 const month=Number(dateParts.find(part=>part.type==='month')?.value);
 const beginning=(year:number,month:number)=>{
  const utc=new Date(Date.UTC(year,month-1,1));
  return new Date(utc.toISOString().slice(0,10)+'T00:00:00'+berlinOffset(utc)).toISOString();
 };
 return {month:`${year}-${String(month).padStart(2,'0')}`,timezone,from:beginning(year,month),to:beginning(year,month+1),asOf:now.toISOString()};
}

export function summarizeReplyUsage(rows:{timings?:{usage?:ReplyUsage}}[],answerCount:number){
 const entries=rows.flatMap(row=>row.timings?.usage?[row.timings.usage]:[]);
 const costedAnswerCount=entries.filter(usage=>usage.answered&&usage.unpricedCalls===0).length;
 const sum=(field:'inputTokens'|'outputTokens'|'cacheReadTokens'|'cacheWriteTokens'|'modelCalls'|'unpricedCalls'|'costUsd')=>
  entries.reduce((total,usage)=>total+(usage[field]??0),0);
 const totalCostUsd=roundUsd(sum('costUsd'));
 const complete=entries.length===rows.length&&sum('unpricedCalls')===0&&costedAnswerCount===answerCount;
 return {
  answerCount,costedAnswerCount,unmeteredAnswers:Math.max(0,answerCount-costedAnswerCount),
  totalCostUsd,averageCostUsd:complete&&answerCount>0?roundUsd(totalCostUsd/answerCount):null,
  inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),cacheReadTokens:sum('cacheReadTokens'),cacheWriteTokens:sum('cacheWriteTokens'),
  modelCalls:sum('modelCalls'),unpricedCalls:sum('unpricedCalls'),complete,
 };
}

async function readGatewayBalance(){
 try{
  const gateway=createGateway({fetch:(input,init)=>fetch(input,{...init,cache:'no-store',signal:AbortSignal.timeout(2500)})});
  const credits=await gateway.getCredits();
  return gatewayDollarAmount(credits.balance);
 }catch{return null;}
}

export async function readUsageMonth(db:Db,tenant:string,now=new Date()){
 const period=usageMonthWindow(now);
 const count=db.from('animahost_whatsapp_decisions').select('message_id',{head:true,count:'exact'})
  .eq('tenant_id',tenant).eq('case_details->>architecture','retrieval-v1').neq('patient_text','')
  .gte('created_at',period.from).lt('created_at',period.to).lte('created_at',period.asOf);
 const evidence=async()=>{
  const rows:{timings?:{usage?:ReplyUsage}}[]=[];
  for(let offset=0;;offset+=500){
   const page=await db.from('animahost_reply_evidence').select('timings').eq('tenant_id',tenant).eq('architecture','retrieval-v1')
    .gte('created_at',period.from).lt('created_at',period.to).lte('created_at',period.asOf)
    .order('created_at').order('message_id').range(offset,offset+499);
   if(page.error)throw Error('animahost_usage_unavailable');
   rows.push(...page.data);
   if(page.data.length<500)return rows;
  }
 };
 const [answers,rows,creditBalanceUsd]=await Promise.all([count,evidence(),readGatewayBalance()]);
 if(answers.error||answers.count===null)throw Error('animahost_usage_unavailable');
 return {...period,currency:'USD' as const,...summarizeReplyUsage(rows,answers.count),creditBalanceUsd,
  creditScope:creditBalanceUsd===null?null:'gateway_team' as const};
}
