import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync('supabase/migrations/094_animahost_contact_and_invoice_recipient.sql', 'utf8');
const rejectMigration = readFileSync('supabase/migrations/095_animahost_reject_contact_change.sql', 'utf8');
const tenant = '0514a140-e570-4c10-a5c1-838a2cfd1d12';
const patient = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
const unrelated = '00000000-0000-4000-8000-000000000003';

test('contact and recipient changes stay patient-scoped, auditable and stable through IVORIS import', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE patients(id uuid PRIMARY KEY, ivoris_id text UNIQUE, vorname text, nachname text,
        email text, telefon text, mobiltelefon text, strasse text, plz text, ort text);
      CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text,patient_id uuid);
      CREATE TABLE patient_access_memberships(user_id uuid,patient_id uuid);
      CREATE TABLE animahost_whatsapp_settings(tenant_id uuid PRIMARY KEY);
      CREATE TABLE zahler(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, strasse text, plz text, ort text, email text);
      CREATE TABLE behandlungsfall(patient_id uuid,zahler_id uuid,status text);
      CREATE TABLE billing_invoices(patient_id uuid,snapshot jsonb);
      CREATE TABLE practice_notifications(recipient_role text,kind text,title text NOT NULL,body text NOT NULL,link text,source_key text,UNIQUE(source_key,recipient_role));
      GRANT SELECT,INSERT,UPDATE ON patients,user_profiles,patient_access_memberships,zahler,behandlungsfall,practice_notifications TO service_role;`);
    const result = await db.exec(migration);
    assert.match(String((result.at(-1)?.rows[0] as { ergebnis: string }).ergebnis), /094.*eingespielt/);
    await db.exec(rejectMigration);
    assert.match(String(((await db.exec(rejectMigration)).at(-1)?.rows[0] as { ergebnis: string }).ergebnis), /095.*eingespielt/);
    await db.query('INSERT INTO animahost_whatsapp_settings VALUES ($1)', [tenant]);
    await db.query("INSERT INTO patients(id,ivoris_id,vorname,nachname,email) VALUES ($1,'p','Mia','Muster','before@example.de')", [patient]);
    await db.query("INSERT INTO user_profiles VALUES($1,'patient',$2)", [user, patient]);
    await db.exec('SET ROLE service_role');
    const changeSql = 'SELECT animahost_contact_change($1,$2,$3,$4,$5,$6) AS result';
    const request = await db.query<{ result: { id: string; state: string } }>(changeSql,
      [tenant, 'wamid.email', patient, JSON.stringify({ email: 'after@example.de' }), null, null]);
    assert.equal(request.rows[0].result.state, 'pending');
    const requestId = request.rows[0].result.id;
    assert.equal((await db.query<{ email: string }>('SELECT email FROM patients')).rows[0].email, 'before@example.de');
    await assert.rejects(db.query(changeSql, [null, null, null, null, requestId, unrelated]), /contact_change_not_found/);
    await db.query(changeSql, [null, null, null, null, requestId, user]);
    await db.query(changeSql, [tenant, 'wamid.address', patient, JSON.stringify({ strasse: 'Neue Straße 2', plz: '04109', ort: 'Leipzig' }), null, null]);
    await db.query("INSERT INTO patients(id,ivoris_id,email,ivoris_contact_import,telefon,strasse) VALUES($1,'p','old@example.de',true,'+4934100','Alte Straße') ON CONFLICT(ivoris_id) DO UPDATE SET email=excluded.email,telefon=excluded.telefon,strasse=excluded.strasse,ivoris_contact_import=excluded.ivoris_contact_import", [patient]);
    const updated = (await db.query('SELECT email,telefon,strasse,ivoris_contact_import AS marker FROM patients')).rows[0];
    assert.deepEqual(updated, { email: 'after@example.de', telefon: '+4934100', strasse: 'Neue Straße 2', marker: false });

    const unwanted = (await db.query<{ result: { id: string } }>(changeSql,
      [tenant, 'wamid.unwanted', patient, JSON.stringify({ email: 'unwanted@example.invalid' }), null, null])).rows[0].result.id;
    const reject = 'SELECT animahost_reject_contact_change($1,$2,$3,$4) AS result';
    await assert.rejects(db.query(reject, [unwanted, unrelated, 'Abgelehnt', 'Vorschlag prüfen.']), /contact_change_not_found/);
    await assert.rejects(db.query(reject, [requestId, user, 'Abgelehnt', 'Vorschlag prüfen.']), /contact_change_already_applied/);
    await assert.rejects(db.query(reject, [unwanted, user, null, 'Vorschlag prüfen.']), /null value/);
    assert.deepEqual((await db.query('SELECT state FROM animahost_contact_changes WHERE id=$1', [unwanted])).rows, [{ state: 'pending' }]);
    const rejection = await db.query(reject, [unwanted, user, 'Abgelehnt', 'Vorschlag prüfen.']);
    assert.deepEqual(rejection.rows, [{ result: { id: unwanted, state: 'rejected' } }]);
    assert.deepEqual((await db.query(reject, [unwanted, user, 'Abgelehnt', 'Vorschlag prüfen.'])).rows, rejection.rows);
    assert.deepEqual((await db.query('SELECT recipient_role,kind,link FROM practice_notifications ORDER BY recipient_role')).rows,
      ['admin', 'verwaltung'].map(recipient_role => ({ recipient_role, kind: 'wichtig', link: '/patienten/' + patient })));
    await assert.rejects(db.query(changeSql, [null, null, null, null, unwanted, user]), /contact_change_rejected/);
    assert.deepEqual((await db.query('SELECT email FROM patients')).rows, [{ email: 'after@example.de' }]);

    const address = { name: 'Alex Muster', street: 'Nebenstraße 4', postalCode: '04109', city: 'Leipzig', email: 'payer@example.de' };
    const confirmation = 'a'.repeat(64);
    const recipient = (await db.query<{ result: { id: string; state: string } }>(
      'SELECT animahost_invoice_recipient_change($1,$2,$3,$4,true,$5,$6,$7) AS result',
      [tenant, 'wamid.payer', patient, JSON.stringify(address), confirmation, '491710000000@s.whatsapp.net', 'de'])).rows[0].result;
    assert.equal(recipient.state, 'pending');
    await db.exec('RESET ROLE');
    await db.query("INSERT INTO billing_invoices VALUES($1,'{}')", [patient]);
    assert.deepEqual((await db.query('SELECT snapshot FROM billing_invoices')).rows[0], { snapshot: {} });
    await db.exec('SET ROLE service_role');
    assert.deepEqual((await db.query('SELECT animahost_confirm_invoice_recipient($1) AS ok', [confirmation])).rows, [{ ok: true }]);
    const firstClaim = (await db.query<{ job: { id: string } }>('SELECT animahost_claim_recipient_followup($1) AS job', [tenant])).rows[0].job;
    assert.equal(firstClaim.id, recipient.id);
    await db.query('SELECT animahost_confirm_invoice_recipient($1) AS ok', [confirmation]);
    assert.deepEqual((await db.query('SELECT animahost_claim_recipient_followup($1) AS job', [tenant])).rows, [{ job: null }]);
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int FROM practice_notifications WHERE kind='antwort' AND body LIKE 'Weicht von IVORIS ab%'")).rows[0].count, 2);
    await db.exec('RESET ROLE');
    await db.query("INSERT INTO billing_invoices VALUES($1,'{}')", [patient]);
    assert.deepEqual((await db.query("SELECT snapshot FROM billing_invoices WHERE snapshot ? 'invoiceRecipient'")).rows[0], { snapshot: { invoiceRecipient: address } });
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT animahost_confirm_invoice_recipient($1)', [confirmation]), /permission denied/);
  } finally {
    await db.close();
  }
});
