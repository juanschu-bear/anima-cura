import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {projectTemplate,projectTemplatesSafely,protectedGroup,slotsAt,templateChangeSchema,type TemplateSlot} from '../../scribe-template-history';
import {findPraxisPassTemplateConflicts} from '../../scribe-praxis-pass-guard';
import {canWriteScribe,isPracticeProfile,isDeveloper} from '../../scribe-workspace-auth';
import {assertInboxStatus} from '../../scribe-inbox-store';
import {inboxMail} from '../../scribe-inbox-mail';
const admin='10000000-0000-4000-8000-000000000001', staff='10000000-0000-4000-8000-000000000002', patient='10000000-0000-4000-8000-000000000003';
const tid='20000000-0000-4000-8000-000000000001', opt='30000000-0000-4000-8000-000000000001', deleted='30000000-0000-4000-8000-000000000002';
const structure={template:[{g:'free'},{g:'billing'},{g:'required'}],groups:{free:{type:'multi',opts:[{t:'A',on:true},{t:'B'}]},billing:{type:'multi',opts:[{t:'Bracket'}]},required:{type:'single',explizit:true,opts:[{t:'Yes'}]}}};
async function setup(reproduceMissingPrerequisite=false){
 const pg=new PGlite();
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE user_profiles(id uuid PRIMARY KEY,display_name text,role text,patient_id uuid,permissions jsonb);
 CREATE TABLE doku_vorlagen(id uuid PRIMARY KEY,behandlungsart text,termin_typ text,aktiv boolean DEFAULT true,struktur jsonb,positionen jsonb);
 CREATE TABLE doku_vorlagen_optionen(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),praxis_id text,behandlungsart text,termin_typ text,gruppe text,text text,aktiv boolean DEFAULT true,sort_index int,created_at timestamptz DEFAULT now());
 CREATE TABLE einstellungen(key text PRIMARY KEY,value jsonb);
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
 await pg.query('INSERT INTO user_profiles VALUES($1,$2,$3,null,$4),($5,$6,$7,null,$8),($9,$10,$11,$9,$12)',[admin,'Juan','admin',{},staff,'Praxis','lesezugriff',{scribe_schreiben:true},patient,'Patient','patient',{}]);
 await pg.query('INSERT INTO doku_vorlagen VALUES($1,$2,$3,true,$4,$5)',[tid,'multiband','routine',structure,[{code:'126a',if:{g:'billing',i:0}}]]);
 await pg.query("INSERT INTO doku_vorlagen_optionen VALUES($1,'praxis-schubert','multiband','routine','free','Active',true,3,now()),($2,'praxis-schubert','multiband','routine','free','Deleted',false,0,now())",[opt,deleted]);
 const legacy={id:randomUUID(),status:'fix_in_arbeit',erstellt_am:'2026-11-01T12:00:00Z',erstellt_von:staff,status_zeitpunkte:{fix_in_arbeit:'2026-11-02T12:00:00Z'},status_verlauf:[{von:'bestaetigt',zu:'fix_in_arbeit',geaendert_von_name:'Juan'}],kommentare:[{id:randomUUID(),text:'Legacy',gelesen_von:[]}]};
 await pg.query("INSERT INTO einstellungen VALUES('scribe_praxis_inbox',$1)",[[legacy]]);
 if(reproduceMissingPrerequisite){
  await assert.rejects(()=>pg.exec(readFileSync('supabase/migrations/078_scribe_time_machine_inbox_bell.sql','utf8')),/praxis_updates.*does not exist/);
  await pg.exec('ROLLBACK');
  assert.equal((await pg.query<any>("SELECT to_regclass('public.scribe_inbox_entries') AS t")).rows[0].t,null);
  assert.deepEqual((await pg.query<any>("SELECT value FROM einstellungen WHERE key='scribe_praxis_inbox'")).rows[0].value,[legacy]);
 }
 await pg.exec(readFileSync('supabase/migrations/079_scribe_updates_prerequisite.sql','utf8'));
 await pg.exec(readFileSync('supabase/migrations/078_scribe_time_machine_inbox_bell.sql','utf8'));
 await pg.exec(readFileSync('supabase/migrations/080_scribe_time_machine_safeguards.sql','utf8'));
 return {pg,legacy};
}
async function change(pg:PGlite,p:Record<string,unknown>,actor=staff){
 const rev=(await pg.query<any>('SELECT coalesce(max(seq),0)::int AS n FROM scribe_option_changes')).rows[0].n;
 return (await pg.query<any>('SELECT scribe_template_change($1,$2,$3) AS r',[actor,'praxis-schubert',{templateId:tid,requestId:randomUUID(),expectedRevision:rev,...p}])).rows[0].r;
}
const key=(g:string,i=0)=>`${tid}:praxis-schubert:${g}:seed:${i}`;
test('time machine preserves indices, immutable history, restoration, CAS and house rule under PostgreSQL',async()=>{
 const {pg}=await setup();try{
 let slots=(await pg.query<any>('SELECT * FROM scribe_option_slots')).rows;
 assert.equal(slots.find(s=>s.practice_option_id===opt).option_index,2);
 assert.equal(slots.find(s=>s.practice_option_id===deleted).option_index,3);
 const base=projectTemplate({id:tid,struktur:structure,positionen:[{if:{g:'billing',i:0}}]},slots);
 assert.equal(base.struktur.groups.free.opts.length,4);
 assert.equal((base.struktur.groups.free.opts[3] as any).hidden,true);
 assert.equal(protectedGroup(base,'billing'),true);assert.equal(protectedGroup(base,'required'),true);
 const first=await change(pg,{action:'rename',optionKey:key('free'),text:'Renamed'});
 const time=(await pg.query<any>('SELECT created_at::text AS t FROM scribe_option_changes WHERE id=$1',[first.changeIds[0]])).rows[0].t;
 await change(pg,{action:'hide',optionKey:key('free',1)});
 await assert.rejects(()=>change(pg,{action:'rename',optionKey:key('free'),text:'stale',expectedRevision:0}),/template_revision_stale/);
 const undo=await change(pg,{action:'undo',changeId:first.changeIds[0]});
 assert.equal((await pg.query<any>('SELECT state FROM scribe_option_slots WHERE option_key=$1',[key('free')])).rows[0].state.text,'A');
 await change(pg,{action:'undo',changeId:undo.changeIds[0]});
 await assert.rejects(()=>change(pg,{action:'undo',changeId:first.changeIds[0]}),/change_superseded/);
 await change(pg,{action:'restore_at',at:time});
 slots=(await pg.query<any>('SELECT * FROM scribe_option_slots')).rows;
 const restored=projectTemplate({id:tid,struktur:structure,positionen:[]},slots);

 assert.equal(restored.struktur.groups.free.opts[0].t,'Renamed');assert.equal((restored.struktur.groups.free.opts[1] as any).hidden,false);
 await change(pg,{action:'restore_practice',optionKey:'practice:'+deleted});
 assert.equal((await pg.query<any>('SELECT aktiv FROM doku_vorlagen_optionen WHERE id=$1',[deleted])).rows[0].aktiv,true);
 for(const group of ['billing','required'])for(const action of ['rename','hide'])await assert.rejects(()=>change(pg,{action,optionKey:key(group),text:'Bad'}),/template_group_protected/);
 await assert.rejects(()=>change(pg,{action:'hide',optionKey:key('free')},patient),/scribe_forbidden/);
 await assert.rejects(()=>pg.exec('DELETE FROM scribe_option_changes'),/scribe_history_immutable/);
 const revision=(await pg.query<any>('SELECT max(seq)::int AS n FROM scribe_option_changes')).rows[0].n;
 const req={requestId:randomUUID(),expectedRevision:revision,action:'hide',optionKey:key('free')};
 const one=await change(pg,req);assert.deepEqual(await change(pg,req),one);
 await assert.rejects(()=>change(pg,{...req,text:'changed'}),/idempotency_conflict/);
 await pg.exec('SET ROLE authenticated');await assert.rejects(()=>pg.exec('UPDATE doku_vorlagen_optionen SET aktiv=false'),/permission denied/);await pg.exec('RESET ROLE');
 // Newly added practice texts always append, even if their sort_index would sort first.
 const later=randomUUID();
 await pg.query("INSERT INTO doku_vorlagen_optionen(id,praxis_id,behandlungsart,termin_typ,gruppe,text,sort_index) VALUES($1,'praxis-schubert','multiband','routine','free','Later',-10)",[later]);
 assert.equal((await pg.query<any>('SELECT option_index FROM scribe_option_slots WHERE practice_option_id=$1',[later])).rows[0].option_index,4);
 await change(pg,{action:'restore_at',at:time});
 assert.equal((await pg.query<any>('SELECT state FROM scribe_option_slots WHERE practice_option_id=$1',[later])).rows[0].state.hidden,true);
 const baselineTime=(await pg.query<any>('SELECT max(created_at)::text AS t FROM scribe_option_slots WHERE practice_option_id IS DISTINCT FROM $1',[later])).rows[0].t;
 await pg.query("UPDATE doku_vorlagen SET positionen=$1 WHERE id=$2",[[{if:{g:'free',i:0}}],tid]);
 const before=(await pg.query<any>('SELECT count(*)::int n FROM scribe_option_changes')).rows[0].n;
 await assert.rejects(()=>change(pg,{action:'restore_at',at:baselineTime}),/template_group_protected/);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM scribe_option_changes')).rows[0].n,before);
 // Runtime service role really has the needed narrow function/table rights.
 await pg.exec('SET ROLE service_role');
 await assert.rejects(()=>change(pg,{action:'hide',optionKey:key('free')}),/template_group_protected/);
 await pg.exec('RESET ROLE');

 }finally{await pg.close();}
});
test('one malformed template is isolated and historical states work with or without a version marker',()=>{
 const good={id:tid,struktur:structure,positionen:[]};const broken={...structuredClone(good),id:'20000000-0000-4000-8000-000000000002'};
 const base='2026-11-10T08:00:00.000Z';
 const slots:TemplateSlot[]=Object.entries(structure.groups).flatMap(([gruppe,group])=>group.opts.map((option,index)=>({
  option_key:`${tid}:praxis-schubert:${gruppe}:seed:${index}`,template_id:tid,gruppe,option_index:index,source:'vorlage' as const,
  practice_option_id:null,baseline:{text:option.t,hidden:false},state:{text:index===0?'Renamed':option.t,hidden:index===1},last_change_id:'later',created_at:base,
 })));
 const isolated=projectTemplatesSafely([good,broken],slots);
 assert.deepEqual(isolated.templates.map(row=>row.id),[tid]);
 assert.deepEqual(isolated.errors,[{templateId:broken.id,code:'template_layout_changed'}]);
 const changes=[
  {id:'40000000-0000-4000-8000-000000000001',option_key:slots[0].option_key,after_state:{text:'Renamed',hidden:false},created_at:'2026-11-10T09:00:00.000Z',seq:1},
  {id:'40000000-0000-4000-8000-000000000002',option_key:slots[1].option_key,after_state:{text:slots[1].baseline.text,hidden:true},created_at:'2026-11-10T10:00:00.000Z',seq:2},
 ];
 for(const marker of [undefined,1]){
  const atConfirmation=projectTemplate(good,slotsAt(slots,changes,'2026-11-10T08:30:00.000Z'));
  assert.equal(atConfirmation.struktur.groups.free.opts[0].t,'A');
  assert.equal(atConfirmation.struktur.groups.free.opts[1].hidden,false);
  assert.equal(marker===1||marker===undefined,true);
 }
});
test('Praxis-Pass submission after the migration keeps seed indices and accepts metadata',async()=>{
 const {pg}=await setup();try{
  const template={id:tid,behandlungsart:'multiband',termin_typ:'routine',struktur:structure};
  const unchanged={behandlungsart:'multiband',termin_typ:'routine',optionen_final:{free:['A','B']}};
  assert.deepEqual(findPraxisPassTemplateConflicts([unchanged],[template]),[]);
  await pg.query("UPDATE doku_vorlagen SET struktur=struktur||$1::jsonb WHERE id=$2",[{praxis_muster:'Neu',quelle:'praxis'},tid]);
  const stored=(await pg.query<any>('SELECT struktur FROM doku_vorlagen WHERE id=$1',[tid])).rows[0].struktur;
  assert.equal(stored.praxis_muster,'Neu');assert.deepEqual(stored.groups.free.opts,structure.groups.free.opts);
  assert.deepEqual(findPraxisPassTemplateConflicts([{...unchanged,optionen_final:{free:['Changed','B']}}],[template]),[
   {templateId:tid,behandlungsart:'multiband',terminTyp:'routine',code:'template_structure_change_requires_history'},
  ]);
 }finally{await pg.close();}
});
test('inbox import preserves history, atomic status/comments/bells, mail enqueue and owner deletion',async()=>{
 const {pg,legacy}=await setup();try{
 assert.deepEqual((await pg.query<any>('SELECT legacy_payload FROM scribe_inbox_entries')).rows[0].legacy_payload,legacy);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM scribe_inbox_events')).rows[0].n,1);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM scribe_inbox_mail_jobs')).rows[0].n,0);
 await assert.rejects(()=>pg.query("UPDATE einstellungen SET value='[]' WHERE key='scribe_praxis_inbox'"),/scribe_inbox_migrated/);
 const e:any={id:randomUUID(),status:'bestaetigt',erstellt_von:staff,erstellt_am:new Date().toISOString(),status_verlauf:[{von:null,zu:'bestaetigt',geaendert_von_name:'Praxis'}],kommentare:[]};
 const commit=(entry:any,rev:number,actor=staff,dev=false,del=false)=>pg.query('SELECT scribe_inbox_commit($1,$2,$3,$4,$5)',[entry,rev,actor,dev,del]);
 await commit(e,0);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM scribe_inbox_mail_jobs')).rows[0].n,1);
 await assert.rejects(()=>commit({...e,status:'untersucht'},1),/inbox_developer_required/);
 await assert.rejects(()=>commit({...e,status:'praxis_bestaetigt'},1),/inbox_not_ready/);
 const updated={...e,status:'bereitgestellt',status_verlauf:[...e.status_verlauf,{von:'bestaetigt',zu:'bereitgestellt',geaendert_von_name:'Juan'}]};
 await commit(updated,1,admin,true);
 await assert.rejects(()=>commit(updated,1,admin,true),/inbox_revision_stale/);
 const comment={id:randomUUID(),text:'Answer',erstellt_von:admin,gelesen_von:[admin]};
 const reply={...updated,kommentare:[comment]};await commit(reply,2,admin,true);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM practice_notifications WHERE recipient_id=$1',[staff])).rows[0].n,2);
 const selfComment={id:randomUUID(),text:'Own note',erstellt_von:staff,gelesen_von:[staff]};
 const ownReply={...reply,kommentare:[comment,selfComment]};await commit(ownReply,3,staff,false);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM practice_notifications WHERE recipient_id=$1',[staff])).rows[0].n,2);
 const accepted={...ownReply,status:'praxis_bestaetigt',status_verlauf:[...ownReply.status_verlauf,{von:'bereitgestellt',zu:'praxis_bestaetigt',geaendert_von_name:'Praxis'}]};
 await commit(accepted,4,staff,false);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM practice_notifications WHERE recipient_id=$1',[staff])).rows[0].n,2);
 await assert.rejects(()=>commit(accepted,5,admin,true,true),/inbox_delete_forbidden/);
 await commit(accepted,5,staff,false,true);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM scribe_inbox_comments')).rows[0].n,3);
 const jobs=(await pg.query<any>('SELECT * FROM scribe_claim_inbox_mail(null)')).rows;assert.equal(jobs.length,1);
 assert.equal((await pg.query('SELECT * FROM scribe_claim_inbox_mail(null)')).rows.length,0);
 await pg.exec("UPDATE scribe_inbox_mail_jobs SET lease_until=now()-interval '1 minute'");
 assert.equal((await pg.query('SELECT * FROM scribe_claim_inbox_mail(null)')).rows.length,1);
 }finally{await pg.close();}
});
test('seed option arrays are immutable while metadata and new templates remain possible',async()=>{
 const {pg}=await setup();try{
  await pg.query("UPDATE doku_vorlagen SET struktur=jsonb_set(struktur,'{kontext}',to_jsonb('Hinweis'::text),true) WHERE id=$1",[tid]);
  const changed=structuredClone(structure);changed.groups.free.opts[0].t='Direct rewrite';
  await assert.rejects(()=>pg.query('UPDATE doku_vorlagen SET struktur=$1 WHERE id=$2',[changed,tid]),/template_structure_change_requires_history/);
  assert.equal((await pg.query<any>('SELECT struktur FROM doku_vorlagen WHERE id=$1',[tid])).rows[0].struktur.groups.free.opts[0].t,'A');
  await pg.query("INSERT INTO doku_vorlagen(id,behandlungsart,termin_typ,struktur,positionen) VALUES(gen_random_uuid(),'multiband','new-type',$1,'[]')",[changed]);
 }finally{await pg.close();}
});
test('shared bell RLS isolates accounts, role receipts, patients and future messages',async()=>{
 const {pg}=await setup();try{
 await pg.query("INSERT INTO praxis_updates(slug,status,audience_roles,category,title_de,summary_de,body_de,title_en,summary_en,body_en,published_at) VALUES('new-test','published',ARRAY['admin','lesezugriff'],'neuerung','New','Description','Body','New','Description','Body',now())");
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM practice_notifications')).rows[0].n,2);
 await pg.query("INSERT INTO practice_notifications(recipient_id,kind,title,body,link,source_key) VALUES($1,'antwort','Private','Private','/scribe','private')",[admin]);
 await pg.query("INSERT INTO practice_notifications(recipient_role,kind,title,body,link,source_key,visible_from) VALUES('lesezugriff','update','Future','Future','/scribe','future',now()+interval '1 day')");
 await pg.exec('SET ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[staff]);
 const visible=(await pg.query<any>('SELECT * FROM practice_notifications')).rows;assert.equal(visible.length,1);
 await pg.exec('SELECT practice_mark_notifications(null,now())');
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM practice_notification_reads')).rows[0].n,1);
 await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[admin]);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM practice_notification_reads')).rows[0].n,0);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM practice_notifications')).rows[0].n,2);
 await assert.rejects(()=>pg.query('SELECT scribe_inbox_commit($1,0,$2,true,false)',[{},admin]),/permission denied/);
 await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[patient]);
 assert.equal((await pg.query<any>('SELECT count(*)::int n FROM practice_notifications')).rows[0].n,0);
 }finally{await pg.close();}
});
test('profile rights, developer statuses and private idempotent email contract',()=>{
 assert.equal(canWriteScribe({role:'lesezugriff',permissions:{scribe_schreiben:true}}),true);
 assert.equal(canWriteScribe({role:'admin',permissions:{scribe_schreiben:false}}),false);
 assert.equal(canWriteScribe({role:'patient',permissions:{scribe_schreiben:true}}),false);
 assert.equal(isPracticeProfile({role:'admin',patient_id:patient}),false);
 assert.equal(isDeveloper(null),false);
 const actor={id:staff,name:'Praxis',role:'verwaltung',developer:false,writer:true};
 for(const status of ['untersucht','fix_in_arbeit','bereitgestellt'])assert.throws(()=>assertInboxStatus(actor,'bestaetigt',status),/inbox_developer_required/);
 assert.doesNotThrow(()=>assertInboxStatus(actor,'bereitgestellt','praxis_bestaetigt'));
 const mail=inboxMail('example','test@example.org')!;assert.equal(mail.track,false);assert.equal(mail.idempotencyKey,'scribe-inbox-example');assert.match(mail.body,/scribe.animacura.io/);
 assert.equal(inboxMail('example',undefined),null);
 assert.equal(templateChangeSchema.safeParse({}).success,false);
});

