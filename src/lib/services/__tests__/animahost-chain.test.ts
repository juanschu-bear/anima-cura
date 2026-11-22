import assert from 'node:assert/strict';
import test from 'node:test';
import type {z} from 'zod';
import {guardReply,runChain,type ChainInput,type Generate} from '../animahost-chain';
import {dossierForModel,loadDossier,type Dossier} from '../animahost-dossier';
import type {WhatsAppRule} from '../animahost-whatsapp';
import type {PhonePatient} from '../animahost-chat-identity';

// Alle Namen, Nummern, Daten und Texte in dieser Datei sind erfunden.
const mia:PhonePatient={id:'10000000-0000-4000-8000-000000000001',vorname:'Mia',nachname:'Beispiel',geburtsdatum:'2014-04-02',geschlecht:'w'};
const jonas:PhonePatient={id:'10000000-0000-4000-8000-000000000002',vorname:'Jonas',nachname:'Beispiel',geburtsdatum:'2012-01-09',geschlecht:'m'};
const rules:WhatsAppRule[]=[
 {id:'oeffnungszeiten',topic:'Öffnungszeiten',keywords:['geöffnet'],action:'antworten',patientText:'Wir sind Dienstag bis Donnerstag von 9:00 bis 13:00 Uhr und von 14:00 bis 18:30 Uhr für Sie da.'},
 {id:'termin-verschieben',topic:'Termin verschieben',keywords:['verschieben'],action:'antworten',patientText:'Einen neuen Termin wählen Sie bitte über {doctolib_link}. Den bisherigen Termin ändere ich hier nicht.'},
 {id:'ersatzschiene',topic:'Schiene verloren',keywords:['verloren'],action:'klaerfall',patientText:'Eine Ersatzschiene kostet 80 €. Das Team meldet sich wegen der Anfertigung.'},
 {id:'notfall',topic:'Notfall',keywords:['Unfall'],action:'notfall',patientText:'Bitte rufen Sie sofort an.'}];
const dossier:Dossier={sender:'guardian',patients:[
 {id:mia.id,firstName:'Mia',lastName:'Beispiel',minor:true,verified:false,treatment:'Feste Zahnspange',appAccount:true,openedInvoicesInApp:false,invoices:'available'},
 {id:jonas.id,firstName:'Jonas',lastName:'Beispiel',minor:true,verified:true,treatment:null,appAccount:true,openedInvoicesInApp:true,invoices:'available',
  confidential:{newestInvoiceDate:'2026-10-02',lastVisits:['2026-11-10','2026-09-15'],reminders:[{invoiceDate:'2026-07-01',remindedOn:'2026-08-15'}],installmentPlan:true,nextInstallmentDue:'2026-12-01'}}]};
const input=(over:Partial<ChainInput>={}):ChainInput=>({message:'Hallo, wann haben Sie geöffnet und kann ich Mias Termin verschieben?',language:'de',informal:false,history:[],dossier,rules,
 practice:{doctolibUrl:'https://example.invalid/termin',phone:'0170 5550100',teamTime:'am Montag, 23. November',today:'2026-11-22'},baseline:null,budgetMs:30_000,...over});
const sources=(i:ChainInput)=>{const d=dossierForModel(i.dossier);return {ruleTexts:['Wir sind Dienstag bis Donnerstag von 9:00 bis 13:00 Uhr und von 14:00 bis 18:30 Uhr für Sie da.',
 'Einen neuen Termin wählen Sie bitte über https://example.invalid/termin. Den bisherigen Termin ändere ich hier nicht.','Eine Ersatzschiene kostet 80 €. Das Team meldet sich wegen der Anfertigung.'],facts:d.facts,names:d.names};};
const guard=(reply:string,over:Partial<ChainInput>={},flags={team:false,asksIdentity:false})=>{const i=input(over);return guardReply(reply,i,flags,sources(i));};

/** Ein gespieltes Modell: liefert der Reihe nach die vorbereiteten Antworten und merkt sich, was es gefragt wurde. */
function model(...answers:unknown[]){
 const calls:{system:string;prompt:Record<string,unknown>}[]=[];
 const generate:Generate=async<T,>(call:{system:string;prompt:string;schema:z.ZodType<T>})=>{
  calls.push({system:call.system,prompt:JSON.parse(call.prompt)});
  const next=answers.shift();
  if(next instanceof Error)throw next;
  return call.schema.parse(next);
 };
 return {generate,calls};
}
const draft=(antwort:string,over:Record<string,unknown>={})=>({anliegen:[{zitat:'wann haben Sie geöffnet',thema:'Öffnungszeiten',weg:'regel',regelIds:['oeffnungszeiten']}],antwort,team:false,teamZusammenfassung:null,fragtIdentitaet:false,...over});
const fine={verstoesse:[],hinweis:''};

