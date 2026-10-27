import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {dispatchAnimaSign} from '../animasign-workflow-dispatch';

const req=(suffix='',headers:Record<string,string>={})=>new Request('https://example.com/api/cron/animasign-dispatch'+suffix,{headers:{authorization:'Bearer synthetic-secret','user-agent':'vercel-cron/1.0',...headers}});
test('dispatch requires configured secret, cron request, empty inputs and production; no token leakage',async()=>{
 const deps={secret:'synthetic-secret',token:'synthetic-token',environment:'production',fetch:async()=>{throw Error('should not call');},claim:async()=>{throw Error('should not claim');}};
 for(const request of [req('',{authorization:'Bearer undefined'}),req('',{authorization:''})])assert.equal((await dispatchAnimaSign(request,deps as any)).status,401);
 for(const request of [req('?ref=other'),req('',{'user-agent':'browser'})])assert.equal((await dispatchAnimaSign(request,deps as any)).status,400);
 assert.equal((await dispatchAnimaSign(req(),{...deps,secret:undefined} as any)).status,401);
 assert.equal((await dispatchAnimaSign(req(),{...deps,environment:'preview'} as any)).status,503);
 assert.equal((await dispatchAnimaSign(req(),{...deps,token:undefined} as any)).status,503);
 const failure=await dispatchAnimaSign(req(),deps as any);assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/synthetic-token|should not/);
});
test('fixed main dispatch, busy check before and after durable gate, cooldown and uncertain result fail closed',async()=>{
 let calls:any[]=[],claims=0,busy=false,claimed=false;
 const deps:any={secret:'synthetic-secret',token:'synthetic-token',environment:'production',claim:async()=>{claims++;if(claimed)return false;claimed=true;return true;},fetch:async(url:string,options:any)=>{calls.push({url,options});return options.method==='POST'?new Response(null,{status:204}):Response.json({total_count:busy?1:0,workflow_runs:[]});}};
 assert.equal((await dispatchAnimaSign(req(),deps)).status,202);
 const posts=calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);
 assert.equal(posts[0].url,'https://api.github.com/repos/juanschu-bear/anima-cura/actions/workflows/animasign-sync-worker.yml/dispatches');
 assert.deepEqual(JSON.parse(posts[0].options.body),{ref:'main'});
 assert.equal((await dispatchAnimaSign(req(),deps)).status,200);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 busy=true;const before=claims;assert.equal((await dispatchAnimaSign(req(),deps)).status,200);assert.equal(claims,before);
 busy=false;claimed=false;deps.claim=async()=>{busy=true;return true;};calls=[];
 await dispatchAnimaSign(req(),deps);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 deps.fetch=async()=>Response.json({total_count:'invalid',workflow_runs:[]});assert.equal((await dispatchAnimaSign(req(),deps)).status,503);
});
test('database clock enforces one durable five-minute slot; client roles and module have no rights',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE ROLE abrechnung_runtime;');
  await db.exec(await readFile('supabase/migrations/066_animasign_dispatch_gate.sql','utf8'));
  await db.exec('SET ROLE service_role;');
  assert.equal((await db.query('UPDATE public.animasign_dispatch_gate SET generation=1 WHERE generation=0 RETURNING generation')).rows.length,1);
  assert.equal((await db.query('UPDATE public.animasign_dispatch_gate SET generation=2 WHERE generation=1 RETURNING generation')).rows.length,0);
  await assert.rejects(db.query('UPDATE public.animasign_dispatch_gate SET attempted_at=null'),/permission denied/);
  await assert.rejects(db.query('DELETE FROM public.animasign_dispatch_gate'),/permission denied/);
  await db.exec("RESET ROLE;ALTER TABLE public.animasign_dispatch_gate DISABLE TRIGGER enforce_animasign_dispatch_gate;UPDATE public.animasign_dispatch_gate SET attempted_at=clock_timestamp()-interval '5 minutes';ALTER TABLE public.animasign_dispatch_gate ENABLE TRIGGER enforce_animasign_dispatch_gate;SET ROLE service_role;");
  assert.equal((await db.query('UPDATE public.animasign_dispatch_gate SET generation=2 WHERE generation=1 RETURNING generation')).rows.length,1);
  await db.exec('RESET ROLE');for(const role of ['anon','authenticated','abrechnung_runtime']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM public.animasign_dispatch_gate'),/permission denied/);await assert.rejects(db.query('SELECT public.guard_animasign_dispatch_gate()'),/permission denied/);await db.exec('RESET ROLE');}
 }finally{await db.close();}
});
