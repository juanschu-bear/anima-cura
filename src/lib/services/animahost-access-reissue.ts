import { z } from 'zod';
import { t } from '@/lib/i18n';
import type { createServerClient } from '@/lib/db/supabase';
import { patientHasContactPhone } from './animahost-contact-notices';
import { requestPatientSelfActivation } from './patient-self-activation';
import { requestPatientPasswordRecovery } from './patient-password-recovery';
import { sendPatientAccessCode } from './patient-access-code-delivery';
import { requestInvoiceAccess } from './invoice-contact-access';
import type { WhatsAppDecision } from './animahost-whatsapp';

export const accessReissuePurpose = z.enum(['activation', 'recovery', 'invoice']);
export const verifiedChatIdentitySchema = z.object({
  patientId: z.string().uuid(),
  phone: z.string().regex(/^\d{8,15}$/),
}).strict();

type Db = ReturnType<typeof createServerClient>;
type Input = { tenantId: string; messageId: string; identity?: z.infer<typeof verifiedChatIdentitySchema> };

export async function reissueChatAccess(
  db: Db, input: Input, purpose: z.infer<typeof accessReissuePurpose>, language: 'de' | 'en',
): Promise<WhatsAppDecision | null> {
  if (!input.identity || input.tenantId !== process.env.ANIMAHOST_TENANT_ID) return null;
  const { patientId, phone } = input.identity;
  const patientRow = await db.from('patients')
    .select('id,vorname,nachname,email,ivoris_nummer,geburtsdatum,telefon,mobiltelefon,versicherter_telefon,eb2_telefon')
    .eq('id', patientId).maybeSingle();
  if (patientRow.error) throw Error('chat_access_patient_unavailable');
  const patient = patientRow.data;
  const email = z.string().trim().email().max(254).safeParse(patient?.email);
  if (!patient || !patientHasContactPhone(patient, phone) || !email.success || /@animacura\.de$/i.test(email.data)) return null;

  const key = { tenant_id: input.tenantId, message_id: input.messageId, patient_id: patientId, purpose };
  const sent = (): WhatsAppDecision => ({ action: 'antworten', text: t('animahost.whatsapp.accessReissued', language), rule: `access_reissued:${purpose}` });
  const reserve = await db.from('animahost_whatsapp_access_reissues').insert(key);
  if (reserve.error?.code === '23505') {
    const prior = await db.from('animahost_whatsapp_access_reissues').select('status,patient_id,purpose')
      .eq('tenant_id', key.tenant_id).eq('message_id', key.message_id).maybeSingle();
    return prior.data?.status === 'accepted' && prior.data.patient_id === patientId && prior.data.purpose === purpose ? sent() : null;
  }
  if (reserve.error) throw Error('chat_access_reservation_failed');

  let accepted = false;
  try {
    const ip = `animahost:${patientId}`;
    if (purpose === 'invoice') {
      const result = await requestInvoiceAccess({ email: email.data, language, ip, deliver: true });
      accepted = 'mailAccepted' in result && result.mailAccepted === true;
    } else if (purpose === 'activation' && patient.ivoris_nummer && patient.geburtsdatum) {
      await requestPatientSelfActivation({ patientNumber: patient.ivoris_nummer, birthDate: patient.geburtsdatum, contactEmail: email.data, ip }, {
        db,
        sendCode: async (to, code, requestId, resolvedPatientId) => {
          if (resolvedPatientId !== patientId || to.toLowerCase() !== email.data.toLowerCase()) throw Error('chat_access_contact_conflict');
          await sendPatientAccessCode({ purpose, patientId, to, code, requestId });
          accepted = true;
        },
      });
    } else if (purpose === 'recovery') {
      await requestPatientPasswordRecovery({ portalEmail: email.data, patientId, ip }, {
        sendCode: async (to, code, requestId, resolvedPatientId, loginEmail) => {
          if (resolvedPatientId !== patientId || to.toLowerCase() !== email.data.toLowerCase()) throw Error('chat_access_contact_conflict');
          await sendPatientAccessCode({ purpose, patientId, to, code, requestId, loginEmail });
          accepted = true;
        },
      });
    }
  } catch {
    // Transport timeouts can happen after acceptance. Do not retry the same inbound message.
  }
  const result = await db.from('animahost_whatsapp_access_reissues').update({ status: accepted ? 'accepted' : 'unconfirmed' })
    .eq('tenant_id', key.tenant_id).eq('message_id', key.message_id).eq('status', 'sending');
  if (result.error) throw Error('chat_access_store_failed');
  return accepted ? sent() : null;
}
