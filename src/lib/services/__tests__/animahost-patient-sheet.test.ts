import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPatientSheet,relativeAppointment,selectedConfirmedPatient,sheetLedger} from '../animahost-patient-sheet';
import {patientTextViolations} from '../animahost-patient-text';
import {runRetrievalReply} from '../animahost-retrieval-core';
const child={id:'child-a',vorname:'Leon',nachname:'Beispiel',geburtsdatum:'2014-05-01',geschlecht:'m'};
const sibling={...child,id:'child-b',vorname:'Mira'};
const at='2026-11-23T10:00:00Z';
function database(){const calls:string[]=[];const tables:Record<string,any>={patients:{behandlung:'Feste Spange',behandlungsart:'KFO',guthaben:27.50,notizen:'Rückruf durch Empfang vereinbart.',versicherter_vorname:'Nora',versicherter_nachname:'Beispiel',versicherter_telefon:'015100000001'},
 behandlungsphasen:[{name:'Aktive Korrektur',status:'aktiv'}],tagesplan_termine:[{datum:'2026-11-26',uhrzeit:'15:30:00',status:'erwartet',behandlung_art:'Kontrolle'},{datum:'2026-11-20',uhrzeit:'11:00:00',status:'fertig'},{datum:'2026-11-12',status:'nicht_erschienen'}],offene_posten:[{rechnung_nr:'TEST-1',rechnung_datum:'2026-11-01',betrag:100,offen:45,gezahlt:55,status:'teilbezahlt'}],doku_positions_klaerfaelle:[{status:'offen',conflicts:['Rückfrage']}],animahost_appointment_cases:[],user_profiles:[],patient_access_memberships:[],doku_eintraege:[],invoice_access_events:[],ratenplaene:[],raten:[]};
 const db={from(table:string){calls.push(table);let single=false;const q:any=new Proxy({}, {get(_t,key){if(key==='then')return (resolve:any)=>resolve({data:single?(tables[table]??null):Array.isArray(tables[table])?tables[table]:tables[table]?[{id:child.id,...tables[table]}]:[],error:null});if(key==='single'||key==='maybeSingle')return ()=>{single=true;return q;};if(['insert','update','upsert','delete'].includes(String(key)))throw Error('write forbidden');return ()=>q;}});return q;},rpc:async()=>({data:{cause:'no_invoice',invoiceDate:null},error:null})};return {db:db as any,calls};}
const args={tenantId:'tenant',patients:[child],verifiedIds:[child.id],message:'Bei Leon ist der Draht ab. Geht Donnerstag?',today:'2026-11-23',at,chatJid:'4915100000001@s.whatsapp.net',phone:'4915100000001'};
test('unlinked, unconfirmed and ambiguous family sheets do not read any patient table',async()=>{
 for(const over of [{patients:[]},{verifiedIds:[]},{patients:[child,sibling],message:'Wann ist der Termin?'}]){
  const {db,calls}=database();const sheet=await loadPatientSheet(db,{...args,...over});assert.deepEqual(calls,[]);assert.deepEqual(sheet.context,{});
 }
 assert.equal(selectedConfirmedPatient([child,sibling],[child.id,sibling.id],'Miras Termin')?.id,sibling.id);
 assert.equal(selectedConfirmedPatient([child,sibling],[child.id],'Miras Termin'),null);
 assert.equal(selectedConfirmedPatient([child],[child.id],'Mein Sohn Fabian braucht einen Termin'),null);
});
test('L26 sheet reads the real appointment state, parent, phase, credit and notes without writes',async()=>{
 const {db}=database();const sheet=await loadPatientSheet(db,args);
 assert.equal(sheet.access,'confirmed');assert.equal((sheet.context.nächsterTermin as any).date,'2026-11-26');assert.equal((sheet.context.nächsterTermin as any).thisWeek,true);
 assert.equal((sheet.context.letzterTermin as any).date,'2026-11-20');assert.equal((sheet.context.schreibendePerson as any).rolle,'Elternteil');assert.equal((sheet.context.guthaben as any).amountEuro,27.5);
 assert.equal(sheet.fields.bisherigeAnliegen,'unavailable');assert.equal(sheet.fields.teamnotizen,'filled');
 const log=JSON.stringify(sheetLedger(sheet));assert.doesNotMatch(log,/Leon|Beispiel|27.5|Rückruf/);
});
test('today/tomorrow are local calendar dates across month changes',()=>{
 assert.equal(relativeAppointment('2026-12-01','2026-11-30').relative,'morgen');assert.equal(relativeAppointment('2026-11-23','2026-11-23').relative,'heute');
});
test('patient text guard rejects internal keys and transliterations without damaging normal German or names',()=>{
 for(const text of ['rueckmeldezeit: heute','patientId: xyz','Fuer Sie waere das moeglich.','Wir koennen das bestaetigen.','Viele Gruesse'])assert.ok(patientTextViolations(text).length,text);
 for(const text of ['Für Sie wäre das möglich. Grüße!','Neue Schuhe passen besser.','Herr Mueller, dass Sie kommen, freut uns.'])assert.deepEqual(patientTextViolations(text),[]);
});
test('sheet is given to compose and verifier, with two repairs before any text is released',async()=>{
 const {db}=database();const sheet=await loadPatientSheet(db,args);const prompts:any[]=[];let composed=0;
 const result=await runRetrievalReply(async call=>{prompts.push(JSON.parse(call.prompt));return call.schema.parse(call.stage==='verify'?{hard:[],repair:[]}:{nonPatient:false,closing:false,team:true,summary:'Draht bei Kontrolle mit ansehen.',identityQuestion:false,substantive:true,answer:++composed<=2?'rueckmeldezeit: heute':'Für Leon steht am Donnerstag, 26.11., um 15:30 Uhr eine Kontrolle an. Wir können anbieten, den Draht dabei mit anzusehen.'});},{message:args.message,messageType:'text',jid:args.chatJid,phone:args.phone,practicePhone:null,history:[],dossier:{sender:'unknown',patients:[]},patientSheet:sheet,documents:[],rules:[],teamTime:'heute noch',today:args.today,doctolibUrl:null,hasPriorConversation:true,hasPriorReply:true,identityAsked:false,preview:false,budgetMs:60000});
 assert.equal(result.repairs,2);assert.match(result.text,/Donnerstag.*15:30/);assert.doesNotMatch(result.text,/rueckmeldezeit|Für welchen Patienten/);assert.equal(prompts[0].akte.nächsterTermin.date,'2026-11-26');assert.equal(prompts.at(-1).akte.nächsterTermin.date,'2026-11-26');
});
