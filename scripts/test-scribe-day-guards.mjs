import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const name='scribe-day-guards-'+randomUUID().slice(0,8);
let container;
function sql(text){return new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','synthetic','-v','ON_ERROR_STOP=1','-At'],{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(text);});}
try{
 container=execFileSync('docker',['run','--detach','--rm','--name',name,'--env','POSTGRES_PASSWORD=synthetic-only','--env','POSTGRES_DB=synthetic','postgres:17-alpine'],{encoding:'utf8'}).trim();
 for(let i=0;;i++){try{await sql('SELECT 1');break;}catch(e){if(i>30)throw e;await new Promise(r=>setTimeout(r,200));}}
 await sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE doku_eintraege(id uuid PRIMARY KEY,patient_id uuid,termin_datum date,status text,text text,positionen jsonb,zaehne text[],variablen jsonb,auswahl jsonb,version int DEFAULT 1,created_at timestamptz DEFAULT now());
 CREATE TABLE doku_tagesdatensaetze(id uuid,canonical_entry_id uuid);
 CREATE FUNCTION decide_doku_day_part() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'SELECT';
 GRANT USAGE ON SCHEMA public TO authenticated;GRANT SELECT,INSERT,UPDATE ON doku_eintraege TO authenticated;GRANT SELECT ON doku_tagesdatensaetze TO authenticated;`);
 await sql(readFileSync('supabase/migrations/076_scribe_day_entry_guards.sql','utf8'));
 const patient=randomUUID(),a=randomUUID(),b=randomUUID();
 const insert=(id,date,status='bestaetigt')=>`INSERT INTO doku_eintraege(id,patient_id,termin_datum,status,text) VALUES('${id}','${patient}','${date}','${status}','synthetic');`;
 // Two actual concurrent database sessions. Wait until A holds its uncommitted slot.
 async function race(left,right){const first=sql(`SET application_name='scribe-race-a';BEGIN;SET LOCAL ROLE authenticated;${left}SELECT pg_sleep(0.8);COMMIT;`);let observed=false;for(let i=0;i<60;i++){if((await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='scribe-race-a' AND wait_event='PgSleep'"))==='1'){observed=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(observed,'race barrier reached');const second=sql(`SET ROLE authenticated;${right}`);const results=await Promise.allSettled([first,second]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/day_record_exists/);}
 await race(insert(a,'2026-11-05'),insert(b,'2026-11-05'));
 assert.equal(await sql("SELECT count(*) FROM doku_eintraege WHERE status='bestaetigt'"),'1');
 const c=randomUUID(),d=randomUUID();await sql(`SET ROLE authenticated;${insert(c,'2026-11-06','entwurf')}${insert(d,'2026-11-06','entwurf')}`);
 await race(`UPDATE doku_eintraege SET status='bestaetigt' WHERE id='${c}';`,`UPDATE doku_eintraege SET status='bestaetigt' WHERE id='${d}';`);
 await sql(`INSERT INTO doku_tagesdatensaetze VALUES('${randomUUID()}','${a}');`);
 await assert.rejects(sql(`SET ROLE authenticated;UPDATE doku_eintraege SET text='overwrite',version=2 WHERE id='${a}';`),/day_record_correction_required/);
 await sql(`UPDATE doku_eintraege SET text='authorized day command owner',version=2 WHERE id='${a}';`);
 assert.equal(await sql(`SELECT count(*) FROM doku_eintraege WHERE id='${d}' AND status='entwurf'`),'1');
 console.log('PASS: concurrent insert, concurrent draft promotion, canonical guard, authorized owner update; synthetic database only.');
}finally{if(container)execFileSync('docker',['stop','--time','1',container],{stdio:'ignore'});}
