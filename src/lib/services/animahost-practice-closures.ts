import { z } from 'zod';
import { t } from '@/lib/i18n';
import type { WhatsAppDecision } from './animahost-whatsapp';

export const closurePeriodsSchema = z.array(z.object({
  from: z.string().date(),
  through: z.string().date(),
  kind: z.enum(['closure', 'holiday']),
}).strict().refine(period => period.from <= period.through)).max(100);

export function closureDecision(periods: unknown, date: string, language: 'de' | 'en'): WhatsAppDecision | null {
  const parsed = closurePeriodsSchema.safeParse(periods);
  if (!parsed.success) return null;
  const period = parsed.data.find(entry => entry.from <= date && date <= entry.through);
  if (!period) return null;
  const display = (value: string) => new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
  return {
    action: 'antworten', rule: `practice_closure:${period.kind}`,
    text: t(period.from === period.through ? 'animahost.whatsapp.closure.day' : 'animahost.whatsapp.closure.range',
      language, { from: display(period.from), through: display(period.through) }),
  };
}
