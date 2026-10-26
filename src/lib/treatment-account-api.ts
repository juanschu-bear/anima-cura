import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { extractAppRole } from './auth';
import { effektiveStufe } from './permissions';
import { canReadBilling } from './billing-readiness';
import { currentPlan, historyKnown, resolveTreatmentIdentity, scribeEvents, treatmentQuarter,
  type Identity, type ScribeEntry, type TreatmentEvent, type TreatmentPlan } from './treatment-account';
import { t } from './i18n';

type Client = Pick<SupabaseClient, 'auth' | 'from' | 'rpc'>;
// Each read verifies total cardinality. A truncated or failed source is never an empty account.
export async function treatmentReadAll<T>(query: () => any): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  for (let offset = 0; ; offset += 200) {
    const result = await query().range(offset, offset + 199);
    if (result.error || result.count === null || !Array.isArray(result.data)) throw new Error('source_unavailable');
    if (total !== null && total !== result.count) throw new Error('source_changed');
    total = result.count;
    rows.push(...result.data);
    if (rows.length === total) return rows;
    if (result.data.length !== 200 || rows.length > total!) throw new Error('source_truncated');
  }
}
export async function readTreatmentAccount(db: Client, patientId: string, date: string) {
  const { data: patient, error } = await db.from('patients')
    .select('id,vorname,nachname,geburtsdatum,ivoris_id,ivoris_nummer,behandlung_start,kasse,krankenkasse')
    .eq('id', patientId).maybeSingle();
  if (error) throw new Error('source_unavailable');
  if (!patient) return null;
  const read = <T>(table: string, columns = '*', revision = false) => treatmentReadAll<T>(() => {
    let q = db.from(table).select(columns, { count: 'exact' }).eq('patient_id', patientId).order('id');
    if (revision) q = q.order('revision');
    return q;
  });
  const [plans, persisted, baseline, entries, invoices, allocations, documents] = await Promise.all([
    read<TreatmentPlan>('treatment_plan_versions', '*', true),
    read<any>('treatment_events', '*', true), read<any>('treatment_baseline', '*', true),
    read<ScribeEntry>('doku_eintraege', 'id,patient_id,termin_datum,text,version,status,bestaetigt_von,zaehne,variablen,positionen,vorlage_id'),
    read<any>('offene_posten', 'id,typ,rechnung_datum,rechnung_nr,unser_zeichen,betrag,status,source_file'),
    read<any>('billing_allocations'), read<any>('patient_documents', 'id,name,typ,hochgeladen_am'),
  ]);
  const candidates = await treatmentReadAll<Identity>(() => db.rpc('treatment_identity_candidates', {
    p_first: patient.vorname, p_last: patient.nachname, p_dob: patient.geburtsdatum,
    p_patient_id: patient.id, p_external_id: patient.ivoris_id,
  }, { count: 'exact' }).order('id'));
  const identity = resolveTreatmentIdentity({ first: patient.vorname, last: patient.nachname,
    dob: patient.geburtsdatum, patientId: patient.id, externalId: patient.ivoris_id }, candidates, true);
  const latest = (items: any[]) => items.filter(row => !items.some(other => other.id === row.id && other.revision > row.revision));
  const events: TreatmentEvent[] = latest(persisted).map(row => ({ id: row.id, patientId,
    date: row.service_date, text: row.text, component: row.component, jaw: row.jaw,
    teeth: row.teeth, material: row.material, quantity: row.quantity === null ? null : Number(row.quantity),
    state: row.clinical_state, copied: row.copied, confirmed: !!(row.confirmed_by && row.confirmed_at),
    evidence: row.source, author: row.clinician_id }));
  const projections = entries.flatMap(scribeEvents).filter(event => !events.some(saved =>
    saved.evidence.system === event.evidence.system && saved.evidence.recordId === event.evidence.recordId
      && saved.evidence.version === event.evidence.version && saved.evidence.locator === event.evidence.locator));
  const plan = currentPlan(plans, date);
  const allEvents = [...events, ...projections].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { patient, identity, plans, plan, quarter: treatmentQuarter(plan, date), calendarQuarter: `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`,
    history: { known: historyKnown(plan), from: plan?.history.from ?? null, through: plan?.history.through ?? null },
    events: allEvents, baseline: latest(baseline),
    // Aggregate legacy amounts are documentary evidence only, never an item-level allocation or debt calculation.
    historicalReferences: invoices.sort((a, b) => String(b.rechnung_datum).localeCompare(String(a.rechnung_datum))), documents, sourceEntries: entries,
    allocations: allocations.map(row => ({ ...row, itemLevelProof: row.evidence_kind === 'position'
      && row.state === 'transferred' && !!row.confirmed_by && !!row.confirmed_at && !!row.transferred_by && !!row.transferred_at })),
    issues: [...(!plan ? ['missing_plan'] : []), ...(!historyKnown(plan) ? ['history_unknown'] : []),
      ...(identity.status !== 'matched' ? ['identity_review'] : []),
      ...(entries.length ? ['legacy_scribe_proposals'] : []),
      ...(invoices.length ? ['summary_not_positions'] : [])],
    asOf: date, readOnly: true as const };
}
export type TreatmentAccount = NonNullable<Awaited<ReturnType<typeof readTreatmentAccount>>>;
export function treatmentAccountHandler(session: () => Client, admin: () => Client) {
  return async (request: Request, patientId: string) => {
    const locale = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'de';
    const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
    const fail = (key: string, status: number) => Response.json({ error: t(`treatment.${key}`, locale) }, { status, headers });
    try {
      const client = session();
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) return fail('signIn', 401);
      const { data: profile, error: profileError } = await client.from('user_profiles').select('role,permissions').eq('id', user.id).maybeSingle();
      if (profileError) return fail('unavailable', 503);
      const role = extractAppRole(profile?.role);
      if (!canReadBilling(role, profile?.permissions) || effektiveStufe(role, profile?.permissions, 'patienten') === 'keine') return fail('forbidden', 403);
      if (!z.string().uuid().safeParse(patientId).success) return fail('notFound', 404);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const account = await readTreatmentAccount(admin(), patientId, today);
      return account ? Response.json(account, { headers }) : fail('notFound', 404);
    } catch { return fail('unavailable', 503); }
  };
}
