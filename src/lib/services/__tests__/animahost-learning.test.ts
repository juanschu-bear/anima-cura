import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{PGlite}from'@electric-sql/pglite';
import{validateLearningEvidence,learningOutput,learningSource}from'../animahost-learning';
const tenant='00000000-0000-4000-8000-000000000001',admin='00000000-0000-4000-8000-000000000002',staff='00000000-0000-4000-8000-000000000003',source='00000000-0000-4000-8000-000000000004';
const draft={topic:'communication',kind:'communication',title:'Kurze Nachfrage',content:'Bei unklarem Anliegen eine konkrete Rückfrage stellen.',occasion:'Unklare Nachricht',observation:'Team fragt nach dem Anliegen.',interpretation:null,medical:false,evidence:[{ref:'M1',quote:'Worum geht es?'}]};
test('suggestions require real exact evidence from the appropriate speaker',()=>{
 const messages=[{ref:'M0',source:'patient',text:'Schon wieder keine Antwort.'},{ref:'M1',source:'practice_phone',text:'Worum geht es?'}];
 assert.equal(validateLearningEvidence(learningOutput.parse({suggestions:[draft]}).suggestions,messages,'M1').length,1);
 assert.throws(()=>validateLearningEvidence([{...draft,evidence:[{ref:'M1',quote:'erfunden'}]}] as any,messages,'M1'),/evidence_invalid/);
 assert.throws(()=>validateLearningEvidence([{...draft,kind:'impatience'}] as any,messages,'M1'),/patient_evidence_required/);
 assert.throws(()=>validateLearningEvidence([{...draft,evidence:[{ref:'M0',quote:'Schon wieder'}]}] as any,messages,'M1'),/human_evidence_required/);
 assert.equal(learningSource.safeParse({source:'animahost'}).success,false);
});
test('learning queue is idempotent, leased and approval is admin-only with audit and withdrawal',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE TABLE animahost_whatsapp_settings(tenant_id uuid PRIMARY KEY);CREATE TABLE animahost_whatsapp_rulebook_versions(id uuid);CREATE TABLE patient_access_memberships(id uuid);CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text);INSERT INTO user_profiles VALUES('${admin}','admin'),('${staff}','verwaltung');INSERT INTO animahost_whatsapp_settings VALUES('${tenant}');`);
 for(const file of ['103_animahost_orthodontic_knowledge.sql','104_animahost_knowledge_import.sql','107_animahost_conversation_learning.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec('SET ROLE service_role');
 await db.query("INSERT INTO animahost_learning_sources(tenant_id,id,source,source_at,chat_jid,evidence) VALUES($1,$2,'practice_phone',now(),'synthetic','[]') ON CONFLICT DO NOTHING",[tenant,source]);
 const claim=async()=> (await db.query('SELECT * FROM animahost_claim_learning($1)',[tenant])).rows as any[];
 const job=(await claim())[0];assert.equal((await claim()).length,0);
 await assert.rejects(db.query('SELECT animahost_finish_learning($1,$2,$3,$4,NULL)',[tenant,source,admin,[draft]]),/lease_lost/);
 await db.query('SELECT animahost_finish_learning($1,$2,$3,$4,NULL)',[tenant,source,job.lease,JSON.stringify([draft])]);
 assert.equal((await claim()).length,0);
 const row=(await db.query('SELECT * FROM animahost_learning_suggestions')).rows[0] as any;
 const review=(actor:string,version:number,action:string,payload:any=null)=>db.query('SELECT * FROM animahost_review_learning($1,$2,$3,$4,$5,$6)',[tenant,row.id,version,actor,action,payload]);
 assert.equal((await db.query('SELECT * FROM animahost_active_knowledge($1,current_date)',[tenant])).rows.length,0);
 await assert.rejects(review(staff,1,'approve'),/actor_forbidden/);
 await assert.rejects(review(admin,2,'approve'),/version_conflict/);
 await review(admin,1,'edit',{title:'Geprüfte Nachfrage',content:'Bitte konkret nach dem Anliegen fragen.'});
 await review(admin,2,'approve');
 assert.equal((await db.query('SELECT * FROM animahost_active_knowledge($1,current_date)',[tenant])).rows.length,1);
 assert.equal(((await db.query('SELECT metadata FROM animahost_knowledge_versions ORDER BY version DESC LIMIT 1')).rows[0] as any).metadata.origin,'conversation');
 await assert.rejects(db.query("SELECT animahost_change_knowledge($1,$2,2,$3,'deactivate',NULL)",[tenant,row.id,staff]),/actor_forbidden/);
 await review(admin,3,'reject');assert.equal((await db.query('SELECT * FROM animahost_active_knowledge($1,current_date)',[tenant])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM animahost_learning_audit')).rows.length,3);
 await assert.rejects(db.query('DELETE FROM animahost_learning_audit'),/permission denied/);
 await db.exec('RESET ROLE;SET ROLE authenticated');await assert.rejects(db.query('SELECT * FROM animahost_learning_sources'),/permission denied/);
 await assert.rejects(review(admin,4,'approve'),/permission denied/);
 }finally{await db.close();}
});
