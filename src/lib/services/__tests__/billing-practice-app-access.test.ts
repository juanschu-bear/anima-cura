import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {appRecipients,appAccessCommand,appRequestResult,scopedAccessRedirect,appAccessScope} from '../practice-app-access-domain';
import {accessLinkMembers} from '../invoice-contact-access';
import {buildInvoiceAccessLinkEmail} from '../../email/invoice-access-link';
test('only stored contacts are offered with real relationship keys and explicit authorization',()=>{
 const p={email:' CHILD@example.com ',versicherter_email:'parent@example.com',versicherter_vorname:'Alex',eb2_email:'invalid'};
 assert.deepEqual(appRecipients(p).map(r=>[r.key,r.email]),[['patient','child@example.com'],['policyholder','parent@example.com']]);
 assert.equal(appAccessCommand.safeParse({requestId:crypto.randomUUID(),patientId:crypto.randomUUID(),recipientKey:'patient',expectedEmail:p.email,recipientConfirmed:false}).success,false);
});
test('accepted is not delivered and uncertain jobs never claim successful delivery',()=>{
 const row={id:'id',state:'processing',created_at:'2026-11-26T10:00:00Z'};assert.equal(appRequestResult(row,Date.parse('2026-11-26T10:03:00Z')).state,'outcome_unknown');
 assert.equal(appRequestResult({...row,state:'accepted',completed_at:'2026-11-26T10:00:01Z'}).acceptedAt,'2026-11-26T10:00:01Z');
 assert.equal(appAccessScope('p','e',1),appAccessScope('p','e',2));assert.notEqual(appAccessScope('p','e',1),appAccessScope('other','e',1));
});
test('scoped invitation never inherits legacy siblings and fails on incomplete patient lookup',async()=>{
 const db={from(table:string){assert.equal(table,'patients');return{select(){return{in(_key:string,ids:string[]){assert.deepEqual(ids,['child']);return{data:[{id:'child',vorname:'Example'}],error:null};}}}}}};
 assert.deepEqual((await accessLinkMembers(db as any,{contact_id:'contact',patient_ids:['child']})).map(r=>r.patient_id),['child']);
 await assert.rejects(accessLinkMembers({from:()=>({select:()=>({in:()=>({data:[],error:null})})})} as any,{contact_id:'c',patient_ids:['child']}),/scope_unavailable/);
 assert.equal(scopedAccessRedirect({patient_ids:['child'],next_path:'/patient/portal'}),'/patient/portal');assert.equal(scopedAccessRedirect({next_path:'https://evil.invalid'}),'/patient/portal?section=rechnungen');
});
test('app invitation has no invoice prerequisite and escapes its URL',()=>{
 const mail=buildInvoiceAccessLinkEmail('https://animacura.io/patient/invoice-access/continue?token=example&lang=de','de','app');assert.match(mail.text,/keine Rechnung/);assert.match(mail.text,/Home-Bildschirm/);assert.doesNotMatch(mail.subject,/Rechnungen/);assert.match(mail.html,/&amp;lang/);
});
test('migration isolates staff send receipts and enforces idempotency and explicit confirmation',async()=>{
 const db=new PGlite();await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE patients(id uuid PRIMARY KEY); CREATE TABLE patient_access_memberships(id int); CREATE TABLE animahost_knowledge_versions(id int); CREATE TABLE invoice_access_links(id uuid);");
 await db.exec(readFileSync('supabase/migrations/108_practice_app_access.sql','utf8'));
 const p=crypto.randomUUID(),id=crypto.randomUUID();await db.query('insert into patients values($1)',[p]);
 const sql="insert into practice_app_access_requests(id,patient_id,actor_id,recipient_key,email,scope_key,state,recipient_confirmed) values($1,$2,$3,'patient','example@example.com','same','processing',true)";
 await db.query(sql,[id,p,crypto.randomUUID()]);await assert.rejects(db.query(sql,[crypto.randomUUID(),p,crypto.randomUUID()]),/unique/);
 const rights=await db.query("select has_table_privilege('authenticated','practice_app_access_requests','SELECT') allowed");assert.equal((rights.rows[0] as any).allowed,false);await db.close();
});

test('staff API rejects unauthenticated and patient roles before admin database or body access',async()=>{
 const {practiceAppAccessHandler}=await import('../../practice-app-access-api');
 for(const role of [null,'patient']){
 const sc={auth:{getUser:async()=>({data:{user:role?{id:'user'}:null},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role},error:null})})})})};
 const handler=practiceAppAccessHandler(()=>sc,()=>{throw Error('must not access admin db');});
 const result=await handler(new Request('https://animacura.io/api/patient/practice-access',{method:'POST',body:'not JSON'}));assert.equal(result.status,role?403:401);
 }
});

test('send uses stored recipient, scopes the link, keeps receipt and never resends same request',async()=>{
 const {sendAppAccess}=await import('../practice-app-access');const requests:any[]=[],links:any[]=[];
 const patient={id:crypto.randomUUID(),email:'child@example.com',versicherter_email:'parent@example.com'};
 const db:any={from(table:string){let op='read',value:any,filters:Record<string,any>={};const run=()=>{
  if(table==='patients')return {data:patient,error:null};
  if(table==='invoice_access_contacts')return {data:{id:'contact'},error:null};
  if(table==='invoice_access_links'){links.push(value);return {data:null,error:null};}
  if(table==='practice_app_access_requests'){
   if(op==='insert'){if(requests.some(r=>r.id===value.id||r.scope_key===value.scope_key))return {data:null,error:{code:'23505'}};const r={...value,created_at:new Date().toISOString()};requests.push(r);return {data:r,error:null};}
   const r=requests.find(r=>Object.entries(filters).every(([k,v])=>r[k]===v));if(op==='update')Object.assign(r??{},value);return {data:r??null,error:null};
  }throw Error(table);
 };const q:any={select(){return q},eq(k:string,v:any){filters[k]=v;return q},insert(v:any){op='insert';value=v;return q},upsert(v:any){op='insert';value=v;return q},update(v:any){op='update';value=v;return q},single:async()=>run(),maybeSingle:async()=>run(),then(resolve:any,reject:any){return Promise.resolve(run()).then(resolve,reject)}};return q;}};
 const c=appAccessCommand.parse({requestId:crypto.randomUUID(),patientId:patient.id,recipientKey:'policyholder',expectedEmail:'parent@example.com',recipientConfirmed:true});let sends=0;
 const deliver=async(args:any)=>{sends++;assert.equal(args.to,'parent@example.com');assert.doesNotMatch(args.body,/child@example.com/);return {ok:true};};
 assert.equal((await sendAppAccess(db,'staff',c,deliver)).state,'accepted');assert.equal((await sendAppAccess(db,'staff',c,deliver)).state,'accepted');assert.equal(sends,1);assert.deepEqual(links[0].patient_ids,[patient.id]);assert.equal(requests[0].actor_id,'staff');
 await assert.rejects(sendAppAccess(db,'staff',{...c,expectedEmail:'attacker@example.com'},deliver),/recipient_changed/);assert.equal(sends,1);
});
