import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createServerClient } from '@/lib/db/supabase';
import { dueAppointmentCases } from '@/lib/services/animahost-appointment-cases';
import { t } from '@/lib/i18n';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim'), tenantId: z.string().uuid(), kind: z.literal('appointment').optional() }).strict(),
  z.object({action:z.literal('tick'),kind:z.literal('appointment'),tenantId:z.string().uuid()}).strict(),
  z.object({ action: z.literal('finish'), tenantId: z.string().uuid(), id: z.string().uuid(),
    state: z.enum(['sent', 'skipped', 'uncertain','retry']), kind: z.literal('appointment').optional(),
    providerMessageId: z.string().min(1).max(200).optional() }).strict(),
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
  if(input.kind==='appointment'){
    const table='animahost_appointment_cases';
    const now=new Date();
    if(input.action==='finish'){
      if(input.state==='sent'&&!input.providerMessageId)return response({code:'invalid_request'},400);
      const patch=input.state==='retry'?{delivery_state:'queued',claimed_at:null}:
        {delivery_state:input.state,finished_at:now.toISOString(),provider_message_id:input.providerMessageId??null};
      const finished=await db.from(table).update(patch).eq('tenant_id',input.tenantId).eq('id',input.id)
        .eq('delivery_state','sending');
      return finished.error?response({code:'appointment_delivery_unavailable'},503):response({ok:true});
    }
    if(process.env.ANIMAHOST_ACCEPTANCE_PASSED!=='true')return response({job:null});
    const settings=await db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',input.tenantId).maybeSingle();
    if(settings.error)return response({code:'appointment_delivery_unavailable'},503);
    if(!settings.data?.appointment_tolerance)return response({job:null});
    try{
      await dueAppointmentCases(db,input.tenantId,settings.data.practice_phone,now);
      if(input.action==='tick')return response({ok:true});
      const next=await db.from(table).select('id').eq('tenant_id',input.tenantId)
        .eq('delivery_state','queued').order('decided_at').limit(1).maybeSingle();
      if(next.error)throw Error('appointment_delivery_unavailable');
      if(!next.data)return response({job:null});
      const claimed=await db.from(table).update({delivery_state:'sending',claimed_at:now.toISOString()})
        .eq('id',next.data.id).eq('tenant_id',input.tenantId).eq('delivery_state','queued')
        .select('id,chat_jid,patient_reply').maybeSingle();
      if(claimed.error)throw Error('appointment_delivery_unavailable');
      return response({job:claimed.data?{id:claimed.data.id,chatJid:claimed.data.chat_jid,text:claimed.data.patient_reply}:null});
    }catch{return response({code:'appointment_delivery_unavailable'},503);}
  }
  if (input.action === 'claim') {
    if (process.env.ANIMAHOST_ACCEPTANCE_PASSED !== 'true') return response({ job: null });
    const result = await db.rpc('animahost_claim_recipient_followup', { p_tenant: input.tenantId });
    if (result.error?.code === 'PGRST202') return response({ job: null });
    if (result.error) return response({ code: 'followup_unavailable' }, 503);
    const job = result.data;
    return response({ job: job ? { id: job.id, chatJid: job.chatJid, patientId: job.patientId,
      text: t('animahost.whatsapp.recipient.saved', job.language) } : null });
  }
  if(input.state==='retry')return response({code:'invalid_request'},400);
  const result = await db.from('animahost_recipient_followups').update({ state: input.state, finished_at: new Date().toISOString() })
    .eq('id', input.id).eq('tenant_id', input.tenantId).eq('state', 'sending');
  return result.error ? response({ code: 'followup_unavailable' }, 503) : response({ ok: true });
}
