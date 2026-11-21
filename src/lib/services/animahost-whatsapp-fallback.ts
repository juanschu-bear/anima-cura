import { t } from '@/lib/i18n';
import { appointmentLocalDate } from './animahost-appointment-notices';
import { closurePeriodsSchema } from './animahost-practice-closures';
import { decisionFromRule, isAppointmentLinkRule, renderWhatsAppRuleText, type WhatsAppDecision, type WhatsAppRule } from './animahost-whatsapp';

export const fallbackTopics = [
  'attachment', 'appliance', 'appointment', 'callback', 'billing', 'access', 'certificate', 'medical', 'practice', 'other',
] as const;
export type FallbackTopic = (typeof fallbackTopics)[number];
type Language = 'de' | 'en';

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
  topic: FallbackTopic; appointment: boolean; language: Language; day: string | null; doctolibUrl: string | null;
}): WhatsAppDecision {
  const { topic, appointment, language, day, doctolibUrl } = options;
  const link = appointment ? renderWhatsAppRuleText('{doctolib_link}', doctolibUrl) : null;
  const text = [
    t(`animahost.whatsapp.fallback.${topic}`, language),
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
  // Keep the original rule identifier for stateful operations and practice notices.
  if (primary) {
    const extras = additional.filter(item => item.rule !== primary.rule);
    const stronger = extras.find(item => item.action === 'notfall');
    const action = primary.action === 'notfall' || stronger ? 'notfall'
      : primary.action === 'klaerfall' || extras.some(item => item.action === 'klaerfall') ? 'klaerfall' : 'antworten';
    const urgentFirst = primary.action === 'notfall' ? [primary, ...extras]
      : [...extras.filter(item => item.action === 'notfall'), primary, ...extras.filter(item => item.action !== 'notfall')];
    return { ...primary, action, text: Array.from(new Set(urgentFirst.map(item => item.text))).join('\n\n') };
  }
  const ordered = ['notfall', 'klaerfall', 'antworten'].flatMap(action => additional.filter(item => item.action === action));
  const first = ordered[0];
  return first ? {
    action: first.action,
    rule: ordered.map(item => item.rule).join('|'),
    text: Array.from(new Set(ordered.map(item => item.text))).join('\n\n'),
  } : null;
}
