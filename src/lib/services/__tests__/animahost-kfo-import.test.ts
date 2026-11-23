import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {bundledKfoImport,bundledKfoPreview,parseKfoImport} from '../animahost-kfo-import';
import {activeKnowledge} from '../animahost-knowledge';

const path='docs/animahost/wissensbasis-kfo-v1.json';
const raw=JSON.parse(readFileSync(path,'utf8'));
const {entries}=bundledKfoImport();
const tenant='00000000-0000-4000-8000-000000000001';
const actor='00000000-0000-4000-8000-000000000002';
const patient='00000000-0000-4000-8000-000000000003';
const foreignTenant='00000000-0000-4000-8000-000000000004';
const importSql=readFileSync('supabase/migrations/104_animahost_knowledge_import.sql','utf8');

test('the actual draft preserves every source, optional field and editorial identifier',()=>{
 assert.equal(entries.length,51);
 assert.equal(entries.filter(item=>item.metadata.openQuestion).length,8);
 assert.equal(entries.filter(item=>item.metadata.sourceApprovalNote).length,9);
 assert.equal(new Set(entries.flatMap(item=>item.metadata.sources??[]).map(ref=>ref.key)).size,11);
 assert.equal(entries.filter(item=>item.area==='gespraech').length,4);
 assert.equal(entries.filter(item=>item.source==='offen').length,0);
 assert.equal(entries.find(item=>item.metadata.originalSource==='offen')?.source,'praxis');
 for(const item of raw.eintraege){
  const imported=entries.find(row=>row.externalId===item.id)!;
  assert.equal(imported.metadata.guidance?.selfHelp,item.selbsthilfe);
  assert.equal(imported.metadata.guidance?.practice,item.praxis);
  assert.equal(imported.metadata.guidance?.reception,item.rezeption);
  assert.equal(imported.metadata.guidance?.warningSigns,item.warnzeichen);
  assert.equal(imported.metadata.openQuestion,item.offen??null);
  assert.equal(imported.metadata.sourceApprovalNote,item.freigabe??null);
  assert.deepEqual(imported.metadata.sources?.map(ref=>ref.key),Array.from(new Set(item.quellen??[])));
 }
 const first=entries[0];
 assert.equal(first.metadata.guidance?.reception,raw.eintraege[0].rezeption);
 assert.deepEqual(parseKfoImport({...raw,eintraege:[...raw.eintraege].reverse()}).entries.map(item=>item.id).reverse(),entries.map(item=>item.id));
 assert.throws(()=>parseKfoImport({...raw,eintraege:[...raw.eintraege,raw.eintraege[0]]}),/knowledge_duplicate_external_id/);
 assert.throws(()=>parseKfoImport({...raw,quellen:{}}),/knowledge_reference_missing/);
 const preview=bundledKfoPreview();
 assert.equal(preview.entries.length,51);
 assert.deepEqual(preview.entries.map(item=>item.id),entries.map(item=>item.id));
 assert.ok(preview.entries.every(item=>!('openQuestion' in item)&&!('sourceApprovalNote' in item)));
});

