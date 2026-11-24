import {clarificationRound} from './animahost-unclear-input';
import {resolveChatName,type ChatNameContext} from './animahost-name-match';
import type {createServerClient} from '@/lib/db/supabase';
import {phonePatients,phoneLabels,maskBirthDates,selectPhonePatient,conversationPhoneProof} from './animahost-chat-identity';
import {recentConversation,type ConversationHistory} from './animahost-whatsapp-conversation';
import {loadPatientSheet,sheetLedger,type ConcernHistory} from './animahost-patient-sheet';
import {localizeInbound} from './animahost-inbound-language';
import {classifyModelFailure} from './animahost-model-failure';
import {classifySender} from './animahost-sender-policy';
import {teamReplyDeadline,teamReplyTime} from './animahost-team-time';
import {appointmentLocalDate} from './animahost-appointment-notices';
import {whatsappRulesSchema} from './animahost-whatsapp';
import {gatewayGenerate,type ModelCall} from './animahost-chain-model';
import {retrieveSources} from './animahost-retrieval';
import {runRetrievalReply,retrievalPreflight,type RetrievalInput,type RetrievalResult} from './animahost-retrieval-core';
import type {OutboundTurn} from './animahost-retrieval-routing';
type Db=ReturnType<typeof createServerClient>;
export async function retrievalAnswer(db:Db,input:{tenantId:string;from:string;phone?:string|null;messageId:string;text:string|null;messageType:string;receivedAt:string;
 identity?:{patientId:string;phone:string};staffPatientIds?:string[];history?:ConversationHistory;lastOutbound?:OutboundTurn;hasPriorConversation?:boolean;hasPriorReply?:boolean;concernHistory?:ConcernHistory;readOnly?:boolean;handoffOnly?:boolean;practiceHeld?:boolean;entries?:{id:string;text:string}[]},practice:any,signal:AbortSignal,preview=false){
 const started=Date.now();
 const history=(input.history??[]).filter(h=>Date.parse(h.at)<=Date.parse(input.receivedAt)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-10).map(h=>({...h,text:maskBirthDates(h.text)}));
 const phone=input.phone&&(input.from.endsWith('@lid')||input.from===`${input.phone}@s.whatsapp.net`)?input.phone:null;
 const calls:ModelCall[]=[];
 const model=gatewayGenerate(practice.model,signal,call=>calls.push(call),{cacheStatic:!input.readOnly&&!preview,tags:['animahost-retrieval']});
 const sender=classifySender({jid:input.from,trustedPhone:phone,hasPatient:false,practicePhone:practice.practice_phone,
  teamPhones:process.env.ANIMAHOST_TEAM_PHONES,nonPatientPhones:process.env.ANIMAHOST_NON_PATIENT_PHONES});
 const translate=!['team','group','non_patient'].includes(sender)&&input.messageType!=='reaction';
 const originals=input.entries?.length?input.entries:[{id:'',text:input.text??''}];
 const localization=Promise.all(originals.map(async entry=>{
  if(!translate)return {...entry,unreadable:false,translation:null,error:undefined};
  try{return {id:entry.id,...await localizeInbound(model,entry.text),error:undefined};}
  catch(error){return {...entry,unreadable:false,translation:null,error:classifyModelFailure(error,'compose')};}
 }));
 const [patients,confirmed,prior,version,localized]=await Promise.all([
  phone?phonePatients(db,phone).then(p=>p??[]):Promise.resolve([]),
  phone?db.from('animahost_whatsapp_verified_patients').select('patient_id').eq('tenant_id',input.tenantId).eq('chat_jid',input.from).eq('phone',phone).lte('verified_at',input.receivedAt):Promise.resolve({data:[],error:null}),
  db.from('animahost_whatsapp_decisions').select('case_details,rule_id,patient_text').eq('tenant_id',input.tenantId).eq('sender_jid',input.from).lte('created_at',input.receivedAt).order('created_at',{ascending:false}).limit(100),
  db.from('animahost_whatsapp_rulebook_versions').select('rules').eq('tenant_id',input.tenantId).eq('version',practice.active_rulebook_version).single(),
  localization,
 ]);
 if(confirmed.error||prior.error||version.error)throw Error('retrieval_context_unavailable');
 const provisional=phone?conversationPhoneProof(patients,input.text??'',input.history??[],input.receivedAt):null;
 const verifiedIds=(confirmed.data??[]).map(r=>r.patient_id);
 if(phone&&input.identity?.phone===phone)verifiedIds.push(input.identity.patientId);
 if(phone&&input.staffPatientIds?.length){
  const staff=await db.from('patients').select('id,vorname,nachname,geburtsdatum,geschlecht').in('id',input.staffPatientIds);
  if(staff.error)throw Error('retrieval_context_unavailable');
  verifiedIds.push(...staff.data.map(patient=>patient.id));
  for(const patient of staff.data)if(!patients.some(p=>p.id===patient.id))patients.push(patient);
 }
 const translated=localized.some(entry=>Boolean(entry.translation));
 const joined=localized.map(entry=>entry.text).filter(Boolean).join('\n\n').slice(-6400);
 const translations=Object.fromEntries(localized.filter(entry=>entry.id&&entry.translation).map(entry=>[entry.id,entry.translation]));
 const language={translation:localized.at(-1)?.translation??null,translations,translated};
 let chatName:ChatNameContext|undefined;
 const phoneSubject=provisional??selectPhonePatient(patients,joined);
 if(phoneSubject)chatName={status:'matched',matchedName:phoneSubject.vorname,patientId:phoneSubject.id,confirmed:Boolean(provisional)||verifiedIds.includes(phoneSubject.id),question:null};
 if(phone&&!phoneSubject){
  const matched=await resolveChatName(db,{tenant:input.tenantId,chat:input.from,phone,message:joined,readOnly:input.readOnly,candidateIds:prior.data.find(r=>r.case_details?.chatName?.candidateIds?.length)?.case_details.chatName.candidateIds});
  chatName=matched.context;
  if(matched.patient){if(!patients.some(p=>p.id===matched.patient!.id))patients.push({...matched.patient,geburtsdatum:matched.patient.geburtsdatum??null,geschlecht:matched.patient.geschlecht??null});if(chatName.confirmed)verifiedIds.push(matched.patient.id);}
 }
 const patientSheet=await loadPatientSheet(db,{tenantId:input.tenantId,patients,verifiedIds,conversationPatientId:provisional?.id,message:joined,today:appointmentLocalDate(input.receivedAt),at:input.receivedAt,chatJid:input.from,phone,concernHistory:input.concernHistory});
 const dossier={sender:'unknown' as const,patients:[]};
 const base:RetrievalInput={message:maskBirthDates(input.text??''),translation:language.translation,translated,unreadable:localized.every(entry=>entry.unreadable),translationError:localized.find(entry=>entry.error)?.error,messageType:input.messageType,jid:input.from,phone,practicePhone:practice.practice_phone,
  teamPhones:process.env.ANIMAHOST_TEAM_PHONES,nonPatientPhones:process.env.ANIMAHOST_NON_PATIENT_PHONES,
  history,dossier,patientSheet,chatName,lastOutbound:input.lastOutbound,clarificationRound:clarificationRound(prior.data,input.history??[]),receivedAt:input.receivedAt,documents:[],rules:whatsappRulesSchema.parse(version.data.rules),teamTime:teamReplyTime(input.receivedAt,practice.team_reply_days,practice.closure_periods,'de'),
  today:appointmentLocalDate(input.receivedAt),doctolibUrl:practice.doctolib_url,
  hasPriorConversation:input.hasPriorConversation===true||history.length>0,hasPriorReply:input.hasPriorReply===true||history.some(h=>h.direction==='outgoing'),
  identityAsked:prior.data.some(r=>r.case_details?.identityQuestion===true&&(!chatName||r.case_details?.chatName?.status===chatName.status)),preview,budgetMs:Math.max(1000,60000-(Date.now()-started)),deadline:teamReplyDeadline(input.receivedAt,practice.team_reply_days,practice.closure_periods,input.readOnly?input.receivedAt:new Date().toISOString())};
 const preflight=retrievalPreflight(base);
 if(preflight)return {result:preflight,calls,...language,patientSheet:sheetLedger(patientSheet),chatName,selectedPatientId:patientSheet.patientId??chatName?.patientId??null,timings:{contextMs:Date.now()-started,embeddingMs:0,searchMs:0,modelMs:0,totalMs:Date.now()-started}};
 const retrieved=await retrieveSources(db,input.tenantId,base.message,history.filter(h=>h.direction==='incoming').map(h=>h.text),preview);
 const contextMs=Date.now()-started;
 const result=await runRetrievalReply(model,{...base,documents:retrieved.documents,budgetMs:Math.max(1000,60000-contextMs)});
 return {result,calls,...language,patientSheet:sheetLedger(patientSheet),chatName,selectedPatientId:patientSheet.patientId??chatName?.patientId??null,phoneMatches:chatName?.source==='chat'?undefined:phoneLabels(patients),timings:{contextMs,...retrieved.timings,modelMs:result.ms,totalMs:Date.now()-started}};
}
