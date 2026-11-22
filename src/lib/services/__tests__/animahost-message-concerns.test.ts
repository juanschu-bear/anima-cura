import test from 'node:test';
import {enforceConversationOutput} from '../animahost-whatsapp-conversation';
import assert from 'node:assert/strict';
import {applicableMessageRules,combinedMessageWorkflow,personRequest,personRequestReply,practiceMessageHandoff,unlinkedAppointmentReply,unlinkedSubjectPlan} from '../animahost-message-concerns';
import {qualityWorkflow} from '../animahost-quality-workflows';
import type {ChatContext} from '../animahost-chat-identity';
import {selectPhonePatient,type PhonePatient} from '../animahost-chat-identity';
import {styleMessage,invoicePortalIntent} from '../animahost-quality-workflows';
import {matchApprovedRuleFallback} from '../animahost-whatsapp-fallback';
import type {WhatsAppRule} from '../animahost-whatsapp';
// Every name, identity, message and URL in this file is fictional.
const children:PhonePatient[]=[{id:'10000000-0000-4000-8000-000000000001',vorname:'Milan',nachname:'Beispiel',geburtsdatum:'2014-01-01',geschlecht:'m'},
 {id:'10000000-0000-4000-8000-000000000002',vorname:'Nora',nachname:'Beispiel',geburtsdatum:'2016-01-01',geschlecht:'w'}];
const opts={language:'de',receivedAt:'2026-11-22T09:10:00+01:00',firstReply:true,informal:false,teamTime:'am Montag',incoming:'Es geht um Milan.'};
const rules:WhatsAppRule[]=[{id:'greeting',topic:'Begrüßung',keywords:['Hallo'],action:'antworten',patientText:'Guten Tag, wie können wir Ihnen helfen?'},
 {id:'reschedule',topic:'Termin verschieben',keywords:['verschieben'],action:'antworten',patientText:'Bitte wählen Sie einen neuen Termin über {doctolib_link}. Der bestehende Termin wird hier nicht geändert.'}];
const text='Hallo, ich möchte Milans Termin am Mittwoch auf die Woche ab 30.11. verschieben, ab 15 Uhr. Die Rechnung aus der Benachrichtigung lässt sich nicht abrufen.';
const input={tenantId:children[0].id,from:'491700000001@s.whatsapp.net',phone:'491700000001',receivedAt:opts.receivedAt,text,language:'de',teamTime:'am Montag',patients:children,patient:children[0],context:{},doctolib:'https://example.invalid/termin',closures:[]};
test('style never prepends a name to a greeting, general answer or fallback, including followups',()=>{
 for(const firstReply of [true,false])for(const decision of [rules[0]&&{rule:'greeting',action:'antworten' as const,text:rules[0].patientText},
  {rule:'fallback:billing',action:'klaerfall' as const,text:'Danke für Ihre Nachricht. Das Team meldet sich am Montag.'},
  {rule:'general',action:'antworten' as const,text:'Unsere Öffnungszeiten finden Sie auf der Website.'}])
  assert.equal(styleMessage(decision,children[0],{...opts,firstReply}).text,decision.text);
});
test('siblings require an unambiguous name; an unknown named child never becomes a sibling',()=>{
 assert.equal(selectPhonePatient(children,'Hallo, wann ist der Termin?'),null);
 assert.equal(selectPhonePatient(children,text)?.id,children[0].id);
 const unknown=text.replace('Milans','Tamios');
 assert.equal(selectPhonePatient(children,unknown),null);
 const result=practiceMessageHandoff(unknown,children,'de','am Montag')!;
 assert.equal(result.decision.action,'klaerfall');
 assert.doesNotMatch(result.decision.text,/Milan|Nora|Tamio/);
 assert.equal(result.details?.requestedName,'Tamio');
 assert.match(result.details?.practiceSummary??'',/Tamios.*30.11.*15 Uhr.*Rechnung/);
});
test('greeting cannot swallow concrete concerns even when the model is unavailable',()=>{
 assert.equal(applicableMessageRules(text,rules).some(r=>r.id==='greeting'),false);
 assert.deepEqual(matchApprovedRuleFallback(text,rules),['reschedule']);
 assert.equal(applicableMessageRules('Hallo!',rules).some(r=>r.id==='greeting'),true);
 assert.equal(invoicePortalIntent(text),'missing');
});
test('one message executes the invoice check and preserves the appointment answer and all dates',async()=>{
 const calls:unknown[]=[];
 const db={rpc:async(name:string,args:unknown)=>{calls.push({name,args});return {data:{cause:'already_available',invoiceDate:'2026-10-01'},error:null};}} as never;
 const result=await combinedMessageWorkflow(db,input,rules);
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0],{name:'animahost_invoice_portal_visibility',args:{p_patient:children[0].id,p_from:null,p_through:null}});
 assert.match(result!.decision.text,/example.invalid\/termin/);
 assert.match(result!.decision.text,/Rechnung.*Milan|Milan.*Rechnung/);
 assert.doesNotMatch(result!.decision.text,/wie können wir Ihnen helfen|Für .* gilt Folgendes/);
 assert.deepEqual(result!.details?.concerns,['appointment','invoice']);
 assert.match(result!.details?.practiceSummary??'',/Mittwoch.*30.11.*15 Uhr.*Rechnung/);
});
// Juan, 22.11.2026: Eine Anrede ans Team ist kein Grund für eine Übergabe. Dafür ist das System da.
test('addressing a team member by name does not hand the message to the team',()=>{
 const addressed=text.replace('Hallo,','Hallo Frau Muster,');
 assert.equal(practiceMessageHandoff(addressed,children,'de','am Montag'),null);
 assert.equal(personRequest(addressed),'none');
 for(const plain of ['Hallo Frau Muster, wann haben Sie geöffnet?','Guten Tag Herr Beispiel, in der App kommt eine Fehlermeldung bei der Rechnung.',
  'Liebe Frau Muster, wir kommen am Dienstag 10 Minuten später.','Meine Frau holt die Schiene ab.','Hallo, wann ist die Praxis geöffnet?'])assert.equal(personRequest(plain),'none',plain);
});

