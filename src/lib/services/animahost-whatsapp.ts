import {z} from 'zod';
import {t} from '@/lib/i18n';

export const whatsappRuleSchema=z.object({
 id:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
 topic:z.string().trim().min(1).max(180),
 keywords:z.array(z.string().trim().min(2).max(80)).min(1).max(30),
 action:z.enum(['antworten','klaerfall','notfall']),
 patientText:z.string().trim().min(1).max(1500),
 appointmentTypeId:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).optional(),
 appointmentDescription:z.string().trim().min(12).max(500).optional(),
}).strict().refine(rule=>Boolean(rule.appointmentTypeId)===Boolean(rule.appointmentDescription),
 'appointment_type_incomplete').refine(rule=>!rule.appointmentTypeId||rule.action==='antworten',
 'appointment_type_must_answer');
export const whatsappRulesSchema=z.array(whatsappRuleSchema).max(100).refine(
 rules=>new Set(rules.map(rule=>rule.id)).size===rules.length,'duplicate_rule_id').refine(
 rules=>{const ids=rules.flatMap(rule=>rule.appointmentTypeId?[rule.appointmentTypeId]:[]);
  return new Set(ids).size===ids.length;},'duplicate_appointment_type');
export type WhatsAppRule=z.infer<typeof whatsappRuleSchema>;
export type WhatsAppDecision={action:'antworten'|'klaerfall'|'notfall';text:string;rule:string};

export function emergencyDecision(message:string):WhatsAppDecision|null{
 if(/\b(atemnot|keine luft|schlecht luft|erstick|bewusstlos|starke blutung|starken blutungen)\b/i.test(message))
  return {action:'notfall',text:t('animahost.whatsapp.emergency','de'),rule:'emergency_112'};
 if(/\b(verschluckt|sticht|angeschwollen|schwellung|unfall|verletz|blutet|blutung)\b/i.test(message))
  return {action:'notfall',text:t('animahost.whatsapp.urgent','de'),rule:'emergency_practice'};
 return null;
}

export function safeRuleText(rule:WhatsAppRule):boolean{
 if(rule.action!=='antworten')return true;
 return !/(?:termin|appointment).{0,35}(?:bestätigt|gebucht|verschoben|storniert|confirmed|booked|cancelled)|\b\d+\s*(?:mg|tabletten?)\b/i.test(rule.patientText);
}

export function candidateRules(message:string,rules:WhatsAppRule[]):WhatsAppRule[]{
 const normalized=message.toLocaleLowerCase('de-DE');
 return rules.filter(rule=>rule.keywords.some(word=>normalized.includes(word.toLocaleLowerCase('de-DE'))));
}

export function mandatoryAppointmentClarification(message:string):boolean{
 return /(?:spange|schiene|apparatur).{0,60}(?:anfertig|herstell|einsetz|einglieder|abhol)|(?:anfertig|herstell|einsetz|einglieder|abhol).{0,60}(?:spange|schiene|apparatur)|behandlungsbeginn|behandlung.{0,25}(?:beginn|start)|(?:praxis|rezeption).{0,100}(?:gesagt|besprochen|vereinbart|abgesprochen|ausgemacht)|(?:gesagt|besprochen|vereinbart|abgesprochen|ausgemacht).{0,100}(?:praxis|rezeption)/i.test(message);
}

export function explicitOptOut(message:string):boolean{
 const text=message.trim().toLocaleLowerCase('de-DE');
 return /^(?:bitte\s+)?(?:stopp|stop|unsubscribe)[.!\s]*$/.test(text)||
  /(?:keine|nicht mehr|nie wieder).{0,40}(?:nachrichten|whatsapp|schreiben|kontaktieren)/.test(text)||
  /(?:schreiben|kontaktieren|nachrichten).{0,40}(?:nicht mehr|nie wieder)/.test(text)||
  /(?:don't|do not|no more).{0,30}(?:message|text|contact|whatsapp)/.test(text)||
  /(?:no me (?:escriban|manden mensajes)|no quiero (?:más )?mensajes)/.test(text);
}

export function isAppointmentLinkRule(rule:WhatsAppRule):boolean{
 return Boolean(rule.appointmentTypeId)||/doctolib/i.test(rule.patientText);
}

export function decisionFromRule(rule:WhatsAppRule|null):WhatsAppDecision{
 if(!rule||!safeRuleText(rule))return {action:'klaerfall',text:t('animahost.whatsapp.clarify','de'),rule:'no_applicable_rule'};
 return {action:rule.action,text:rule.patientText,rule:rule.id};
}
