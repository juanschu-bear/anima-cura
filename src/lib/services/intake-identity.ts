import type { SupabaseClient } from '@supabase/supabase-js';
export type IntakeResolution = {
  status: 'matched' | 'possible_duplicate' | 'new_candidate' | 'lookup_failed';
  reason: string; patient_id?: string; is_new?: boolean; swapped?: boolean;
};
export async function resolveIntakeIdentity(db: Pick<SupabaseClient, 'rpc'>, submissionId: string, allowCreate = false): Promise<IntakeResolution> {
  try {
    const { data, error } = await db.rpc('resolve_intake_identity', { p_submission_id: submissionId, p_allow_create: allowCreate });
    if (error || !data || !['matched', 'possible_duplicate', 'new_candidate', 'lookup_failed'].includes(data.status)
      || (data.status === 'matched' && !/^[a-f0-9-]{36}$/i.test(data.patient_id ?? ''))) {
      return { status: 'lookup_failed', reason: 'identity_lookup_unavailable' };
    }
    return data as IntakeResolution;
  } catch { return { status: 'lookup_failed', reason: 'identity_lookup_unavailable' }; }
}
/** Neither identity lookup nor form replay proves access to an existing portal. */
export const INTAKE_PORTAL_UNAVAILABLE = { status: 'unavailable' as const, reason: 'independent_activation_required' };
