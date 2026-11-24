import assert from 'node:assert/strict';
import test from 'node:test';
import {runRetrievalReply,retrievalPreflight,hardReplyViolations,type RetrievalInput} from '../animahost-retrieval-core';
import type {Generate} from '../animahost-chain';
import type {RetrievalDocument} from '../animahost-retrieval';
import {anonymizeRetrieval} from '../animahost-retrieval-privacy';
import {historyPairDocuments,type ArchiveMessage} from '../animahost-history-pairs';
const input=(over:Partial<RetrievalInput>={}):RetrievalInput=>({message:'Kunststoff ab, tut weh. Online erst im Dezember.',messageType:'text',jid:'4915100000000@s.whatsapp.net',phone:'4915100000000',practicePhone:'4915100000001',
 history:[],dossier:{sender:'unknown',patients:[]},documents:[],rules:[],teamTime:'heute noch',today:'2026-11-23',doctolibUrl:'https://example.invalid/termin',hasPriorConversation:false,hasPriorReply:false,identityAsked:false,preview:false,budgetMs:17000,...over});
const answer=(over:Record<string,unknown>={})=>({answer:'Das ist unangenehm. Bitte rufen Sie bei Schmerzen direkt in der Praxis an. Der Empfang prüft, ob ein früherer Termin frei ist.',team:true,summary:'Ob ein früherer Termin frei ist prüfen.',identityQuestion:false,substantive:true,nonPatient:false,closing:false,...over});
const valid={hard:[],repair:[]};
function model(...answers:unknown[]){const calls:any[]=[];const generate:Generate=async call=>{calls.push(call);return call.schema.parse(answers.shift());};return {generate,calls};}
test('anbieterbedingte Antwortausfälle sind bei Erstellung und Prüfung unterscheidbar',async()=>{
 for(const [stage,httpStatus] of [['compose',402],['verify',429]] as const){
  const generate:Generate=async call=>{
   if(call.stage===stage)throw Object.assign(new Error('provider failure'),{statusCode:httpStatus});
   return call.schema.parse(answer());
  };
  const result=await runRetrievalReply(generate,input());
  assert.equal(result.action,'klaerfall');
  assert.equal(result.rule,'retrieval:safe_fallback');
  assert.equal(result.safeFallback,true);
  assert.ok(result.text);
  assert.deepEqual(result.error,{code:'model_budget_exhausted',stage,httpStatus});
 }
});
test('unlinked pain patient is not excluded; only configured team, groups and non-patients are excluded',async()=>{
 assert.equal(retrievalPreflight(input()),null);
 for(const over of [{teamPhones:'4915100000000'},{jid:'123456@g.us'},{nonPatientPhones:'4915100000000'}])assert.equal(retrievalPreflight(input(over))?.excluded,true);
 const m=model(answer(),valid);const result=await runRetrievalReply(m.generate,input());
 assert.equal(result.excluded,false);assert.equal(result.substantive,true);assert.equal(result.identityQuestion,false);
 assert.match(result.text,/früherer Termin/);assert.doesNotMatch(result.text,/heute noch|Namen/);
});
test('empty, reaction and acknowledgments never call the model; stickers reach clarification',async()=>{
 const fail:Generate=async()=>{throw Error('must not call model');};
 for(const [messageType,message] of [['text',''],['system',''],['protocol',''],['reaction','👍'],['text','Danke']]){
  const result=await runRetrievalReply(fail,input({messageType,message,hasPriorConversation:true,hasPriorReply:true}));
  assert.equal(result.skipSend,true);assert.equal(result.action,'antworten');assert.equal(result.text,'');
 }
 assert.equal(retrievalPreflight(input({message:'',messageType:'sticker'})),null);
 assert.match(retrievalPreflight(input({message:'',messageType:'unsupported'}))!.text,/Deutsch oder Englisch/);
});
test('previous system answers are not facts and no team time is appended',async()=>{
 const m=model(answer(),valid);
 const result=await runRetrievalReply(m.generate,input({history:[{direction:'outgoing',text:'UNTRUSTED BOOKING CLAIM',at:'2026-11-23T10:00:00Z'},{direction:'incoming',text:'Es gibt noch keine Uhrzeit.',at:'2026-11-23T10:01:00Z'}]}));
 assert.doesNotMatch(result.text,/heute noch/);assert.doesNotMatch(m.calls[0].prompt,/UNTRUSTED/);assert.match(m.calls[0].prompt,/keine Uhrzeit/);
 assert.deepEqual(m.calls.map(c=>c.stage),['compose','verify']);
});
test('a standard handoff is rewritten and the team interval is available only when asked',async()=>{
 const m=model(answer({answer:'Ich gebe Ihren Wunsch an das Praxisteam weiter.'}),answer(),valid);
 const result=await runRetrievalReply(m.generate,input());
 assert.equal(result.repairs,1);assert.doesNotMatch(result.text,/weiter|heute noch/);
 assert.equal(JSON.parse(m.calls[0].prompt).rueckmeldezeit,null);
 const asked=model(answer({answer:'Der Empfang prüft die Terminverfügbarkeit und meldet sich heute noch.'}),valid);
 await runRetrievalReply(asked.generate,input({message:'Wann meldet sich die Praxis wegen meines Termins?'}));
 assert.equal(JSON.parse(asked.calls[0].prompt).rueckmeldezeit,'heute noch');
});
test('repairable critique gets exactly one repair; medical and invented booking output never passes',async()=>{
 const m=model(answer({team:false,answer:'Ich gebe Ihren Wunsch ans Team.'}),{hard:[],repair:[{issue:'team_handoff',quote:'Ich gebe Ihren Wunsch ans Team.'}]},answer({answer:'Der Empfang prüft, ob ein früherer Termin frei ist.'}),valid);
 const result=await runRetrievalReply(m.generate,input());assert.equal(result.repairs,1);assert.equal(result.skipSend,undefined);
 const bad=model(answer({answer:'Nehmen Sie 400 mg Ibuprofen.'}),answer({answer:'Nehmen Sie 400 mg Ibuprofen.'}));
 const safe=await runRetrievalReply(bad.generate,input());
 assert.equal(safe.safeFallback,true);assert.doesNotMatch(safe.text,/Ibuprofen|400 mg/);
 assert.ok(hardReplyViolations('Ich habe Ihren Termin gebucht.').includes('booking'));
});
test('names and identifiers are removed before indexing; human pairs do not consume later bot answers',()=>{
 const safe=anonymizeRetrieval('Mein Sohn Fabian Muster hat Schmerzen. Mail f@example.invalid, 0176 12345678, Patientennummer 123456.', ['Fabian','Muster']);
 assert.doesNotMatch(safe,/Fabian|Muster|123456|example/);
 const row=(id:string,from_me:boolean,body:string,message_at:string):ArchiveMessage=>({id,message_id:id,chat_jid:'4915100000000@s.whatsapp.net',message_type:'text',from_me,body,message_at});
 const docs=historyPairDocuments([row('a',false,'Bei Fabian ist der Draht ab.','2026-11-20T09:00:00Z'),row('b',true,'Fabian kann mit Wartezeit kommen.','2026-11-20T10:00:00Z'),row('c',false,'Wann soll ich kommen?','2026-11-21T09:00:00Z'),row('d',true,'Automatische Antwort.','2026-11-21T10:00:00Z')],['Fabian'],new Set(['d']),'2026-11-21T00:00:00Z');
 assert.equal(docs.length,1);assert.doesNotMatch(docs[0].content,/Fabian|491510/);assert.equal(docs[0].payload.factsOnly,true);
});