test('the dossier keeps confidential details out unless the person is confirmed, and unknown stays unknown',async()=>{
 const tables:Record<string,unknown[]|Error>={
  patients:[{id:mia.id,behandlung:'Feste Zahnspange'},{id:jonas.id,behandlung:null}],
  user_profiles:[{patient_id:mia.id}],patient_access_memberships:[{patient_id:jonas.id}],
  invoice_access_events:[{patient_id:jonas.id}],
  doku_eintraege:[{patient_id:jonas.id,termin_datum:'2026-11-10'},{patient_id:jonas.id,termin_datum:'2026-11-10'},{patient_id:jonas.id,termin_datum:'2026-09-15'}],
  offene_posten:[{patient_id:jonas.id,rechnung_datum:'2026-07-01',mahnung_datum:'2026-08-15'}],
  ratenplaene:new Error('nicht lesbar'),raten:[{patient_id:jonas.id,faellig_am:'2026-12-01',status:'offen'}]};
 const asked:string[]=[];
 const db={
  rpc:async(_:string,args:{p_patient:string})=>({data:args.p_patient===mia.id?{cause:'already_available',invoiceDate:'2026-10-05'}:{cause:'no_invoice',invoiceDate:null},error:null}),
  from(table:string){
   asked.push(table);
   const result=()=>{const rows=tables[table];return rows instanceof Error?{data:null,error:{message:'x'}}:{data:rows??[],error:null};};
   const chain:Record<string,unknown>={};
   for(const name of ['select','eq','in','not','lte','gte','order','limit'])chain[name]=()=>chain;
   chain.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve);
   return chain;
  }} as never;
 const loaded=await loadDossier(db,{patients:[mia,jonas],verifiedIds:[jonas.id,'99999999-0000-4000-8000-000000000009'],today:'2026-11-22'});
 assert.equal(loaded.sender,'guardian');
 const [first,second]=loaded.patients;
 // Unbestätigt: Zugang, Behandlung und „Rechnungen abrufbar“, aber kein Datum, keine Besuche, keine Mahnung.
 assert.deepEqual(first,{id:mia.id,firstName:'Mia',lastName:'Beispiel',minor:true,verified:false,treatment:'Feste Zahnspange',appAccount:true,openedInvoicesInApp:false,invoices:'available'});
 assert.equal('confidential' in first,false);
 // Bestätigt: Besuche ohne Doppelte, Erinnerung, nächste Rate. Nicht Lesbares ist unbekannt und nie „keine“.
 assert.deepEqual(second.confidential,{newestInvoiceDate:null,lastVisits:['2026-11-10','2026-09-15'],reminders:[{invoiceDate:'2026-07-01',remindedOn:'2026-08-15'}],installmentPlan:null,nextInstallmentDue:'2026-12-01'});
 assert.equal(second.invoices,'none');
 const forModel=dossierForModel(loaded);
 const text=JSON.stringify(forModel.akte);
 assert.doesNotMatch(text,/05\.10\.2026/);
 assert.match(text,/"ratenzahlung":"unbekannt"/);
 assert.deepEqual(forModel.facts.sort(),['01.07.2026','01.12.2026','10.11.2026','15.08.2026','15.09.2026']);
 // Ohne Akte an der Nummer wird nichts abgefragt.
 const before=asked.length;
 assert.deepEqual(await loadDossier(db,{patients:[],verifiedIds:[],today:'2026-11-22'}),{sender:'unknown',patients:[]});
 assert.equal(asked.length,before);
 // 1 erwachsener Patient an der Nummer: vermutlich der Patient selbst.
 const adult=await loadDossier(db,{patients:[{...mia,geburtsdatum:'1990-01-01'}],verifiedIds:[],today:'2026-11-22'});
 assert.equal(adult.sender,'patient');
});

