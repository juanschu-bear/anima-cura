import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { currentRooms, roomInputError } from '../../scribe-rooms';

test('room can be selected before the patient; explicit patient switch still clears it',async()=>{
  const ui=await readFile('src/app/scribe/ScribeCockpit.tsx','utf8');
  assert.match(ui,/disabled=\{sendet \|\| speichert\} \/>/);
  assert.doesNotMatch(ui,/disabled=\{sendet \|\| speichert \|\| !patient\}/);
  assert.match(ui,/setPatient\(t\); setTreffer\(\[\]\); resetSitzung\(true\)/);
  assert.match(ui,/setPatient\(null\); setSuche\(""\); resetSitzung\(\)/);
});

test('room input rejects malformed and missing values; legacy absence remains valid',()=>{
  for(const value of [undefined,null,'',{},42,'Zimmer 1']) assert.ok(roomInputError(value,true));
  assert.equal(roomInputError(null,false),null);
  assert.equal(roomInputError('11111111-1111-1111-1111-111111111111',true),null);
  assert.equal(currentRooms([{id:'old',room_id:'a',version:1,name:'A',active:true},{id:'new',room_id:'a',version:2,name:'B',active:false}])[0].id,'new');
});

test('room migration: required new entries, unchanged legacy, append-only history, stale rooms and least privilege',async()=>{
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE abrechnung_runtime;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE TABLE user_profiles(id uuid, role text, permissions jsonb);
      GRANT SELECT ON user_profiles TO authenticated;
      INSERT INTO user_profiles VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin','{}'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','verwaltung','{}');
      CREATE TABLE doku_eintraege(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text DEFAULT 'entwurf', version integer DEFAULT 1, created_at timestamptz DEFAULT now());
      CREATE TABLE doku_eintrag_versionen(eintrag_id uuid, version integer);
      INSERT INTO doku_eintraege(id) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc');
      GRANT SELECT, INSERT, UPDATE ON doku_eintraege TO authenticated; GRANT SELECT, INSERT ON doku_eintrag_versionen TO authenticated;
      ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
    `);
    await db.exec(await readFile('supabase/migrations/068_scribe_rooms.sql','utf8'));
    assert.equal((await db.query('SELECT zimmer_version_id FROM doku_eintraege')).rows[0].zimmer_version_id,null);
    await db.exec("UPDATE doku_eintraege SET status='bestaetigt',version=2 WHERE id='cccccccc-cccc-cccc-cccc-cccccccccccc'");
    await assert.rejects(db.exec('INSERT INTO doku_eintraege DEFAULT VALUES'),/Zimmer auswählen/);
    const room = (await db.query<{id:string;room_id:string}>('SELECT * FROM scribe_room_versions LIMIT 1')).rows[0];
    await db.exec("SET ROLE authenticated; SET test.uid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'");
    assert.equal((await db.query('SELECT * FROM scribe_room_versions')).rows.length,3);
    await assert.rejects(db.query("INSERT INTO scribe_room_versions(room_id,version,name,created_by) VALUES($1,2,'Other',auth.uid())",[room.room_id]),/row-level security/);
    const entry=(await db.query<{id:string}>('INSERT INTO doku_eintraege(zimmer_version_id) VALUES($1) RETURNING id',[room.id])).rows[0];
    await db.query('INSERT INTO doku_eintrag_versionen(eintrag_id,version) VALUES($1,1)',[entry.id]);
    assert.equal((await db.query('SELECT zimmer_version_id FROM doku_eintrag_versionen')).rows[0].zimmer_version_id,room.id);
    await assert.rejects(db.query('INSERT INTO doku_eintrag_versionen(eintrag_id,version) VALUES($1,2)',[entry.id]),/inzwischen geändert/);
    await db.exec("SET test.uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'");
    await db.query("INSERT INTO scribe_room_versions(room_id,version,name,active,created_by) VALUES($1,2,'<img onerror=alert(1)>',false,auth.uid())",[room.room_id]);
    await assert.rejects(db.query('INSERT INTO doku_eintraege(zimmer_version_id) VALUES($1)',[room.id]),/Zimmerliste geändert/);
    await db.query("UPDATE doku_eintraege SET status='bestaetigt' WHERE id=$1",[entry.id]);
    await assert.rejects(db.query("INSERT INTO scribe_room_versions(room_id,version,name,created_by) VALUES($1,2,'stale',auth.uid())",[room.room_id]),/Room list changed/);
    await assert.rejects(db.exec("UPDATE scribe_room_versions SET name='changed'"),/permission denied/);
    await db.exec('RESET ROLE');
    for (const role of ['anon','authenticated','service_role','abrechnung_runtime']) {
      for(const fn of ['scribe_entry_room_guard','scribe_history_room_guard','scribe_room_catalog_guard']) assert.equal((await db.query<{ok:boolean}>(`SELECT has_function_privilege($1,$2,'EXECUTE') ok`,[role,fn+'()'])).rows[0].ok,false);
      assert.equal((await db.query<{ok:boolean}>(`SELECT has_table_privilege($1,'scribe_room_versions','DELETE') ok`,[role])).rows[0].ok,false);
    }
    const legacyBefore = await db.query('SELECT id,zimmer_version_id FROM doku_eintraege ORDER BY id');
    const locations = await readFile('supabase/migrations/069_scribe_activity_locations.sql','utf8');
    await db.exec(locations);
    await db.exec(locations); // safe repeat, no duplicate places
    assert.deepEqual((await db.query('SELECT id,zimmer_version_id FROM doku_eintraege ORDER BY id')).rows,legacyBefore.rows);
    const places=(await db.query<{id:string;name:string}>("SELECT id,name FROM scribe_room_versions WHERE room_id::text LIKE '06900000-%' ORDER BY name")).rows;
    assert.equal(places.length,3);
    assert.deepEqual(places.map(p=>p.name),['Anmeldung / Empfang','Ohne festen Ort / nachträgliche Dokumentation','Röntgen']);
    for(const place of places) await db.query('INSERT INTO doku_eintraege(zimmer_version_id) VALUES($1)',[place.id]);
    await db.exec(await readFile('docs/reports/scribe-activity-locations-069-rollback.sql','utf8'));
    await db.exec(await readFile('docs/reports/scribe-activity-locations-069-rollback.sql','utf8'));
    for(const place of places){
      await assert.rejects(db.query('INSERT INTO doku_eintraege(zimmer_version_id) VALUES($1)',[place.id]),/Zimmerliste geändert/);
      await db.query("UPDATE doku_eintraege SET status='bestaetigt' WHERE zimmer_version_id=$1",[place.id]);
    }
    await db.exec(await readFile('docs/reports/scribe-rooms-068-rollback.sql','utf8'));
    await db.exec('INSERT INTO doku_eintraege DEFAULT VALUES');
    assert.equal((await db.query('SELECT zimmer_version_id FROM doku_eintrag_versionen')).rows[0].zimmer_version_id,room.id);
  } finally {await db.close();}
});
