import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {teamReplyTime} from '../animahost-team-time';
import {explicitlyOffersDu,identifyByBirthDate,mentionsPatient,namedSubject,parseBirthDate,patientIsMinor,selectPhonePatient,useDu,type ChatContext,type PhonePatient} from '../animahost-chat-identity';
import {qualityWorkflow,styleMessage} from '../animahost-quality-workflows';

const lead:PhonePatient={id:'30000000-0000-4000-8000-000000000003',vorname:'Leon',nachname:'Beispiel',geburtsdatum:'2012-05-03',geschlecht:'m'};
const child:PhonePatient={id:'20000000-0000-4000-8000-000000000002',vorname:'Emma',nachname:'Beispiel',geburtsdatum:'2014-04-02',geschlecht:'w'};
const adult:PhonePatient={id:'10000000-0000-4000-8000-000000000001',vorname:'Mara',nachname:'Beispiel',geburtsdatum:'1992-03-01',geschlecht:'w'};
const publicPhone='491790000000';
const sunday='2026-11-22T02:08:00+01:00';
const simpleDb={from(){
 const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:null,error:null}),
  upsert:async()=>({error:null})};return chain;
}} as never;

test('the team writes on Monday even though visits start Tuesday; cut-off and closure periods apply',()=>{
 assert.equal(teamReplyTime(sunday,undefined,[],'de'),'am Montag, 23. November');
 assert.equal(teamReplyTime('2026-11-23T16:00:00+01:00',undefined,[],'de'),'heute noch');
 assert.equal(teamReplyTime('2026-11-23T16:01:00+01:00',undefined,[],'de'),'am Dienstag, 24. November');
 assert.equal(teamReplyTime(sunday,[1,2,3,4,5],[{from:'2026-11-23',through:'2026-11-23',kind:'closure'}],'de'),'am Dienstag, 24. November');
 assert.equal(teamReplyTime(sunday,[3],[],'de'),'am Mittwoch, 25. November');
});

test('one number can identify siblings while a financially verified identity stays patient-specific',async()=>{
 assert.equal(selectPhonePatient([],''),null);
 assert.equal(selectPhonePatient([adult],''),adult);
 assert.equal(selectPhonePatient([lead,child],'mein Kind'),null);
 assert.equal(selectPhonePatient([lead,child],'Es geht um Emma.'),child);
 assert.equal(patientIsMinor(child.geburtsdatum,'2026-11-22'),true);
 assert.equal(patientIsMinor(adult.geburtsdatum,'2026-11-22'),false);
 assert.equal(parseBirthDate('31.02.2014'),null);
 assert.equal(await identifyByBirthDate(simpleDb,'03.05.2012',[lead,child],child.id),null);
 assert.equal(await identifyByBirthDate(simpleDb,'03.05.2012',[lead,child],lead.id),lead);
});

test('the first greeting distinguishes a child and an adult, and Du requires an offer',()=>{
 const original={rule:'general',text:'Ihren Termin finden Sie in Ihrem Konto.',action:'antworten' as const};
 const opts={language:'de',receivedAt:sunday,firstReply:true,informal:false,teamTime:'am Montag'};
 assert.equal(styleMessage(original,adult,opts).text,original.text);
 assert.equal(styleMessage(original,child,{...opts,incoming:'Wann hat Emma ihren Termin?'}).text,original.text);
 assert.equal(explicitlyOffersDu('Bist du ein Mensch?'),false);
 assert.equal(explicitlyOffersDu('Du kannst mich übrigens auch duzen.'),true);
 assert.match(useDu(original.text),/Deinen Termin findest du in Deinem Konto/);
});

// 22.11.2026, live: Die Mutter schrieb über ein Kind, das nicht an der Nummer hängt. AnimaHost antwortete
// „Guten Tag, gern helfe ich Ihnen bei Ihrer Frage zu <anderes Kind>. Guten Tag, wie können wir Ihnen helfen?“ und danach
// „Für <anderes Kind> gilt Folgendes. Danke für Ihre Nachricht. …“. Alle Namen hier sind erfunden.
test('a number with one child is no proof that the message is about that child',()=>{
 const about='Hallo Frau Muster, ist es möglich Leons Termin am Mittwoch auf kommende Woche zu verschieben? Viele Grüße Bea Beispiel';
 assert.equal(namedSubject(about),'Leon');
 assert.equal(namedSubject('Mein Sohn Leon braucht eine Bescheinigung.'),'Leon');
 assert.equal(namedSubject('Es geht um unsere Tochter Emma.'),'Emma');
 // Keine Vornamen: Besitzwörter, Wochentage, Anreden und Wörter ohne klare Form.
 for(const text of ['Wir möchten Ihres Termins wegen fragen.','Kann ich Dienstags Termin verschieben?','Meine Tochter hat Schmerzen.','Hallo Frau Muster, wann ist der Termin?',
  'Ich hoffe das uns Frau Muster am Montag antwortet','Anima Cura so viel zur Hilfe','wegen leons termin',''])assert.equal(namedSubject(text),null,text);
 // 1 Kind an der Nummer, die Nachricht nennt ausdrücklich ein anderes: Es wird nichts angenommen.
 assert.equal(selectPhonePatient([child],about),null);
 assert.equal(selectPhonePatient([child],'Mein Sohn Leon braucht eine Bescheinigung.'),null);
 // Dasselbe Kind genannt oder niemand genannt: wie bisher der Patient der Nummer.
 assert.equal(selectPhonePatient([child],'Wann ist Emmas Termin?'),child);
 assert.equal(selectPhonePatient([child],'Wann ist der nächste Termin?'),child);
 assert.equal(selectPhonePatient([child],'Ich hoffe das uns Frau Muster am Montag antwortet'),child);
 // Geschwister: „Emmas Termin“ benennt Emma eindeutig, ein fremder Name niemanden.
 assert.equal(selectPhonePatient([lead,child],'Wann ist Emmas Termin?'),child);
 assert.equal(selectPhonePatient([lead,child],'Emma und Leon kommen beide.'),null);
 assert.equal(selectPhonePatient([lead,child],'Wann ist Noahs Termin?'),null);
 assert.equal(mentionsPatient('Wann ist Emmas Termin?',child),true);
 assert.equal(mentionsPatient('Wann ist der Termin von emma?',child),true);
 assert.equal(mentionsPatient('Wann ist der Termin?',child),false);
 assert.equal(mentionsPatient('Es geht um Elias.',{...child,vorname:'Noah Elias'}),true);
});

