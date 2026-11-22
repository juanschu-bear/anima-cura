import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const name='patient-invoice-auth-'+randomUUID().slice(0,8);let container;
const psql=(sql,user='postgres')=>spawnSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-At','-U',user,'-d','test'],{input:sql,encoding:'utf8'});
const run=(sql,user)=>{const r=psql(sql,user);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const session=(user,sql)=>`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','${JSON.stringify({sub:id(user),role:'authenticated'})}',true); ${sql} ROLLBACK;`;
const migration=readFileSync('supabase/migrations/099_invoice_portal_visibility.sql','utf8');
try{
 container=execFileSync('docker',['run','--detach','--rm','--network','none','--memory','512m','--name',name,'--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','POSTGRES_USER=test_root','--env','POSTGRES_DB=test','postgres:17.6-alpine'],{encoding:'utf8'}).trim();
 let ready=false;for(let i=0;i<40;i++){if(spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','test_root','-d','test'],{stdio:'ignore'}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 run(`CREATE ROLE postgres LOGIN CREATEROLE NOSUPERUSER; ALTER DATABASE test OWNER TO postgres;
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE abrechnung_runtime; GRANT authenticated TO postgres;
 GRANT abrechnung_runtime TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
 CREATE SCHEMA auth AUTHORIZATION postgres; CREATE SCHEMA abrechnung AUTHORIZATION postgres;
 GRANT USAGE,CREATE ON SCHEMA public TO postgres; SET ROLE postgres;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;`,'test_root');
 const wrong=psql(migration);assert.notEqual(wrong.status,0);assert.match(wrong.stderr,/Falsches Projekt/);
 run(`CREATE TABLE public.user_profiles(id uuid,patient_id uuid,role text);
 CREATE TABLE public.patient_access_memberships(user_id uuid,patient_id uuid);
 CREATE TABLE public.invoice_access_contacts(id uuid,normalized_email text,auth_user_id uuid); CREATE TABLE public.animahost_whatsapp_chat_preferences(id uuid);
 CREATE VIEW abrechnung.source_user_profiles AS SELECT * FROM public.user_profiles;
 CREATE TABLE abrechnung.source_offene_posten(id uuid,patient_id uuid,rechnung_nr text);
 CREATE TABLE abrechnung.active_patient_invoice_documents(id uuid,patient_id uuid,fields jsonb,content bytea,invoice_key text);
 CREATE TABLE abrechnung.verified_invoice_editions(part_id uuid,content bytea);
 CREATE TABLE abrechnung.invoice_edition_settings(revision int,enabled boolean);
 GRANT USAGE ON SCHEMA abrechnung TO abrechnung_runtime;
 GRANT SELECT ON ALL TABLES IN SCHEMA abrechnung TO abrechnung_runtime;
 GRANT SELECT ON public.user_profiles,public.patient_access_memberships TO abrechnung_runtime;
 ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
 GRANT abrechnung_runtime TO CURRENT_USER WITH SET TRUE; GRANT CREATE ON SCHEMA public TO abrechnung_runtime;`);
 const imported=readFileSync('supabase/migrations/098_animahost_invoice_documents.sql','utf8').match(/EXECUTE \$ddl\$(CREATE FUNCTION[\s\S]*?)\$ddl\$;/)[1];
 run(imported);
 run('REVOKE ALL ON FUNCTION public.animahost_imported_invoice_documents(uuid,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.animahost_imported_invoice_documents(uuid,uuid) TO service_role; ALTER FUNCTION public.animahost_imported_invoice_documents(uuid,uuid) OWNER TO abrechnung_runtime;');
 run(readFileSync('scripts/fixtures/patient-invoice-rpcs.sql','utf8'));
 const signatures=['patient_invoice_documents()','patient_invoice_documents_for_access()','patient_invoice_document_editions()','patient_invoice_document_edition(uuid,boolean)','patient_invoice_document_pdf(uuid)','patient_invoice_document_pdf_for_access(uuid)'];
 for(const fn of signatures)run(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC,anon,service_role; GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated; ALTER FUNCTION public.${fn} OWNER TO abrechnung_runtime;`);
 run('REVOKE CREATE ON SCHEMA public FROM abrechnung_runtime; REVOKE abrechnung_runtime FROM CURRENT_USER GRANTED BY CURRENT_USER;');
 const audit=readFileSync('supabase/migrations/082_function_audit_reviewed_module_access.sql','utf8');
 run(audit.slice(audit.indexOf('CREATE OR REPLACE FUNCTION'),audit.indexOf('-- Fail closed:')));
 // Three synthetic account types plus an unrelated patient and a nonpatient account.
 run(`INSERT INTO public.user_profiles VALUES ('${id(1)}','${id(101)}','patient'),('${id(2)}','${id(102)}','patient'),('${id(3)}','${id(104)}','patient'),('${id(4)}','${id(105)}','patient'),('${id(5)}','${id(101)}','admin'),('${id(6)}','${id(107)}','patient');
 INSERT INTO public.patient_access_memberships VALUES ('${id(2)}','${id(103)}'),('${id(3)}','${id(106)}'),('${id(6)}','${id(108)}');
 INSERT INTO abrechnung.active_patient_invoice_documents SELECT ('00000000-0000-4000-8000-'||lpad((n+1000)::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 jsonb_build_object('invoiceNumber',n::text,'date','2026-11-01','ivoris',jsonb_build_object('lines','[]'::jsonb,'reasons','[]'::jsonb)),convert_to('%PDF-1.7 synthetic test','UTF8'),n::text FROM generate_series(101,108) n WHERE n<>104;`);
 run(`ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.patient_access_memberships ENABLE ROW LEVEL SECURITY; ALTER TABLE public.invoice_access_contacts ENABLE ROW LEVEL SECURITY;
 INSERT INTO abrechnung.verified_invoice_editions SELECT id,convert_to('%PDF-1.7 typeset test','UTF8') FROM abrechnung.active_patient_invoice_documents;
 INSERT INTO abrechnung.invoice_edition_settings VALUES (1,true);`);
 assert.equal(run("SELECT has_schema_privilege('abrechnung_runtime','auth','USAGE')"),'f');
 for(const fn of signatures){const args=fn.includes('uuid,boolean')?`'${id(1101)}',false`:fn.includes('uuid')?`'${id(1101)}'`:'';const result=psql(session(1,`SELECT public.${fn.split('(')[0]}(${args});`));assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied for schema auth/);}
 console.log('Before repair: all six RPCs reproduce schema-auth denial as authenticated.');

 run(migration);
 if(process.argv.includes('--fingerprints'))console.log(run("SELECT proname,md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname LIKE 'patient_invoice_%' OR proname LIKE 'invoice_portal_%' OR proname LIKE 'animahost_%' ORDER BY proname"));
 if(process.argv.includes('--fingerprints'))process.exitCode=0;
 else {
 run(readFileSync('supabase/migrations/100_invoice_portal_function_audit.sql','utf8'));
 run(readFileSync('supabase/migrations/100_invoice_portal_function_audit.sql','utf8'));
 for(const [user,patients] of [[1,[101]],[2,[102,103]],[3,[106]],[6,[107,108]]]){
  const sql=`DO $check$ DECLARE docs jsonb; d jsonb; pdf text; BEGIN
  docs := public.patient_invoice_documents_for_access();
  IF jsonb_array_length(docs)<>${patients.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(docs) AS item(value) WHERE item.value->>'patientId' NOT IN (${patients.map(n=>`'${id(n)}'`).join(',')})) THEN RAISE EXCEPTION 'wrong patient scope'; END IF;
  PERFORM public.patient_invoice_documents();
  IF jsonb_array_length(public.patient_invoice_document_editions())<>jsonb_array_length(docs) THEN RAISE EXCEPTION 'edition scope mismatch'; END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(docs) LOOP
   IF public.patient_invoice_document_edition((d->>'id')::uuid,false)->>'edition'<>'typeset' THEN RAISE EXCEPTION 'typeset missing'; END IF;
   pdf := public.patient_invoice_document_edition((d->>'id')::uuid,false)->>'pdf';
   IF pdf IS NULL THEN pdf := public.patient_invoice_document_pdf((d->>'id')::uuid); END IF;
   IF pdf IS NULL OR left(convert_from(decode(pdf,'base64'),'UTF8'),5)<>'%PDF-' THEN RAISE EXCEPTION 'PDF missing'; END IF;
   IF public.patient_invoice_document_pdf_for_access((d->>'id')::uuid) IS DISTINCT FROM public.patient_invoice_document_pdf((d->>'id')::uuid) THEN RAISE EXCEPTION 'PDF access differs'; END IF;
  END LOOP;
  IF public.patient_invoice_document_pdf('${id(1105)}') IS NOT NULL OR public.patient_invoice_document_edition('${id(1105)}',false) IS NOT NULL THEN RAISE EXCEPTION 'foreign PDF leak'; END IF;
  END $check$;`;
  run(session(user,sql));
 }
 // Compare dispatch preflight with real authenticated calls, including a distinct second family.
 const targets=[[1,101,1101],[2,103,1103],[3,106,1106],[6,108,1108],[1,105,1105],[1,101,9999]]
  .map(([a,p,d])=>({account_id:id(a),patient_id:id(p),document_id:id(d)}));
 targets.push({account_id:null,patient_id:id(101),document_id:id(1101)});
 const preflight=JSON.parse(run(`SET ROLE abrechnung_runtime; SELECT jsonb_agg(status ORDER BY status) FROM public.invoice_portal_delivery_preflight('${JSON.stringify(targets)}'); RESET ROLE;`,'test_root').split('\n').find(line=>line.startsWith('[')));
 assert.deepEqual(preflight,['account_scope_mismatch','document_inactive','no_account','visible','visible','visible','visible']);
 const visibility=run(`SET ROLE service_role; SELECT public.animahost_invoice_portal_visibility('${id(106)}',NULL,NULL)->>'cause'; RESET ROLE;`,'test_root');
 assert.ok(visibility.includes('already_available'));
 for(const role of ['authenticated','anon','service_role'])assert.notEqual(psql(`SET ROLE ${role}; SELECT * FROM public.invoice_portal_delivery_preflight('[]');`,'test_root').status,0);
 for(const role of ['authenticated','anon'])assert.notEqual(psql(`SET ROLE ${role}; SELECT public.animahost_invoice_portal_visibility('${id(106)}',NULL,NULL);`,'test_root').status,0);
 run(`UPDATE abrechnung.verified_invoice_editions SET content=convert_to('broken','UTF8') WHERE part_id='${id(1106)}';`);
 assert.ok(run(session(3,`SELECT public.patient_invoice_document_edition('${id(1106)}',false)->>'edition';`)).includes('original'));
 run(`UPDATE abrechnung.active_patient_invoice_documents SET content=convert_to('broken','UTF8') WHERE id='${id(1106)}';`);
 assert.ok(run(`SET ROLE abrechnung_runtime; SELECT status FROM public.invoice_portal_delivery_preflight('[{"account_id":"${id(3)}","patient_id":"${id(106)}","document_id":"${id(1106)}"}]'); RESET ROLE;`,'test_root').includes('pdf_unavailable'));
 assert.ok(run(`SET ROLE service_role; SELECT public.animahost_invoice_portal_visibility('${id(106)}',NULL,NULL)->>'cause'; RESET ROLE;`,'test_root').includes('manual_review'));
 for(const claims of ['{}',JSON.stringify({sub:id(5)}),JSON.stringify({sub:'invalid'})]){const r=psql(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','${claims}',true); SELECT public.patient_invoice_documents_for_access(); ROLLBACK;`);assert.notEqual(r.status,0);}
 assert.equal(run("SELECT has_schema_privilege('abrechnung_runtime','auth','USAGE') OR has_schema_privilege('abrechnung_runtime','public','CREATE')"),'f');
 for(const fn of signatures)assert.equal(run(`SELECT has_function_privilege('authenticated','public.${fn}','EXECUTE') AND NOT has_function_privilege('anon','public.${fn}','EXECUTE') AND NOT has_function_privilege('service_role','public.${fn}','EXECUTE')`),'t');
 assert.equal(run("SELECT count(*) FROM jsonb_array_elements(public.function_acl_audit()->'violations') v WHERE v->>'signature' LIKE 'public.patient_invoice_%' OR v->>'signature' LIKE 'public.invoice_portal_%' OR v->>'signature' LIKE 'public.animahost%invoice%'"),'0');
 run("GRANT abrechnung_runtime TO CURRENT_USER WITH SET TRUE; GRANT CREATE ON SCHEMA public TO abrechnung_runtime; SET ROLE abrechnung_runtime; CREATE OR REPLACE FUNCTION public.patient_invoice_documents() RETURNS jsonb LANGUAGE sql AS $$ SELECT '[]'::jsonb $$; RESET ROLE; REVOKE CREATE ON SCHEMA public FROM abrechnung_runtime; REVOKE abrechnung_runtime FROM CURRENT_USER GRANTED BY CURRENT_USER;");
 const drift=psql(readFileSync('supabase/migrations/100_invoice_portal_function_audit.sql','utf8'));assert.notEqual(drift.status,0);assert.match(drift.stderr,/Ungeprüfte Funktionsdefinition/);
 assert.equal(run("SELECT has_schema_privilege('abrechnung_runtime','public','CREATE')"),'f');
 console.log('PASS: four distinct accounts (single, two families, membership-only invoice), RLS, typeset + original, preflight and AnimaHost failure checks, foreign denial, no claims, wrong role, malformed JWT, twelve audited functions, ACL preservation, repeat install and atomic drift rollback.');
 }
}finally{if(container)execFileSync('docker',['stop','--time','2',container],{stdio:'ignore'});}