test('fixed limits: links, times, dates, phone numbers, amounts and names must come from the sources',()=>{
 assert.deepEqual(guard('Wir sind Dienstag bis Donnerstag von 9 bis 13 Uhr und von 14 bis 18:30 Uhr für Sie da. Mias Termin wählen Sie bitte neu über https://example.invalid/termin.'),[]);
 assert.deepEqual(guard('Kommen Sie gern um 17:15 Uhr vorbei.'),['uhrzeit_nicht_in_quellen']);
 assert.deepEqual(guard('Der nächste freie Termin ist am 03.12.'),['datum_nicht_in_quellen']);
 assert.deepEqual(guard('Buchen Sie hier: https://example.invalid/anders'),['fremder_link']);
 assert.deepEqual(guard('Rufen Sie bitte 0341 9999999 an.'),['telefonnummer_nicht_in_quellen']);
 assert.deepEqual(guard('Rufen Sie bitte 0170 5550100 an.'),[]);
 assert.deepEqual(guard('Offen sind noch 120 €.'),['betrag']);
 // Ein Betrag aus einer Regel ist erlaubt, ein Datum aus der bestätigten Akte auch.
 assert.deepEqual(guard('Eine Ersatzschiene kostet 80 €. Das gebe ich ans Team weiter, es meldet sich am Montag, 23. November bei Ihnen.',{message:'Mia hat ihre Schiene verloren.'},{team:true,asksIdentity:false}),[]);
 assert.deepEqual(guard('Die nächste Rate ist am 01.12.2026 fällig.',{message:'Wann ist die nächste Rate von Jonas fällig?'}),[]);
 // Namen: Jonas steht in der Akte, die Nachricht nennt ihn aber nicht.
 assert.deepEqual(guard('Für Jonas ist alles in Ordnung.'),['name_nicht_genannt']);
 assert.deepEqual(guard('Für Mia ist das möglich.'),[]);
 // Übergabe: mit Zeit und gemeldet, sonst gesperrt.
 assert.deepEqual(guard('Das gebe ich an unser Praxisteam weiter.',{},{team:true,asksIdentity:false}),['team_ohne_zeit']);
 assert.deepEqual(guard('Das klärt unser Praxisteam, es meldet sich bei Ihnen.'),['uebergabe_nicht_gemeldet']);
 assert.deepEqual(guard('Dafür brauche ich kurz Ihre Hilfe.',{},{team:false,asksIdentity:true}),['frage_nach_geburtsdatum_fehlt']);
 assert.deepEqual(guard('Schreiben Sie mir bitte Ihre Patientennummer.'),['patientennummer']);
 assert.deepEqual(guard('   '),['leer']);
});

test('the chain answers freely from rules and dossier and reports every concern',async()=>{
 const reply='Wir sind Dienstag bis Donnerstag von 9:00 bis 13:00 Uhr und von 14:00 bis 18:30 Uhr für Sie da. Einen neuen Termin für Mia wählen Sie bitte über https://example.invalid/termin.';
 const {generate,calls}=model(draft(reply,{anliegen:[{zitat:'wann haben Sie geöffnet',thema:'Öffnungszeiten',weg:'regel',regelIds:['oeffnungszeiten']},
  {zitat:'kann ich Mias Termin verschieben',thema:'Termin verschieben',weg:'regel',regelIds:['termin-verschieben','gibt-es-nicht']}]}),fine);
 const result=await runChain(generate,input());
 assert.equal(result.ok,true);
 if(!result.ok)return;
 assert.equal(result.action,'antworten');assert.equal(result.rule,'chain:answered');assert.equal(result.text,reply);
 assert.deepEqual(result.usedRuleIds,['oeffnungszeiten','termin-verschieben']);
 assert.deepEqual(result.concerns.map(item=>item.way),['regel','regel']);
 assert.equal(result.attempts,1);
 // Das Modell bekommt Akte, Regeln als Wissen und die Rückmeldezeit, aber weder die Notfallregel noch Vertrauliches zu Mia.
 const asked=calls[0].prompt;
 assert.equal(asked.rueckmeldezeitTeam,'am Montag, 23. November');
 assert.deepEqual((asked.regeln as {id:string}[]).map(rule=>rule.id),['oeffnungszeiten','termin-verschieben','ersatzschiene']);
 assert.match(JSON.stringify(asked.regeln),/example\.invalid\/termin/);
 const patients=(asked.akte as {patienten:Record<string,unknown>[]}).patienten;
 assert.equal('vertraulich' in patients[0],false);assert.equal('vertraulich' in patients[1],true);
 // Der 2. Durchgang prüft genau diese Antwort.
 assert.equal(calls[1].prompt.vorgeschlageneAntwort,reply);
});

test('a draft that breaks a fixed limit gets 1 correction and is then checked again',async()=>{
 const good='Wir sind Dienstag bis Donnerstag von 9:00 bis 13:00 Uhr und von 14:00 bis 18:30 Uhr für Sie da.';
 const {generate,calls}=model(draft('Kommen Sie einfach morgen um 17:15 Uhr.'),draft(good),fine);
 const result=await runChain(generate,input({message:'Wann haben Sie geöffnet?'}));
 assert.equal(result.ok&&result.text,good);
 assert.equal(result.ok&&result.attempts,2);
 // Der Entwurf mit der erfundenen Uhrzeit ging nie in die Gegenprüfung: Die Schranke im Code hat ihn vorher gestoppt.
 assert.equal(calls.length,3);
 assert.deepEqual(calls[1].prompt.beanstandet,['uhrzeit_nicht_in_quellen']);
 assert.equal(calls[1].prompt.vorherigerEntwurf,'Kommen Sie einfach morgen um 17:15 Uhr.');
});