test('a child is named only when the message is about that child, never twice greeted and never before a handoff',()=>{
 const opts={language:'de',receivedAt:sunday,firstReply:true,informal:false,teamTime:'am Montag'};
 const greeting={rule:'rulebook:greeting',text:'Guten Tag, wie können wir Ihnen helfen?',action:'antworten' as const};
 const answer={rule:'rulebook:pickup',text:'Schienen können Sie Dienstag bis Donnerstag abholen.',action:'antworten' as const};
 const fallback={rule:'fallback:general',text:'Danke für Ihre Nachricht. Das sieht sich unser Praxisteam persönlich an und meldet sich am Montag bei Ihnen.',action:'klaerfall' as const};
 // Die Nachricht nennt das Kind nicht: kein Namenssatz, der Text bleibt, wie die Regel ihn vorgibt.
 assert.equal(styleMessage(greeting,child,{...opts,incoming:'Hallo, ich habe eine Frage.'}).text,greeting.text);
 assert.equal(styleMessage(answer,child,{...opts,incoming:'Wann können wir die Schiene abholen?'}).text,answer.text);
 assert.equal(styleMessage(answer,child,opts).text,answer.text);
 // Die Nachricht nennt das Kind: 1 Begrüßung, danach die Antwort.
 assert.equal(styleMessage(answer,child,{...opts,incoming:'Wann kann Emma die Schiene abholen?'}).text,
  answer.text);
 const greeted=styleMessage(greeting,child,{...opts,incoming:'Hallo, es geht um Emma.'}).text;
 assert.equal(greeted,greeting.text);
 assert.equal(greeted.match(/Guten Tag/g)?.length,1);
 // Übergabe ans Team: kein „gern helfe ich“ und kein „Für Emma gilt Folgendes.“ davor.
 assert.equal(styleMessage(fallback,child,{...opts,incoming:'Emma hat eine Frage zur Rechnung.'}).text,fallback.text);
 assert.equal(styleMessage(fallback,child,{...opts,firstReply:false,incoming:'Ich hoffe, dass Emma am Montag eine Antwort bekommt.'}).text,fallback.text);
 assert.doesNotMatch(styleMessage(fallback,child,{...opts,firstReply:false,incoming:'Ich hoffe das uns Frau Muster am Montag antwortet'}).text,/gilt Folgendes|Emma/);
 // Folgeantwort mit Bezug zum Kind bleibt möglich.
 assert.equal(styleMessage(answer,child,{...opts,firstReply:false,incoming:'Und Emmas Schiene?'}).text,answer.text);
 // Erwachsene: Anrede mit Namen, aber nur 1 Begrüßung.
 assert.equal(styleMessage(greeting,adult,opts).text,greeting.text);
 assert.equal(styleMessage(answer,adult,opts).text,answer.text);
});

