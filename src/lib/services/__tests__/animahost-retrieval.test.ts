import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';
import {runRetrievalReply,retrievalPreflight,replyContext,systemText,systemTextPath,type RetrievalInput} from '../animahost-retrieval-core';
import type {Generate} from '../animahost-chain';
const input=(over:Partial<RetrievalInput>={}):RetrievalInput=>({message:'Huhu',messageType:'text',jid:'4915100000000@s.whatsapp.net',phone:null,practicePhone:null,history:[],dossier:{sender:'unknown',patients:[]},documents:[],rules:[],teamTime:'heute',today:'2026-11-24',receivedAt:'2026-11-24T10:15:00Z',doctolibUrl:null,hasPriorConversation:false,hasPriorReply:false,identityAsked:false,preview:false,budgetMs:60000,...over});
const valid={passed:true,hard:[],teamRequired:false,urgent:false,summary:null};
function model(...values:unknown[]){const calls:any[]=[];const generate:Generate=async call=>{calls.push(call);return call.schema.parse(values.shift());};return {generate,calls};}
test('sole system text is byte-for-byte the approved document, only placeholders are filled',()=>{assert.equal(systemText,readFileSync(systemTextPath,'utf8'));const c=replyContext(input());assert.ok(c.system.startsWith(systemText.split('<Doctolib-Link>')[0]));assert.doesNotMatch(c.system,/<PATIENTENBLATT>|<JETZT>|<VERLAUF>/);});
test('one text draft and one hard check; imperfect style is sent unchanged',async()=>{const text=' Huhu.  Also ja, das ist ein etwas holpriger Satz!\nNoch einer. ';const m=model(text,valid);const r=await runRetrievalReply(m.generate,input());assert.equal(r.text,text);assert.equal(m.calls.length,2);assert.equal(m.calls[0].plainText,true);assert.equal(m.calls[1].system,'');assert.equal(r.rule,'systemtext-v1:answered');});
test('one hard failure permits exactly one second draft with the checker hint',async()=>{const m=model('Die Rechnung ist bezahlt.',{...valid,passed:false,hard:[{kind:'invoice_paid',quote:'ist bezahlt',reason:'Rechnung für bezahlt erklärt'}]},'Das Team prüft den Rechnungsstand.',{...valid,teamRequired:true});const r=await runRetrievalReply(m.generate,input());assert.equal(m.calls.length,4);assert.equal(r.repairs,1);assert.match(m.calls[2].prompt,/prüferHinweis/);assert.equal(r.action,'klaerfall');assert.equal(r.text,'Das Team prüft den Rechnungsstand.');});
test('second hard failure creates a reasoned case without replacement text',async()=>{const bad={...valid,passed:false,hard:[{kind:'confidential_unconfirmed',quote:'Befund',reason:'Unbestätigte Zuordnung'}]};const m=model('Befund',bad,'Befund',bad);const r=await runRetrievalReply(m.generate,input());assert.equal(m.calls.length,4);assert.equal(r.text,'');assert.equal(r.skipSend,true);assert.match(r.teamSummary!,/Unbestätigte/);});
test('only reactions, plain thanks/ok/corrections and latest human reply within 24 hours are silent',()=>{for(const [message,messageType] of [['Danke!','text'],['Ok','text'],['Hätte*','text'],['👍','reaction']])assert.equal(retrievalPreflight(input({message,messageType}))?.skipSend,true);for(const message of ['Huhu','Ich komme Mittwoch 14:15','Tür aufmachen','12345','https://example.invalid',''])assert.equal(retrievalPreflight(input({message})),null);assert.equal(retrievalPreflight(input({lastOutbound:{source:'practice',at:'2026-11-23T10:15:00Z'}}))?.skipSend,true);assert.equal(retrievalPreflight(input({lastOutbound:{source:'practice',at:'2026-11-23T10:14:59Z'}})),null);assert.equal(retrievalPreflight(input({lastOutbound:{source:'animahost',at:'2026-11-24T10:14:59Z'}})),null);});
test('context caps knowledge and gold at three and conversation at ten; archived cases are not a style source',()=>{const docs:any[]=[];for(const kind of ['gold','knowledge','rule','history'])for(let i=0;i<6;i++)docs.push({kind,ref:kind+i,version:1,source_at:'2026-11-24',title:kind,content:kind,payload:{question:'q',answer:'a'},draft:false,content_hash:'x'});const c=replyContext(input({documents:docs,history:Array.from({length:20},(_,i)=>({direction:'incoming' as const,text:String(i),at:'2026-11-24T10:00:00Z'}))}));assert.equal(c.selected.gold.length,3);assert.equal(c.selected.knowledge.length,3);assert.equal((c.fields.VERLAUF as unknown[]).length,10);assert.equal(c.retrieved.history.length,0);});
test('a known-patient identity question is a hard failure; length and tone never add code violations',async()=>{const m=model('Unter welchem Namen sind Sie bei uns angemeldet?',{...valid,passed:false,hard:[{kind:'identity_known',quote:'Unter welchem Namen',reason:'Patient bereits bekannt'}]},'Für Ihren Termin prüft das Team den gewünschten Tag.',valid);const r=await runRetrievalReply(m.generate,input());assert.equal(r.repairs,1);assert.equal(r.skipSend,undefined);});

