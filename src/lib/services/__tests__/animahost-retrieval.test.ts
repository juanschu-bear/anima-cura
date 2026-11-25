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
test('a known-patient identity question prompts one improvement; length and tone never block',async()=>{const m=model('Unter welchem Namen sind Sie bei uns angemeldet?',{...valid,passed:false,hard:[{kind:'identity_known',quote:'Unter welchem Namen',reason:'Patient bereits bekannt'}]},'Für Ihren Termin prüft das Team den gewünschten Tag.',valid);const r=await runRetrievalReply(m.generate,input());assert.equal(r.repairs,1);assert.equal(r.skipSend,undefined);});

test('even a previously approved deadline is forbidden in the first reply and absent from model context',async()=>{
 const deadline={dueAt:'2026-11-24T16:00:00.000Z',phrase:'heute bis 17 Uhr'};
 const m=model('Das Team prüft das. Sie hören heute bis 17 Uhr von uns.',{...valid,teamRequired:true},'Das Team prüft das und meldet sich bei Ihnen.',{...valid,teamRequired:true});
 const result=await runRetrievalReply(m.generate,input({message:'Meine Rechnung fehlt.',deadline}));
 assert.equal(result.text,'Das Team prüft das und meldet sich bei Ihnen.');assert.equal(result.dueAt,undefined);assert.equal(result.action,'klaerfall');assert.equal(m.calls.length,4);
 assert.doesNotMatch(m.calls[0].system,/2026-11-24T16:00:00/);assert.equal((replyContext(input({deadline})).fields.JETZT as any).rueckmeldefristErlaubt,false);
});

test('confidential invoice state blocks; other findings are improvement hints',async()=>{
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
 assert.equal(first.violations.length,1);
 assert.match(first.violations.join(','),/confidential_unconfirmed/);
 assert.doesNotMatch(result.text,/100 €|17 Uhr/);
});

