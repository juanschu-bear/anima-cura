import assert from 'node:assert/strict';
import test from 'node:test';
import {runRetrievalReply,retrievalPreflight,hardReplyViolations,type RetrievalInput} from '../animahost-retrieval-core';
import type {Generate} from '../animahost-chain';
import type {RetrievalDocument} from '../animahost-retrieval';
import {anonymizeRetrieval} from '../animahost-retrieval-privacy';
import {historyPairDocuments,type ArchiveMessage} from '../animahost-history-pairs';
const input=(over:Partial<RetrievalInput>={}):RetrievalInput=>({message:'Kunststoff ab, tut weh. Online erst im Dezember.',messageType:'text',jid:'4915100000000@s.whatsapp.net',phone:'4915100000000',practicePhone:'4915100000001',
 history:[],dossier:{sender:'unknown',patients:[]},documents:[],rules:[],teamTime:'heute noch',today:'2026-11-23',doctolibUrl:'https://example.invalid/termin',hasPriorConversation:false,hasPriorReply:false,identityAsked:false,preview:false,budgetMs:17000,...over});
const answer=(over:Record<string,unknown>={})=>({answer:'Das ist unangenehm. Bitte rufen Sie bei Schmerzen direkt in der Praxis an. Für welchen Patienten schreiben Sie?',team:true,summary:'Defekte Apparatur, Schmerzen, früheren Termin klären.',identityQuestion:true,substantive:true,nonPatient:false,closing:false,...over});
const valid={hard:[],repair:[]};
function model(...answers:unknown[]){const calls:any[]=[];const generate:Generate=async call=>{calls.push(call);return call.schema.parse(answers.shift());};return {generate,calls};}
test('unlinked pain patient is not excluded; only configured team, groups and non-patients are excluded',async()=>{
 assert.equal(retrievalPreflight(input()),null);
 for(const over of [{teamPhones:'4915100000000'},{jid:'123456@g.us'},{nonPatientPhones:'4915100000000'}])assert.equal(retrievalPreflight(input(over))?.excluded,true);
 const m=model(answer(),valid);const result=await runRetrievalReply(m.generate,input());
 assert.equal(result.excluded,false);assert.equal(result.substantive,true);assert.equal(result.identityQuestion,true);
 assert.match(result.text,/heute noch/);assert.equal(result.text.match(/\?/g)?.length,1);
});
test('empty, reaction and acknowledgments never call the model; stickers reach clarification',async()=>{
 const fail:Generate=async()=>{throw Error('must not call model');};
 for(const [messageType,message] of [['text',''],['system',''],['protocol',''],['unsupported',''],['reaction','👍'],['text','Danke'],['text','Ok']]){
  const result=await runRetrievalReply(fail,input({messageType,message,hasPriorConversation:true,hasPriorReply:true}));
  assert.equal(result.skipSend,true);assert.equal(result.action,'antworten');assert.equal(result.text,'');
 }
 assert.equal(retrievalPreflight(input({message:'',messageType:'sticker'})),null);
});
test('system answers are not facts; missing team time is repaired before checking, no rule classifier',async()=>{
 const m=model(answer(),valid);
 const result=await runRetrievalReply(m.generate,input({history:[{direction:'outgoing',text:'UNTRUSTED BOOKING CLAIM',at:'2026-11-23T10:00:00Z'},{direction:'incoming',text:'Es gibt noch keine Uhrzeit.',at:'2026-11-23T10:01:00Z'}]}));
 assert.match(result.text,/heute noch/);assert.doesNotMatch(m.calls[0].prompt,/UNTRUSTED/);assert.match(m.calls[0].prompt,/keine Uhrzeit/);
 assert.deepEqual(m.calls.map(c=>c.stage),['compose','verify']);
});
test('repairable critique gets exactly one repair; medical and invented booking output never passes',async()=>{
 const m=model(answer({team:false,answer:'Ich gebe Ihren Wunsch ans Team. Für welchen Patienten schreiben Sie?'}),{hard:[],repair:[{issue:'team_handoff',quote:'Ich gebe Ihren Wunsch ans Team.'}]},answer({answer:'Ich gebe Ihren Wunsch nach einem früheren Termin konkret ans Team. Für welchen Patienten schreiben Sie?'}),valid);
 const result=await runRetrievalReply(m.generate,input());assert.equal(result.repairs,1);assert.equal(result.skipSend,undefined);
 const bad=model(answer({answer:'Nehmen Sie 400 mg Ibuprofen.'}),answer({answer:'Nehmen Sie 400 mg Ibuprofen.'}));
 assert.equal((await runRetrievalReply(bad.generate,input())).skipSend,true);
 assert.ok(hardReplyViolations('Ich habe Ihren Termin gebucht.').includes('booking'));
});
test('names and identifiers are removed before indexing; human pairs do not consume later bot answers',()=>{
 const safe=anonymizeRetrieval('Mein Sohn Fabian Muster hat Schmerzen. Mail f@example.invalid, 0176 12345678, Patientennummer 123456.', ['Fabian','Muster']);
 assert.doesNotMatch(safe,/Fabian|Muster|123456|example/);
 const row=(id:string,from_me:boolean,body:string,message_at:string):ArchiveMessage=>({id,message_id:id,chat_jid:'4915100000000@s.whatsapp.net',message_type:'text',from_me,body,message_at});
 const docs=historyPairDocuments([row('a',false,'Bei Fabian ist der Draht ab.','2026-11-20T09:00:00Z'),row('b',true,'Fabian kann mit Wartezeit kommen.','2026-11-20T10:00:00Z'),row('c',false,'Wann soll ich kommen?','2026-11-21T09:00:00Z'),row('d',true,'Automatische Antwort.','2026-11-21T10:00:00Z')],['Fabian'],new Set(['d']),'2026-11-21T00:00:00Z');
 assert.equal(docs.length,1);assert.doesNotMatch(docs[0].content,/Fabian|491510/);assert.equal(docs[0].payload.factsOnly,true);
});