test('the source ledger reflects the structured input, including when a checked fallback replaces an unsafe answer',async()=>{
 const document=(kind:RetrievalDocument['kind'],number:number,draft=false):RetrievalDocument=>({
  kind,ref:kind+'-'+number,version:3,source_at:'2026-11-23T00:00:00Z',title:'Titel '+number,content:'Suchindex',
  payload:kind==='knowledge'?{content:'Geprüfter Inhalt',guidance:{selfHelp:'A',practice:'B',reception:'C',warningSigns:'D'}}:
   {question:'Früherer Fall',answer:'Allgemeine Unterstützung'},draft,content_hash:'test',
 });
 const documents=[...Array.from({length:51},(_,index)=>document('knowledge',index,true)),
  document('gold',1),document('history',1),document('rule',1)];
 const simulation=model(answer(),{hard:['invented_action'],repair:[]});
 const withheld=await runRetrievalReply(simulation.generate,input({documents,preview:true}));
 const prompt=JSON.parse(simulation.calls[0].prompt);
 assert.equal(prompt.wissen.length,8);
 assert.deepEqual(prompt.wissen[0],{titel:'Titel 0',inhalt:'Geprüfter Inhalt',selbsthilfe:'A',praxis:'B',rezeption:'C',warnzeichen:'D'});
 assert.equal(prompt.regeln.length,1);
 assert.equal(prompt.gold.length,1);
 assert.equal(prompt.praxisfaelle.length,1);
 assert.equal(withheld.safeFallback,true);
 assert.equal(withheld.repairs,1);
 assert.equal(withheld.retrieved.knowledge.length,8);
 assert.deepEqual(withheld.retrieved.knowledge[0],{kind:'knowledge',ref:'knowledge-0',version:3,date:'2026-11-23T00:00:00Z',preview:true});
 assert.equal(withheld.retrieved.gold[0]?.ref,'gold-1');
 assert.equal(withheld.retrieved.rule[0]?.ref,'rule-1');
 assert.equal(withheld.retrieved.history[0]?.ref,'history-1');
 assert.equal(simulation.calls[1].reasoning,'none');
 const verify=JSON.parse(simulation.calls[1].prompt);
 assert.equal('gold' in verify,false);
 assert.equal('used' in verify.antwort,false);
 const live=model(answer(),valid);
 const accepted=await runRetrievalReply(live.generate,input({documents,preview:false}));
 assert.deepEqual(accepted.retrieved.knowledge,[]);
 assert.deepEqual(JSON.parse(live.calls[0].prompt).wissen,[]);
});

