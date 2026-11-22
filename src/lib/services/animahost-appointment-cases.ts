import {formulateConversationReply} from './animahost-whatsapp-conversation';
import {t} from '@/lib/i18n';
import type {createServerClient} from '@/lib/db/supabase';
import {appointmentInstant,lateReply,type Language,type LateState} from './animahost-appointment-tolerance';

type DB = ReturnType<typeof createServerClient>;
const table='animahost_appointment_cases';
export const caseColumns='id,message_id,chat_jid,appointment_date,original_time,arrival_time,delay_minutes,appointment_type_id,status,created_at,reminder_at,reminded_at,fallback_at,decided_at,decided_by,note,delivery_state,finished_at';
type CaseRow={
 id:string;message_id:string;chat_jid:string;appointment_date:string;original_time:string;arrival_time:string;
 delay_minutes:number;appointment_type_id:string|null;status:string;language:Language;
 created_at:string;reminder_at:string;reminded_at:string|null;fallback_at:string;decided_at:string|null;
 decided_by:string|null;note:string|null;delivery_state:string;finished_at:string|null;patient_reply:string|null;
};
export function appointmentCaseView(row:Omit<CaseRow,'language'|'patient_reply'>){
 return {id:row.id,messageId:row.message_id,chatJid:row.chat_jid,appointmentDate:row.appointment_date,
  originalTime:row.original_time.slice(0,5),arrivalTime:row.arrival_time.slice(0,5),
  delayMinutes:row.delay_minutes,appointmentTypeId:row.appointment_type_id,status:row.status,
  createdAt:row.created_at,reminderAt:row.reminder_at,remindedAt:row.reminded_at,fallbackAt:row.fallback_at,
  decidedAt:row.decided_at,decidedBy:row.decided_by,note:row.note,deliveryState:row.delivery_state,
  finishedAt:row.finished_at};
}

async function alert(db:DB,tenant:string,id:string,reminder=false){
 const result=await db.from('practice_notifications').upsert(['admin','verwaltung'].map(role=>({
  recipient_role:role,kind:'wichtig',title:t(reminder?'animahost.late.reminder.title':'animahost.late.notice.title','de'),
  body:t('animahost.late.notice.body','de'),link:'/praxis',
  source_key:`animahost:${tenant}:arrival:${id}:${reminder?'reminder':'case'}`,
 })),{onConflict:'source_key,recipient_role',ignoreDuplicates:true});
 if(result.error)throw Error('appointment_notice_unavailable');
}

export async function openAppointmentCase(db:DB,input:{tenantId:string;messageId:string;from:string},state:LateState,language:Language,now=new Date()){
 if(!state.originalTime||!state.arrivalTime||!state.appointmentDate||!state.delayMinutes)return null;
 const existing=await db.from(table).select(caseColumns).eq('tenant_id',input.tenantId).eq('message_id',input.messageId).maybeSingle();
 if(existing.error)throw Error('appointment_case_unavailable');
 if(existing.data){
  if(existing.data.status==='pending')await alert(db,input.tenantId,existing.data.id).catch(()=>undefined);
  return appointmentCaseView(existing.data);
 }
 const stored=await db.from(table).insert({tenant_id:input.tenantId,message_id:input.messageId,chat_jid:input.from,
  appointment_date:state.appointmentDate,original_time:state.originalTime,arrival_time:state.arrivalTime,
  delay_minutes:state.delayMinutes,appointment_type_id:state.appointmentTypeId,language,
  reminder_at:new Date(now.getTime()+600_000).toISOString(),
  fallback_at:new Date(appointmentInstant(state.appointmentDate,state.originalTime).getTime()-3_600_000).toISOString(),
 }).select(caseColumns).single();
 if(stored.error?.code==='23505'){
  const pending=await db.from(table).select(caseColumns).eq('tenant_id',input.tenantId).eq('chat_jid',input.from)
   .eq('appointment_date',state.appointmentDate).eq('original_time',state.originalTime).eq('status','pending').maybeSingle();
  if(pending.data){
   const updated=await db.from(table).update({arrival_time:state.arrivalTime,delay_minutes:state.delayMinutes,
    appointment_type_id:state.appointmentTypeId??pending.data.appointment_type_id})
    .eq('tenant_id',input.tenantId).eq('id',pending.data.id).eq('status','pending')
    .select(caseColumns).maybeSingle();
   if(updated.data)return appointmentCaseView(updated.data);
  }
 }
 if(stored.error||!stored.data)throw Error('appointment_case_unavailable');
 await alert(db,input.tenantId,stored.data.id).catch(()=>console.error('animahost_appointment_case_notice_failed'));
 return appointmentCaseView(stored.data as CaseRow);
}

