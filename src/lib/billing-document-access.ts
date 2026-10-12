import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { effektiveStufe } from './permissions';
import { extractAppRole } from './auth';
import { t } from './i18n';

export const BILLING_DOCUMENTS_BUCKET = 'billing-documents';
export const billingDocumentUrl = (id: string) => `/api/patient/dokumente/${id}/datei`;
export const billingDocumentPath = (patientId: string, documentId: string) => `${patientId}/${documentId}.pdf`;
type Client = Pick<SupabaseClient, 'auth' | 'from' | 'storage'>;

/** Private document delivery. It never issues invoices, changes balances or sends mail. */
export function billingDocumentHandler(session: () => Client, service: () => Client) {
  return async (request: Request, documentId: string) => {
    const locale = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'de';
    const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
    const fail = (key: string, status: number) => Response.json({ error: t(`billing.document.${key}`, locale) }, { status, headers });
    try {
      const { data: { user }, error: authError } = await session().auth.getUser();
      if (authError || !user) return fail('signIn', 401);
      if (!z.string().uuid().safeParse(documentId).success) return fail('notFound', 404);
      const db = service();
      const { data: profile, error: profileError } = await db.from('user_profiles')
        .select('role,patient_id,permissions').eq('id', user.id).maybeSingle();
      if (profileError) return fail('unavailable', 503);
      if (!profile) return fail('forbidden', 403);
      const role = extractAppRole(profile.role);
      const patient = role === 'patient';
      // Only a server-side profile grants access. User-editable metadata cannot.
      const staff = role !== null && !patient &&
        effektiveStufe(role, profile.permissions, 'rechnungen') !== 'keine' &&
        effektiveStufe(role, profile.permissions, 'patienten') !== 'keine';
      if ((!patient && !staff) || (patient && !z.string().uuid().safeParse(profile.patient_id).success)) {
        return fail('forbidden', 403);
      }
      let query = db.from('patient_documents').select('id,patient_id,file_url').eq('id', documentId);
      if (patient) query = query.eq('patient_id', profile.patient_id);
      const { data: document, error: documentError } = await query.maybeSingle();
      if (documentError) return fail('unavailable', 503);
      if (!document || !z.string().uuid().safeParse(document.patient_id).success ||
          (patient && document.patient_id !== profile.patient_id) ||
          document.id !== documentId || document.file_url !== billingDocumentUrl(documentId)) {
        return fail('notFound', 404);
      }
      const { data: bucket, error: bucketError } = await db.storage.getBucket(BILLING_DOCUMENTS_BUCKET);
      if (bucketError || !bucket || bucket.public !== false) return fail('unavailable', 503);
      const { data: pdf, error: storageError } = await db.storage.from(BILLING_DOCUMENTS_BUCKET)
        .download(billingDocumentPath(document.patient_id, documentId));
      if (storageError || !pdf || pdf.size === 0 || pdf.size > 25 * 1024 * 1024) return fail('unavailable', 503);
      if (await pdf.slice(0, 5).text() !== '%PDF-') return fail('unavailable', 503);
      return new Response(pdf, { headers: {
        ...headers, 'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="Anima-Cura-Dokument.pdf"',
        'Content-Security-Policy': "frame-ancestors 'self'", 'X-Frame-Options': 'SAMEORIGIN',
      } });
    } catch {
      return fail('unavailable', 503);
    }
  };
}