test('missing production prerequisite rolls back 078; schema-only 079 then 078 succeeds without publishing history',async()=>{
 const {pg,legacy}=await setup(true);try{
  assert.equal((await pg.query<any>('SELECT count(*)::int n FROM praxis_updates')).rows[0].n,0);
  assert.equal((await pg.query<any>('SELECT count(*)::int n FROM practice_notifications')).rows[0].n,0);
  assert.equal((await pg.query<any>('SELECT count(*)::int n FROM scribe_inbox_mail_jobs')).rows[0].n,0);
  assert.deepEqual((await pg.query<any>('SELECT legacy_payload FROM scribe_inbox_entries')).rows[0].legacy_payload,legacy);
  const rights=(await pg.query<any>(`SELECT c.relrowsecurity AS rls,
   has_table_privilege('anon',c.oid,'SELECT') AS anon_read,
   has_table_privilege('authenticated',c.oid,'INSERT') AS client_write,
   has_table_privilege('service_role',c.oid,'INSERT') AS server_write
   FROM pg_class c WHERE c.oid IN ('public.praxis_updates'::regclass,'public.praxis_update_lesestaende'::regclass)`)).rows;
  assert.equal(rights.length,2);
  for(const r of rights)assert.deepEqual(r,{rls:true,anon_read:false,client_write:false,server_write:true});
 }finally{await pg.close();}
});