test('self-service escalates only after two attempts, includes a team date and honours the newest topic',async()=>{
 const context:ChatContext={};
 const run=(text:string)=>qualityWorkflow(simpleDb,{tenantId:adult.id,from:'999000000@s.whatsapp.net',phone:publicPhone,
  receivedAt:sunday,text,language:'de',teamTime:'am Montag',patients:[],patient:null,context,
  doctolib:'https://example.invalid/termin',closures:[]});
 const flow=['Ich weiß nicht, wann mein Termin ist.','Ich habe kein Profil bei Doctolib.','Ich komme da nicht rein und finde keine Mail.'];
 const answers=[];
 for(const text of flow)answers.push((await run(text))?.decision);
 assert.deepEqual(answers.map(a=>a?.rule),['quality:appointment:1','quality:appointment:2','quality:appointment:3']);
 assert.match(answers[0]?.text??'',/https:\/\//);
 assert.doesNotMatch(answers[1]?.text??'',/https:\/\/|Team/);
 assert.match(answers[2]?.text??'',/Geburtsdatum.*am Montag/);
 const invoice=await run('Nein, nicht Abrechnung, die Rechnungen, die angeblich in der App zu sehen sein sollten.');
 assert.equal(invoice?.decision.rule,'invoice_portal:manual_review');
 assert.match(invoice?.decision.text??'',/missverstanden/);
});

test('a reminder asks for date of birth before opening any payment or invoice data',async()=>{
 const db={from(table:string){
  assert.equal(table,'animahost_whatsapp_verified_patients');
  return (simpleDb as any).from();
 }} as never;
 const context:ChatContext={};
 const outcome=await qualityWorkflow(db,{tenantId:adult.id,from:'999000000@s.whatsapp.net',phone:publicPhone,
  receivedAt:sunday,text:'Ich habe eine Mahnung bekommen.',language:'de',teamTime:'am Montag',
  patients:[child],patient:child,context,doctolib:null,closures:[]});
 assert.equal(outcome?.decision.rule,'identity:financial');
 assert.match(outcome?.decision.text??'',/Geburtsdatum/);
 assert.equal(context.challenge?.patientId,child.id);
});

test('invoice navigation stays in Rechnungen even when free-form replies are paused',async()=>{
 const input={tenantId:adult.id,from:'999000000@s.whatsapp.net',phone:publicPhone,receivedAt:sunday,
  teamTime:'am Montag',patients:[child],patient:child,context:{},doctolib:null,closures:[],onlyInvoiceRouting:true};
 for(const [language,text,section] of [['de','Wo finde ich die Rechnung?','„Rechnungen“'],
  ['en','Where can I find the invoice?','under Invoices'],['es','¿Dónde está la factura?','«Facturas»']]){
  const response=await qualityWorkflow(simpleDb,{...input,text,language});
  assert.equal(response?.decision.rule,'quality:invoice_documents');
  assert.ok(response?.decision.text.includes(section));
  assert.match(response.decision.text,/Emma.*https:\/\/animacura\.io\/patient\/portal\?section=rechnungen/);
  assert.doesNotMatch(response.decision.text,/Dokumente|Documents|Documentos/);
 }
 const wrongSection=await qualityWorkflow(simpleDb,{...input,text:'Gehört die Rechnung unter Dokumente?',language:'de'});
 assert.match(wrongSection?.decision.text??'',/„Rechnungen“.*„Dokumente“.*Anamnesebögen/);
});

test('phone migration checks the project and matches formats, guardians and active payers without duplicates',async()=>{
 const sql=readFileSync('supabase/migrations/097_animahost_phone_identity.sql','utf8');
 const pg=new PGlite();
 try{
  await assert.rejects(pg.exec(sql),/Falsches Projekt/);
  await pg.exec(`create role anon;create role authenticated;create role service_role;
   create table patients(id uuid primary key,vorname text,nachname text,geburtsdatum date,geschlecht text,telefon text,mobiltelefon text,versicherter_telefon text,eb2_telefon text);
   create table zahler(id uuid primary key,telefon text);
   create table behandlungsfall(patient_id uuid,zahler_id uuid,status text);
   create table billing_invoice_recipient_versions(patient_id uuid,zahler_id uuid,state text,snapshot jsonb);
   create table animahost_whatsapp_settings(tenant_id uuid primary key);
   create table animahost_whatsapp_decisions(id uuid);
   grant select on patients,zahler,behandlungsfall,billing_invoice_recipient_versions to service_role;`);
  await pg.exec(sql);
  const insert='insert into patients(id,vorname,nachname,geburtsdatum,geschlecht,telefon,mobiltelefon,versicherter_telefon,eb2_telefon) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)';
  await pg.query(insert,[adult.id,adult.vorname,adult.nachname,adult.geburtsdatum,'w','0179 000-0001',null,null,null]);
  await pg.query(insert,[child.id,child.vorname,child.nachname,child.geburtsdatum,'w',null,null,'0049 179-0000000',null]);
  await pg.query(insert,[lead.id,lead.vorname,lead.nachname,lead.geburtsdatum,'m',null,null,null,null]);
  await pg.query('insert into zahler(id,telefon) values ($1,$2)',[adult.id,'+49 179 0000000']);
  await pg.query('insert into behandlungsfall values ($1,$2,$3)',[lead.id,adult.id,'aktiv']);
  await pg.exec('set role authenticated');
  await assert.rejects(pg.query('select * from animahost_phone_patients($1)',[publicPhone]),/permission denied/);
  await pg.exec('reset role; set role service_role');
  const match=async(phone:string)=>(await pg.query<{id:string}>('select id from animahost_phone_patients($1)',[phone])).rows.map(p=>p.id);
  assert.deepEqual(await match(publicPhone),[child.id,lead.id]);
  assert.deepEqual(await match('491790000001'),[adult.id]);
  assert.deepEqual(await match('491790000099'),[]);
 }finally{await pg.close();}
});
