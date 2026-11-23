import { t } from '@/lib/i18n';
import { appointmentLocalDate } from './animahost-appointment-notices';
import { closurePeriodsSchema } from './animahost-practice-closures';
import { applicableMessageRules, decisionFromRule, isAppointmentLinkRule, renderWhatsAppRuleText, type WhatsAppDecision, type WhatsAppRule } from './animahost-whatsapp';

export const fallbackTopics = [
  'attachment', 'appliance', 'appointment', 'callback', 'billing', 'access', 'certificate', 'medical', 'practice', 'other',
] as const;
export type FallbackTopic = (typeof fallbackTopics)[number];
type Language = 'de' | 'en' | 'es';

const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function nextPracticeDay(receivedAt: string, hoursRule: string | undefined, closures: unknown, language: Language): string | null {
  // Use the regular-hours part of the current rule. Appointment-only days are not regular hours.
  const schedule = /regulären Sprechzeiten sind (.+?) von \d/i.exec(hoursRule ?? '')?.[1];
  const periods = closurePeriodsSchema.safeParse(closures);
  if (!schedule || !periods.success) return null;
  const open = new Set<number>();
  for (const day of weekdays) if (schedule.includes(day)) open.add(weekdays.indexOf(day));
  const range = /([A-Za-z]+) bis ([A-Za-z]+)/.exec(schedule);
  if (range) {
    const first = weekdays.indexOf(range[1]);
    const last = weekdays.indexOf(range[2]);
    if (first < 0 || last < 0) return null;
    for (let day = first; day !== last; day = (day + 1) % 7) open.add(day);
  }
  const day = new Date(`${appointmentLocalDate(receivedAt)}T00:00:00Z`);
  for (let count = 0; count < 120; count++) {
    day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    if (open.has(day.getUTCDay()) && !periods.data.some(period => period.from <= date && date <= period.through)) {
      return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
      }).format(day);
    }
  }
  return null;
}

export function fallbackHints(message: string | null): { topic: FallbackTopic; appointment: boolean } {
  const text = message ?? '';
  const appointment = /termin|vorbeikommen|appointment|book a visit|pedir cita|una cita/i.test(text);
  const topic = /attachment|knöpfchen|bracket/i.test(text) ? 'attachment'
    : /spange|schiene|retainer|aligner/i.test(text) ? 'appliance'
    : /rechnung|zahlung|invoice|reimbursement|versicherer.{0,60}rückzahl/i.test(text) ? 'billing'
    : /per telefon|zurückruf|call me/i.test(text) ? 'callback'
    : appointment ? 'appointment' : 'other';
  return { topic, appointment };
}

export function fallbackDecision(options: {
  topic: FallbackTopic; appointment: boolean; language: Language; day?: string | null; teamTime?: string; safetyAck?: boolean; doctolibUrl: string | null;
}): WhatsAppDecision {
  const { topic, appointment, language, day, teamTime, safetyAck, doctolibUrl } = options;
  if(safetyAck)return {action:'klaerfall',rule:`fallback:${topic}`,text:t('animahost.whatsapp.safety_ack',language,
    {when:teamTime??t('animahost.team.next',language)})};
  const link = appointment ? renderWhatsAppRuleText('{doctolib_link}', doctolibUrl) : null;
  const text = [
    t(`animahost.whatsapp.fallback.${topic}`, language),
    teamTime?t('animahost.team.reply',language,{when:teamTime}):
      t(day ? 'animahost.whatsapp.fallback.date' : 'animahost.whatsapp.fallback.next', language, { day: day ?? '' }),
    link ? t('animahost.whatsapp.fallback.link', language, { link }) : null,
  ].filter(Boolean).join(' ');
  return { action: 'klaerfall', rule: `fallback:${topic}`, text };
}

export function withRuleReplies(
  primary: WhatsAppDecision | null, ruleIds: string[], rules: WhatsAppRule[], doctolibUrl: string | null,
): WhatsAppDecision | null {
  const additional = Array.from(new Set(ruleIds)).flatMap(id => {
    const rule = rules.find(item => item.id === id);
    if (!rule || isAppointmentLinkRule(rule)) return [];
    const decision = decisionFromRule(rule, doctolibUrl);
    return decision.rule === id ? [decision] : [];
  });
  if(primary?.action==='notfall')return primary;
  const emergency=additional.find(item=>item.action==='notfall');
  if(emergency)return emergency;
  // Keep the original rule identifier for stateful operations and practice notices.
  if (primary) {
    const extras = additional.filter(item => item.rule !== primary.rule);
    const action = primary.action === 'klaerfall' || extras.some(item => item.action === 'klaerfall') ? 'klaerfall' : 'antworten';
    const ordered = primary.rule.startsWith('fallback:') ? [...extras,primary] : [primary,...extras];
    return { ...primary, action, text: Array.from(new Set(ordered.map(item => item.text))).join('\n\n') };
  }
  const ordered = additional;
  const first = ordered[0];
  return first ? {
    action: ordered.some(item=>item.action==='klaerfall')?'klaerfall':'antworten',
    rule: ordered.map(item => item.rule).join('|'),
    text: Array.from(new Set(ordered.map(item => item.text))).join('\n\n'),
  } : null;
}

export function completeRuleReply(primary: WhatsAppDecision | null, fallback: WhatsAppDecision | null,
 ruleIds: string[], rules: WhatsAppRule[], doctolibUrl: string | null): WhatsAppDecision | null {
 const answered = withRuleReplies(primary,ruleIds,rules,doctolibUrl);
 if(!answered)return fallback;
 if(!fallback||answered.action==='notfall'||answered.rule===fallback.rule)return answered;
 return {...answered,action:'klaerfall',text:[answered.text,fallback.text].join('\n\n')};
}

/** For a gateway failure, only use unambiguous, literally present rulebook cues. */
export function matchApprovedRuleFallback(message:string,rules:WhatsAppRule[]):string[]{
 const separators=new RegExp('[^\\p{L}\\p{N}]+','gu');
 const normalize=(value:string)=>' '+value.toLocaleLowerCase('de-DE').normalize('NFKC')
  .replace(separators,' ').trim()+' ';
 const clauses=message.split(/[?;]\s*|\bund\b|\band\b/i).map(normalize).filter(value=>value.trim().length>=5);
 const eligible=applicableMessageRules(message,rules).filter(rule=>rule.action==='antworten'&&!rule.appointmentTypeId);
 const matchesByPhrase=new Map<string,Set<string>>();
 for(const rule of eligible)for(const keyword of rule.keywords){
  const phrase=normalize(keyword);
  if(phrase.trim().length<5||/^(?: rechnung | termin | hilfe | bitte | praxis | zahlung )$/.test(phrase))continue;
  if(!matchesByPhrase.has(phrase))matchesByPhrase.set(phrase,new Set());
  matchesByPhrase.get(phrase)!.add(rule.id);
 }
 const matches=clauses.flatMap(clause=>{
  const best=new Map<string,number>();
  for(const [phrase,ids] of Array.from(matchesByPhrase)){
   if(ids.size!==1||!clause.includes(phrase))continue;
   const id=ids.values().next().value!;
   best.set(id,Math.max(best.get(id)??0,phrase.trim().length));
  }
  const ranked=Array.from(best).sort((a,b)=>b[1]-a[1]);
  return ranked[0]&&(!ranked[1]||ranked[0][1]>=ranked[1][1]+5)?[ranked[0][0]]:[];
 });
 return Array.from(new Set(matches));
}