test('an answer that fails twice is never sent: the caller keeps its approved answer',async()=>{
 const text='Wir sind Dienstag bis Donnerstag von 9:00 bis 13:00 Uhr und von 14:00 bis 18:30 Uhr für Sie da.';
 const twice=await runChain(model(draft(text),{verstoesse:['anliegen_uebergangen'],hinweis:'Terminfrage fehlt'},draft(text),{verstoesse:['anliegen_uebergangen'],hinweis:'fehlt weiter'}).generate,input());
 assert.deepEqual({ok:twice.ok,reason:!twice.ok&&twice.reason,violations:!twice.ok&&twice.violations},{ok:false,reason:'rejected',violations:['anliegen_uebergangen']});
 const broken=await runChain(model(new Error('Zeitüberschreitung')).generate,input());
 assert.equal(!broken.ok&&broken.reason,'model_failed');
 const late=await runChain(model().generate,input({budgetMs:3_000}));
 assert.equal(!late.ok&&late.reason,'no_time');
});

test('emergencies and opt-outs never run through the chain',async()=>{
 const {generate,calls}=model();
 for(const message of ['Mein Sohn hatte einen Unfall und blutet stark','Bitte keine Nachrichten mehr'])
  assert.equal((await runChain(generate,input({message}))).ok,false);
 assert.equal(calls.length,0);
});

test('handing over to the team: time is stated, the practice gets a summary, and an approved answer keeps its rule',async()=>{
 const reply='Eine Ersatzschiene kostet 80 €. Die Anfertigung gebe ich an unser Praxisteam weiter, es meldet sich am Montag, 23. November bei Ihnen.';
 const team=draft(reply,{anliegen:[{zitat:'Schiene verloren',thema:'Ersatzschiene',weg:'team',regelIds:['ersatzschiene']}],team:true,teamZusammenfassung:'Mia hat ihre Schiene verloren und braucht Ersatz.'});
 const result=await runChain(model(team,fine).generate,input({message:'Mia hat ihre Schiene verloren. Was nun?'}));
 assert.equal(result.ok&&result.action,'klaerfall');assert.equal(result.ok&&result.rule,'chain:team');
 assert.equal(result.ok&&result.teamSummary,'Mia hat ihre Schiene verloren und braucht Ersatz.');
 // Mit Vorgabe gleicher Art bleibt deren Regel, damit Protokoll und Leitstand unverändert auswerten können.
 const kept=await runChain(model(team,fine).generate,input({message:'Mia hat ihre Schiene verloren. Was nun?',baseline:{action:'klaerfall',rule:'ersatzschiene',text:'Eine Ersatzschiene kostet 80 €. Das Team meldet sich wegen der Anfertigung.'}}));
 assert.equal(kept.ok&&kept.rule,'ersatzschiene');
 // Aus einer Rückfall-Übergabe wird eine Antwort, wenn die Kette alles selbst klären kann.
 const open='Wir sind Dienstag bis Donnerstag von 9:00 bis 13:00 Uhr und von 14:00 bis 18:30 Uhr für Sie da.';
 const upgraded=await runChain(model(draft(open),fine).generate,input({message:'Wann haben Sie geöffnet?',baseline:{action:'klaerfall',rule:'fallback:other',text:'Danke für Ihre Nachricht. Das Team meldet sich am Montag, 23. November bei Ihnen.'}}));
 assert.equal(upgraded.ok&&upgraded.action,'antworten');assert.equal(upgraded.ok&&upgraded.rule,'chain:answered');
 // Fragt die Kette nach der Person, ist das als eigener Weg sichtbar.
 const identity=await runChain(model(draft('Das sehe ich mir gern an. Schreiben Sie mir bitte den Vor- und Nachnamen und das Geburtsdatum des Patienten.',{anliegen:[{zitat:'Mahnung',thema:'Mahnung',weg:'identitaet',regelIds:[]}]}),fine).generate,
  input({message:'Warum habe ich eine Mahnung bekommen?'}));
 assert.equal(identity.ok&&identity.rule,'chain:identity');assert.equal(identity.ok&&identity.asksIdentity,true);
});
