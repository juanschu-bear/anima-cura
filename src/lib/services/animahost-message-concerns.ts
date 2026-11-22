import {t} from '@/lib/i18n';
import {namedSubject,selectPhonePatient,type PhonePatient} from './animahost-chat-identity';
import {appointmentNoticeDecision} from './animahost-appointment-notices';
import {invoicePortalIntent,qualityWorkflow,type Outcome} from './animahost-quality-workflows';
import {decisionFromRule,type WhatsAppRule} from './animahost-whatsapp';

export {applicableMessageRules} from './animahost-whatsapp';
export function appointmentConcern(text:string):'reschedule'|'cancel'|null{
 if(!/termin|appointment|cita/i.test(text))return null;
 if(/verschieb|verleg|umbuch|reschedul|reprogram/i.test(text))return 'reschedule';
 if(/absag|stornier|cancel/i.test(text))return 'cancel';
 return null;
}
export function messageConcerns(text:string){
 return [appointmentConcern(text)?'appointment':null,invoicePortalIntent(text)?'invoice':null].filter((x):x is string=>Boolean(x));
}
export function practiceSummary(text:string){
 const topics=messageConcerns(text).map(topic=>t(`animahost.quality.concern_${topic}`,'de')).join('; ');
 return t('animahost.quality.concern_summary','de',{topics:topics||t('animahost.quality.concern_personal','de')})+'\n\n'+text;
}
/** Explicit addressees and unmatched subjects are practice cases before any patient-specific lookup. */
export function practiceMessageHandoff(text:string,patients:PhonePatient[],language:string,teamTime:string):Outcome|null{
 const staff=/(?:^\s*(?:(?:hallo|guten (?:tag|morgen|abend)|liebe[r]?|sehr geehrte[r]?)\s+)?(?:frau|herr[n]?|dr\.)\s+[A-ZÄÖÜ][A-Za-zÀ-ÿ-]+)|(?:\b(?:frau|herr[n]?)\s+[A-ZÄÖÜ][A-Za-zÀ-ÿ-]+.{0,60}(?:antwort|meld|sprechen|rufen))/i.test(text);
 const requestedName=namedSubject(text);
 const unmatched=Boolean(requestedName&&!selectPhonePatient(patients,text));
 if(!staff&&!unmatched)return null;
 return {decision:{action:'klaerfall',rule:staff?'quality:personal_team':'identity:unmatched_subject',
  text:t(staff?'animahost.quality.personal_team':'animahost.quality.unmatched_subject',language,{when:teamTime})},
  details:{patientId:null,firstName:null,lastName:null,invoiceDate:null,cause:staff?'personal_team':'identity_review',
   requestedName,concerns:messageConcerns(text),practiceSummary:practiceSummary(text)}};
}

/** Run both workflows; the invoice result must never swallow the appointment request. */
export async function combinedMessageWorkflow(db:Parameters<typeof qualityWorkflow>[0],
 input:Parameters<typeof qualityWorkflow>[1],rules:WhatsAppRule[]):Promise<Outcome|null>{
 const kind=appointmentConcern(input.text);
 if(!kind||!invoicePortalIntent(input.text))return null;
 const invoice=await qualityWorkflow(db,input);
 if(!invoice)return null;
 const matching=rules.filter(rule=>!rule.appointmentTypeId&&
  (kind==='reschedule'?/verschieb|verleg|umbuch|reschedul/i:/absag|stornier|cancel/i).test(rule.topic));
 const rule=matching.length===1?matching[0]:null;
 const authored=rule?decisionFromRule(rule,input.doctolib):null;
 const appointment=authored&&authored.rule!=='no_applicable_rule'?authored:
  appointmentNoticeDecision({kind,appointmentDate:null,delayMinutes:null},input.receivedAt,input.language==='en'?'en':'de',null,input.doctolib)!;
 // Keep all requested dates/times in the practice case; never claim a booking changed.
 return {decision:{action:'klaerfall',rule:'quality:multiple_concerns',text:[appointment.text,invoice.decision.text,
  t('animahost.quality.multiple_team',input.language,{when:input.teamTime})].join('\n\n')},
  details:{patientId:input.patient?.id??null,firstName:input.patient?.vorname??null,lastName:input.patient?.nachname??null,
   invoiceDate:invoice.details?.invoiceDate??null,cause:invoice.details?.cause??'multiple_concerns',
   requestedName:namedSubject(input.text),concerns:messageConcerns(input.text),practiceSummary:practiceSummary(input.text)}};
}