test('atomic import is repeatable, retains approvals and puts open questions in their own list',async()=>{
 const db=new PGlite();
 try{
  await assert.rejects(db.exec(importSql),/Falsches Projekt/);
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE animahost_whatsapp_settings(tenant_id uuid PRIMARY KEY);
   CREATE TABLE animahost_whatsapp_rulebook_versions(id uuid);
   CREATE TABLE patient_access_memberships(id uuid);
   CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text);
   INSERT INTO user_profiles VALUES ('${actor}','verwaltung'),('${patient}','patient');
   INSERT INTO animahost_whatsapp_settings VALUES ('${tenant}'),('${foreignTenant}');`);
  await assert.rejects(db.exec(importSql),/zuerst Migration 103/);
  await db.exec(readFileSync('supabase/migrations/103_animahost_orthodontic_knowledge.sql','utf8'));
  await db.exec(importSql);
  const importDraft=(items=entries,person=actor)=>db.query<{summary:object}>(
   'SELECT public.animahost_import_knowledge($1,$2,$3) AS summary',[tenant,person,JSON.stringify(items)]);
  const questions=(selectedTenant=tenant)=>db.query<any>('SELECT * FROM public.animahost_knowledge_open_questions($1)',[selectedTenant]);
  const active=()=>db.query<{version:number;title:string;guidance:object}>(
   'SELECT version,title,guidance FROM public.animahost_active_knowledge_details($1,$2)',[tenant,'2099-11-23']);
  const open=entries.find(item=>item.metadata.openQuestion)!;
  const change=(expected:number,action:string,payload:unknown=null)=>db.query<any>(
   'SELECT active,approved_at,approved_by,metadata FROM public.animahost_change_knowledge($1,$2,$3,$4,$5,$6)',
   [tenant,open.id,expected,actor,action,payload]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(importDraft(),/permission denied/);
  await assert.rejects(questions(),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE service_role');
  await assert.rejects(importDraft(entries,patient),/knowledge_actor_forbidden/);
  const broken={...entries[50],area:'invented'} as unknown as typeof entries[number];
  await assert.rejects(importDraft([...entries.slice(0,50),broken]),/violates check constraint/);
  assert.equal((await db.query<any>('SELECT count(*) FROM animahost_knowledge_versions')).rows[0].count,0);
  assert.deepEqual((await importDraft()).rows[0].summary,{created:51,revised:0,unchanged:0});
  assert.deepEqual((await importDraft()).rows[0].summary,{created:0,revised:0,unchanged:51});
  assert.equal((await questions()).rows.length,8);
  assert.equal((await questions(foreignTenant)).rows.length,0);
  assert.deepEqual((await active()).rows,[]);
  assert.equal((await db.query<any>('SELECT count(*) FROM animahost_knowledge_versions WHERE active OR approved_at IS NOT NULL OR approved_by IS NOT NULL')).rows[0].count,0);
  const approved=(await change(1,'approve')).rows[0];
  assert.ok(approved.approved_at);
  assert.equal(approved.approved_by,actor);
  assert.equal((await active()).rows[0].version,2);
  assert.deepEqual((await active()).rows[0].guidance,JSON.parse(JSON.stringify(open.metadata.guidance)));
  const updated=entries.map(item=>item.id===open.id?{...item,title:'Überarbeiteter Entwurf'}:item);
  assert.deepEqual((await importDraft(updated)).rows[0].summary,{created:0,revised:1,unchanged:50});
  assert.equal((await active()).rows[0].title,open.title);
  assert.equal((await questions()).rows.find(row=>row.id===open.id)?.version,3);
  await change(3,'draft',{area:open.area,source:open.source,title:'Praxisfassung',content:open.content,
   validFrom:open.validFrom,openQuestion:null});
  assert.deepEqual((await importDraft(updated)).rows[0].summary,{created:0,revised:0,unchanged:51});
  assert.equal((await questions()).rows.length,7);
  await change(4,'approve');
  assert.equal((await active()).rows[0].title,'Praxisfassung');
  await change(5,'deactivate');
  assert.deepEqual((await active()).rows,[]);
  assert.equal((await db.query<any>('SELECT count(*) FROM animahost_knowledge_versions WHERE id=$1',[open.id])).rows[0].count,6);
 }finally{await db.close();}
});

test('live knowledge reads effective records only and never loads the bundled preview',async()=>{
 const calls:string[]=[];
 const db={rpc:async(name:string)=>{calls.push(name);return {data:[],error:null};}} as never;
 assert.deepEqual(await activeKnowledge(db,tenant,'2026-11-23'),{available:true,entries:[]});
 assert.deepEqual(calls,['animahost_active_knowledge_details']);
});
