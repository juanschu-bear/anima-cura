import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createServerClient } from '@/lib/db/supabase';
import { t } from '@/lib/i18n';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim'), tenantId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('finish'), tenantId: z.string().uuid(), id: z.string().uuid(),
    state: z.enum(['sent', 'skipped', 'uncertain']) }).strict(),
]);
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const secret = Buffer.from(process.env.ANIMAHOST_LINE_SECRET ?? '');
  const token = Buffer.from(/^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '');
  if (!secret.length || secret.length !== token.length || !timingSafeEqual(secret, token)) return response({ code: 'not_authorized' }, 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ code: 'invalid_request' }, 400);
  const input = parsed.data;
  if (input.tenantId !== process.env.ANIMAHOST_TENANT_ID) return response({ code: 'not_authorized' }, 403);
  const db = createServerClient();
  if (input.action === 'claim') {
    if (process.env.ANIMAHOST_ACCEPTANCE_PASSED !== 'true') return response({ job: null });
    const result = await db.rpc('animahost_claim_recipient_followup', { p_tenant: input.tenantId });
    if (result.error?.code === 'PGRST202') return response({ job: null });
    if (result.error) return response({ code: 'followup_unavailable' }, 503);
    const job = result.data;
    return response({ job: job ? { id: job.id, chatJid: job.chatJid, patientId: job.patientId,
      text: t('animahost.whatsapp.recipient.saved', job.language) } : null });
  }
  const result = await db.from('animahost_recipient_followups').update({ state: input.state, finished_at: new Date().toISOString() })
    .eq('id', input.id).eq('tenant_id', input.tenantId).eq('state', 'sending');
  return result.error ? response({ code: 'followup_unavailable' }, 503) : response({ ok: true });
}
