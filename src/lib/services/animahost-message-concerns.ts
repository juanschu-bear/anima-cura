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
const STAFF_NAME=/(?:Frau|Herrn?|Dr\.?)\s+[A-ZÄÖÜ][A-Za-zÀ-ÿ-]{1,}/g;
const WISH_WORDS=new Set(['ich','wir','mir','uns','mich','sie','ihnen','bitte','danke','gern','gerne','lieber','möchte','möchten','würde','würden','will','wollen','kann','können','könnte','könnten',
 'hoffe','hoffen','dass','das','mal','kurz','einfach','nur','doch','direkt','persönlich','hallo','guten','tag','morgen','abend','liebe','lieber','sehr','geehrte','geehrter','frau','herr','herrn',
 'mit','sprechen','reden','telefonieren','schreiben','schreibt','antwortet','antworten','antwort','melden','meldet','anrufen','anruft','zurückrufen','zurückruft','rückruf','ruft','rufen','soll','sollen',
 'jemand','jemandem','jemanden','mensch','menschen','echten','richtigen','mitarbeiter','mitarbeiterin','team','praxisteam','praxis','der','die','den','dem','ein','eine','einen','einem','einer','und','oder',
 'am','um','an','zurück','kein','keinen','keine','bot','roboter','computer','ist','es','geht','möglich','wäre','heute','montag','dienstag','mittwoch','donnerstag','freitag','samstag','sonntag','mfg','grüße','viele','vielen','dank']);
/**
 * Der Patient möchte ausdrücklich einen Menschen aus dem Team statt AnimaHost („ich möchte lieber mit Frau Muster sprechen“).
 * `only`: Die Nachricht enthält sonst kein Anliegen. `with_concern`: Sie nennt zusätzlich etwas Konkretes, das der normale Weg beantwortet.
 * Eine Anrede allein („Hallo Frau Muster, wann …“) ist kein solcher Wunsch (Juan, 22.11.2026: Dafür ist das System da).
 */
export function personRequest(text:string):'none'|'only'|'with_concern'{
 const lower=text.toLocaleLowerCase('de-DE');
 const staff=text.match(STAFF_NAME)??[];
 const wish=staff.length>0&&(/\bmit\s+(?:frau|herrn?|dr\.?)\s+\S+[^.!?]{0,40}(?:sprechen|reden|telefonieren|schreiben)/.test(lower)||
   /(?:frau|herrn?|dr\.?)\s+\S+[^.!?]{0,60}(?:antwort|\bmelde|anruf|zurückruf|rückruf|sprechen)/.test(lower))||
  /\bmit\s+(?:jemand(?:em|en)?|eine[mr]\s+(?:mensch(?:en)?|mitarbeiter(?:in)?)|(?:einem\s+)?(?:echten|richtigen)\s+menschen|dem\s+(?:praxis)?team|der\s+praxis)[^.!?]{0,40}(?:sprechen|reden|telefonieren)/.test(lower)||
  /\b(?:um\s+)?(?:einen\s+)?rückruf\b|\bruf(?:en|t)?\s+(?:sie\s+)?(?:mich|uns)\s+(?:bitte\s+)?(?:an|zurück)\b|\bcall me back\b|\b(?:speak|talk) (?:to|with) (?:a|some)(?:one| human| person)\b/.test(lower)||
  /\bkein(?:en|e)?\s+(?:bot|roboter|computer|automat\w*)\b|\b(?:echten|richtigen)\s+menschen\b/.test(lower);
 if(!wish)return 'none';
 const names=new Set(staff.flatMap(value=>value.toLocaleLowerCase('de-DE').split(/\s+/)));
 const rest=lower.replace(/[^a-zß-ÿ0-9]+/g,' ').split(' ').filter(word=>word.length>=3&&!WISH_WORDS.has(word)&&!names.has(word));
 return rest.length<=1?'only':'with_concern';
}
const teamHandoff=(text:string,language:string,teamTime:string,requestedName:string|null):Outcome=>({
 decision:{action:'klaerfall',rule:'quality:personal_team',text:t('animahost.quality.personal_team',language,{when:teamTime})},
 details:{patientId:null,firstName:null,lastName:null,invoiceDate:null,cause:'personal_team',requestedName,concerns:messageConcerns(text),practiceSummary:practiceSummary(text)}});
/**
 * Antwort auf den reinen Wunsch nach einer Person. AnimaHost bietet 2-mal an, sofort selbst zu helfen, und fragt nach dem Anliegen.
 * Erst beim 3. Wunsch geht der Fall ans Team. Sofort ans Team geht er, wenn schon ein Fall beim Team liegt (die Nachricht ist dann
 * eine Ergänzung dazu) oder wenn automatische Antworten ausgeschaltet sind.
 */
export function personRequestReply(input:{text:string;language:string;teamTime:string;automatic:boolean;lastAction:string|null;lastRule:string|null}):Outcome{
 const step=(Number(/^quality:prefers_person:([12])$/.exec(input.lastRule??'')?.[1])||0)+1;
 if(!input.automatic||input.lastAction==='klaerfall'||step>2)return teamHandoff(input.text,input.language,input.teamTime,null);
 return {decision:{action:'antworten',rule:`quality:prefers_person:${step}`,text:t(`animahost.quality.prefers_person_${step}`,input.language)}};
}
/** Ein ausdrücklich genannter Patient, der zu keiner Akte der Nummer passt, geht mit allen Anliegen ans Team. Eine Anrede ans Team löst nichts aus. */
export function practiceMessageHandoff(text:string,patients:PhonePatient[],language:string,teamTime:string):Outcome|null{
 const requestedName=namedSubject(text);
 if(!requestedName||selectPhonePatient(patients,text))return null;
 return {decision:{action:'klaerfall',rule:'identity:unmatched_subject',text:t('animahost.quality.unmatched_subject',language,{when:teamTime})},
  details:{patientId:null,firstName:null,lastName:null,invoiceDate:null,cause:'identity_review',
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
