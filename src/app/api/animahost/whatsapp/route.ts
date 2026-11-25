import {withoutCallbackDeadlines} from '@/lib/services/animahost-no-deadlines';
import {notifyHostPractice} from '@/lib/services/animahost-practice-notifications';
import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {generateText,Output} from 'ai';
import {z} from 'zod';
import {concernHistorySchema} from '@/lib/services/animahost-patient-sheet';
import {createServerClient} from '@/lib/db/supabase';
import {t} from '@/lib/i18n';
import {decisionFromRule,emergencyDecision,resolveEmergency,explicitOptOut,mandatoryAppointmentClarification,
 renderWhatsAppRuleText,whatsappRulesSchema,type WhatsAppDecision} from '@/lib/services/animahost-whatsapp';
import {appointmentLocalDate,appointmentNoticeDecision,appointmentNoticeFromDecision,
 appointmentNoticeSchema} from '@/lib/services/animahost-appointment-notices';
import {completeRuleReply,fallbackDecision,fallbackHints,fallbackTopics,matchApprovedRuleFallback,withRuleReplies,type FallbackTopic} from '@/lib/services/animahost-whatsapp-fallback';
import {closureDecision} from '@/lib/services/animahost-practice-closures';
import {accessReissuePurpose,reissueChatAccess,verifiedChatIdentitySchema} from '@/lib/services/animahost-access-reissue';
import {attendanceArtworkVersion,attendanceProof,issueAttendanceFromChat,mayBeAttendanceRequest} from '@/lib/services/animahost-attendance';
import {changeChatInvoiceRecipient,changeChatPatientContact,chatContactChangeIntent,chatRecipientChangeIntent} from '@/lib/services/animahost-contact-changes';

import {appointmentToleranceSchema,lateIntentSchema,lateReply,lateStateSchema,planLateArrival,recoverLateTimes,knownVisitType,statesLaterArrival,type LateState} from '@/lib/services/animahost-appointment-tolerance';
import {latestAppointmentCase,openAppointmentCase} from '@/lib/services/animahost-appointment-cases';
import {conversationHistorySchema,enforceConversationOutput,formulateConversationReply,gatewayOptions,recentConversation,referenceHistory} from '@/lib/services/animahost-whatsapp-conversation';
import {measureReplyUsage} from '@/lib/services/animahost-usage';
import {immediateRule,practiceReplyRule} from '@/lib/services/animahost-retrieval-routing';

import {teamReplyTime} from '@/lib/services/animahost-team-time';

import {explicitlyOffersDu,maskBirthDates,parseBirthDate,phoneLabels,phonePatients,selectPhonePatient,type ChatContext} from '@/lib/services/animahost-chat-identity';
import {invoicePortalIntent,qualityWorkflow,selfServiceReply,styleMessage,visitReply,type ChatDetails} from '@/lib/services/animahost-quality-workflows';

import {applicableMessageRules,practiceMessageHandoff,personRequest,personRequestReply,unlinkedSubjectPlan,unlinkedAppointmentReply,combinedMessageWorkflow,appointmentConcern,practiceSummary,messageConcerns} from '@/lib/services/animahost-message-concerns';
import {classifySender,quietSenderRule,unknownSenderDecision} from '@/lib/services/animahost-sender-policy';
import {silentSocialRule,socialReply} from '@/lib/services/animahost-conversation-signals';
import {runChain} from '@/lib/services/animahost-chain';
import {gatewayGenerate} from '@/lib/services/animahost-chain-model';
import {loadDossier} from '@/lib/services/animahost-dossier';
import {retrievalAnswer} from '@/lib/services/animahost-retrieval-live';
import {activeKnowledge} from '@/lib/services/animahost-knowledge';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=90;

const inputSchema=z.object({
 tenantId:z.string().uuid(),messageId:z.string().min(1).max(200),
 from:z.string().min(3).max(254),text:z.string().max(4000).nullable(),
 messageType:z.enum(['text','image','audio','document','sticker','video','album','reaction','edit','poll','view_once_image','view_once_audio','view_once_video','view_once_document','view_once_sticker','view_once_unsupported','unsupported']),
 receivedAt:z.string().datetime({offset:true}),
 hasPriorConversation:z.boolean().optional(),hasPriorReply:z.boolean().optional(),
 identity:verifiedChatIdentitySchema.optional(),phone:z.string().regex(/^[1-9][0-9]{7,14}$/).optional(),staffPatientIds:z.array(z.string().uuid()).max(10).optional(),handoffOnly:z.boolean().optional(),history:conversationHistorySchema.optional(),concernHistory:concernHistorySchema.optional(),senderPolicy:z.literal(1).optional(),
 eventId:z.string().uuid().optional(),practiceHeld:z.boolean().optional(),entries:z.array(z.object({id:z.string().uuid(),text:z.string().max(4000)})).max(20).optional(),
 lastOutbound:z.object({source:z.enum(['practice','animahost']),at:z.string().datetime({offset:true})}).optional(),
}).strict();
type StoredDecision={action:'antworten'|'klaerfall'|'notfall';patient_text:string;rule_id:string;case_details?:ChatDetails|null};
const lookupSchema=z.strictObject({action:z.literal('phone_lookup'),tenantId:z.string().uuid(),phone:z.string().regex(/^[1-9][0-9]{7,14}$/)});
const classificationSchema=z.object({kind:z.enum(['appointment','appointment_notice','late_arrival','rebook_after_cancel','practice_closure','access_resend','attendance_certificate','contact_change','invoice_recipient_change','outside_scope','other','clarify']),
 clear:z.boolean(),appointmentTypeId:z.string().nullable().optional(),
 ruleIds:z.array(z.string()).max(8).optional(),language:z.enum(['de','en','es']).optional(),
 replyLanguage:z.string().regex(/^[a-z]{2}$/).optional(),lateArrival:lateIntentSchema.nullable().optional(),
 fallbackTopic:z.enum(fallbackTopics).nullable().optional(),unansweredQuote:z.string().max(400).nullable().optional(),
 appointmentRelated:z.boolean().optional(),
 emergency:z.enum(['immediate','urgent','none']).optional(),emergencyEvidence:z.string().max(250).nullable().optional(),
 appointmentNotice:appointmentNoticeSchema.nullable().optional(),
 closureDate:z.string().date().nullable().optional(),
 accessPurpose:accessReissuePurpose.nullable().optional(),
 attendance:z.object({patientName:z.string().trim().min(3).max(250).nullable(),date:z.string().date().nullable()}).nullable().optional(),
 contactChange:chatContactChangeIntent.nullable().optional(),
 recipientChange:chatRecipientChangeIntent.nullable().optional(),
 optOut:z.boolean().default(false)});

function authorized(header:string|null){
 const secret=process.env.ANIMAHOST_LINE_SECRET||'';
 const provided=/^Bearer (.+)$/.exec(header||'')?.[1]||'';
 return Boolean(secret)&&Buffer.byteLength(secret)===Buffer.byteLength(provided)&&
  timingSafeEqual(Buffer.from(secret),Buffer.from(provided));
}

async function notifyPractice(db:ReturnType<typeof createServerClient>,
 input:{tenantId:string;messageId:string;from:string;phone?:string|null;text?:string|null;history?:z.infer<typeof conversationHistorySchema>},decision:WhatsAppDecision,details?:ChatDetails|null){
 try{await notifyHostPractice(db,input,decision,details);}catch{console.error('animahost_practice_notification_failed',{messageId:input.messageId});}
}