test('a repairable review gets one rewrite without a citation requirement',async()=>{
 const m=model(answer({team:false,answer:'Das Team meldet sich bei Ihnen.'}),{hard:[],repair:[{issue:'team_handoff',quote:'Das Team meldet sich bei Ihnen.'}]},answer(),valid);
 const result=await runRetrievalReply(m.generate,input());
 assert.equal(result.skipSend,undefined);
 assert.equal(result.repairs,1);
 assert.deepEqual(m.calls.map(call=>call.stage),['compose','verify','compose','verify']);
 const noModel=model();
 const social=await runRetrievalReply(noModel.generate,input({messageType:'reaction'}));
 assert.equal(noModel.calls.length,0);
 assert.deepEqual(social.retrieved,{gold:[],knowledge:[],rule:[],history:[]});
});

test('redaction preserves ordinary words while removing possessive patient names',()=>{
 const safe=anonymizeRetrieval('Ich weiß nicht, ob Fabians Termin im November passt.', ['Weiß','Im','Fabian']);
 assert.equal(safe,'Ich weiß nicht, ob [Person] Termin im November passt.');
});

test('an outgoing acknowledgment closes a historical pair, never borrows a later unrelated answer',()=>{
 const message=(id:string,from_me:boolean,body:string):ArchiveMessage=>({id,message_id:id,from_me,body,chat_jid:'4915100000000@s.whatsapp.net',message_type:'text',message_at:`2026-11-20T09:0${id}:00Z`});
 const docs=historyPairDocuments([message('1',false,'Ich komme heute fünf Minuten später.'),message('2',true,'Ok'),message('3',true,'Die Rechnung liegt bereit.')],[],new Set(),'2026-11-21T00:00:00Z');
 assert.equal(docs.length,0);
});

test('a repair needs a verbatim quote and cannot dispute an already enabled handoff',async()=>{
 for(const draft of [answer(),answer({team:false})]){
  const m=model(draft,{hard:[],repair:[{issue:'team_handoff',quote:'Dieses erfundene Zitat steht nicht in der Antwort.'}]});
  const result=await runRetrievalReply(m.generate,input());
  assert.equal(result.skipSend,undefined);assert.equal(result.repairs,0);
 }
});