test('the wish for a person is answered with help first and reaches the team only on the 3rd request',()=>{
 for(const wish of ['Ich möchte lieber mit Frau Muster sprechen.','Kann mich Frau Muster bitte anrufen?','Ich will mit einem echten Menschen sprechen','Bitte um Rückruf','Rufen Sie mich bitte zurück',
  'Hallo Frau Muster, bitte antworten Sie uns.','Ich hoffe das uns Frau Muster am Montag antwortet','Kein Bot bitte, ich möchte mit jemandem reden'])assert.equal(personRequest(wish),'only',wish);
 // Mit einem Anliegen dabei beantwortet der normale Weg das Anliegen.
 for(const mixed of ['Ich möchte lieber mit Frau Muster sprechen, weil die Zahnspange von Milan gebrochen ist.',
  'Kann mich Frau Muster anrufen? Es geht um die Ratenzahlung für die Behandlung.'])assert.equal(personRequest(mixed),'with_concern',mixed);
 const reply=(lastAction:string|null,lastRule:string|null,automatic=true)=>personRequestReply({text:'Ich möchte lieber mit Frau Muster sprechen.',language:'de',teamTime:'am Montag',automatic,lastAction,lastRule});
 const first=reply(null,null),second=reply('antworten','quality:prefers_person:1'),third=reply('antworten','quality:prefers_person:2');
 assert.equal(first.decision.action,'antworten');assert.equal(first.decision.rule,'quality:prefers_person:1');
 assert.match(first.decision.text,/helfe ich Ihnen gern sofort weiter.*worum es geht/);
 assert.equal(second.decision.action,'antworten');assert.equal(second.decision.rule,'quality:prefers_person:2');
 assert.notEqual(second.decision.text,first.decision.text);
 assert.equal(third.decision.action,'klaerfall');assert.equal(third.decision.rule,'quality:personal_team');
 assert.match(third.decision.text,/vollständige Nachricht mit allen Anliegen.*Team.*am Montag/);
 assert.ok(third.details?.practiceSummary?.endsWith('Ich möchte lieber mit Frau Muster sprechen.'));
 // Kein Name eines Teammitglieds und kein Versprechen über eine bestimmte Person in den Antworten.
 for(const answer of [first,second,third])assert.doesNotMatch(answer.decision.text,/Muster|Milan|Nora/);
 // Nach einer normalen Antwort beginnt die Zählung neu.
 assert.equal(reply('antworten','oeffnungszeiten').decision.rule,'quality:prefers_person:1');
 // Liegt schon ein Fall beim Team, ist die Nachricht eine Ergänzung dazu. Ohne automatische Antworten geht sie immer ans Team.
 assert.equal(reply('klaerfall','fallback:other').decision.rule,'quality:personal_team');
 assert.equal(reply(null,null,false).decision.rule,'quality:personal_team');
});

