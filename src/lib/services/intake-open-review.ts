import type { SupabaseClient } from '@supabase/supabase-js';

// Recent duplicate suggestions have a separate time window. Unresolved cases do not.
export async function loadOpenIntakeReviews(db: Pick<SupabaseClient,'from'>) {
  const rows: Array<Record<string, any>> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('anamnese_submissions')
      .select('id,created_at,vorname,nachname,geburtsdatum,status,ivoris_patient_id,matched_patient_id,ivoris_sync_error,ivoris_document_error,ivoris_sync_failed_permanently,ivoris_doc_failed_permanently')
      .or('ivoris_sync_failed_permanently.eq.true,ivoris_doc_failed_permanently.eq.true,ivoris_sync_error.like.MANUAL_REVIEW:*')
      .order('created_at', { ascending: true }).order('id').range(offset, offset + 499);
    if (error) throw new Error('intake_review_read_failed');
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
