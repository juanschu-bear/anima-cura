import { z } from 'zod';
import { t } from '@/lib/i18n';
import { decisionFromRule, type WhatsAppDecision, type WhatsAppRule } from './animahost-whatsapp';

export const appointmentNoticeSchema = z.object({
  kind: z.enum(['cancel', 'reschedule', 'missed', 'late']),
  appointmentDate: z.string().date().nullable(),
  delayMinutes: z.number().int().min(1).max(1440).nullable(),
});

export const appointmentLocalDate = (receivedAt: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(receivedAt));

export function appointmentNoticeDecision(
  notice: z.infer<typeof appointmentNoticeSchema>,
  receivedAt: string,
  language: 'de' | 'en',
  rule: WhatsAppRule | null,
  doctolibUrl: string | null,
): WhatsAppDecision | null {
  if (notice.kind === 'late' && (notice.delayMinutes ?? 0) <= 15) return null;

  const sameDay = notice.appointmentDate === appointmentLocalDate(receivedAt);
  const urgent = sameDay && (notice.kind === 'cancel' || notice.kind === 'late');
  const reply = rule && !rule.appointmentTypeId ? decisionFromRule(rule, doctolibUrl) : null;
  return {
    action: 'antworten',
    text: reply?.action === 'antworten' ? reply.text : t(`animahost.whatsapp.notice.${notice.kind}`, language),
    rule: `appointment_notice:${notice.kind}:${urgent ? 'urgent' : 'routine'}`,
  };
}

export function appointmentNoticeFromDecision(decision: WhatsAppDecision) {
  const match = /^appointment_notice:(cancel|reschedule|missed|late):(urgent|routine)$/.exec(decision.rule);
  if (decision.action !== 'antworten' || !match) return null;
  return { kind: match[1], urgent: match[2] === 'urgent' };
}