test('a dueAt-backed callback and a neutral team check survive false findings and still create the team task',async()=>{
 const deadline={dueAt:'2026-11-24T16:00:00.000Z',phrase:'heute bis 17 Uhr'};
 const quote='Ich lasse das gleich vom Team für Alex prüfen';
 const callback='Sie hören heute bis 17 Uhr von uns';
 const draft=quote+'. '+callback+'.';
 const m=model(draft,{...valid,passed:false,hard:[
  {kind:'invented_appointment_or_cost',quote:callback,reason:'Uhrzeit'},
  {kind:'confidential_unconfirmed',quote,reason:'Zuordnung'},
 ]});
 const result=await runRetrievalReply(m.generate,input({message:'In der App sehe ich für Alex noch keine Rechnung.',deadline}));
 assert.equal(result.text,draft);
 assert.equal(result.dueAt,deadline.dueAt);
 assert.equal(result.action,'klaerfall');
 assert.equal(m.calls.length,2);
 assert.match(m.calls[1].prompt,/2026-11-24T16:00:00.000Z/);
 assert.equal((result.checks?.[0] as {exempted?:unknown[]}).exempted?.length,2);
});

test('callback exemptions never clear an invented treatment appointment, protected invoice state or forbidden sentence',async()=>{
 const deadline={dueAt:'2026-11-24T16:00:00.000Z',phrase:'heute bis 17 Uhr'};
 const time='17 Uhr';
 const invoice='Alex hat noch 100 € offen';
 const forbidden='ich leite weiter';
 const draft=`Alex hat einen Termin um ${time}. ${invoice}. ${forbidden}. Sie hören heute bis ${time} von uns.`;
 const m=model(draft,{...valid,passed:false,hard:[
  {kind:'invented_appointment_or_cost',quote:time,reason:'Unbelegter Termin'},
  {kind:'confidential_unconfirmed',quote:invoice,reason:'Zahlungsstand'},
 ]},'Ich kläre, wann die Rechnung in der App sichtbar wird.',valid);
 const result=await runRetrievalReply(m.generate,input({message:'Was ist mit Alex’ Rechnung?',deadline}));
 assert.equal(result.repairs,1);
 const first=result.checks?.[0] as {violations:string[]};
 assert.equal(first.violations.length,3);
 assert.match(first.violations.join(','),/forbidden_sentence/);
 assert.doesNotMatch(result.text,/100 €|17 Uhr/);
});

test('an incorrect callback time stays a finding while the correct next-working-day deadline is allowed',async()=>{
 const deadline={dueAt:'2026-11-25T09:00:00.000Z',phrase:'am Mittwoch, 25. November bis 10 Uhr'};
 const wrong='Sie hören heute bis 17 Uhr von uns';
 const right='Sie hören am Mittwoch, 25. November bis 10 Uhr von uns';
 const finding=(quote:string)=>({...valid,passed:false,hard:[{kind:'invented_appointment_or_cost',quote,reason:'Uhrzeit'}]});
 const m=model(wrong+'.',finding(wrong),right+'.',finding(right));
 const r=await runRetrievalReply(m.generate,input({deadline}));
 assert.equal(r.text,right+'.');assert.equal(r.repairs,1);assert.equal(r.dueAt,deadline.dueAt);
});

test('an unconfirmed sender can hear the general invoice flow and their own reported app view',async()=>{
 const visibility='Sie sehen die Rechnung noch nicht in der App';
 const flow='Nach der Freigabe erscheint sie in der App und per E-Mail';
 const draft=visibility+'. '+flow+'.';
 const m=model(draft,{...valid,passed:false,hard:[visibility,flow].map(quote=>({kind:'confidential_unconfirmed',quote,reason:'Rechnung'}))});
 const result=await runRetrievalReply(m.generate,input({message:'Ich sehe in der App keine Rechnung.'}));
 assert.equal(result.text,draft);
 assert.equal(result.repairs,0);
});
