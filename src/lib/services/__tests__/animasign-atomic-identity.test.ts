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
test('new patients from the form are created with the insurance labels the form actually sends', async () => {
  const db = new PGlite();
  const ids = ['00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000014'];
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE patients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vorname text NOT NULL,nachname text NOT NULL,geburtsdatum date NOT NULL,
        ivoris_id text UNIQUE,geschlecht text,kasse text NOT NULL,email text,behandlung text NOT NULL,behandlung_start date,behandlung_status text,notizen text);
      CREATE TABLE billing_versions(id uuid PRIMARY KEY);
      CREATE TABLE anamnese_submissions(id uuid PRIMARY KEY,vorname text,nachname text,geburtsdatum date,patient_id uuid,matched_patient_id uuid,ivoris_patient_id text,
        answers jsonb,email text,is_existing boolean);
      INSERT INTO anamnese_submissions(id,vorname,nachname,geburtsdatum,answers,email) VALUES
        ('${ids[0]}','Ada','Eins','2001-01-01','{"versicherungsart":"Gesetzlich versichert","besuchsgrund":"Erstvorstellung"}','a@example.invalid'),
        ('${ids[1]}','Bea','Zwei','2002-02-02','{"versicherungsart":"Privat versichert","besuchsgrund":"Erstvorstellung"}','b@example.invalid'),
        ('${ids[2]}','Cem','Drei','2003-03-03','{"versicherungsart":"Beihilfe","besuchsgrund":"Erstvorstellung"}','c@example.invalid'),
        ('${ids[3]}','Dan','Vier','2004-04-04','{"versicherungsart":"weiß nicht","besuchsgrund":"Erstvorstellung"}','d@example.invalid');`);
    await db.exec(await readFile('supabase/migrations/059_treatment_accounts.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/061_atomic_intake_identity.sql', 'utf8'));
    const resolve = async (id: string) => (await db.query<{ result: any }>('SELECT resolve_intake_identity($1,true) AS result', [id])).rows[0].result;
    // Vorher: Die Beschriftung des Bogens galt als fehlende Angabe, es wurde kein Patient angelegt.
    assert.equal((await resolve(ids[0])).reason, 'missing_creation_facts');
    await db.exec(await readFile('supabase/migrations/083_intake_insurance_labels.sql', 'utf8'));
    const kasse = async (id: string) => (await db.query<{ kasse: string }>('SELECT kasse FROM patients WHERE id=$1', [(await resolve(id)).patient_id])).rows[0]?.kasse;
    assert.equal(await kasse(ids[0]), 'gesetzlich');
    assert.equal(await kasse(ids[1]), 'privat');
    assert.equal(await kasse(ids[2]), 'privat');
    // Eine unbekannte Angabe wird weiterhin nicht geraten.
    assert.equal((await resolve(ids[3])).reason, 'missing_creation_facts');
    assert.equal((await db.query('SELECT * FROM patients')).rows.length, 3);
  } finally { await db.close(); }
});
test('a manual assignment by the practice confirms identity despite a differently spelled name, but never across birthdates', async () => {
  const db = new PGlite();
  const form = '00000000-0000-4000-8000-000000000021', other = '00000000-0000-4000-8000-000000000022', user = '00000000-0000-4000-8000-0000000000aa';
  const patient = '00000000-0000-4000-8000-0000000000b1', stranger = '00000000-0000-4000-8000-0000000000b2', wrongBirth = '00000000-0000-4000-8000-0000000000b3';
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE patients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vorname text NOT NULL,nachname text NOT NULL,geburtsdatum date NOT NULL,
        ivoris_id text UNIQUE,geschlecht text,kasse text NOT NULL,email text,behandlung text NOT NULL,behandlung_start date,behandlung_status text,notizen text);
      CREATE TABLE billing_versions(id uuid PRIMARY KEY);
      CREATE TABLE anamnese_submissions(id uuid PRIMARY KEY,vorname text,nachname text,geburtsdatum date,patient_id uuid,matched_patient_id uuid,ivoris_patient_id text,
        answers jsonb,email text,is_existing boolean);
      INSERT INTO patients(id,vorname,nachname,geburtsdatum,ivoris_id,kasse,behandlung) VALUES
        ('${patient}','Lena','Schmitt','2010-05-05','iv-1','gesetzlich','KFO'),
        ('${stranger}','Paul','Anders','2010-05-05','iv-2','gesetzlich','KFO'),
        ('${wrongBirth}','Lena','Schmidt','2011-06-06','iv-3','gesetzlich','KFO');
      INSERT INTO anamnese_submissions(id,vorname,nachname,geburtsdatum,answers) VALUES
        ('${form}','Lena','Schmidt','2010-05-05','{"versicherungsart":"Gesetzlich versichert","besuchsgrund":"Erstvorstellung"}'),
        ('${other}','Lena','Schmidt','2010-05-05','{}');`);
    for (const file of ['059_treatment_accounts', '061_atomic_intake_identity', '083_intake_insurance_labels', '084_intake_practice_confirmation'])
      await db.exec(await readFile(`supabase/migrations/${file}.sql`, 'utf8'));
    const resolve = async (id: string) => (await db.query<{ result: any }>('SELECT resolve_intake_identity($1,false) AS result', [id])).rows[0].result;
    const assign = (id: string, target: string) => db.exec(`UPDATE anamnese_submissions SET patient_id='${target}',matched_patient_id='${target}',ivoris_patient_id=(SELECT ivoris_id FROM patients WHERE id='${target}') WHERE id='${id}'`);
    const confirm = (id: string, target: string) => db.exec(`INSERT INTO intake_identity_confirmations(submission_id,patient_id,confirmed_by) VALUES('${id}','${target}','${user}')
      ON CONFLICT(submission_id) DO UPDATE SET patient_id=excluded.patient_id,confirmed_by=excluded.confirmed_by,confirmed_at=now()`);

    // Vorher: Der Bogen hängt am Patienten, die Prüfung lehnt die abweichende Schreibweise trotzdem ab.
    await assign(form, patient);
    assert.equal((await resolve(form)).reason, 'identity_conflict');
    // Mit Bestätigung der Praxis geht genau diese Zuordnung durch.
    await confirm(form, patient);
    assert.deepEqual(await resolve(form), { status: 'matched', reason: 'confirmed_by_practice', patient_id: patient, is_new: false, swapped: false });
    // Eine Bestätigung für einen anderen Bogen gilt nicht für diesen.
    await assign(other, patient);
    assert.equal((await resolve(other)).reason, 'identity_conflict');
    // Anderes Geburtsdatum: Auch eine Bestätigung reicht nicht.
    await db.exec(`UPDATE anamnese_submissions SET patient_id=NULL,matched_patient_id=NULL,ivoris_patient_id=NULL WHERE id='${form}'`);
    await confirm(form, wrongBirth);
    assert.equal((await resolve(form)).reason, 'confirmed_birthdate_mismatch');
    // Hängt der Bogen schon an einem anderen Patienten, gewinnt die Bestätigung nicht still.
    await assign(form, stranger);
    await confirm(form, patient);
    assert.equal((await resolve(form)).reason, 'stable_id_conflict');
    // Die Bestätigungen sind für anon und angemeldete Nutzer nicht erreichbar, nur für den Server.
    const privilege = async (role: string) => (await db.query<{ ok: boolean }>(`SELECT has_table_privilege('${role}','intake_identity_confirmations','SELECT,INSERT,UPDATE,DELETE') AS ok`)).rows[0].ok;
    assert.equal(await privilege('anon'), false);
    assert.equal(await privilege('authenticated'), false);
    assert.equal(await privilege('service_role'), true);
    // Wird der Patient gelöscht (z. B. zusammengeführt), verfällt die Bestätigung.
    await db.exec(`UPDATE anamnese_submissions SET patient_id=NULL,matched_patient_id=NULL,ivoris_patient_id=NULL WHERE id='${form}'; DELETE FROM patients WHERE id='${patient}'`);
    assert.equal((await db.query('SELECT 1 FROM intake_identity_confirmations')).rows.length, 0);
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