test('a failed invoice check keeps the appointment answer and a complete team case',async()=>{
 const db={rpc:async()=>({data:null,error:{message:'unavailable'}})} as never;
 const result=await combinedMessageWorkflow(db,input,rules);
 assert.equal(result?.decision.action,'klaerfall');
 assert.match(result?.decision.text??'',/example.invalid/);
 assert.equal(result?.details?.cause,'manual_review');
 assert.deepEqual(result?.details?.concerns,['appointment','invoice']);
 assert.ok(result?.details?.practiceSummary?.endsWith(text));
});

test('a personal follow-up does not falsely claim that the assistant is stuck',()=>{
 const decision=personRequestReply({text:'Hallo Frau Muster, bitte antworten Sie uns.',language:'de',teamTime:'am Montag',automatic:true,lastAction:'klaerfall',lastRule:'fallback:other'}).decision;
 const followup=enforceConversationOutput(decision,[{direction:'outgoing',text:decision.text,at:opts.receivedAt}],
  'de',{receivedAt:'2026-11-22T09:11:00+01:00',teamTime:'am Montag'});
 assert.equal(followup.rule,'quality:personal_team');
 assert.match(followup.text,/Ergänzung.*09:11.*vollständig.*Praxisteam/);
 assert.doesNotMatch(followup.text,/komme.*nicht weiter|Für .* gilt/);
});

// Juan, 22.11.2026: Schreibt jemand über ein Kind, das nicht an der Nummer hängt, soll AnimaHost weiterhelfen statt alles zu übergeben.
// So war der Fall von 09:10 Uhr: Die Nummer kannte 1 Kind, die Nachricht ging um ein anderes.
const tamio={id:'10000000-0000-4000-8000-000000000009',vorname:'Tamio',nachname:'Beispiel',geburtsdatum:'2015-02-01',geschlecht:'m',ivoris_nummer:'004799'};
function familyDb(){
 const calls:{name:string;args:unknown}[]=[],saved:unknown[]=[];
 const db={
  rpc:async(name:string,args:unknown)=>{calls.push({name,args});
   const patient=(args as {p_patient:string|null}).p_patient;
   return {data:patient?{cause:'already_available',invoiceDate:'2026-10-01'}:{cause:'no_invoice',invoiceDate:null},error:null};},
  from(table:string){
   let day='';
   const chain={select:()=>chain,eq:(column:string,value:string)=>{if(column==='geburtsdatum')day=value;return chain;},
    limit:async()=>({data:table==='patients'?[tamio].filter(p=>p.geburtsdatum===day):[],error:null}),
    maybeSingle:async()=>({data:null,error:null}),upsert:async(row:unknown)=>{saved.push(row);return {error:null};}};
   return chain;
  }} as never;
 return {db,calls,saved};
}

test('an unlinked child: invoice is settled by name and date of birth across all records, never against a sibling',async()=>{
 const unknown='Hallo Frau Muster, die Rechnung für Tamio lässt sich in der App nicht öffnen.';
 assert.equal(selectPhonePatient(children,unknown),null);
 assert.equal(unlinkedSubjectPlan(unknown),'identify');
 const {db,calls,saved}=familyDb();
 const context:ChatContext={};
 const base={...input,patient:null,context,unlinkedSubject:'Tamio'};
 const first=await qualityWorkflow(db,{...base,text:unknown});
 // Keine Frage „Milan oder Nora?“ und keine Prüfung gegen ein Geschwisterkind: AnimaHost fragt nach Name und Geburtsdatum.
 assert.equal(first?.decision.rule,'identity:missing_invoice');
 assert.equal(first?.decision.action,'antworten');
 assert.match(first?.decision.text??'',/Vor- und Nachnamen und das Geburtsdatum/);
 assert.doesNotMatch(first?.decision.text??'',/Milan|Nora|Team/);
 assert.equal(context.challenge?.anyPatient,true);
 assert.equal(calls.some(call=>children.some(child=>(call.args as {p_patient:string|null}).p_patient===child.id)),false);
 // Die Antwort des Patienten in einem ganzen Satz: gefunden in allen Akten, geprüft wird genau dieses Kind.
 const second=await qualityWorkflow(db,{...base,text:'Tamio Beispiel, geboren am 01.02.2015'});
 assert.match(second?.decision.rule??'',/^invoice_portal:/);
 assert.equal(second?.details?.patientId,tamio.id);
 assert.deepEqual((calls.at(-1)?.args as {p_patient:string}).p_patient,tamio.id);
 assert.equal((saved[0] as {patient_id:string}).patient_id,tamio.id);
 assert.equal(context.challenge,undefined);
});