export async function latestAppointmentCase(db:DB,tenant:string,chat:string,state:LateState){
 if(!state.appointmentDate||!state.originalTime)return null;
 const result=await db.from(table).select(caseColumns).eq('tenant_id',tenant).eq('chat_jid',chat)
  .eq('appointment_date',state.appointmentDate).eq('original_time',state.originalTime)
  .order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(result.error)throw Error('appointment_case_unavailable');
 return result.data?appointmentCaseView(result.data):null;
}

export async function dueAppointmentCases(db:DB,tenant:string,phone:string|null,now:Date){
 const at=now.toISOString();
 const due=await db.from(table).select('id,language').eq('tenant_id',tenant).eq('status','pending')
  .lte('fallback_at',at).order('fallback_at').limit(25);
 if(due.error)throw Error('appointment_case_unavailable');
 for(const row of due.data){
  const ended=await db.from(table).update({status:'phone_required',decided_at:at,delivery_state:'queued',
   patient_reply:t('animahost.late.phone',row.language,{phone:phone||'0179 5351813'})})
   .eq('tenant_id',tenant).eq('id',row.id).eq('status','pending');
  if(ended.error)throw Error('appointment_case_unavailable');
 }
 const reminders=await db.from(table).select('id').eq('tenant_id',tenant).eq('status','pending')
  .lte('reminder_at',at).gt('fallback_at',at).is('reminded_at',null).order('reminder_at').limit(25);
 if(reminders.error)throw Error('appointment_case_unavailable');
 for(const row of reminders.data){
  await alert(db,tenant,row.id,true);
  const marked=await db.from(table).update({reminded_at:at}).eq('tenant_id',tenant).eq('id',row.id)
   .eq('status','pending').is('reminded_at',null);
  if(marked.error)throw Error('appointment_case_unavailable');
 }
 const stale=await db.from(table).update({delivery_state:'uncertain',finished_at:at}).eq('tenant_id',tenant)
  .eq('delivery_state','sending').lte('claimed_at',new Date(now.getTime()-120_000).toISOString());
 if(stale.error)throw Error('appointment_case_unavailable');
}

export async function decideAppointmentCase(db:DB,tenant:string,input:{
 caseId:string;actorId:string;decision:'approved'|'declined';note?:string|null;
},doctolib:string|null,model:string,signal:AbortSignal, now=new Date()){
 const found=await db.from(table).select(`${caseColumns},language`).eq('tenant_id',tenant).eq('id',input.caseId).maybeSingle();
 if(found.error)throw Error('appointment_case_unavailable');
 if(!found.data)return {code:'appointment_case_not_found'} as const;
 const row=found.data as CaseRow;
 if(row.status===input.decision&&row.decided_by===input.actorId&&row.note===(input.note??null))
  return {appointmentCase:appointmentCaseView(row)};
 if(row.status!=='pending'||Date.parse(row.fallback_at)<=now.getTime())return {code:'appointment_case_closed'} as const;
 const text=input.decision==='approved'?t('animahost.late.approved',row.language,{arrival:row.arrival_time.slice(0,5)}):
  lateReply({outcome:'rebook'} as LateState,row.language,doctolib,null);
 const formulated=await formulateConversationReply({model,decision:{action:'antworten',
  rule:`late_arrival:${input.decision}`,text},
  text:t('animahost.late.pending',row.language),history:[],language:row.language,
  verifiedIdentity:false,signal,deadline:Date.now()+5_500});
 const decisionTime=new Date().toISOString();
 const saved=await db.from(table).update({status:input.decision,decided_at:decisionTime,decided_by:input.actorId,
  note:input.note??null,delivery_state:'queued',patient_reply:formulated.text})
  .eq('tenant_id',tenant).eq('id',row.id).eq('status','pending').gt('fallback_at',decisionTime)
  .select(caseColumns).maybeSingle();
 if(saved.error)throw Error('appointment_case_unavailable');
 return saved.data?{appointmentCase:appointmentCaseView(saved.data as CaseRow)}:{code:'appointment_case_closed'} as const;
}