test('thanks with closing wishes stay quiet; a new request after thanks remains actionable',()=>{
 for(const message of ['Vielen Dank! Ich wünsche Ihnen einen schönen Abend','Danke für Ihre Hilfe.','Danke, Ihnen auch!','Schönes Wochenende!']){
  assert.equal(retrievalPreflight(input({message,hasPriorConversation:true}))?.rule,'social:acknowledged');
 }
 assert.equal(retrievalPreflight(input({message:'Danke! Der Draht piekst aber noch.'})),null);
});


test('a model closure cannot silence a substantive question',async()=>{
 const closing=answer({closing:true,answer:'',team:false,summary:null,substantive:false,identityQuestion:false});
 const m=model(closing,closing);
 const result=await runRetrievalReply(m.generate,input({message:'Danke! Kann ich morgen trotzdem kommen?'}));
 assert.equal(result.safeFallback,true);assert.ok(result.text);
 assert.equal(m.calls.length,2);
});


test('an unsafe draft may be rewritten once, but only the independently checked safe answer is returned',async()=>{
 const m=model(answer({answer:'Ich habe Ihren Termin gebucht.'}),answer(),valid);
 const result=await runRetrievalReply(m.generate,input());
 assert.equal(result.repairs,1);assert.equal(result.skipSend,undefined);assert.doesNotMatch(result.text,/gebucht/);
});

test('a confirmed or unconfirmed patient never receives an identity question, even if the model does not flag it',async()=>{
 for(const access of ['confirmed','unconfirmed'] as const){
  const patientSheet={access,asOf:'2026-11-23T20:00:00Z',context:{portalzugang:true,rechnungsakteMitZustellstand:[{patientVisible:true}]},fields:{}};
  const m=model(answer({answer:'Welchen Namen darf ich zu Ihrer Rechnung notieren?',identityQuestion:true}),answer({answer:'Öffnen Sie im Browser den Bereich Rechnungen.',team:false}),valid);
  const result=await runRetrievalReply(m.generate,input({message:'Welche meiner Rechnungen habe ich bereits bezahlt?',patientSheet}));
  assert.equal(result.repairs,1);assert.equal(result.identityQuestion,false);
  assert.equal(JSON.parse(m.calls[0].prompt).identitaetsfrageErlaubt,false);
  assert.match(m.calls[0].prompt,/rechnungsakteMitZustellstand/);
 }
});

test('billing portal replies use only confirmed facts and name a concrete check if needed',()=>{
 const sheet={access:'confirmed' as const,asOf:'2026-11-23T20:00:00Z',context:{portalzugang:true,
  rechnungsakteMitZustellstand:[{patientVisible:true}]},fields:{}};
 const msg='Meine Rechnung ist nicht im Portal sichtbar';
 assert.equal(retrievalPreflight(input({message:msg,patientSheet:sheet}))?.rule,'billing:portal_visible');
 const denied=retrievalPreflight(input({message:msg,patientSheet:{...sheet,access:'unconfirmed'}}));
 assert.equal(denied?.rule,'billing:portal_missing');
 assert.match(denied?.teamSummary??'',/Freigabe, Kontozuordnung/);
 assert.doesNotMatch(denied?.text??'',/sind für Ihr Konto sichtbar|meldet sich/);
 assert.equal(retrievalPreflight(input({message:'Ist ein Download der App nötig?'}))?.rule,'billing:portal_browser');
});

test('an unlinked patient gets identity asked only for a personal matter, never appended after useful general guidance',async()=>{
 const ready=model(answer({answer:'Sie können auch im Browser auf das Portal zugreifen.',team:false}),valid);
 const general=await runRetrievalReply(ready.generate,input({message:'Wie melde ich mich im Browser an?'}));
 assert.equal(general.identityQuestion,false);assert.doesNotMatch(general.text,/Namen/);
 const ask=model(answer({answer:'Auf welchen Namen ist die Rechnung ausgestellt, damit wir ihren Versand prüfen können?',identityQuestion:true,team:false}),valid);
 const personal=await runRetrievalReply(ask.generate,input({message:'Meine Rechnung ist nicht angekommen.'}));
 assert.equal(personal.identityQuestion,true);
 assert.match(personal.text,/Rechnung/);
});

