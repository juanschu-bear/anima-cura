import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { currentPlan, historyKnown, resolveTreatmentIdentity, resolveTreatmentListIdentity, scribeEvents, treatmentQuarter, validDate, type TreatmentPlan } from '../../treatment-account';
import { treatmentAccountHandler, treatmentReadAll } from '../../treatment-account-api';

const id = '00000000-0000-4000-8000-000000000001';
const plan: TreatmentPlan = { id, revision: 1, valid_from: '2026-02-20', valid_to: null, treatment_start: '2026-02-20', jaws: null,
  insurer: null, insurance: null, quotas: [], pauses: [], confirmed_by: id, confirmed_at: '2026-02-20', history: {},
  source: { system: 'manual', recordId: 'test', version: '1', locator: 'test' } };
test('calendar quarters, confirmed source and missing history are independent', () => {
  assert.equal(treatmentQuarter(plan, '2026-03-31'), 1);
  assert.equal(treatmentQuarter(plan, '2026-04-01'), 2);
  assert.equal(treatmentQuarter(plan, '2027-01-01'), 5);
  assert.equal(treatmentQuarter(plan, '2026-02-19'), null);
  assert.equal(treatmentQuarter({ ...plan, confirmed_by: null }, '2026-04-01'), null);
  assert.equal(treatmentQuarter({ ...plan, pauses: [{ confirmed: false }] }, '2026-04-01'), null);
  assert.equal(historyKnown(plan), false);
  assert.equal(historyKnown({ ...plan, history: { complete: true, from: '2026-01-01', through: '2026-09-30' } }), false);
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(currentPlan([plan, { ...plan, id: 'conflicting' }], '2026-04-01'), null);
  assert.equal(currentPlan([plan, { ...plan, revision: 2 }], '2026-04-01')?.revision, 2);
});
test('Scribe projection never promotes document confirmation or default amounts to clinical evidence', () => {
  const events = scribeEvents({ id, patient_id: id, termin_datum: '2026-10-01', text: 'Bg OK eingesetzt. T-Loop beim nächsten Termin geplant. Kein Band gesetzt. Alte Notiz kopiert: Bogen eingesetzt.',
    version: 1, status: 'bestaetigt', bestaetigt_von: id, zaehne: ['11'], variablen: { bogen: 'NiTi' }, positionen: [{ code: '128b', anzahl: 1 }], vorlage_id: id });
  assert.equal(events.length, 4);
  assert.deepEqual(events.map(e => e.state), ['performed', 'planned', 'negated', 'performed']);
  assert.ok(events.every(e => !e.confirmed && e.quantity === null && e.teeth.length === 0));
  assert.equal(events[0].material, null); assert.equal(events[0].jaw, 'OK');
  assert.equal(events[3].copied, true);
});
const identity = { id, vorname: 'Ute', nachname: 'Müller', geburtsdatum: '2000-01-01', ivoris_id: 'a' };
test('identity: direct/swapped, variants, twins, trusted conflicts and failed searches', () => {
  const input = { first: ' Müller ', last: ' Ute ', dob: '2000-01-01' };
  assert.equal(resolveTreatmentIdentity(input, [identity], true).status, 'matched');
  assert.equal(resolveTreatmentIdentity(input, [identity], false).status, 'lookup_failed');
  assert.equal(resolveTreatmentIdentity({ ...input, first: 'Mueller' }, [identity], true).status, 'possible_duplicate');
  assert.equal(resolveTreatmentIdentity(input, [identity, { ...identity, id: 'other' }], true).status, 'possible_duplicate');
  assert.equal(resolveTreatmentIdentity({ ...input, externalId: 'b' }, [identity], true).status, 'possible_duplicate');
  assert.equal(resolveTreatmentIdentity({ ...input, dob: null }, [], true).status, 'possible_duplicate');
  assert.equal(resolveTreatmentIdentity(input, [], true).status, 'new_candidate');
  assert.equal(resolveTreatmentIdentity({ ...input, patientId: id }, [], true).status, 'possible_duplicate');
  const numbered = { ...identity, ivoris_nummer: '00000123' };
  assert.equal(resolveTreatmentListIdentity({ first: 'Ute', last: 'Müller', patientNumber: '00000123' }, [numbered], true).status, 'matched');
  assert.equal(resolveTreatmentListIdentity({ first: 'Ute', last: 'Müller', patientNumber: '00000123' }, [numbered, { ...numbered, id: 'other' }], true).status, 'possible_duplicate');
});
test('pagination rejects truncation, failures and changing totals', async () => {
  let reads = 0;
  const rows = Array.from({ length: 421 }, (_, id) => ({ id }));
  assert.equal((await treatmentReadAll(() => ({ range: async (from: number, to: number) => { reads++; return { data: rows.slice(from, to + 1), count: 421, error: null }; } }))).length, 421);
  assert.equal(reads, 3);
  await assert.rejects(treatmentReadAll(() => ({ range: async () => ({ data: [], count: 1, error: null }) })), /truncated/);
  await assert.rejects(treatmentReadAll(() => ({ range: async () => ({ data: [], count: null, error: null }) })), /unavailable/);
});
test('account API denies unsigned, patient and insufficiently authorized users before reading any patient', async () => {
  for (const role of [null, 'patient', 'behandler']) {
    let adminUsed = false;
    const session: any = { auth: { getUser: async () => ({ data: { user: role ? { id } : null }, error: null }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role }, error: null }) }) }) }) };
    const response = await treatmentAccountHandler(() => session, () => { adminUsed = true; throw Error('forbidden'); })(new Request('https://example.com/api/account'), id);
    assert.equal(response.status, role ? 403 : 401); assert.equal(adminUsed, false);
    assert.match(response.headers.get('cache-control')!, /no-store/);
  }
});
test('additive schema: immutable revisions, patient scoping, no public access, complete identity search', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE patients(id uuid PRIMARY KEY,vorname text,nachname text,geburtsdatum date,ivoris_id text);
      CREATE TABLE billing_records(id uuid PRIMARY KEY,patient_id uuid,kind text);
      CREATE TABLE billing_versions(id uuid PRIMARY KEY,record_id uuid);
      INSERT INTO patients VALUES ('${id}','Ute','Müller','2000-01-01','a');`);
    await db.exec(await readFile('supabase/migrations/059_treatment_accounts.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/060_treatment_account_scope_guards.sql', 'utf8'));
    await db.query(`INSERT INTO treatment_plan_versions(id,patient_id,revision,valid_from,source,created_by) VALUES ($1,$1,1,'2026-02-20',$2,$1)`, [id, JSON.stringify(plan.source)]);
    await assert.rejects(db.query('UPDATE treatment_plan_versions SET revision=2'), /immutable/);
    await assert.rejects(db.query('DELETE FROM treatment_plan_versions'), /immutable/);
    const result = await db.query(`SELECT * FROM treatment_identity_candidates('Mueller','Ute','1999-01-01',null,null)`);
    assert.equal(result.rows.length, 1); // Variant with a different DOB must still reach review, not creation.
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT * FROM treatment_plan_versions'), /permission denied/);
    await assert.rejects(db.query(`SELECT * FROM treatment_identity_candidates('Ute','Müller','2000-01-01',null,null)`), /permission denied/);
    await db.exec('RESET ROLE');
    await db.exec('SET ROLE service_role');
    await assert.rejects(db.query('TRUNCATE treatment_plan_versions CASCADE'), /permission denied/);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT * FROM patients')).rows.length, 1);
  } finally { await db.close(); }
});
