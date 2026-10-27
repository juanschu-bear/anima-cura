import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { validBirthDate, validateIntakeAnswers, requiredIntakeFields } from '../intake-required-fields';
import { splitPatientImport, resolveValidPatientImports } from '../patient-import-review';
import { loadOpenIntakeReviews } from '../intake-open-review';

const today = '2026-10-27';
function completed(birthday = '1990-04-12') {
  const a: Record<string,unknown> = { patient_geburtsdatum:birthday,ist_selbstzahler:'ja',ist_vn:'ja' };
  for (const key of requiredIntakeFields(a,today)) if (!(key in a)) a[key] = 'Angabe';
  for (const key of Object.keys(a)) {
    if (key.endsWith('_vorname')) a[key] = 'Anna';
    if (key.endsWith('_nachname')) a[key] = 'Müller';
    if (key.endsWith('_telefon') || key === 'patient_mobil') a[key] = '+493411234567';
  }
  Object.assign(a,{patient_email:'patient@example.com',patient_plz:'04109',patient_hausnummer:'12',ew_roentgen:true,abschluss_datum:today,unterschrift_versicherter:'data:image/png;base64,aGVsbG8='});
  return a;
}
test('server validates required fields and exact calendar birthdate before any persistence', async () => {
  for (const bad of [null,undefined,'','  ','2026-02-30','2025-02-29','2030-01-01','1899-01-01','garbage',{},'2010-01-01Tbad']) assert.equal(validBirthDate(bad,today),null);
  assert.equal(validBirthDate('2024-02-29',today),'2024-02-29');
  assert.equal(validBirthDate('2010-03-04T00:00:00Z',today),'2010-03-04');
  assert.deepEqual(validateIntakeAnswers(completed(),today),[]);
  assert.deepEqual(validateIntakeAnswers(completed('2015-04-12'),today),[]);
  for (const key of requiredIntakeFields(completed(),today)) {
    const a=completed();delete a[key];if(key==='unterschrift_sig1')delete a.unterschrift_versicherter;
    assert.ok(validateIntakeAnswers(a,today).includes(key),key);
  }
  assert.ok(validateIntakeAnswers({...completed(),patient_geburtsdatum:'2026-02-30'},today).includes('patient_geburtsdatum'));
  assert.ok(validateIntakeAnswers({...completed(),patient_email:'bad'},today).includes('patient_email'));
  assert.deepEqual(validateIntakeAnswers({...completed(),ew_anima:false,ew_digitale_rechnung:false},today),[]); // Optional consent is still optional.
  const adult=completed();adult.ist_selbstzahler='nein';adult.ist_vn='nein';
  assert.ok(validateIntakeAnswers(adult,today).includes('zahler_vorname'));
  assert.ok(validateIntakeAnswers(adult,today).includes('vn_vorname'));
  assert.deepEqual(validateIntakeAnswers([],today),['answers']);
  const route=await readFile('src/app/api/anima-sign/submit/route.ts','utf8');
  assert.ok(route.indexOf('validateIntakeAnswers(answers)') < route.indexOf('const supabase = createServerClient();',route.indexOf('export async function POST')));
  assert.match(route,/status: 422/);
});
test('mixed import quarantines invalid rows before valid upsert, never fabricates dates, and closes only explicitly successful IDs', async () => {
  const saved:any[]=[];let resolved:any;
  const db:any={from:(table:string)=>{assert.equal(table,'patient_import_reviews');return {upsert:async(value:any,options:any)=>{saved.push({value,options});return {error:null};},update:(value:any)=>({eq:()=>({eq:()=>({in:async(_:string,ids:string[])=>{resolved={value,ids};return {error:null};}})})})};}};
  const mixed=[{Id:'missing',Firstname:'<img onerror=x>',Birthday:null},{Id:'good',Birthday:'2010-02-03T00:00:00Z'},{Id:'invalid',Birthday:'2010-02-30'},{Id:'future',Birthday:'2030-01-01'}];
  const result=await splitPatientImport(db,mixed,today);
  assert.equal(result.deferred,3);assert.deepEqual(result.valid,[{Id:'good',Birthday:'2010-02-03'}]);
  assert.deepEqual(saved.map(x=>x.value.reason),['birthdate_missing','birthdate_invalid','birthdate_invalid']);
  assert.ok(saved.every(x=>x.value.state==='open'&&x.value.resolved_at===null&&x.options.onConflict==='source,external_id'));
  assert.equal(saved[0].value.first_name,'<img onerror=x>'); // Stored as text, escaped by React.
  await resolveValidPatientImports(db,['good']);assert.deepEqual(resolved.ids,['good']);assert.equal(resolved.value.state,'resolved');
  await assert.rejects(splitPatientImport({from:()=>({upsert:async()=>({error:{code:'unavailable'}})})} as any,mixed,today),/review_persistence_failed/);
  const route=await readFile('src/app/api/ivoris/patients/batch-sync/route.ts','utf8');
  assert.ok(route.indexOf('await splitPatientImport')<route.indexOf('.upsert(rows'));
  assert.match(route,/for \(const raw of split.valid\)/);
  assert.ok(route.indexOf('await resolveValidPatientImports(db, rows.map')>route.indexOf('if (error) {\n      errors.push(`Upsert'));
  const cron=await readFile('src/app/api/cron/patients/route.ts','utf8');
  assert.match(cron,/deferred \+= json.results\?\.deferred/);
  const reviewApi=await readFile('src/app/api/anima-sign/import-reviews/route.ts','utf8');
  assert.ok(reviewApi.indexOf('requirePraxisRole')<reviewApi.indexOf(".from('patient_import_reviews')"));
  assert.match(reviewApi,/\['admin','verwaltung'\]/);assert.match(reviewApi,/status: 503/);
  assert.match(reviewApi,/size = 15/);assert.match(reviewApi,/\.eq\('state','open'\)/);
});
test('manual reviews include old unresolved records across every page; read failures never become an empty list', async()=>{
  const records=Array.from({length:521},(_,i)=>({id:String(i),created_at:'2020-01-01',ivoris_sync_failed_permanently:true}));
  let pages=0;
  const db:any={from:()=>({select:()=>({or:()=>({order:()=>({order:()=>({range:async(start:number,end:number)=>{pages++;return {data:records.slice(start,end+1),error:null};}})})})})})};
  assert.equal((await loadOpenIntakeReviews(db)).length,521);assert.equal(pages,2);
  await assert.rejects(loadOpenIntakeReviews({from:()=>({select:()=>({or:()=>({order:()=>({order:()=>({range:async()=>({error:{code:'denied'}})})})})})})} as any),/review_read_failed/);
  const route=await readFile('src/app/api/anima-sign/review-queue/route.ts','utf8');
  assert.match(route,/await loadOpenIntakeReviews\(db\)/);assert.doesNotMatch(route.slice(route.indexOf('const manualReview ='),route.indexOf('const patientGroups =')),/slice\(0, 20\)/);
});
test('quarantine migration is additive, client roles cannot read it, and existing patients stay unchanged',async()=>{
  const db=new PGlite();
  try{
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE TABLE patients(id integer PRIMARY KEY,marker text);INSERT INTO patients VALUES(1,'unchanged');");
    const before=(await db.query('SELECT * FROM patients')).rows;
    const sql=await readFile('supabase/migrations/065_patient_import_reviews.sql','utf8');
    await db.exec(sql);
    assert.deepEqual((await db.query('SELECT * FROM patients')).rows,before);
    for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM public.patient_import_reviews'),/permission denied/);await db.exec('RESET ROLE');}
    await db.exec("SET ROLE service_role;INSERT INTO public.patient_import_reviews(source,external_id,first_name,last_name,reason) VALUES('ivoris','test','Synthetic','Patient','birthdate_missing');");
    assert.equal((await db.query<{state:string}>('SELECT state FROM public.patient_import_reviews')).rows[0].state,'open');
    await assert.rejects(db.query('SELECT * FROM patients'),/permission denied/);
  }finally{await db.close();}
});
