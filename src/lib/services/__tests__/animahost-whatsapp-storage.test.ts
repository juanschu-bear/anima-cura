import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration=readFileSync(new URL('../../../../supabase/migrations/087_animahost_whatsapp_rulebook.sql',import.meta.url),'utf8');
const tenant='0514a140-e570-4c10-a5c1-838a2cfd1d12';
const actor='11111111-1111-4111-8111-111111111111';

test('rulebooks are versioned, immutable, and not publicly readable',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec(migration);
  const first=await db.query<{animahost_whatsapp_publish_rules:number}>(
   'SELECT animahost_whatsapp_publish_rules($1,$2,$3,$4)',[tenant,null,JSON.stringify([{id:'termin',topic:'Doctolib',keywords:['Termin'],action:'antworten',patientText:'Termine über Doctolib.'}]),actor]);
  assert.equal(first.rows[0].animahost_whatsapp_publish_rules,1);
  await assert.rejects(()=>db.query('SELECT animahost_whatsapp_publish_rules($1,$2,$3,$4)',
   [tenant,null,'[]',actor]),/animahost_rulebook_stale/);
  await assert.rejects(()=>db.query('UPDATE animahost_whatsapp_rulebook_versions SET rules=$1 WHERE tenant_id=$2',
   ['[]',tenant]),/animahost_history_immutable/);
  await db.exec('SET ROLE anon');
  await assert.rejects(()=>db.query('SELECT * FROM animahost_whatsapp_settings'),/permission denied/);
 }finally{await db.close();}
});

test('self-service SQL aborts in the wrong project and keeps codes and mail jobs server-only',async()=>{
 const files=['091_animahost_whatsapp_closures.sql','092_animahost_whatsapp_access_reissues.sql','093_animahost_attendance_certificates.sql'];
 const migrations=files.map(name=>readFileSync(new URL(`../../../../supabase/migrations/${name}`,import.meta.url),'utf8'));
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  for(const sql of migrations)await assert.rejects(()=>db.exec(sql),/Falsches Projekt/);
  await db.exec('CREATE TABLE patients(id uuid PRIMARY KEY); CREATE TABLE patient_documents(id uuid PRIMARY KEY); CREATE TABLE communication_messages(id uuid); CREATE TABLE doku_tagesdatensaetze(id uuid);');
  await db.exec(migration);
  for(let index=0;index<migrations.length;index++){
   const result=await db.exec(migrations[index]);
   assert.equal((result.at(-1)?.rows[0] as {ergebnis:string}).ergebnis,`${files[index]} eingespielt`);
  }
  const patient='00000000-0000-4000-8000-000000000123';
  await db.query('INSERT INTO patients(id) VALUES($1)',[patient]);
  await db.query('INSERT INTO patient_documents(id) VALUES($1)',[patient]);
  await db.exec('SET ROLE service_role');
  await db.query("INSERT INTO animahost_whatsapp_access_reissues(tenant_id,message_id,patient_id,purpose) VALUES($1,'wamid.test',$2,'activation')",[tenant,patient]);
  await assert.rejects(()=>db.query("INSERT INTO animahost_whatsapp_access_reissues(tenant_id,message_id,patient_id,purpose) VALUES($1,'wamid.test',$2,'recovery')",[tenant,patient]),/duplicate key/);
  await db.query("INSERT INTO animahost_attendance_certificates(document_id,tenant_id,source_message_id,service_date,service_time,verification_hash,evidence,artwork_version) VALUES($1,$2,'wamid.test','2026-11-20','10:05',repeat('a',64),$3,'v1')",[patient,tenant,JSON.stringify({source:'doku_tagesdatensaetze',id:patient})]);
  await assert.rejects(()=>db.query("UPDATE animahost_attendance_certificates SET service_time='10:15'"),/permission denied/);
  await db.query('UPDATE animahost_attendance_certificates SET revoked_at = now()');
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(()=>db.query('SELECT * FROM animahost_attendance_certificates'),/permission denied/);
  await assert.rejects(()=>db.query('SELECT * FROM animahost_whatsapp_access_reissues'),/permission denied/);
 }finally{await db.close();}
});
