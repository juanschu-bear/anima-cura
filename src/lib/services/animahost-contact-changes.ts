import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { t } from '@/lib/i18n';
import type { createServerClient } from '@/lib/db/supabase';
import { buildPatientPortalTarget } from '@/lib/patient-navigation';
import { normalizeContactPhone, patientHasContactPhone } from './animahost-contact-notices';
import { sendEmail } from './email-send';
import type { WhatsAppDecision } from './animahost-whatsapp';

const text = z.string().trim().min(1).max(160).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const email = z.string().trim().email().max(254).transform(value => value.toLowerCase())
  .refine(value => !/@animacura\.de$/.test(value));
const postcode = z.string().trim().min(3).max(12).regex(/^[A-Z0-9 -]+$/i);
const address = z.object({ street: text, postalCode: postcode, city: text }).strict();
const phone = z.string().trim().max(40).regex(/^[+\d() .-]+$/).transform(value => normalizeContactPhone(value)).refine(Boolean);
export const chatContactChangeIntent = z.object({
  address: address.nullable(), email: z.string().nullable(), phone: z.string().nullable(),
}).strict();
export const chatRecipientChangeIntent = z.object({
  scope: z.enum(['new_person', 'existing_person']),
  name: text.nullable(), address: address.nullable(), email: z.string().nullable(),
}).strict();
const chatContactChangeSchema = chatContactChangeIntent.extend({ email: email.nullable(), phone: phone.nullable() });
const chatRecipientChangeSchema = chatRecipientChangeIntent.extend({ email: email.nullable() });

type Db = ReturnType<typeof createServerClient>;
type Input = { tenantId: string; messageId: string; from: string; text: string | null; identity?: { patientId: string; phone: string } };
const confirmationPage = 'https://animacura.io/patient/invoice-recipient/continue';
export const recipientConfirmationHash = (token: string) => createHash('sha256').update(token).digest('hex');

function explicitlyMentioned(message: string | null, values: (string | null | undefined)[]) {
  const normalized = (value: string) => value.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim();
  const source = normalized(message ?? '');
  return values.every(value => !value || source.includes(normalized(value)));
}

async function verifiedPatient(db: Db, input: Input) {
  if (!input.identity || input.tenantId !== process.env.ANIMAHOST_TENANT_ID) return null;
  const { patientId, phone } = input.identity;
  const { data } = await db.from('patients').select('id,vorname,nachname,telefon,mobiltelefon,versicherter_telefon,eb2_telefon')
    .eq('id', patientId).maybeSingle();
  return data && patientHasContactPhone(data, phone) ? data : null;
}

export async function changeChatPatientContact(db: Db, input: Input, raw: unknown, language: 'de' | 'en'): Promise<WhatsAppDecision | null> {
  const change = chatContactChangeSchema.safeParse(raw);
  const patient = await verifiedPatient(db, input);
  if (!patient || !change.success) return null;
  const { address, email, phone } = change.data;
  if (!explicitlyMentioned(input.text, [email, address?.street, address?.postalCode, address?.city])) return null;
  if (phone && !(input.text?.match(/[+\d][\d(). -]{6,36}/g) ?? []).some(candidate => normalizeContactPhone(candidate) === phone)) return null;
  if (email && process.env.ANIMAHOST_CONTACT_CONFIRM_PAGE_READY !== 'true') return null;
  const patch = {
    ...(address ? { strasse: address.street, plz: address.postalCode, ort: address.city } : {}),
    ...(email ? { email } : {}), ...(phone ? { telefon: `+${phone}` } : {}),
  };
  if (!Object.keys(patch).length) return null;
  const result = await db.rpc('animahost_contact_change', { p_tenant: input.tenantId, p_message: input.messageId,
    p_patient: patient.id, p_patch: patch, p_request: null, p_user: null });
  if (result.error || !result.data?.id) return null;
  if (result.data.state === 'applied') return {
    action: 'antworten', text: t('animahost.whatsapp.contact.saved', language), rule: 'contact_change_applied',
  };
  const url = `https://animacura.io${buildPatientPortalTarget({ contactChange: result.data.id })}`;
  return { action: 'antworten', text: t('animahost.whatsapp.contact.confirm', language, { url }), rule: 'contact_change_pending' };
}

export async function changeChatInvoiceRecipient(db: Db, input: Input, raw: unknown, language: 'de' | 'en'): Promise<WhatsAppDecision | null> {
  const change = chatRecipientChangeSchema.safeParse(raw);
  const patient = await verifiedPatient(db, input);
  if (!patient || !change.success) return null;
  const { scope, name, address, email } = change.data;
  const newPerson = scope === 'new_person';
  if (newPerson && (!name || !address || !email)) return {
    action: 'antworten', text: t('animahost.whatsapp.recipient.details', language), rule: 'invoice_recipient_details_requested',
  };
  if (newPerson && process.env.ANIMAHOST_RECIPIENT_CONFIRM_PAGE_READY !== 'true') return null;
  if (!newPerson && (name || (!address && !email))) return null;
  if (!explicitlyMentioned(input.text, [name, email, address?.street, address?.postalCode, address?.city])) return null;
  const patch = { ...(name ? { name } : {}), ...(address ?? {}), ...(email ? { email } : {}) };
  const token = newPerson ? randomBytes(32).toString('base64url') : null;
  const result = await db.rpc('animahost_invoice_recipient_change', { p_tenant: input.tenantId,
    p_message: input.messageId, p_patient: patient.id, p_patch: patch, p_new: newPerson,
    p_hash: token ? recipientConfirmationHash(token) : null, p_chat: input.from, p_language: language });
  if (result.error || !result.data?.id) return null;
  if (result.data.state === 'active') return {
    action: 'antworten', text: t('animahost.whatsapp.recipient.saved', language), rule: 'invoice_recipient_applied',
  };
  // Only the request that created the pending recipient has the token. A replay
  // can read the status but cannot send a new confirmation for the same message.
  if (!token || !email || result.data.state !== 'pending' || !result.data.created) return null;
  const url = `${confirmationPage}#code=${encodeURIComponent(token)}`;
  const accepted = await sendEmail({ to: email, subject: t('animahost.whatsapp.recipient.mailSubject', language),
    body: `<p>${t('animahost.whatsapp.recipient.mailBody', language)}</p><p><a href="${url}">${t('animahost.whatsapp.recipient.mailAction', language)}</a></p>`,
    track: false, idempotencyKey: `invoice-recipient-${result.data.id}` });
  return accepted.ok ? { action: 'antworten', text: t('animahost.whatsapp.recipient.pending', language), rule: 'invoice_recipient_confirmation_sent' } : null;
}
