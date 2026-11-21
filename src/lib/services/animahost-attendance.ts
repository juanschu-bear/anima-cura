import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFRef } from 'pdf-lib';
import type { createServerClient } from '@/lib/db/supabase';
import { BILLING_DOCUMENTS_BUCKET, billingDocumentPath } from '@/lib/billing-document-access';
import { buildPatientPortalTarget } from '@/lib/patient-navigation';
import { t } from '@/lib/i18n';
import { appointmentLocalDate } from './animahost-appointment-notices';
import { patientHasContactPhone } from './animahost-contact-notices';

type Db = ReturnType<typeof createServerClient>;
export type AttendanceEvidence = { source: 'tagesplan_termine' | 'doku_tagesdatensaetze' | 'treatment_events'; id: string; occurredAt: string };
type Identity = { patientId: string; phone: string };
type Language = 'de' | 'en';
const localTime = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const certificateDates = {
  de: new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }),
  en: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }),
};
const boldFontPath = join(process.cwd(), 'src/lib/services/schrift/NunitoSans_700Bold.ttf');
const regularFontPath = join(process.cwd(), 'src/lib/services/schrift/NunitoSans_400Regular.ttf');

export function attendanceArtworkVersion() {
  const version = process.env.ANIMAHOST_ATTENDANCE_ARTWORK_VERSION;
  return version && /^[\w-]{1,80}$/.test(version) ? version : null;
}

export function mayBeAttendanceRequest(text: string) {
  return /bescheinigung|\b(?:certificate|proof|confirmation|note)\b.{0,40}\b(?:attend\w*|visit\w*|appointment)\b|\b(?:attend\w*|visit\w*|appointment)\b.{0,40}\b(?:certificate|proof|confirmation|note)\b/i.test(text);
}

export function uniqueAttendanceTime(witnesses: AttendanceEvidence[], date: string, through: string) {
  const candidates = witnesses.filter(w => Number.isFinite(Date.parse(w.occurredAt)) &&
    Date.parse(w.occurredAt) <= Date.parse(through) && appointmentLocalDate(w.occurredAt) === date);
  const times = new Set(candidates.map(w => localTime.format(new Date(w.occurredAt))));
  return times.size === 1 ? { time: Array.from(times)[0], evidence: candidates[0] } : null;
}

async function attendanceProof(db: Db, patientId: string, date: string, receivedAt: string) {
  const [agenda, day, events] = await Promise.all([
    db.from('tagesplan_termine').select('id,eingecheckt_um').eq('patient_id', patientId).eq('datum', date)
      .in('status', ['eingecheckt', 'in_behandlung', 'fertig']).not('eingecheckt_um', 'is', null).limit(21),
    db.from('doku_tagesdatensaetze').select('id').eq('patient_id', patientId).eq('service_date', date).maybeSingle(),
    db.from('treatment_events').select('id,revision,source').eq('patient_id', patientId).eq('service_date', date)
      .eq('clinical_state', 'performed').eq('copied', false).not('confirmed_at', 'is', null).limit(101),
  ]);
  if (agenda.error || day.error || events.error || agenda.data.length > 20 || events.data.length > 100) return null;
  const arrival = agenda.data.map(row => ({ source: 'tagesplan_termine' as const, id: row.id, occurredAt: row.eingecheckt_um }));
  if (arrival.length) return uniqueAttendanceTime(arrival, date, receivedAt);
  if (day.data) {
    // Bootstrap and copies use a documentation timestamp. Only a newly recorded,
    // confirmed original carries the explicitly recorded visit time.
    const parts = await db.from('doku_tagesdatensatz_teile').select('id,occurred_at')
      .eq('tagesdatensatz_id', day.data.id).eq('state', 'bestaetigt').eq('kind', 'original')
      .is('source_entry_id', null).limit(21);
    if (parts.error || parts.data.length > 20) return null;
    if (parts.data.length) return uniqueAttendanceTime(parts.data.map(row => ({
      source: 'doku_tagesdatensaetze', id: row.id, occurredAt: row.occurred_at,
    })), date, receivedAt);
  }
  // A clinical event can support the day. Its record creation or confirmation
  // time does not prove when the patient was present.
  const explicit = events.data.flatMap(row => typeof row.source?.occurredAt === 'string' ? [{
    source: 'treatment_events' as const, id: row.id, occurredAt: row.source.occurredAt,
  }] : []);
  return uniqueAttendanceTime(explicit, date, receivedAt);
}

type PdfFields = { patientName: string; serviceDate: string; serviceTime: string; issuedDate: string; verificationCode: string; verificationUrl: string };

