import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('WhatsApp email intake updates only the exact eligible Q1-Q3 patient scope',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE patients(id uuid PRIMARY KEY,email text,updated_at timestamptz DEFAULT now());
   CREATE TABLE animahost_knowledge_versions(id int);
   CREATE SCHEMA abrechnung;
   CREATE TABLE abrechnung.active_patient_invoice_documents(id uuid PRIMARY KEY,patient_id uuid,fields jsonb);`);
  await db.query('INSERT INTO patients(id,email) VALUES($1,NULL),($2,$3),($4,NULL)',[id(1),id(2),'anderes@example.org',id(3)]);
  await db.query(`INSERT INTO abrechnung.active_patient_invoice_documents VALUES
   ($1,$2,$3::jsonb),($4,$5,$6::jsonb)`,[id(11),id(1),JSON.stringify({quarter:'2026-Q3',informationOnly:false,patientCents:1234}),id(12),id(3),JSON.stringify({quarter:'2026-Q3',informationOnly:true,patientCents:0})]);
  await db.exec(readFileSync('supabase/migrations/109_invoice_contact_email_intake.sql','utf8'));
  const prepared=(await db.query('SELECT * FROM prepare_invoice_contact_email($1,$2,$3,$4,$5,now(),$6,$7,$8)',[id(21),id(22),'invoice-email-q1-q3-2026','491700000000@s.whatsapp.net','wamid.1','familie@example.org',[id(1)],null])).rows[0];
  assert.equal(prepared.state,'prepared');
  assert.equal(prepared.invoice_count,1);
  assert.equal((await db.query('SELECT email FROM patients WHERE id=$1',[id(1)])).rows[0].email,'familie@example.org');
  const conflict=(await db.query('SELECT * FROM prepare_invoice_contact_email($1,$2,$3,$4,$5,now(),$6,$7,$8)',[id(23),id(22),'invoice-email-q1-q3-2026','491700000001@s.whatsapp.net','wamid.2','neu@example.org',[id(2)],null])).rows[0];
  assert.equal(conflict.error_code,'profile_email_conflict');
  const insurerOnly=(await db.query('SELECT * FROM prepare_invoice_contact_email($1,$2,$3,$4,$5,now(),$6,$7,$8)',[id(24),id(22),'invoice-email-q1-q3-2026','491700000002@s.whatsapp.net','wamid.3','drei@example.org',[id(3)],null])).rows[0];
  assert.equal(insurerOnly.error_code,'invoice_documents_missing');
 }finally{await db.close();}
});
