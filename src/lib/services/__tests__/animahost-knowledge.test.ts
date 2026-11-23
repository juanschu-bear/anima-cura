import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const tenant='00000000-0000-4000-8000-000000000001';
const actor='00000000-0000-4000-8000-000000000002';
const patient='00000000-0000-4000-8000-000000000003';
const entry='00000000-0000-4000-8000-000000000004';
const sql=readFileSync('supabase/migrations/103_animahost_orthodontic_knowledge.sql','utf8');

test('knowledge history is append only, limited to practice actors and read only when approved and effective',async()=>{
 const db=new PGlite();
 try{
  await assert.rejects(db.exec(sql),/Falsches Projekt/);
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE animahost_whatsapp_settings(tenant_id uuid PRIMARY KEY);
   CREATE TABLE animahost_whatsapp_rulebook_versions(id uuid);
   CREATE TABLE patient_access_memberships(id uuid);
   CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text);
   INSERT INTO user_profiles VALUES ('${actor}','verwaltung'),('${patient}','patient');
   INSERT INTO animahost_whatsapp_settings VALUES ('${tenant}');`);
  await db.exec(sql);
  const change=(version:number,by:string,action:string,data:object|null=null)=>db.query(
   'SELECT version FROM public.animahost_change_knowledge($1,$2,$3,$4,$5,$6)',[tenant,entry,version,by,action,data]);
  const active=(date='2099-12-01')=>db.query('SELECT version,title FROM public.animahost_active_knowledge($1,$2) ORDER BY version',[tenant,date]);
  const draft={title:'Hinweis',area:'praxisablauf',content:'Ein Hinweis zum Empfang.',source:'praxis',validFrom:'2026-01-01'};
  await db.exec('SET ROLE authenticated');
  await assert.rejects(active(),/permission denied/);
  await assert.rejects(change(0,actor,'draft',draft),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE service_role');
  await assert.rejects(change(0,patient,'draft',draft),/knowledge_actor_forbidden/);
  assert.deepEqual((await change(0,actor,'draft',draft)).rows,[{version:1}]);
  assert.deepEqual((await active()).rows,[]);
  assert.deepEqual((await change(1,actor,'approve')).rows,[{version:2}]);
  await assert.rejects(change(1,actor,'draft',draft),/knowledge_version_conflict/);
  await change(2,actor,'draft',{...draft,title:'Später',validFrom:'2099-11-01'});
  assert.deepEqual((await active()).rows,[{version:2,title:'Hinweis'}]);
  await change(3,actor,'approve');
  assert.deepEqual((await active('2026-11-23')).rows,[{version:2,title:'Hinweis'}]);
  assert.deepEqual((await active()).rows,[{version:4,title:'Später'}]);
  await change(4,actor,'deactivate');
  assert.deepEqual((await active()).rows,[]);
  await assert.rejects(db.exec('UPDATE public.animahost_knowledge_versions SET title=\'overwrite\''),/permission denied/);
 }finally{await db.close();}
});
