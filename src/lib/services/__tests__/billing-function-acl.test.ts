import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('function ACL migrations: explicit defaults, inherited access, fail-closed discovery',async t=>{
 const db=new PGlite();
 try{
  const manifest=JSON.parse(await readFile('docs/reports/function-acl-2026-10-26-manifest.json','utf8')) as {manifest:Array<{name:string;signature:string;before:Array<{grantee:string}>;after:Array<{grantee:string}>}>};
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE abrechnung_runtime NOLOGIN NOINHERIT;
   CREATE ROLE supabase_admin SUPERUSER;REVOKE CREATE ON SCHEMA public FROM PUBLIC;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
   CREATE TABLE synthetic_acl_rows(id integer);`);
  for(const f of manifest.manifest){
   await db.exec(`CREATE FUNCTION ${f.signature} RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;REVOKE ALL ON FUNCTION ${f.signature} FROM PUBLIC,anon,authenticated,service_role;`);
   for(const a of f.before)await db.exec(`GRANT EXECUTE ON FUNCTION ${f.signature} TO ${a.grantee==='PUBLIC'?'PUBLIC':'"'+a.grantee+'"'};`);
  }
  const migration=await readFile('supabase/migrations/062_function_execution_hardening.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  for(const f of manifest.manifest){
   for(const role of ['anon','authenticated','service_role','abrechnung_runtime']){
    const {rows:[r]}=await db.query<{allowed:boolean}>(`SELECT has_function_privilege($1,p.oid,'EXECUTE') AS allowed FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=$2`,[role,f.name]);
    assert.equal(r.allowed,f.after.some(a=>a.grantee===role),role+':'+f.name);
   }
  }
  await db.exec(await readFile('supabase/migrations/063_explicit_function_defaults_and_audit.sql','utf8'));
  const audit=async()=> (await db.query<{report:{ok:boolean;violations:Array<{reason:string}>;default_violations:unknown[];platform_default_warnings:unknown[]}}>('SELECT function_acl_audit() AS report')).rows[0].report;
  await t.test('baseline audit is healthy, platform defaults remain explicitly visible',async()=>{
   const r=await audit();assert.equal(r.ok,true);assert.equal(r.default_violations.length,0);assert.ok(r.platform_default_warnings.length>0);
  });
  await t.test('new functions have no implicit public, anon, authenticated or service execution',async()=>{
   await db.exec(`CREATE FUNCTION new_writer() RETURNS void LANGUAGE sql AS $$ INSERT INTO synthetic_acl_rows VALUES(1) $$;`);
   for(const role of ['anon','authenticated','service_role','abrechnung_runtime'])assert.equal((await db.query<{allowed:boolean}>(`SELECT has_function_privilege($1,'new_writer()','EXECUTE') AS allowed`,[role])).rows[0].allowed,false);
   assert.equal((await audit()).ok,true);
  });
  await t.test('new PUBLIC writer and unreviewed wrappers fail the audit',async()=>{
   await db.exec('GRANT EXECUTE ON FUNCTION new_writer() TO PUBLIC');
   assert.ok((await audit()).violations.some(v=>v.reason==='public_unreviewed_execution'));
   await db.exec('REVOKE EXECUTE ON FUNCTION new_writer() FROM PUBLIC');
   await db.exec(`CREATE FUNCTION innocent_name() RETURNS integer LANGUAGE plpgsql AS $$ BEGIN PERFORM new_writer();RETURN 1;END $$;GRANT EXECUTE ON FUNCTION innocent_name() TO PUBLIC;`);
   assert.equal((await audit()).ok,false);
   await db.exec('REVOKE EXECUTE ON FUNCTION innocent_name() FROM PUBLIC');
  });
  await t.test('module direct grants and role inheritance cannot bypass the audit',async()=>{
   await db.exec('GRANT EXECUTE ON FUNCTION new_writer() TO abrechnung_runtime');assert.equal((await audit()).ok,false);
   await db.exec('REVOKE EXECUTE ON FUNCTION new_writer() FROM abrechnung_runtime;GRANT service_role TO abrechnung_runtime');assert.equal((await audit()).ok,false);
   await db.exec('REVOKE service_role FROM abrechnung_runtime');assert.equal((await audit()).ok,true);
  });
  await t.test('unreviewed replacements of known read-only names fail closed',async()=>{
   await db.exec(`CREATE FUNCTION ac_norm(t text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN PERFORM new_writer();RETURN t;END $$;GRANT EXECUTE ON FUNCTION ac_norm(text) TO PUBLIC;`);
   assert.equal((await audit()).ok,false);await db.exec('REVOKE EXECUTE ON FUNCTION ac_norm(text) FROM PUBLIC');
  });
  await t.test('audit itself is service-only and reopening defaults is detected',async()=>{
   await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT function_acl_audit()'),/permission denied/);await db.exec('RESET ROLE');
   await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated');
   assert.equal((await audit()).ok,false);
  });
 }finally{await db.close();}
});