export async function renderAttendanceCertificate(
  template: Uint8Array, stamp: Uint8Array, signature: Uint8Array, fields: PdfFields, language: Language,
) {
  const pdf = await PDFDocument.load(template);
  pdf.registerFontkit(fontkit);
  const [boldBytes, regularBytes] = await Promise.all([readFile(boldFontPath), readFile(regularFontPath)]);
  const bold = await pdf.embedFont(boldBytes, { subset: false });
  const regular = await pdf.embedFont(regularBytes, { subset: false });
  const form = pdf.getForm();
  const formatDate = (date: string) => certificateDates[language].format(new Date(`${date}T00:00:00Z`));
  const values = { ...fields, serviceDate: formatDate(fields.serviceDate), issuedDate: formatDate(fields.issuedDate) };
  for (const [name, value] of Object.entries(values)) form.getTextField(name).setText(value);

  const nameField = form.getTextField('patientName');
  const width = nameField.acroField.getWidgets()[0].getRectangle().width - 4;
  let size = 13.5;
  while (size > 9 && bold.widthOfTextAtSize(fields.patientName, size) > width) size -= 0.5;
  nameField.setFontSize(size);
  form.getTextField('verificationUrl').updateAppearances(regular);
  form.getTextField('issuedDate').updateAppearances(regular);
  form.updateFieldAppearances(bold);
  form.getButton('practiceStamp').setImage(await pdf.embedPng(stamp));
  form.getButton('practiceSignature').setImage(await pdf.embedPng(signature));
  form.flatten({ updateFieldAppearances: false });
  // pdf-lib can delete a field widget but leave its reference in the page annotations.
  for (const page of pdf.getPages()) {
    const annotations = page.node.Annots();
    if (!annotations) continue;
    for (let index = annotations.size() - 1; index >= 0; index--) {
      const annotation = annotations.get(index);
      if (annotation instanceof PDFRef && !pdf.context.lookup(annotation)) annotations.remove(index);
    }
  }
  return pdf.save({ useObjectStreams: false });
}

function nameKey(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('de-DE').trim().replace(/[\s,]+/g, ' ');
}

export async function issueAttendanceFromChat(db: Db, input: {
  identity?: Identity; tenantId: string; messageId: string; receivedAt: string;
  date: string; patientName: string; language: Language;
}): Promise<string | null> {
  const artworkVersion = attendanceArtworkVersion();
  if (!artworkVersion || !input.identity || input.tenantId !== process.env.ANIMAHOST_TENANT_ID || input.date > appointmentLocalDate(input.receivedAt)) return null;
  const { patientId, phone } = input.identity;
  const row = await db.from('patients').select('id,vorname,nachname,telefon,mobiltelefon,versicherter_telefon,eb2_telefon')
    .eq('id', patientId).maybeSingle();
  const patient = row.data;
  if (row.error || !patient || !patientHasContactPhone(patient, phone) || !patient.vorname || !patient.nachname) return null;
  const patientName = `${patient.vorname} ${patient.nachname}`;
  if (![patientName, `${patient.nachname} ${patient.vorname}`].map(nameKey).includes(nameKey(input.patientName))) return null;
  const proof = await attendanceProof(db, patientId, input.date, input.receivedAt);
  if (!proof) return null;
  const bucket = await db.storage.getBucket(BILLING_DOCUMENTS_BUCKET);
  if (bucket.error || bucket.data?.public !== false) return null;
  const storage = db.storage.from(BILLING_DOCUMENTS_BUCKET);
  const artwork = `attendance-assets/${input.tenantId}/${artworkVersion}`;
  const template = input.language === 'en' ? 'certificate-en.pdf' : 'certificate-de.pdf';
  const files = await Promise.all([template, 'stamp.png', 'signature.png'].map(file => storage.download(`${artwork}/${file}`)));
  const blobs = files.map(file => file.data);
  if (files.some(file => file.error) || !blobs.every((file): file is Blob => !!file && file.size > 0 && file.size <= 4 * 1024 * 1024)) return null;

  const documentId = randomUUID();
  const code = randomBytes(24).toString('base64url');
  const [blank, stamp, signature] = await Promise.all(blobs.map(async file => new Uint8Array(await file!.arrayBuffer())));
  const pdf = await renderAttendanceCertificate(blank, stamp, signature, {
    patientName, serviceDate: input.date, serviceTime: proof.time, issuedDate: appointmentLocalDate(new Date().toISOString()),
    verificationCode: code, verificationUrl: 'https://animacura.io/patient/attendance-certificate/verify',
  }, input.language);
  const path = billingDocumentPath(patientId, documentId);
  const uploaded = await storage.upload(path, pdf, { contentType: 'application/pdf', upsert: false });
  if (uploaded.error) return null;
  const stored = await db.rpc('animahost_publish_attendance_certificate', {
    p_document: documentId, p_patient: patientId, p_tenant: input.tenantId, p_message: input.messageId,
    p_date: input.date, p_time: proof.time, p_hash: createHash('sha256').update(code).digest('hex'),
    p_evidence: proof.evidence, p_artwork: artworkVersion, p_title: t('animahost.whatsapp.attendance.title', 'de'),
  });
  // Only remove the unused upload when the transaction has explicitly returned
  // the existing document. A transport failure may have committed our upload.
  if (stored.error || typeof stored.data !== 'string') return null;
  if (stored.data !== documentId) await storage.remove([path]);
  return `https://animacura.io${buildPatientPortalTarget({ section: 'documents', document: stored.data })}`;
}
