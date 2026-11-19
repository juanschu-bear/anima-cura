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
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
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
