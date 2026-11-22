import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const first='10000000-0000-4000-8000-000000000001';
const child='10000000-0000-4000-8000-000000000002';
const foreign='10000000-0000-4000-8000-000000000003';
const login='10000000-0000-4000-8000-000000000004';
const document='10000000-0000-4000-8000-000000000005';
const foreignDocument='10000000-0000-4000-8000-000000000006';
const migration=readFileSync('supabase/migrations/099_invoice_portal_visibility.sql','utf8');
const setup=`
 CREATE ROLE authenticated;
 CREATE ROLE anon;
 CREATE ROLE service_role;
 CREATE ROLE abrechnung_runtime;
 CREATE ROLE invoice_installer CREATEROLE NOINHERIT;
 GRANT abrechnung_runtime TO invoice_installer WITH ADMIN TRUE,INHERIT FALSE,SET FALSE;
 CREATE SCHEMA abrechnung;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE public.user_profiles(id uuid PRIMARY KEY,patient_id uuid,role text);
 CREATE TABLE public.patient_access_memberships(user_id uuid,patient_id uuid);
 CREATE TABLE public.invoice_access_contacts(normalized_email text,auth_user_id uuid);
 ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.patient_access_memberships ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.invoice_access_contacts ENABLE ROW LEVEL SECURITY;
 CREATE VIEW abrechnung.source_user_profiles AS SELECT id,patient_id,role FROM public.user_profiles;
 CREATE TABLE abrechnung.active_patient_invoice_documents(id uuid PRIMARY KEY,patient_id uuid,fields jsonb,content bytea);
 CREATE TABLE abrechnung.verified_invoice_editions(part_id uuid PRIMARY KEY,content bytea);
 CREATE TABLE abrechnung.invoice_edition_settings(revision integer,enabled boolean);
 CREATE FUNCTION public.animahost_imported_invoice_documents(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '[]'::jsonb$$;
 GRANT USAGE ON SCHEMA abrechnung TO abrechnung_runtime;
 GRANT SELECT ON public.patient_access_memberships,public.invoice_access_contacts TO abrechnung_runtime;
 GRANT SELECT ON ALL TABLES IN SCHEMA abrechnung TO abrechnung_runtime;
 GRANT CREATE ON SCHEMA public TO abrechnung_runtime;
 SET ROLE abrechnung_runtime;
 CREATE FUNCTION public.patient_invoice_documents_for_access() RETURNS jsonb LANGUAGE sql AS $$SELECT null::jsonb$$;
 CREATE FUNCTION public.patient_invoice_document_edition(document_id uuid, original_only boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $$SELECT null::jsonb$$;
 CREATE FUNCTION public.patient_invoice_document_pdf(document_id uuid) RETURNS text LANGUAGE sql AS $$SELECT null::text$$;
 CREATE FUNCTION public.patient_invoice_document_pdf_for_access(document_id uuid) RETURNS text LANGUAGE sql AS $$SELECT null::text$$;
 CREATE FUNCTION public.patient_invoice_document_editions() RETURNS jsonb LANGUAGE sql AS $$SELECT null::jsonb$$;
 REVOKE ALL ON FUNCTION public.patient_invoice_documents_for_access(),public.patient_invoice_document_pdf_for_access(uuid),public.patient_invoice_document_editions(),public.patient_invoice_document_edition(uuid,boolean),public.patient_invoice_document_pdf(uuid) FROM PUBLIC,anon,service_role;
 GRANT EXECUTE ON FUNCTION public.patient_invoice_documents_for_access(),public.patient_invoice_document_pdf_for_access(uuid),public.patient_invoice_document_editions(),public.patient_invoice_document_edition(uuid,boolean),public.patient_invoice_document_pdf(uuid) TO authenticated;
 RESET ROLE;
 REVOKE CREATE ON SCHEMA public FROM abrechnung_runtime;
 INSERT INTO public.user_profiles VALUES ('${login}','${first}','patient');
 INSERT INTO public.patient_access_memberships VALUES ('${login}','${child}');
 INSERT INTO abrechnung.active_patient_invoice_documents VALUES
 ('${document}','${child}','{"date":"2026-09-30","invoiceNumber":"TEST-01"}',convert_to('%PDF- original','UTF8')),
 ('${foreignDocument}','${foreign}','{"date":"2026-09-30","invoiceNumber":"TEST-02"}',convert_to('%PDF- foreign','UTF8'));
 INSERT INTO abrechnung.verified_invoice_editions VALUES ('${document}',convert_to('%PDF- typeset','UTF8'));
 INSERT INTO abrechnung.invoice_edition_settings VALUES (1,true);
`;

test('invoice listing, edition, original and dispatch use exactly the same patient membership',async()=>{
 const db=new PGlite();
 try{
  await assert.rejects(db.exec(migration),/Falsches Projekt/);
  await db.exec(setup);
  await db.exec(`GRANT ALL ON SCHEMA public,abrechnung TO invoice_installer WITH GRANT OPTION;
   GRANT SELECT ON public.patient_access_memberships,public.invoice_access_contacts TO invoice_installer;
   CREATE POLICY fixture_memberships ON public.patient_access_memberships FOR SELECT TO invoice_installer USING(true);
   CREATE POLICY fixture_contacts ON public.invoice_access_contacts FOR SELECT TO invoice_installer USING(true);
   SET ROLE invoice_installer;`);
  await db.exec(migration.replace("current_user<>'postgres'","current_user<>'invoice_installer'"));
  await db.exec('RESET ROLE;');
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${login}',false);`);
  const [view]=(await db.query(`SELECT public.patient_invoice_documents_for_access() AS docs,
   public.patient_invoice_document_edition('${document}',false) AS edition,
   public.patient_invoice_document_pdf('${document}') AS original,
   public.patient_invoice_document_edition('${foreignDocument}',false) AS foreign`)).rows as Array<{
    docs:{id:string}[];edition:{edition:string;pdf:string};original:string;foreign:null;
   }>;
  assert.deepEqual(view.docs.map(x=>x.id),[document]);
  assert.equal(view.edition.edition,'typeset');
  assert.match(Buffer.from(view.edition.pdf,'base64').toString(),/^%PDF-/);
  assert.equal(Buffer.from(view.original,'base64').toString(),'%PDF- original');
  assert.equal(view.foreign,null);
  await assert.rejects(db.query("SELECT public.invoice_portal_delivery_preflight('[]')"),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE service_role;');
  assert.deepEqual((await db.query(`SELECT public.animahost_invoice_portal_visibility('${child}',NULL,NULL) AS result`)).rows,
   [{result:{cause:'already_available',invoiceDate:'2026-09-30'}}]);
  assert.deepEqual((await db.query(`SELECT public.animahost_invoice_portal_visibility('${foreign}',NULL,NULL) AS result`)).rows,
   [{result:{cause:'manual_review',invoiceDate:null}}]);
  await db.exec('RESET ROLE;');
  assert.deepEqual((await db.query(`SELECT has_schema_privilege('abrechnung_runtime','public','CREATE') AS can_create`)).rows,[{can_create:false}]);
 }finally{await db.close();}
});