test('a second draft cannot reintroduce a callback deadline even when the checker passes it',async()=>{
 const draft='Das Team prüft das. Sie hören am Mittwoch, 25. November bis 10 Uhr von uns.';
 const m=model(draft,valid,draft,valid);const r=await runRetrievalReply(m.generate,input());
 assert.equal(r.text,'Das Team prüft das.');assert.equal(r.repairs,1);assert.equal(r.dueAt,undefined);
 assert.equal((r.checks?.[1] as any).removedCallbackDeadlines.length,1);
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
test('identity_known may improve once but can never suppress the second non-confidential answer',async()=>{const warning={...valid,passed:false,hard:[{kind:'identity_known',quote:'Danke',reason:'Zuordnung ist bekannt'}]};const m=model('Danke für das Datum.',warning,'Danke, die Zuordnung ist jetzt eindeutig.',warning);const r=await runRetrievalReply(m.generate,input({chatName:{status:'matched',matchedName:'Mira Beispiel',question:null},message:'[Datum]'}));assert.equal(r.skipSend,undefined);assert.equal(r.text,'Danke, die Zuordnung ist jetzt eindeutig.');assert.match(m.calls[0].system,/erneuteNamensOderGeburtsdatumFrageNötig\\?":false/);});

test('a repeated birthday question is corrected once even if the model checker missed it',async()=>{const m=model('Bitte nennen Sie Ihr Geburtsdatum.',valid,'Danke, Mira, das Team prüft die Vollmacht.',valid);const r=await runRetrievalReply(m.generate,input({chatName:{status:'matched',matchedName:'Mira Beispiel',question:null},message:'[Datum]'}));assert.equal(r.repairs,1);assert.equal(r.skipSend,undefined);assert.equal(r.text,'Danke, Mira, das Team prüft die Vollmacht.');});

test('a masked birthday remains meaningful input instead of an empty placeholder',async()=>{const m=model('Danke, Ihre Angaben sind angekommen.',valid);await runRetrievalReply(m.generate,input({chatName:{status:'matched',matchedName:'Mira Beispiel',question:null},message:'[Datum]'}));assert.match(m.calls[0].prompt,/Antwort auf die Geburtsdatumsfrage/);assert.doesNotMatch(m.calls[0].prompt,/\[Datum\]/);});

const knownSender=()=>input({chatName:{status:'matched',matchedName:'Mira Beispiel',question:null},message:'[Datum]',history:[{direction:'incoming',text:'Mein Name ist Mira Beispiel.',at:'2026-11-24T10:00:00Z'}]});
test('after correction remove only repeated identity questions and log exact sentences',async()=>{
 const question='Bitte nennen Sie mir Ihren vollständigen Namen und Ihr Geburtsdatum.';
 const draft='Danke für Ihre Nachricht.  '+question+'\nDas Team meldet sich am Mittwoch bis 10 Uhr.';
 const m=model(question,valid,draft,valid);const r=await runRetrievalReply(m.generate,knownSender());
 assert.equal(m.calls.length,4);assert.equal(r.text,'Danke für Ihre Nachricht.');
 assert.deepEqual((r.checks?.[1] as any).removedIdentityQuestions,[question]);assert.equal((r.checks?.[1] as any).draft,draft);assert.equal(r.skipSend,undefined);
});
test('identity-only second draft leaves an empty answer and hands off',async()=>{
 const q='Können Sie mir bitte Ihr Geburtsdatum nennen?';const m=model(q,valid,q,valid);const r=await runRetrievalReply(m.generate,knownSender());assert.equal(r.skipSend,true);assert.equal(r.text,'');assert.ok(r.violations.includes('empty_model_output'));
});
test('removing identity questions does not release confidential information',async()=>{
 const q='Bitte nennen Sie mir Ihr Geburtsdatum.';const m=model(q,valid,q+' Ihr Befund ist X.',{...valid,passed:false,hard:[{kind:'confidential_unconfirmed',quote:'Ihr Befund ist X.',reason:'Akteninhalt nicht freigegeben'}]});const r=await runRetrievalReply(m.generate,knownSender());assert.equal(r.skipSend,true);assert.match(r.teamSummary!,/Akteninhalt/);
});

test('an unresolved delay does not inherit a booking-link requirement from a keyword rule',async()=>{
 const question='Wie viele Minuten nach Ihrem vereinbarten Termin kommen Sie ungefähr an?';
 const m=model(question,{...valid,lateness:'clarify'});
 const r=await runRetrievalReply(m.generate,input({message:'Ich schaffe meinen Termin vielleicht nicht rechtzeitig.',doctolibUrl:'https://www.doctolib.de/test',rules:[{id:'termin-absagen',topic:'Absage',keywords:['termin'],action:'antworten',patientText:'Termin verschieben: {doctolib_link}'}]}));
 assert.equal(r.text,question);assert.equal(r.teamKind,'info');assert.equal(r.repairs,0);assert.equal(r.skipSend,undefined);
});
test('a premature delay link is retried and never sent even when the checker passes the text',async()=>{
 const text='Verschieben Sie hier: {doctolib_link}';const review={...valid,lateness:'clarify'};
 const m=model(text,review,text,review);const r=await runRetrievalReply(m.generate,input({message:'Der Wettkampf endet vielleicht um 15:20.',doctolibUrl:'https://www.doctolib.de/test'}));
 assert.equal(r.skipSend,true);assert.equal(r.text,'');assert.match(r.violations.join(' '),/appointment_flow/);
});
test('a wrong appointment step is corrected once before delivery',async()=>{
 const wrong='Kommen Sie einfach vorbei.';const question='Wie viele Minuten später kommen Sie ungefähr an?';
 const m=model(wrong,{...valid,passed:false,lateness:'clarify',hard:[{kind:'appointment_flow',quote:wrong,reason:'Verspätung noch unbekannt'}]},question,{...valid,lateness:'clarify'});
 const r=await runRetrievalReply(m.generate,input({message:'Wir kommen zu spät.'}));assert.equal(r.text,question);assert.equal(r.repairs,1);assert.equal(r.teamKind,'info');
});
test('a delay above tolerance requires the configured link and stays information-only',async()=>{
 const m=model('Bitte verschieben Sie den bestehenden Termin.',{...valid,lateness:'reschedule'},'Bitte verschieben Sie den bestehenden Termin in Ihrem eigenen Konto: {doctolib_link}',{...valid,lateness:'reschedule',teamRequired:true});
 const r=await runRetrievalReply(m.generate,input({message:'Etwa 20 Minuten.',doctolibUrl:'https://www.doctolib.de/test'}));
 assert.equal(r.repairs,1);assert.match(r.text,/https:\/\/www.doctolib.de\/test/);assert.equal(r.teamKind,'info');assert.equal(r.action,'antworten');assert.equal(r.dueAt,undefined);
});
test('an exception request requires team action even if a broad appointment rule matched',async()=>{
 const m=model('Das Team prüft, ob es ausnahmsweise noch passt.',{...valid,lateness:'exception'});
 const r=await runRetrievalReply(m.generate,input({message:'Termin: Wir kommen 25 Minuten später nach einer Stunde Anfahrt. Geht es trotzdem?',doctolibUrl:'https://www.doctolib.de/test',rules:[{id:'termin-verschieben',topic:'Termin',keywords:['termin'],action:'antworten',patientText:'{doctolib_link}'}]}));
 assert.equal(r.teamKind,'act');assert.equal(r.action,'klaerfall');assert.doesNotMatch(r.text,/https:/);assert.equal(r.dueAt,undefined);
});
test('a checker statement explicitly denying an appointment-flow violation cannot block a valid exception review',async()=>{
 const text='Das Team entscheidet, ob es trotz 25 Minuten Verspätung noch passt.';
 const m=model(text,{...valid,passed:false,lateness:'exception',hard:[{kind:'appointment_flow',quote:text,reason:'Der appointment_flow-Befund ist nicht nachweisbar falsch.'}]});
 const r=await runRetrievalReply(m.generate,input({message:'Wir kommen 25 Minuten später nach langer Anfahrt. Geht es trotzdem?'}));
 assert.equal(r.text,text);assert.equal(r.teamKind,'act');assert.equal(r.repairs,0);assert.equal((r.checks?.[0] as any).dismissedFlow.length,1);
});
test('lateness-flow findings do not apply to unrelated appointment changes',async()=>{
 const text='Was möchten Sie am Termin ändern?';const m=model(text,{...valid,passed:false,lateness:'none',hard:[{kind:'appointment_flow',quote:text,reason:'Keine Minutenfrage'}]});
 const r=await runRetrievalReply(m.generate,input({message:'Ich habe eine Frage zu meinem Termin.'}));assert.equal(r.text,text);assert.equal(r.skipSend,undefined);
});
