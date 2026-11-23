import {clarificationRound} from './animahost-unclear-input';
import {resolveChatName,type ChatNameContext} from './animahost-name-match';
import type {createServerClient} from '@/lib/db/supabase';
import {phonePatients,phoneLabels,maskBirthDates,selectPhonePatient} from './animahost-chat-identity';
import {recentConversation,type ConversationHistory} from './animahost-whatsapp-conversation';
import {loadPatientSheet,sheetLedger,type ConcernHistory} from './animahost-patient-sheet';
import {teamReplyTime} from './animahost-team-time';
import {appointmentLocalDate} from './animahost-appointment-notices';
import {whatsappRulesSchema} from './animahost-whatsapp';
import {gatewayGenerate,type ModelCall} from './animahost-chain-model';
import {retrieveSources} from './animahost-retrieval';
import {runRetrievalReply,retrievalPreflight,type RetrievalInput} from './animahost-retrieval-core';
type Db=ReturnType<typeof createServerClient>;
export async function retrievalAnswer(db:Db,input:{tenantId:string;from:string;phone?:string|null;messageId:string;text:string|null;messageType:string;receivedAt:string;
 identity?:{patientId:string;phone:string};staffPatientIds?:string[];history?:ConversationHistory;hasPriorConversation?:boolean;hasPriorReply?:boolean;concernHistory?:ConcernHistory;readOnly?:boolean},practice:any,signal:AbortSignal,preview=false){
 const started=Date.now();
 const history=recentConversation(input.history??[],input.receivedAt).map(h=>({...h,text:maskBirthDates(h.text)}));
 const phone=input.phone&&(input.from.endsWith('@lid')||input.from===`${input.phone}@s.whatsapp.net`)?input.phone:null;
 const [patients,confirmed,prior,version]=await Promise.all([
  phone?phonePatients(db,phone).then(p=>p??[]):Promise.resolve([]),
  phone?db.from('animahost_whatsapp_verified_patients').select('patient_id').eq('tenant_id',input.tenantId).eq('chat_jid',input.from).eq('phone',phone).lte('verified_at',input.receivedAt):Promise.resolve({data:[],error:null}),
  db.from('animahost_whatsapp_decisions').select('case_details,rule_id,patient_text').eq('tenant_id',input.tenantId).eq('sender_jid',input.from).lte('created_at',input.receivedAt).order('created_at',{ascending:false}).limit(100),
  db.from('animahost_whatsapp_rulebook_versions').select('rules').eq('tenant_id',input.tenantId).eq('version',practice.active_rulebook_version).single(),
 ]);
 if(confirmed.error||prior.error||version.error)throw Error('retrieval_context_unavailable');
 const verifiedIds=(confirmed.data??[]).map(r=>r.patient_id);
 if(phone&&input.identity?.phone===phone)verifiedIds.push(input.identity.patientId);
 if(phone&&input.staffPatientIds?.length){
  const staff=await db.from('patients').select('id,vorname,nachname,geburtsdatum,geschlecht').in('id',input.staffPatientIds);
  if(staff.error)throw Error('retrieval_context_unavailable');
  verifiedIds.push(...staff.data.map(patient=>patient.id));
  for(const patient of staff.data)if(!patients.some(p=>p.id===patient.id))patients.push(patient);
 }
 let chatName:ChatNameContext|undefined;
 const phoneSubject=selectPhonePatient(patients,input.text??'');
 if(phoneSubject)chatName={status:'matched',matchedName:phoneSubject.vorname,patientId:phoneSubject.id,confirmed:verifiedIds.includes(phoneSubject.id),question:null};
 if(phone&&!phoneSubject){
  const matched=await resolveChatName(db,{tenant:input.tenantId,chat:input.from,phone,message:input.text??'',readOnly:input.readOnly,candidateIds:prior.data.find(r=>r.case_details?.chatName?.candidateIds?.length)?.case_details.chatName.candidateIds});
  chatName=matched.context;
  if(matched.patient){if(!patients.some(p=>p.id===matched.patient!.id))patients.push({...matched.patient,geburtsdatum:matched.patient.geburtsdatum??null,geschlecht:matched.patient.geschlecht??null});if(chatName.confirmed)verifiedIds.push(matched.patient.id);}
 }
 const patientSheet=await loadPatientSheet(db,{tenantId:input.tenantId,patients,verifiedIds,message:input.text??'',today:appointmentLocalDate(input.receivedAt),at:input.receivedAt,chatJid:input.from,phone,concernHistory:input.concernHistory});
 const dossier={sender:'unknown' as const,patients:[]};
 const base:RetrievalInput={message:maskBirthDates(input.text??''),messageType:input.messageType,jid:input.from,phone,practicePhone:practice.practice_phone,
  teamPhones:process.env.ANIMAHOST_TEAM_PHONES,nonPatientPhones:process.env.ANIMAHOST_NON_PATIENT_PHONES,
  history,dossier,patientSheet,chatName,clarificationRound:clarificationRound(prior.data,input.history??[]),receivedAt:input.receivedAt,documents:[],rules:whatsappRulesSchema.parse(version.data.rules),teamTime:teamReplyTime(input.receivedAt,practice.team_reply_days,practice.closure_periods,'de'),
  today:appointmentLocalDate(input.receivedAt),doctolibUrl:practice.doctolib_url,
  hasPriorConversation:input.hasPriorConversation===true||history.length>0,hasPriorReply:input.hasPriorReply===true||history.some(h=>h.direction==='outgoing'),
  identityAsked:prior.data.some(r=>r.case_details?.identityQuestion===true&&(!chatName||r.case_details?.chatName?.status===chatName.status)),preview,budgetMs:Math.max(1000,60000-(Date.now()-started))};
 const preflight=retrievalPreflight(base);
 if(preflight)return {result:preflight,calls:[] as ModelCall[],patientSheet:sheetLedger(patientSheet),chatName,selectedPatientId:patientSheet.patientId??chatName?.patientId??null,timings:{contextMs:Date.now()-started,embeddingMs:0,searchMs:0,modelMs:0,totalMs:Date.now()-started}};
 const retrieved=await retrieveSources(db,input.tenantId,base.message,history.filter(h=>h.direction==='incoming').map(h=>h.text),preview);
 const contextMs=Date.now()-started;
 const calls:ModelCall[]=[];
 const result=await runRetrievalReply(gatewayGenerate(practice.model,signal,call=>calls.push(call)),{...base,documents:retrieved.documents,budgetMs:Math.max(1000,60000-contextMs)});
 return {result,calls,patientSheet:sheetLedger(patientSheet),chatName,selectedPatientId:patientSheet.patientId??chatName?.patientId??null,phoneMatches:chatName?.source==='chat'?undefined:phoneLabels(patients),timings:{contextMs,...retrieved.timings,modelMs:result.ms,totalMs:Date.now()-started}};
}