test('human turn, correction and agreement wait without sending; door and small current delay are urgent',()=>{
 const at='2026-11-23T20:00:00Z';
 const human={direction:'outgoing' as const,source:'practice' as const,text:'Der Zahn schmerzt seit wann?',at:'2026-11-23T19:00:00Z'};
 for(const msg of ['Seit gestern.','Hätte*','Alles klar','Ok.']){
  const result=retrievalPreflight(input({message:msg,receivedAt:at,history:[human]}));
  assert.equal(result?.rule,'conversation:practice_reply');assert.equal(result?.skipSend,true);assert.equal(result?.teamSummary,'Antwort an eure Nachricht');
 }
 assert.equal(retrievalPreflight(input({message:'Danke!',receivedAt:at,history:[human]}))?.rule,'social:acknowledged');
 assert.equal(retrievalPreflight(input({message:'Seit gestern.',receivedAt:at,history:[{...human,source:'animahost'}]})),null);
 assert.equal(retrievalPreflight(input({message:'Seit gestern.',receivedAt:at,history:[{...human,at:'2026-11-22T19:59:59Z'}]})),null);
 for(const msg of ['Ich bin im Treppenhaus', 'Komme fünf Minuten später', 'Kannst du die Tür öffnen?']){
  const result=retrievalPreflight(input({message:msg,receivedAt:at,history:[human]}));
  assert.equal(result?.rule,'conversation:immediate_practice');
  assert.match(result?.text??'',/0341 9806457/);assert.doesNotMatch(result?.text??'',/meldet sich/);
 }
 assert.equal(retrievalPreflight(input({message:'Komme morgen fünf Minuten später',receivedAt:at})),null);
});

test('a punctuation-only follow-up question is not a thank-you or closing',()=>{
 assert.equal(retrievalPreflight(input({message:'?',hasPriorConversation:true})),null);
 assert.equal(retrievalPreflight(input({message:'???',hasPriorConversation:true})),null);
});

test('unclear input addresses the known parent, never the child; no model or identity question',async()=>{
 const fail:Generate=async()=>{throw Error('must not call model');};
 const result=await runRetrievalReply(fail,input({message:'Huhu',chatName:{status:'matched',matchedName:'Leon',question:null},patientSheet:{access:'confirmed',asOf:'2026-11-23T20:00:00Z',context:{schreibendePerson:{rolle:'Elternteil',name:'Alex Beispiel',patient:'Leon Beispiel'}},fields:{}}}));
 assert.match(result.text,/Alex Beispiel/);assert.doesNotMatch(result.text,/Leon|wer schreibt|angemeldet/);assert.equal(result.rule,'conversation:clarify_first');assert.equal(result.skipSend,undefined);
});

test('external booking discloses only a confirmed chart appointment and attaches the same deadline to the practice task',()=>{
 const message='Meine Bestätigung von Doctolib ist da. Ist die Buchung bei Ihnen eingetragen?';
 const deadline={dueAt:'2026-11-24T11:00:00Z',phrase:'heute bis 12 Uhr'};
 const patientSheet={access:'confirmed' as const,asOf:'2026-11-24T08:00:00Z',context:{nächsterTermin:{date:'2026-11-26',time:'14:30'}},fields:{}};
 const confirmed=retrievalPreflight(input({message,deadline,patientSheet}));
 const unconfirmed=retrievalPreflight(input({message,deadline,patientSheet:{...patientSheet,access:'unconfirmed'}}));
 assert.equal(confirmed?.dueAt,deadline.dueAt);assert.match(confirmed!.text,/26.11.2026 um 14:30 Uhr/);
 assert.match(unconfirmed!.text,/externe Buchungsbestätigung/);assert.doesNotMatch(unconfirmed!.text,/14:30/);
});

test('a semantic thank-you is quiet only after its content is independently checked',async()=>{
 const closing=answer({answer:'',closing:true,team:false,summary:null,substantive:false});
 const m=model(closing,{closing:'thanks'});
 const result=await runRetrievalReply(m.generate,input({message:'Vielen Dank für die ausführliche Erklärung und schöne Grüße!'}));
 assert.equal(result.rule,'social:acknowledged');assert.equal(result.skipSend,true);
 const agree=model(closing,{closing:'agreement'});
 assert.equal((await runRetrievalReply(agree.generate,input({message:'Ja, das passt für uns gut.'}))).rule,'conversation:practice_reply');
});
