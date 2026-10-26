import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { resolveIntakeIdentity, INTAKE_PORTAL_UNAVAILABLE } from '../intake-identity';
const one = '00000000-0000-4000-8000-000000000001', two = '00000000-0000-4000-8000-000000000002';

test('intake lookup fails closed; no lookup result is a portal credential', async () => {
  for (const response of [{ data: null, error: null }, { data: { status: 'matched' }, error: null }, { data: null, error: { message: 'unavailable' } }]) {
    const result = await resolveIntakeIdentity({ rpc: async () => response } as any, one, true);
    assert.equal(result.status, 'lookup_failed');
  }
  assert.deepEqual(INTAKE_PORTAL_UNAVAILABLE, { status: 'unavailable', reason: 'independent_activation_required' });
});
test('atomic local intake rechecks swapped identity, preserves patients and never defaults clinical facts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE patients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vorname text NOT NULL,nachname text NOT NULL,geburtsdatum date NOT NULL,
        ivoris_id text UNIQUE,geschlecht text,kasse text NOT NULL,email text,behandlung text NOT NULL,behandlung_start date,behandlung_status text,notizen text);
      CREATE TABLE billing_versions(id uuid PRIMARY KEY);
      CREATE TABLE anamnese_submissions(id uuid PRIMARY KEY,vorname text,nachname text,geburtsdatum date,patient_id uuid,matched_patient_id uuid,ivoris_patient_id text,
        answers jsonb,email text,is_existing boolean);
      INSERT INTO anamnese_submissions(id,vorname,nachname,geburtsdatum,answers,email) VALUES
        ('${one}','Ute','Müller','2000-01-01','{"versicherungsart":"gesetzlich","besuchsgrund":"Erstvorstellung"}','test@example.invalid'),
        ('${two}','Müller','Ute','2000-01-01','{"versicherungsart":"gesetzlich","besuchsgrund":"Erstvorstellung"}','other@example.invalid');`);
    await db.exec(await readFile('supabase/migrations/059_treatment_accounts.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/061_atomic_intake_identity.sql', 'utf8'));
    const resolve = async (id: string, create = true) => (await db.query<{ result: any }>('SELECT resolve_intake_identity($1,$2) AS result', [id, create])).rows[0].result;
    assert.equal((await resolve(one, false)).status, 'new_candidate');
    assert.equal((await db.query('SELECT * FROM patients')).rows.length, 0);
    const first = await resolve(one), snapshot = (await db.query('SELECT * FROM patients')).rows;
    assert.equal(first.status, 'matched'); assert.equal(first.is_new, true);
    const second = await resolve(two);
    assert.equal(second.patient_id, first.patient_id); assert.equal(second.is_new, false);
    assert.equal((await resolve(one)).patient_id, first.patient_id);
    assert.deepEqual((await db.query('SELECT * FROM patients')).rows, snapshot); // No email/name/start overwrite.
    assert.equal((snapshot[0] as any).behandlung_start, null);
    assert.equal((snapshot[0] as any).geschlecht, null);
    await db.query(`UPDATE anamnese_submissions SET vorname='Mueller',nachname='Ute',patient_id=null,matched_patient_id=null WHERE id=$1`, [two]);
    assert.equal((await resolve(two)).status, 'possible_duplicate');
    await db.query(`UPDATE anamnese_submissions SET vorname='Neu',nachname='Person',geburtsdatum=null WHERE id=$1`, [two]);
    assert.equal((await resolve(two)).reason, 'missing_identity');
    await db.query(`UPDATE anamnese_submissions SET geburtsdatum='2000-02-02',answers='{}' WHERE id=$1`, [two]);
    assert.equal((await resolve(two)).reason, 'missing_creation_facts');
    assert.equal((await db.query('SELECT * FROM patients')).rows.length, 1);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(resolve(one), /permission denied/);
    await db.exec('RESET ROLE');
  } finally { await db.close(); }
});
test('public submit has no legacy creation RPC or portal account/password write path', async () => {
  const route = await readFile('src/app/api/anima-sign/submit/route.ts', 'utf8');
  const local = await readFile('src/lib/services/animasign-local-patient-link.ts', 'utf8');
  assert.doesNotMatch(route, /abgleich_patient_aus_submission|ensurePatientPortalAccount|sendWelcomeEmail|password:\s*submission\.account_password/);
  assert.doesNotMatch(local, /abgleich_patient_aus_submission|\.insert\(/);
  assert.match(route, /if \(resolvedPatientId\) try/);
  assert.match(route, /INTAKE_PORTAL_UNAVAILABLE/);
});
