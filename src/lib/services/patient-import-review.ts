import type { SupabaseClient } from '@supabase/supabase-js';
import { validBirthDate } from './intake-required-fields';

type RawPatient = { Id?: unknown; Firstname?: unknown; Lastname?: unknown; Birthday?: unknown };
export async function splitPatientImport(db: Pick<SupabaseClient, 'from'>, rows: RawPatient[], today?: string) {
  const valid: RawPatient[] = []; let deferred = 0;
  for (const row of rows) {
    if (!row.Id) { valid.push(row); continue; } // Existing caller counts rows without a source identifier as skipped.
    const birthday = validBirthDate(row.Birthday, today);
    if (birthday) { valid.push({ ...row, Birthday: birthday }); continue; }
    const { error } = await db.from('patient_import_reviews').upsert({
      source: 'ivoris', external_id: String(row.Id),
      first_name: typeof row.Firstname === 'string' ? row.Firstname.trim() : '',
      last_name: typeof row.Lastname === 'string' ? row.Lastname.trim() : '',
      reason: row.Birthday == null || row.Birthday === '' ? 'birthdate_missing' : 'birthdate_invalid',
      state: 'open', last_seen_at: new Date().toISOString(), resolved_at: null,
    }, { onConflict: 'source,external_id' });
    if (error) throw new Error('patient_import_review_persistence_failed');
    deferred++;
  }
  return { valid, deferred };
}
export async function resolveValidPatientImports(db: Pick<SupabaseClient, 'from'>, externalIds: string[]) {
  if (!externalIds.length) return;
  const { error } = await db.from('patient_import_reviews').update({ state: 'resolved', resolved_at: new Date().toISOString() })
    .eq('source','ivoris').eq('state','open').in('external_id',externalIds);
  if (error) throw new Error('patient_import_review_resolution_failed');
}