test('the source ledger reflects the structured input, including when the verifier withholds the answer',async()=>{
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
 assert.equal(withheld.skipSend,true);
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
 const m=model(answer({team:false,answer:'Das Team meldet sich bei Ihnen. Für welchen Patienten schreiben Sie?'}),{hard:[],repair:[{issue:'team_handoff',quote:'Das Team meldet sich bei Ihnen.'}]},answer(),valid);
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


test('a semantic closing recognized by the core stays quiet and creates no clarification case',async()=>{
 const m=model(answer({closing:true,answer:'',team:false,summary:null,substantive:false,identityQuestion:false}));
 const result=await runRetrievalReply(m.generate,input({message:'Perfekt, das trage ich mir so ein. Besten Dank!'}));
 assert.equal(result.action,'antworten');assert.equal(result.rule,'social:acknowledged');assert.equal(result.skipSend,true);
 assert.equal(m.calls.length,1);
});


test('an unsafe draft may be rewritten once, but only the independently checked safe answer is returned',async()=>{
 const m=model(answer({answer:'Ich habe Ihren Termin gebucht.'}),answer(),valid);
 const result=await runRetrievalReply(m.generate,input());
 assert.equal(result.repairs,1);assert.equal(result.skipSend,undefined);assert.doesNotMatch(result.text,/gebucht/);
});

test('unknown patients get one identity question even when the useful draft asks none',async()=>{
 const m=model(answer({answer:'Bitte rufen Sie wegen der Schmerzen direkt in der Praxis an.',identityQuestion:false}),valid);
 const result=await runRetrievalReply(m.generate,input());
 assert.equal(result.identityQuestion,true);assert.equal(result.text.match(/\?/g)?.length,1);
 assert.match(result.text,/Unter welchem Namen sind Sie bei uns angemeldet\?/);
 const already=model(answer({answer:'Bitte rufen Sie wegen der Schmerzen direkt in der Praxis an.',identityQuestion:false}),valid);
 const second=await runRetrievalReply(already.generate,input({identityAsked:true}));
 assert.doesNotMatch(second.text,/Für welchen Patienten/);
});

test('a punctuation-only follow-up question is not a thank-you or closing',()=>{
 assert.equal(retrievalPreflight(input({message:'?',hasPriorConversation:true})),null);
 assert.equal(retrievalPreflight(input({message:'???',hasPriorConversation:true})),null);
});
