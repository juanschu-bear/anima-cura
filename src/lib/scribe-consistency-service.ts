import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { t } from './i18n';
import { assessScribeConsistency, consistencyResult, scribeConsistencyInput, scribeConsistencyTemplate, type ScribeConsistencyResult } from './scribe-consistency';

// Caller authenticates/authorizes first. Use that same session-bound client;
// never upgrade to the service key to make inaccessible evidence look valid.
export async function checkScribeConsistency(db: Pick<SupabaseClient, 'from'>, raw: unknown): Promise<ScribeConsistencyResult> {
  const parsed = scribeConsistencyInput.safeParse(raw);
  if (!parsed.success) return consistencyResult([{code:'input_invalid',scope:'input'}]);
  const input = parsed.data;
  const slugs = input.termin_typ.split('+');
  if (slugs.length > 32 || slugs.some(s => !s) || new Set(slugs).size !== slugs.length)
    return consistencyResult([{code:'module_selection_invalid',scope:'selection'}]);
  try {
    const {data, error} = await db.from('doku_vorlagen')
      .select('id,behandlungsart,termin_typ,struktur,positionen').eq('aktiv', true)
      .eq('behandlungsart', input.behandlungsart).in('termin_typ', slugs).limit(100);
    if (error || !data || data.length >= 100) return consistencyResult([{code:'template_read_failed',scope:'source'}]);
    const templates = data.map(row => scribeConsistencyTemplate.safeParse(row));
    if (templates.some(row => !row.success)) return consistencyResult([{code:'template_invalid',scope:'template'}]);
    const rows = templates.flatMap(row => row.success ? [row.data] : []);
    // Match /api/doku/vorlagen: seed options retain their indices; practice
    // additions follow sort_index and created_at, and all pages must be read.
    for (let from = 0; ; from += 500) {
      const options = await db.from('doku_vorlagen_optionen')
        .select('id,behandlungsart,termin_typ,gruppe,text')
        .eq('praxis_id', process.env.SCRIBE_PRAXIS_ID || 'praxis-schubert').eq('aktiv', true)
        .eq('behandlungsart', input.behandlungsart).in('termin_typ', slugs)
        .order('sort_index', {ascending:true}).order('created_at', {ascending:true}).range(from, from + 499);
      if (options.error || !options.data || from >= 10000) return consistencyResult([{code:'practice_options_read_failed',scope:'source'}]);
      for (const option of options.data) {
        for (const row of rows) {
          if (row.termin_typ !== option.termin_typ || !Object.hasOwn(row.struktur.groups, option.gruppe)) continue;
          if (typeof option.text !== 'string' || typeof option.id !== 'string') return consistencyResult([{code:'practice_options_invalid',scope:'source'}]);
          row.struktur.groups[option.gruppe].opts.push({t:option.text,id:option.id});
        }
      }
      if (options.data.length < 500) break;
    }
    return assessScribeConsistency(input, rows);
  } catch {
    return consistencyResult([{code:'consistency_read_failed',scope:'source'}]);
  }
}

export function scribeConsistencyFailure(check: ScribeConsistencyResult, url: string) {
  const unavailable = check.issues.some(issue => issue.scope === 'source');
  const locale = new URL(url).searchParams.get('lang') === 'en' ? 'en' : 'de';
  return NextResponse.json({
    status: 'needs_consistency_review',
    // Existing translated message is already shown by the Cockpit's error path.
    // Claude owns the detailed visible issue labels/navigation, not this service.
    error: t(unavailable ? 'billing.loadError' : 'billing.issue.invalid_field', locale),
    consistency: check,
  }, {status:unavailable ? 503 : 422,headers:{'Cache-Control':'private, no-store'}});
}