function decisionResponse(decision: WhatsAppDecision,replyStyle?:'formulated'|'template',
 phoneMatches?:ReturnType<typeof phoneLabels>,details?:ChatDetails|null,replySchedule?:{teamReplyDays:unknown;closurePeriods:unknown}) {
 decision={...decision,text:withoutCallbackDeadlines(decision.text).text};
 const note=details?.teamKind==='info'||(decision.action==='antworten'&&decision.rule.startsWith('invoice_portal:'))||appointmentNoticeFromDecision(decision)||/^late_arrival:(accept|wait)$/.test(decision.rule)||[
  'attendance_certificate_issued','invoice_recipient_applied','invoice_recipient_confirmation_sent','contact_change_applied',
 ].includes(decision.rule);
 return NextResponse.json({...decision,...(!decision.text.trim()?{skipSend:true}:{}),...(quietSenderRule.test(decision.rule)||silentSocialRule.test(decision.rule)||decision.rule==='chain:guard_rejected'||decision.rule===practiceReplyRule?{skipSend:true}:{}),...(phoneMatches?{phoneMatches}:{}),...(replySchedule?{replySchedule}:{}),...(details?{details}:{}),...(replyStyle?{replyStyle}:{}),optOut:decision.rule==='opt_out',
  ...(note?{disposition:'vermerk'}:{})},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:NextRequest){
 if(!authorized(request.headers.get('authorization')))
  return NextResponse.json({code:'not_authorized'},{status:401});
 const body=await request.json().catch(()=>null);
 const lookup=lookupSchema.safeParse(body);
 if(lookup.success){
  if(lookup.data.tenantId!==process.env.ANIMAHOST_TENANT_ID)
   return NextResponse.json({code:'not_authorized'},{status:403});
  try{
   const db=createServerClient();
   const people=await phonePatients(db,lookup.data.phone);
   return NextResponse.json({phoneMatches:people?phoneLabels(people):null},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({code:'phone_match_unavailable'},{status:503});}
 }
 const parsed=inputSchema.safeParse(body);
 if(!parsed.success)return NextResponse.json({code:'invalid_request'},{status:400});
 const input={...parsed.data,text:parsed.data.text?.trim()||null};
 if(process.env.ANIMAHOST_TENANT_ID&&input.tenantId!==process.env.ANIMAHOST_TENANT_ID)
  return NextResponse.json({code:'not_authorized'},{status:403});
 const past=recentConversation(input.history??[],input.receivedAt);
 const social=socialReply({...input,clarifyUnclear:process.env.ANIMAHOST_RETRIEVAL_PASSED==='true',hasPriorConversation:input.hasPriorConversation===true||past.length>0,
  hasPriorReply:input.hasPriorReply===true||past.some(item=>item.direction==='outgoing')});
 if(social&&silentSocialRule.test(social)&&process.env.ANIMAHOST_RETRIEVAL_PASSED!=='true')
  return decisionResponse({action:'antworten',rule:social,text:''});
 const db=createServerClient();
 const deadline=Date.now()+17_000;
 const history=past.map(item=>({...item,text:maskBirthDates(item.text)}));
 const references=referenceHistory(input.text??'',history,input.receivedAt);
 try{
  const settings=await db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',input.tenantId).maybeSingle();
  if(settings.error||!settings.data)return NextResponse.json({code:'tenant_not_configured'},{status:503});
  const practice=settings.data;
  // The retrieval architecture bypasses every legacy classifier/workflow gate. Enable only after Juan's acceptance.
  if(process.env.ANIMAHOST_RETRIEVAL_PASSED==='true'){
   const existing=await db.from('animahost_whatsapp_decisions').select('action,patient_text,rule_id,case_details')
    .eq('tenant_id',input.tenantId).eq('message_id',input.messageId).maybeSingle();
   if(existing.error)throw Error('decision_read_failed');
   if(existing.data){
    const saved=existing.data;
    if(saved.case_details?.modelFailure?.code==='model_budget_exhausted')
     await notifyPractice(db,input,{action:saved.action,text:saved.patient_text,rule:saved.rule_id},saved.case_details);
    return decisionResponse({action:saved.action,text:saved.patient_text,rule:saved.rule_id},undefined,undefined,saved.case_details);
   }
   const answer=await retrievalAnswer(db,input,practice,request.signal);
   const result=answer.result;
   const details={patientId:answer.selectedPatientId,firstName:null,lastName:null,invoiceDate:null,cause:result.error?.code??result.rule,modelFailure:result.error,
    teamKind:result.teamKind??(result.action==='klaerfall'||result.action==='notfall'?'act' as const:undefined),usedRuleIds:result.usedRuleIds,eventId:input.eventId,translation:answer.translation,translations:answer.translations,dueAt:'dueAt' in result?result.dueAt:undefined,safeFallback:'safeFallback' in result?result.safeFallback:undefined,
    practiceSummary:result.error?.code==='model_budget_exhausted'?t('animahost.whatsapp.model_budget.body','de'):result.teamSummary??undefined,identityQuestion:result.identityQuestion,answerEvidence:result.retrieved,chatName:answer.chatName,patientSheet:'patientSheet' in answer?answer.patientSheet:null,architecture:'retrieval-v1',systemTextVersion:'2026-11-24-systemtext-v1',checks:result.checks};
   const saved=await db.from('animahost_whatsapp_decisions').insert({tenant_id:input.tenantId,message_id:input.messageId,
    sender_jid:input.from,action:result.action,patient_text:result.text,rule_id:result.rule,rulebook_version:practice.active_rulebook_version,case_details:details});
   if(saved.error&&saved.error.code!=='23505')throw Error('decision_store_failed');
   if(saved.error?.code==='23505'){
    const duplicate=await db.from('animahost_whatsapp_decisions').select('action,patient_text,rule_id,case_details').eq('tenant_id',input.tenantId).eq('message_id',input.messageId).single();
    if(duplicate.error)throw Error('decision_read_failed');
    const savedDecision={action:duplicate.data.action,text:duplicate.data.patient_text,rule:duplicate.data.rule_id};
    if(duplicate.data.case_details?.modelFailure?.code==='model_budget_exhausted')
     await notifyPractice(db,input,savedDecision,duplicate.data.case_details);
    return decisionResponse(savedDecision,undefined,undefined,duplicate.data.case_details);
   }
   if(result.action!=='antworten'||result.teamKind==='info')await notifyPractice(db,input,result,details);
   const recorded=await db.from('animahost_reply_evidence').insert({tenant_id:input.tenantId,message_id:input.messageId,evidence:result.retrieved,timings:{...answer.timings,
    eventId:input.eventId,systemTextVersion:'2026-11-24-systemtext-v1',checks:result.checks,translation:answer.translation,modelFailure:result.error,patientSheet:'patientSheet' in answer?answer.patientSheet:null,
    usage:measureReplyUsage(practice.model,answer.calls,Boolean(result.text)&&!result.skipSend)}});
   if(recorded.error&&recorded.error.code!=='23505')console.error('reply_evidence_store_failed',{eventId:input.eventId});
   return NextResponse.json({...result,details,phoneMatches:'phoneMatches' in answer?answer.phoneMatches:undefined,replyStyle:'formulated',optOut:result.rule==='opt_out',
    replySchedule:{teamReplyDays:practice.team_reply_days,closurePeriods:practice.closure_periods}},{headers:{'Cache-Control':'no-store'}});
  }
  if(input.text)input.messageType='text';
  const qualityAvailable=Array.isArray(practice.team_reply_days);
  const replySchedule={teamReplyDays:practice.team_reply_days??[1,2,3,4,5],closurePeriods:practice.closure_periods??[]};
  const trustedPhone=input.phone&&(input.from.endsWith('@lid')||input.from===`${input.phone}@s.whatsapp.net`)?input.phone:null;
  const earlySender=input.senderPolicy===1?classifySender({jid:input.from,trustedPhone,hasPatient:false,
   practicePhone:practice.practice_phone,teamPhones:process.env.ANIMAHOST_TEAM_PHONES,nonPatientPhones:process.env.ANIMAHOST_NON_PATIENT_PHONES}):'patient';
  const quiet=earlySender==='team'||earlySender==='group'||earlySender==='non_patient';
  if(social==='begruessung-ohne-anliegen'){
   if(quiet||input.handoffOnly||/@g\.us$/.test(input.from))
    return decisionResponse({action:'antworten',rule:'social:acknowledged',text:''});
   return decisionResponse({action:'antworten',rule:social,text:t('animahost.whatsapp.first_signal_greeting','de')},'template');
  }
  const patientMatches=!quiet&&qualityAvailable&&trustedPhone?await phonePatients(db,trustedPhone).catch(()=>null):null;
  const existing=await db.from('animahost_whatsapp_decisions')
   .select(qualityAvailable?'action,patient_text,rule_id,case_details':'action,patient_text,rule_id')
   .eq('tenant_id',input.tenantId).eq('message_id',input.messageId).maybeSingle();
  if(existing.error)throw Error('decision_read_failed');
  if(existing.data){
   if(quiet)return decisionResponse({action:'klaerfall',text:'',rule:`sender:${earlySender}`});
   const saved=existing.data as unknown as StoredDecision;
   const decision={action:saved.action,text:saved.patient_text,rule:saved.rule_id};
   await notifyPractice(db,input,decision,saved.case_details);
   return decisionResponse(decision,undefined,patientMatches?phoneLabels(patientMatches):undefined,saved.case_details,replySchedule);
  }
  if(quiet||input.senderPolicy===1&&!(patientMatches?.length||input.staffPatientIds?.length||input.identity)){
   let decision:WhatsAppDecision={action:'klaerfall',text:'',rule:`sender:${earlySender}`};
   if(!quiet){
    const prior=await db.from('animahost_whatsapp_decisions').select('rule_id').eq('tenant_id',input.tenantId)
     .eq('sender_jid',input.from).eq('rule_id','sender:identify').limit(1).maybeSingle();
    const locale=/\b(?:hello|please|hi|my|where)\b/i.test(input.text??'')?'en':/[¿¡]|\bhola\b/i.test(input.text??'')?'es':'de';
    decision=unknownSenderDecision(Boolean(prior.error||prior.data||input.handoffOnly||(!patientMatches&&trustedPhone)),
     t('animahost.whatsapp.identify_sender',locale));
   }
   const summary=t(`animahost.whatsapp.${quiet?'sender_'+earlySender:'sender_unknown'}`,'de');
   const details:ChatDetails={patientId:null,firstName:null,lastName:null,invoiceDate:null,cause:decision.rule,practiceSummary:summary};
   const saved=await db.from('animahost_whatsapp_decisions').insert({tenant_id:input.tenantId,message_id:input.messageId,
    sender_jid:input.from,action:decision.action,patient_text:decision.text,rule_id:decision.rule,
    rulebook_version:practice.active_rulebook_version,...(qualityAvailable?{case_details:details}:{})});
   if(saved.error&&saved.error.code!=='23505')throw Error('decision_store_failed');
   await notifyPractice(db,input,decision,details);
   return decisionResponse(decision,'template',undefined,details,replySchedule);
  }
  const tolerance=appointmentToleranceSchema.safeParse(practice.appointment_tolerance);
  const lateLanguage=/\b(?:später|verspät\w*|erst um|statt um|schaff.{0,18}nicht.{0,45}kann.{0,15}kommen|running late|minutes late|llegar.{0,20}tarde)/i.test(input.text??'');
  const explicitTimes=recoverLateTimes(input.text??'',appointmentLocalDate(input.receivedAt));
  const explicitLater=statesLaterArrival(input.text??'',explicitTimes);
  const hints=fallbackHints(input.text);
  let topic:FallbackTopic=hints.topic;
  let language:'de'|'en'|'es'=/\b(?:where|when|please|daughter|what|appointment|speak|thank|my)\b/i.test(input.text??'')?'en':
   /[¿¡]|\b(?:hola|cita|factura|gracias|puedo|mañana)\b/i.test(input.text??'')?'es':'de';
  let replyLanguage:string=language;
  let lateState:LateState|null=null;
  let hoursRule:string|undefined;
  let decision:WhatsAppDecision=decisionFromRule(null);
  const optOut=():WhatsAppDecision=>({action:'antworten',text:t('animahost.whatsapp.optOut',language),rule:'opt_out'});
  const automaticReplies=process.env.ANIMAHOST_ACCEPTANCE_PASSED==='true';
  const freeForm=process.env.ANIMAHOST_QUALITY_V3_PASSED==='true'&&practice.active_rulebook_version===8;
  const teamTime=()=>teamReplyTime(input.receivedAt,practice.team_reply_days,practice.closure_periods,language);
  const attendanceEnabled=input.tenantId===process.env.ANIMAHOST_TENANT_ID&&Boolean(input.identity&&attendanceArtworkVersion());
  const staff=qualityAvailable&&trustedPhone&&input.staffPatientIds?.length?
   await db.from('patients').select('id,vorname,nachname,geburtsdatum,geschlecht').in('id',input.staffPatientIds):null;
  const candidates=Array.from(new Map([...(patientMatches??[]),...(staff?.data??[])].map(row=>[row.id,row] as const)).values());
  const patient=selectPhonePatient(candidates,input.text??'');
  let preferences:{informal:boolean;context:ChatContext}|null=null;
  if(qualityAvailable&&trustedPhone){
   const stored=await db.from('animahost_whatsapp_chat_preferences').select('informal,context')
    .eq('tenant_id',input.tenantId).eq('chat_jid',input.from).maybeSingle();
   if(stored.error)throw Error('chat_preferences_unavailable');
   preferences=stored.data as typeof preferences??{informal:false,context:{}};
  }
  let details:ChatDetails|undefined;
  let qualityHandled=false;
  let composedReply=false;
  let unlinkedSubject:string|null=null;
  let unlinkedHandoff:ReturnType<typeof practiceMessageHandoff>=null;
  if(input.text&&!input.handoffOnly&&!explicitOptOut(input.text)&&!emergencyDecision(input.text)){
   // Antwortet der Patient gerade auf die Frage nach Name und Geburtsdatum, gehört die Nachricht in die Prüfung und nie in eine Übergabe.
   const answeringIdentity=Boolean(preferences?.context.challenge&&parseBirthDate(input.text));
   const handoff=answeringIdentity?null:practiceMessageHandoff(input.text,candidates,language,teamTime());
   // Ein Kind, das nicht an der Nummer hängt: Rechnung und Zahlung klärt AnimaHost über Name und Geburtsdatum, einen reinen
   // Terminwunsch beantwortet er sofort. Alles andere geht weiter ans Team, damit nie die Akte eines anderen Kindes getroffen wird.
   const plan=handoff?unlinkedSubjectPlan(input.text):null;
   let unlinkedReply:ReturnType<typeof unlinkedAppointmentReply>=null;
   if(handoff&&plan==='appointment'&&automaticReplies&&practice.active_rulebook_version){
    const version=await db.from('animahost_whatsapp_rulebook_versions').select('rules')
     .eq('tenant_id',input.tenantId).eq('version',practice.active_rulebook_version).single();
    const rules=whatsappRulesSchema.safeParse(version.data?.rules);
    unlinkedReply=unlinkedAppointmentReply(input.text,rules.success?rules.data:[],{receivedAt:input.receivedAt,language,doctolib:practice.doctolib_url});
   }
   if(handoff&&plan==='identify'&&preferences&&trustedPhone){unlinkedSubject=handoff.details?.requestedName??null;unlinkedHandoff=handoff;}
   else if(unlinkedReply){decision=unlinkedReply.decision;details=unlinkedReply.details;qualityHandled=true;}
   else if(handoff){decision=handoff.decision;details=handoff.details;qualityHandled=true;}
   else if(personRequest(input.text)==='only'){
    // Wunsch nach einer Person ohne Anliegen: AnimaHost hilft zuerst selbst weiter. Der letzte Stand des Chats entscheidet über den Schritt.
    const last=await db.from('animahost_whatsapp_decisions').select('action,rule_id')
     .eq('tenant_id',input.tenantId).eq('sender_jid',input.from)
     .gte('created_at',new Date(Date.parse(input.receivedAt)-24*3_600_000).toISOString())
     .order('created_at',{ascending:false}).limit(1).maybeSingle();
    const answer=personRequestReply({text:input.text,language,teamTime:teamTime(),automatic:automaticReplies,
     lastAction:last.data?.action??null,lastRule:last.data?.rule_id??null});
    decision=answer.decision;details=answer.details;qualityHandled=true;
   }
  }
  if(!input.text&&!input.handoffOnly&&input.messageType!=='text'){
   const kind=input.messageType.replace(/^view_once_/,'');
   const media=['album','video'].includes(kind)?'image':kind;
   decision={action:'antworten',rule:`media:${input.messageType}`,
    text:t(`animahost.whatsapp.media.${['image','audio','document','sticker'].includes(media)?media:'unsupported'}`,language)};
   qualityHandled=true;
  }
  if(!qualityHandled&&preferences&&trustedPhone&&input.text&&input.messageType==='text'&&!input.handoffOnly&&
     !explicitOptOut(input.text)&&!emergencyDecision(input.text)){
   if(automaticReplies&&explicitlyOffersDu(input.text)){
    preferences.informal=true;
    decision={action:'antworten',rule:'address:du',text:t('animahost.quality.du',language)};
    qualityHandled=true;
   }else{
    const workflowInput={tenantId:input.tenantId,from:input.from,phone:trustedPhone,
     receivedAt:input.receivedAt,text:input.text,language,teamTime:teamTime(),patients:candidates,
     patient,context:preferences.context,doctolib:practice.doctolib_url,closures:practice.closure_periods,phoneForPractice:practice.practice_phone,onlyInvoiceRouting:!automaticReplies,unlinkedSubject};
    let resolved;
    if(appointmentConcern(input.text)&&invoicePortalIntent(input.text)){
     const version=await db.from('animahost_whatsapp_rulebook_versions').select('rules')
      .eq('tenant_id',input.tenantId).eq('version',practice.active_rulebook_version).single();
     const rules=whatsappRulesSchema.safeParse(version.data?.rules);
     resolved=await combinedMessageWorkflow(db,workflowInput,rules.success?rules.data:[]);
    }else resolved=await qualityWorkflow(db,workflowInput);
    if(resolved){decision=resolved.decision;details=resolved.details;qualityHandled=true;}
   }
  }
  // Hat die Prüfung den Fall mit dem nicht verknüpften Kind nicht übernommen, bleibt es bei der sicheren Übergabe ans Team.
  if(!qualityHandled&&unlinkedHandoff){decision=unlinkedHandoff.decision;details=unlinkedHandoff.details;qualityHandled=true;}
  if(!qualityHandled&&!preferences&&input.text&&!input.handoffOnly&&!explicitOptOut(input.text)&&!emergencyDecision(input.text)){
   const portalIntent=invoicePortalIntent(input.text);
   if(portalIntent==='missing'){
    decision={action:'klaerfall',rule:'invoice_portal:manual_review',
     text:t('animahost.quality.invoice_manual',language)+' '+t('animahost.team.reply',language,{when:teamTime()})};
    qualityHandled=true;
   }else if(portalIntent==='section'){
    decision={action:'antworten',rule:'quality:invoice_section',text:t('animahost.quality.invoice_section',language)};
    qualityHandled=true;
   }else if(portalIntent==='location'){
    decision={action:'antworten',rule:'quality:invoice_documents',text:t('animahost.quality.portal_invoice',language,
     {portal:'https://animacura.io/patient/portal?section=rechnungen'})};
    qualityHandled=true;
   }
  }
  if(!preferences&&qualityHandled&&input.text&&appointmentConcern(input.text)&&invoicePortalIntent(input.text)&&!details?.practiceSummary){
   const notice=appointmentNoticeDecision({kind:appointmentConcern(input.text)!,appointmentDate:null,delayMinutes:null},
    input.receivedAt,language==='en'?'en':'de',null,practice.doctolib_url)!;
   decision={action:'klaerfall',rule:'quality:multiple_concerns',text:[notice.text,decision.text,
    t('animahost.quality.multiple_team',language,{when:teamTime()})].join('\n\n')};
   details={patientId:null,firstName:null,lastName:null,invoiceDate:null,cause:'manual_review',
    concerns:messageConcerns(input.text),practiceSummary:practiceSummary(input.text)};
  }
  let informal=preferences?.informal??false;
  const plainText=input.messageType==='text'&&input.text&&!input.handoffOnly&&!explicitOptOut(input.text)&&!emergencyDecision(input.text);
  if(!preferences?.informal&&input.messageType==='text'){
   const offer=await db.from('animahost_whatsapp_decisions').select('rule_id').eq('tenant_id',input.tenantId)
    .eq('sender_jid',input.from).eq('rule_id','address:du').limit(1).maybeSingle();
   informal=offer.data?.rule_id==='address:du';
   if(preferences&&informal)preferences.informal=true;
  }
  if(!qualityHandled&&plainText&&automaticReplies&&input.text){
   if(explicitlyOffersDu(input.text)){
    informal=true;
    if(preferences)preferences.informal=true;
    decision={action:'antworten',rule:'address:du',text:t('animahost.quality.du',language)};
    qualityHandled=true;
   }else{
    const visit=visitReply({text:input.text,language,receivedAt:input.receivedAt,doctolib:practice.doctolib_url,
     closures:practice.closure_periods});
    if(visit){decision=visit.decision;qualityHandled=true;}
    else if(!preferences){
     const previous=await db.from('animahost_whatsapp_decisions').select('rule_id,created_at')
      .eq('tenant_id',input.tenantId).eq('sender_jid',input.from)
      .gte('created_at',new Date(Date.parse(input.receivedAt)-30*60_000).toISOString())
      .order('created_at',{ascending:false}).limit(1).maybeSingle();
     const step=/^quality:(appointment|portal):([123])$/.exec(previous.data?.rule_id??'');
     const context:ChatContext=step&&previous.data?.created_at?{journey:{kind:step[1]==='appointment'?'appointment':'portal',
      step:Number(step[2]),at:previous.data.created_at}}:{};
     const selfService=selfServiceReply({text:input.text,language,receivedAt:input.receivedAt,teamTime:teamTime(),
      doctolib:practice.doctolib_url,context,assigned:Boolean(input.identity||input.staffPatientIds?.length)});
     if(selfService){decision=selfService.decision;qualityHandled=true;}
    }
   }
  }
  const readOnlyReply=/^quality:(?:attachment|walk_in|appliance_visit)$/.test(decision.rule);
  if((!qualityHandled||readOnlyReply)&&plainText&&input.text&&input.senderPolicy===1&&process.env.ANIMAHOST_REPLY_CORE_PASSED==='true'&&
   !explicitLater&&!lateLanguage&&!appointmentConcern(input.text)&&!invoicePortalIntent(input.text)&&
   !mayBeAttendanceRequest(input.text)&&!/(?:adresse|telefonnummer|e.mail|rechnungsempfänger|zugangscode|passwort|geburtsdatum|mahnung|guthaben|rechn(?:ung|ungen)|payment|invoice|address|contraseña|factura)/i.test(input.text)){
   const today=appointmentLocalDate(input.receivedAt);
   try{
    const [version,knowledge,confirmed]=await Promise.all([
     db.from('animahost_whatsapp_rulebook_versions').select('rules').eq('tenant_id',input.tenantId).eq('version',practice.active_rulebook_version).single(),
     activeKnowledge(db,input.tenantId,today),
     trustedPhone?db.from('animahost_whatsapp_verified_patients').select('patient_id').eq('tenant_id',input.tenantId)
      .eq('chat_jid',input.from).eq('phone',trustedPhone).lte('verified_at',input.receivedAt):Promise.resolve({data:[],error:null}),
    ]);
    const rules=whatsappRulesSchema.safeParse(version.data?.rules);
    if(version.error||confirmed.error||!rules.success||!knowledge.available)throw Error('reply_core_context_unavailable');
    const verifiedIds=(confirmed.data??[]).map(row=>row.patient_id);
    if(input.identity?.phone===trustedPhone)verifiedIds.push(input.identity.patientId);
    const dossier=await loadDossier(db,{patients:candidates,verifiedIds,today});
    const result=await runChain(gatewayGenerate(practice.model,request.signal),{message:maskBirthDates(input.text),language,informal:false,
     history,dossier,rules:rules.data,approvedKnowledge:knowledge.entries,
     practice:{doctolibUrl:practice.doctolib_url,phone:practice.practice_phone,today,teamTime:teamTime(),closurePeriods:practice.closure_periods},
     baseline:null,budgetMs:Math.max(0,deadline-Date.now())});
    details={patientId:null,firstName:null,lastName:null,invoiceDate:null,cause:result.ok?'reply_core':result.reason,
     ...(result.ok?{practiceSummary:result.teamSummary??undefined,concerns:result.concerns.map(item=>item.topic),usedRuleIds:result.usedRuleIds,
      usedKnowledge:result.usedKnowledge,responseQuality:result.concerns.some(item=>['regel','akte','gespraech'].includes(item.way))?'content':'handoff_only'}:
      {responseQuality:'withheld',violations:result.violations,practiceSummary:t('animahost.whatsapp.chain_review','de',{reason:result.reason})})};
    decision=result.ok?{action:result.action,text:result.text,rule:result.rule}:{action:'klaerfall',text:'',rule:'chain:guard_rejected'};
   }catch{
    decision={action:'klaerfall',text:'',rule:'chain:guard_rejected'};
    details={patientId:null,firstName:null,lastName:null,invoiceDate:null,cause:'reply_core_context_unavailable',responseQuality:'withheld',
     practiceSummary:t('animahost.whatsapp.chain_review','de',{reason:'reply_core_context_unavailable'})};
   }
   qualityHandled=true;composedReply=true;
  }
  if(!qualityHandled){
  if(input.messageType==='text'&&input.text){
   const emergency=emergencyDecision(input.text);
   if(emergency)decision=emergency;
   if(!emergency&&explicitOptOut(input.text))decision=optOut();
   else if(input.text.trim()==='?'&&automaticReplies&&!input.handoffOnly)
    decision={action:'antworten',text:t('animahost.whatsapp.askTopic','de'),rule:'ask_topic'};
   else if(practice.active_rulebook_version){
     const recent=await db.from('animahost_whatsapp_decisions').select(tolerance.success?'rule_id,created_at,appointment_context':'rule_id,created_at')
      .eq('tenant_id',input.tenantId).eq('sender_jid',input.from)
      .gte('created_at',new Date(Date.parse(input.receivedAt)-(tolerance.success?7*86_400_000:30*60_000)).toISOString())
      .order('created_at',{ascending:false}).limit(1).maybeSingle();
     const previous=recent.data as {rule_id?:string;created_at?:string;appointment_context?:unknown}|null;
     const recentRule=previous?.created_at&&Date.parse(previous.created_at)>Date.parse(input.receivedAt)-30*60_000?previous.rule_id:null;
     const old=lateStateSchema.safeParse(previous?.appointment_context);
     const prior=old.success?old.data:null;
     const awaitingAttendanceDetails=recentRule==='attendance_details_requested';
     const handleAttendance=attendanceEnabled&&(awaitingAttendanceDetails||mayBeAttendanceRequest(input.text));
      const version=await db.from('animahost_whatsapp_rulebook_versions').select('rules')
       .eq('tenant_id',input.tenantId).eq('version',practice.active_rulebook_version).single();
      if(version.error&&decision.action!=='notfall')throw Error('rulebook_read_failed');
      const validated=whatsappRulesSchema.safeParse(version.data?.rules);
      if(validated.success){
      validated.data=applicableMessageRules(input.text,validated.data);
      hoursRule=validated.data.find(rule=>rule.id==='oeffnungszeiten-und-sprechzeiten')?.patientText;
      const medicationRule='medizinische-frage-zu-medikamenten-schmerzen-ode';
      const medicationQuestion=/\b(ibuprofen|paracetamol|schmerzmittel|painkillers?)\b/i.test(input.text)&&
       /[?]|\b(?:einnehmen|nehmen|take)\b/i.test(input.text);
      const looseBrace=/\b(?:bracket|band|brackets?|brace)\b.{0,48}(?:abge|gelöst|lock|lose|loose)|(?:los|locker|gelöst).{0,32}\b(?:bracket|band|brace)\b/i.test(input.text);
      if(emergency){
       decision=resolveEmergency(input.text,emergency,validated.data,[],language,practice.practice_phone||'0179 5351813');
      }else if(automaticReplies&&!input.handoffOnly&&medicationQuestion){
       decision=withRuleReplies(null,[medicationRule],validated.data,practice.doctolib_url)??decision;
       if(decision.rule!=='no_applicable_rule')decision={...decision,
        text:`${t('animahost.quality.medication_limit',language)} ${t('animahost.quality.medical_contact',language,{phone:practice.practice_phone||'0179 5351813'})}`};
      }else if(automaticReplies&&!input.handoffOnly&&looseBrace){
       decision=decisionFromRule(validated.data.find(rule=>rule.id==='bracket-oder-band-hat-sich-geloest')??null,practice.doctolib_url);
      }else if(automaticReplies||handleAttendance){
      try{
       const arrivalIntent=Boolean(tolerance.success&&(explicitLater||
        lateLanguage&&(/\btermin\b|appointment|\bstau\b|\bbahn\b|\bspäter (?:da|kommen)\b/i.test(input.text)||explicitTimes.delayMinutes!=null))&&
        (explicitTimes.delayMinutes!=null||explicitTimes.originalTime&&explicitTimes.arrivalTime));
       const choseArrival=arrivalIntent?{
        kind:'late_arrival' as const,clear:true,language,replyLanguage:language,optOut:false,
        lateArrival:{
         appointmentDate:explicitTimes.appointmentDate??(prior?.appointmentDate&&references.length?prior.appointmentDate:
          /\bstau\b|on (?:my|the) way|en camino/i.test(input.text)?appointmentLocalDate(input.receivedAt):null),
         originalTime:explicitTimes.originalTime??null,arrivalTime:explicitTimes.arrivalTime??null,
         delayMinutes:explicitTimes.delayMinutes??null,appointmentTypeId:null,usesEarlierDetails:references.length>0,
         challengesRefusal:prior?.outcome==='rebook'&&references.length>0,
        },
       }:null;
       const chosen: z.infer<typeof classificationSchema>=choseArrival??(await generateText({
        model:practice.model,maxRetries:0,temperature:0,
        abortSignal:AbortSignal.any([request.signal,AbortSignal.timeout(10_500)]),
        output:Output.object({schema:classificationSchema}),
        system:[
         'Klassifiziere die neueste Nachricht. Der Verlauf erklärt nur echte Bezüge. Wähle passende freigegebene ruleIds für jedes aktuelle Anliegen, auch bei Synonymen, Tippfehlern und anderen Sprachen. Wähle nie eine Regel für ein früheres Anliegen und höchstens eine Regel pro Frage.',
         'clear=true bedeutet klar erkanntes Anliegen, selbst wenn Daten für die Bearbeitung fehlen. Gib nur relevante Felder aus. Setze language und replyLanguage auf die tatsächliche Sprache.',
         'Termin: Absage, Verschiebung auf einen anderen Termin oder verpasster Termin sind appointment_notice. Später zum selben Termin ist late_arrival. Gib Datum, Uhrzeiten, Minuten und bei genannter Terminart deren wörtlichen Beleg an. Nutze localDate für relative Tage. Ein Einwand nach Ablehnung nutzt priorLateArrival nur für denselben Besuch und setzt challengesRefusal.',
         'Buchungsanfragen zu einem klar benannten Doctolib-Termin nutzen appointment mit der passenden ID. Allgemeine Fragen zu früheren Terminen, Geschwistern, Kosten oder Abläufen nutzen Textregeln. Termine zum Behandlungsbeginn, Herstellen, Einsetzen, Abholen oder nach Absprache am Empfang sind Klärfälle.',
         'Allgemeine Fragen zu Rechnungen, Zahlung, Guthaben oder Kontakt beantwortet die passende Auskunftsregel. Kein Identitätsnachweis für allgemeine Informationen. Nur eine konkrete Änderung mit neuen Werten ist contact_change oder invoice_recipient_change. access_resend nur für fehlende oder abgelaufene Codes oder Links, nicht für Passwort vergessen.',
         'Bescheinigung ohne konkrete Person und Datum ist eine allgemeine Auskunft. Bei konkretem Besuch setze attendance_certificate und übernimm Name und Besuchsdatum. Der genannte Wochentag in der Vergangenheit zählt, wenn die Nachricht sagt, die Person war dort. Tragezeit und Medikamente sind medizinische Fragen ohne eigene Empfehlung.',
         'Notfall setzt akute Gefahr, starke Schmerzen, Blutung, Unfall oder Verschlucken voraus. Zitiere die akuten Zeichen genau. Defekte Apparatur ohne akute Beschwerden ist kein Notfall. Sofortige Gefahr, Atemnot, starke Blutung oder Bewusstlosigkeit sind immediate.',
         'Wenn eine neue Frage nicht zur Praxis gehört, setze outside_scope. Wenn eine Frage außerhalb der verfügbaren Regeln liegt, gib fallbackTopic an. Einen zweiten offenen Teil nur als unansweredQuote zitieren, wenn er wirklich eigenständig ist. Bei ausdrücklichem Stopp setze optOut.',
        ].join(' '),
        prompt:JSON.stringify({
         message:/geburtsdatum|date of birth|fecha de nacimiento/i.test(input.text)?maskBirthDates(input.text):input.text,history:references,priorLateArrival:references.length?prior:null,
         priorCancellation:recentRule?.startsWith('appointment_notice:cancel:')??false,localDate:appointmentLocalDate(input.receivedAt),
         awaitingAttendanceDetails,awaitingRecipientDetails:recentRule==='invoice_recipient_details_requested',
         appointmentTypes:validated.data.filter(rule=>rule.appointmentTypeId)
          .map(rule=>[rule.appointmentTypeId,rule.topic,rule.appointmentDescription]),
         otherRules:validated.data.filter(rule=>!rule.appointmentTypeId)
          .map(rule=>[rule.id,rule.topic,...rule.keywords.slice(0,5)]),
        }),
        maxOutputTokens:700,providerOptions:gatewayOptions,
       })).output;
       language=chosen.language||'de';
       replyLanguage=chosen.replyLanguage??language;
       topic=hints.topic!=='other'&&hints.topic!=='appointment'?hints.topic:chosen.fallbackTopic??topic;
       const reportedSymptoms=chosen.emergencyEvidence?.trim()??'';
       const hasEmergencyEvidence=reportedSymptoms.length>=4&&
        input.text.toLocaleLowerCase().includes(reportedSymptoms.toLocaleLowerCase())&&
        emergencyDecision(reportedSymptoms)!==null;
       const semanticEmergency=hasEmergencyEvidence?chosen.emergency:'none';
       const selectedRules=chosen.ruleIds??[];
       const ruleIds=medicationQuestion&&!emergency&&semanticEmergency!=='immediate'&&semanticEmergency!=='urgent'
        ?[medicationRule,...selectedRules.filter(id=>validated.data.find(rule=>rule.id===id)?.action!=='notfall')]
        :selectedRules.filter(id=>validated.data.find(rule=>rule.id===id)?.action!=='notfall');
       const quote=chosen.unansweredQuote?.trim().toLocaleLowerCase();
       const original=input.text.trim().toLocaleLowerCase();
       const hasIndependentQuestion=Boolean(quote&&quote.length>=8&&quote.length<original.length&&
        (original.startsWith(quote)||original.includes(quote))&&/[?;,]|\bund\b|\band\b|\by\b/.test(original));
       const matchedRule=ruleIds.map(id=>validated.data.find(rule=>rule.id===id)).find(Boolean)??null;
       const selectedAnswer=matchedRule?.action==='antworten'?decisionFromRule(matchedRule,practice.doctolib_url):null;
       const late=chosen.lateArrival??(chosen.appointmentNotice?.kind==='late'?{
        appointmentDate:chosen.appointmentNotice.appointmentDate,originalTime:null,arrivalTime:null,
        delayMinutes:chosen.appointmentNotice.delayMinutes,appointmentTypeId:null,
       }:null);
       const sameVisit=explicitLater||chosen.kind==='late_arrival'||chosen.appointmentNotice?.kind==='late'||
        (lateLanguage&&(chosen.kind==='appointment'||chosen.appointmentNotice?.kind==='reschedule'));
       const approvedBooking=chosen.kind==='appointment'&&validated.data.some(rule=>rule.appointmentTypeId&&
        rule.appointmentTypeId===chosen.appointmentTypeId)&&!sameVisit&&!mandatoryAppointmentClarification(input.text);
       const fallback=()=>fallbackDecision({topic,appointment:approvedBooking,language,teamTime:teamTime(),
        doctolibUrl:practice.doctolib_url});
       const rebookRequested=recentRule?.startsWith('appointment_notice:cancel:')&&
        (chosen.kind==='rebook_after_cancel'||/^(?:ja|yes|s[ií])(?:[, ]+(?:bitte|gern(?:e)?|please|por favor))?[.!]?$/i.test(input.text.trim())||
         /(?:möchte|würde|bitte).{0,30}(?:neuen termin|new appointment|nueva cita)/i.test(input.text));
       const serviceLanguage=language==='es'?'de':language;
       if(semanticEmergency==='immediate'||semanticEmergency==='urgent'){
        decision=resolveEmergency(input.text,{action:'notfall',rule:semanticEmergency==='immediate'?'emergency_112':'emergency_practice',text:''},
         validated.data,selectedRules,language,practice.practice_phone||'0179 5351813');
       }else if(chosen.optOut){decision=optOut();
       }else if(input.handoffOnly){decision=fallback();
       }else if(medicationQuestion&&automaticReplies){
        decision=withRuleReplies(null,[medicationRule],validated.data,practice.doctolib_url)??fallback();
        decision={...decision,text:[decision.text,t('animahost.quality.medical_contact',language,{phone:practice.practice_phone||'0179 5351813'})].join(' ')};
       }else if(!automaticReplies&&(chosen.kind!=='attendance_certificate'||!chosen.clear)){
        if(mandatoryAppointmentClarification(input.text))decision={...decision,rule:'appointment_practice_arrangement'};
       }else if(sameVisit){
        if(tolerance.success){
         const requested=late??{appointmentDate:null,originalTime:null,arrivalTime:null,delayMinutes:null,appointmentTypeId:null};
         const recovered=explicitTimes;
         const hasDayEvidence=/\b(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|heute|morgen|today|tomorrow|mon(?:day)?|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miércoles|jueves|viernes|sábado|domingo|hoy|mañana)\b|\d{1,2}[./-]\d{1,2}/i.test(input.text);
         const hasTimeEvidence=/\d{1,2}:\d{2}|(?:um|gegen|at|a las) +\d{1,2}\b|\b(?:halb|viertel)\b/i.test(input.text);
         lateState=planLateArrival({...requested,
          appointmentDate:recovered.appointmentDate??(hasDayEvidence||choseArrival?requested.appointmentDate:null),
          originalTime:recovered.originalTime??(hasTimeEvidence?requested.originalTime:null),
          arrivalTime:recovered.arrivalTime??(hasTimeEvidence?requested.arrivalTime:null),
          delayMinutes:recovered.delayMinutes??requested.delayMinutes,
          appointmentTypeId:knownVisitType(input.text,requested,validated.data)},
          references.length?prior:null,tolerance.data,validated.data,hoursRule,practice.closure_periods);
         if(lateState.outcome==='pending'){
          const opened=await openAppointmentCase(db,input,lateState,language);
          if(!opened)lateState={...lateState,outcome:'ask_time'};
         }else if(lateState.outcome==='already_pending'){
          const saved=await latestAppointmentCase(db,input.tenantId,input.from,lateState);
          if(saved?.status==='approved')lateState={...lateState,outcome:'wait',arrivalTime:saved.arrivalTime};
          if(saved?.status==='declined')lateState={...lateState,outcome:'rebook'};
          if(saved?.status==='phone_required')lateState={...lateState,outcome:'phone'};
         }
         const advice=lateReply(lateState,language,practice.doctolib_url,practice.practice_phone,validated.data,tolerance.data);
         const pending=lateState.outcome==='pending'||lateState.outcome==='already_pending';
         decision={action:pending||lateState.outcome==='incomplete_review'?'klaerfall':'antworten',
          rule:lateState.outcome==='incomplete_review'?'quality:late_review':`late_arrival:${lateState.outcome}`,
          text:qualityAvailable&&pending?t('animahost.quality.late_pending',language,{when:teamTime(),arrival:lateState.arrivalTime??''}):
           lateState.outcome==='incomplete_review'?`${advice} ${t('animahost.team.reply',language,{when:teamTime()})}`:advice};
        }else{
         decision=fallbackDecision({topic:'appointment',appointment:false,language,teamTime:teamTime(),doctolibUrl:null});
        }
       }else if(rebookRequested){
        const link=renderWhatsAppRuleText('{doctolib_link}',practice.doctolib_url);
        decision={action:'antworten',rule:'rebook_after_cancel',
         text:t(link?'animahost.late.book':'animahost.late.ask_type',language,link?{url:link}:undefined)};
       }else if(chosen.kind==='appointment_notice'&&chosen.clear&&chosen.appointmentNotice){
        const notice=chosen.appointmentNotice;
        const shortDelay=notice.kind==='late'&&notice.delayMinutes!==null&&notice.delayMinutes<=15;
        decision=shortDelay&&matchedRule?.id==='verspaetung-zum-termin'
         ?decisionFromRule(matchedRule,practice.doctolib_url)
         :appointmentNoticeDecision(notice,input.receivedAt,serviceLanguage,matchedRule,practice.doctolib_url)??decision;
        if(notice.kind==='cancel'&&decision.action==='antworten')decision={...decision,
         text:qualityAvailable&&practice.doctolib_url?
          `${t('animahost.late.cancel_recorded',language)} ${t('animahost.late.book',language,{url:practice.doctolib_url})}`:
          `${t('animahost.late.cancel_recorded',language)} ${t('animahost.late.cancel_prompt',language)}`};
       }else if(mandatoryAppointmentClarification(input.text)){
        topic=hints.topic==='attachment'?'attachment':'appointment';
        decision=fallback();
       }else if(chosen.kind==='outside_scope'){
        decision=ruleIds.length||topic!=='other'?fallback():{action:'antworten',rule:'conversation:outside_scope',text:t('animahost.whatsapp.outside_scope',language)};
       }else if(chosen.kind==='practice_closure'&&chosen.clear&&chosen.closureDate){
        decision=closureDecision(practice.closure_periods,chosen.closureDate,serviceLanguage)||decision;
       }else if(chosen.kind==='access_resend'&&chosen.clear&&chosen.accessPurpose){
        decision=await reissueChatAccess(db,input,chosen.accessPurpose,serviceLanguage)??{...decision,rule:'access_resend_needs_practice'};
       }else if(chosen.kind==='attendance_certificate'&&chosen.clear){
        const {patientName:quotedName,date:classifiedDate}=chosen.attendance??{};
        const date=classifiedDate;
        const patientName=patient&&(!quotedName||quotedName.toLocaleLowerCase()===patient.vorname.toLocaleLowerCase())?
         `${patient.vorname} ${patient.nachname}`:quotedName;
        if(!patientName||!date){
         decision={action:'antworten',text:t('animahost.whatsapp.attendance.details',language),rule:'attendance_details_requested'};
        }else{
         if(qualityAvailable&&date>appointmentLocalDate(input.receivedAt)){
          decision={action:'antworten',rule:'attendance_certificate_future',text:t('animahost.quality.attendance_future',language)};
         }else{
          const identity=input.identity??(patient&&trustedPhone?{patientId:patient.id,phone:trustedPhone}:undefined);
          const proof=qualityAvailable&&identity?await attendanceProof(db,identity.patientId,date,input.receivedAt):undefined;
          if(proof===null)decision={action:'antworten',rule:'attendance_certificate_unproven',text:t('animahost.quality.attendance_unproven',language)};
          else{
           const url=await issueAttendanceFromChat(db,{...input,identity,patientName,date,language:serviceLanguage});
           decision=url?{action:'antworten',text:t('animahost.whatsapp.attendance.ready',language,{url}),rule:'attendance_certificate_issued'}:
            {...decision,rule:'attendance_certificate_needs_practice'};
          }
         }
        }
       }else if(chosen.kind==='contact_change'&&chosen.clear){
        decision=await changeChatPatientContact(db,input,chosen.contactChange,serviceLanguage)??{...decision,rule:'contact_change_needs_practice'};
       }else if(chosen.kind==='invoice_recipient_change'&&chosen.clear){
        decision=await changeChatInvoiceRecipient(db,input,chosen.recipientChange,serviceLanguage)??{...decision,rule:'invoice_recipient_needs_practice'};
       }else if(chosen.kind==='appointment'){
        const matched=chosen.clear?validated.data.find(rule=>rule.appointmentTypeId===chosen.appointmentTypeId):null;
        const link=renderWhatsAppRuleText('{doctolib_link}',practice.doctolib_url);
        if(selectedAnswer?.rule!=='no_applicable_rule'&&selectedAnswer){decision=selectedAnswer;}
        else if(matched&&link){
         const authored=matched.patientText.includes('{doctolib_link}')?decisionFromRule(matched,link):null;
         decision={action:'antworten',text:authored?.action==='antworten'?authored.text:
          t('animahost.whatsapp.doctolib',language,{url:link}),rule:`doctolib:${matched.appointmentTypeId}`};
        }
        else decision={...decisionFromRule(null),rule:'appointment_needs_practice'};
       }
       if(automaticReplies&&!input.handoffOnly&&!chosen.optOut&&!medicationQuestion&&!sameVisit&&!rebookRequested&&decision.action!=='notfall'){
        const excluded=mandatoryAppointmentClarification(input.text);
        const primary=decision.rule==='no_applicable_rule'||decision.rule==='appointment_needs_practice'?null:decision;
        const independent=hasIndependentQuestion&&chosen.fallbackTopic;
        const needsTeam=Boolean(independent||!chosen.clear||chosen.kind==='clarify'||(!primary&&ruleIds.length===0));
        const safeIds=excluded?ruleIds.filter(id=>!validated.data.find(rule=>rule.id===id)?.patientText.includes('{doctolib_link}')):ruleIds;
        decision=completeRuleReply(primary,needsTeam?fallback():null,safeIds,validated.data,practice.doctolib_url)??fallback();
       }
      }catch{
       if(decision.action!=='notfall'){
        const cues=automaticReplies&&!input.handoffOnly&&!explicitLater&&!lateLanguage&&!mandatoryAppointmentClarification(input.text)
         ?matchApprovedRuleFallback(input.text,validated.data):[];
        decision=withRuleReplies(null,cues,validated.data,practice.doctolib_url)??decisionFromRule(null);
       }
      }
      }
      }
   }
  }
  }
  if(explicitLater&&decision.rule.startsWith('doctolib:'))decision=decisionFromRule(null);
  if(decision.rule==='no_applicable_rule'||(!automaticReplies&&decision.action==='klaerfall'&&!decision.rule.startsWith('invoice_portal:')&&!details?.practiceSummary)){
   decision=fallbackDecision({topic,appointment:false,language,teamTime:teamTime(),
    doctolibUrl:practice.doctolib_url});
  }
  if(!composedReply)decision=styleMessage(decision,qualityAvailable?patient:null,{language,receivedAt:input.receivedAt,
   firstReply:!history.some(item=>item.direction==='outgoing'),informal,teamTime:teamTime(),incoming:input.text??''});
  if(preferences){
   const saved=await db.from('animahost_whatsapp_chat_preferences').upsert({tenant_id:input.tenantId,chat_jid:input.from,
    informal:preferences.informal,context:preferences.context,updated_at:input.receivedAt},{onConflict:'tenant_id,chat_jid'});
   if(saved.error)throw Error('chat_preferences_unavailable');
  }
  let replyStyle:'formulated'|'template'=composedReply&&decision.text?'formulated':'template';
  if(!composedReply&&freeForm&&automaticReplies&&input.text&&decision.action!=='notfall'&&!decision.rule.startsWith('fallback:')&&!details?.practiceSummary){
   const approved=decision.text;
   decision=await formulateConversationReply({model:practice.model,decision,text:maskBirthDates(input.text),history:references,language:replyLanguage,informal,
    verifiedIdentity:Boolean(input.identity),signal:request.signal,deadline});
   if(decision.text!==approved)replyStyle='formulated';
  }
  const sentThrough=input.history?.filter(turn=>Date.parse(turn.at)<=Date.parse(input.receivedAt))??[];
  if(!composedReply)decision=enforceConversationOutput(decision,sentThrough,language,{teamTime:teamTime(),receivedAt:input.receivedAt,informal,
   keepLinks:/^(?:access_|attendance_|invoice_recipient_|contact_change_)/.test(decision.rule)});
  const inserted=await db.from('animahost_whatsapp_decisions').insert({tenant_id:input.tenantId,
   message_id:input.messageId,sender_jid:input.from,action:decision.action,
   rule_id:decision.rule,rulebook_version:practice.active_rulebook_version,
   patient_text:decision.text,...(qualityAvailable?{case_details:details??null}:{}),...(tolerance.success?{appointment_context:lateState}:{} )});
  if(inserted.error&&inserted.error.code!=='23505')throw Error('decision_store_failed');
  if(inserted.error?.code==='23505'){
   const duplicate=await db.from('animahost_whatsapp_decisions').select('action,patient_text,rule_id')
    .eq('tenant_id',input.tenantId).eq('message_id',input.messageId).single();
   if(duplicate.error)throw Error('decision_read_failed');
   decision={action:duplicate.data.action,text:duplicate.data.patient_text,rule:duplicate.data.rule_id};
  }
  await notifyPractice(db,input,decision,details);
  return decisionResponse(decision,replyStyle,patientMatches?phoneLabels(patientMatches):undefined,details,replySchedule);
 }catch{
  return NextResponse.json({code:'answer_unavailable'},{status:503});
 }
}