test('an unlinked child: a wrong name or date of birth never reveals anything and goes to the team',async()=>{
 const {db}=familyDb();
 const context:ChatContext={};
 const base={...input,patient:null,context,unlinkedSubject:'Tamio'};
 await qualityWorkflow(db,{...base,text:'Die Rechnung für Tamio lässt sich nicht öffnen.'});
 for(const wrong of ['Tamio Beispiel, 02.02.2015','Timo Beispiel, 01.02.2015','Tamio, 01.02.2015']){
  const result=await qualityWorkflow(db,{...base,text:wrong});
  assert.equal(result?.decision.action,'klaerfall',wrong);
  assert.equal(result?.details?.patientId,null,wrong);
  assert.doesNotMatch(result?.decision.text??'',/Tamio|im Portal|verfügbar/,wrong);
 }
 // Ohne den Hinweis auf ein nicht verknüpftes Kind bleibt die Suche auf die Akten der Nummer begrenzt.
 const linkedOnly:ChatContext={challenge:{kind:'missing_invoice',question:'Rechnung fehlt',attempts:0,at:opts.receivedAt}};
 const result=await qualityWorkflow(db,{...input,patient:null,context:linkedOnly,text:'Tamio Beispiel, 01.02.2015'});
 assert.equal(result?.details?.patientId,null);
});

test('an unlinked child: a plain appointment wish is answered at once and the practice gets the name and the full message',()=>{
 const wish='Hallo, ich möchte Tamios Termin am Mittwoch auf die Woche ab 30.11. verschieben, ab 15 Uhr.';
 assert.equal(unlinkedSubjectPlan(wish),'appointment');
 const reply=unlinkedAppointmentReply(wish,rules,{receivedAt:opts.receivedAt,language:'de',doctolib:'https://example.invalid/termin'})!;
 assert.equal(reply.decision.action,'antworten');
 assert.equal(reply.decision.rule,'appointment_notice:reschedule:routine');
 assert.match(reply.decision.text,/example.invalid\/termin/);
 assert.doesNotMatch(reply.decision.text,/Milan|Nora|Tamio/);
 assert.equal(reply.details?.requestedName,'Tamio');
 assert.ok(reply.details?.practiceSummary?.endsWith(wish));
 // Änderungen an Daten und alles Unklare bleiben beim Team.
 assert.equal(unlinkedSubjectPlan('Bitte ändern Sie die Adresse von Tamio auf Musterweg 1.'),'team');
 assert.equal(unlinkedSubjectPlan('Tamios Zahnspange ist gebrochen.'),'team');
 assert.equal(unlinkedAppointmentReply('Tamios Zahnspange ist gebrochen.',rules,{receivedAt:opts.receivedAt,language:'de',doctolib:null}),null);
});

test('an unlinked child with appointment and invoice: answer, team note for the appointment, then the question the patient should answer',async()=>{
 const {db}=familyDb();
 const both=text.replace('Milans','Tamios');
 const result=await combinedMessageWorkflow(db,{...input,text:both,patient:null,context:{},unlinkedSubject:'Tamio'},rules);
 assert.equal(result?.decision.rule,'quality:multiple_concerns');
 const parts=(result?.decision.text??'').split('\n\n');
 assert.equal(parts.length,3);
 assert.match(parts[0],/example.invalid\/termin/);
 assert.match(parts[1],/Terminwunsch.*Praxisteam.*am Montag.*noch nicht geändert/);
 assert.match(parts[2],/Vor- und Nachnamen und das Geburtsdatum/);
 assert.doesNotMatch(result?.decision.text??'',/Milan|Nora|Rückmeldung zur Rechnung/);
 assert.equal(result?.details?.requestedName,'Tamio');
});
