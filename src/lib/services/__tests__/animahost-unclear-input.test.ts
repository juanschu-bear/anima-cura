import test from 'node:test';
import assert from 'node:assert/strict';
import {unclearInput,unclearReply,clarificationRound} from '../animahost-unclear-input';
import {socialReply} from '../animahost-conversation-signals';
test('unclear links, greeting, sticker, code and fragment are recognized; substantive requests remain untouched',()=>{
 for(const [text,type] of [['https://example.invalid','text'],['Huhu','text'],['','sticker'],['123456','text'],['ich wollte …','text']])assert.ok(unclearInput(text,type));
 assert.equal(unclearInput('Ping','text'),'word');
 assert.equal(unclearInput('Schmerzen','text'),null);
 assert.equal(unclearInput('Hallo, die Rechnung fehlt und ich möchte den Termin verschieben','text'),null);
});
test('two warm questions then announced handoff, known names never trigger identity questions',()=>{
 const base={kind:'link',teamTime:'morgen Vormittag',at:'2026-11-23T19:00:00Z'};
 const first=unclearReply({...base,round:0});assert.match(first.text,/Guten Abend! Bei mir kam nur ein Link an/);assert.match(first.text,/öffne/);assert.doesNotMatch(first.text,/wer schreibt|angemeldet/);
 assert.equal(unclearReply({...base,round:1}).rule,'conversation:clarify_second');
 const third=unclearReply({...base,round:2});assert.equal(third.action,'klaerfall');assert.equal(third.rule,'conversation:outside_scope');assert.match(third.text,/Praxisteam/);assert.match(third.text,/morgen Vormittag/);
});
test('only actually delivered consecutive clarification questions count, substantive answer resets',()=>{
 const history=[{direction:'outgoing',text:'first'},{direction:'outgoing',text:'second'}];
 assert.equal(clarificationRound([{rule_id:'conversation:clarify_second',patient_text:'second'},{rule_id:'conversation:clarify_first',patient_text:'first'}],history),2);
 assert.equal(clarificationRound([{rule_id:'conversation:clarify_first',patient_text:'unsent'}],history),0);
 assert.equal(clarificationRound([{rule_id:'retrieval:answered',patient_text:'second'},{rule_id:'conversation:clarify_first',patient_text:'first'}],history),0);
});
test('retrieval stickers are not consumed by old social gate, thanks and reactions remain quiet',()=>{
 const base={hasPriorConversation:true,hasPriorReply:true,clarifyUnclear:true};
 assert.equal(socialReply({...base,messageType:'sticker',text:''}),null);
 assert.equal(socialReply({...base,messageType:'text',text:'Danke'}),'social:acknowledged');
 assert.equal(socialReply({...base,messageType:'reaction',text:'🙂'}),'social:reaction');
});

test('the approved informal and formal examples ask for context and never open the link',()=>{
 const base={kind:'link',round:0,teamTime:'morgen',at:'2026-11-23T19:00:00Z',register:'du' as const};
 assert.match(unclearReply(base).text,/mein Chef hat mich so erzogen/);
 assert.match(unclearReply({...base,register:'Sie'}).text,/fremde Links öffne ich grundsätzlich nicht/);
 assert.match(unclearReply({...base,kind:'greeting'}).text,/Huhu zurück 👋/);
 assert.match(unclearReply({...base,kind:'greeting',serious:true}).text,/dir gern/);
 assert.doesNotMatch(unclearReply({...base,kind:'greeting',serious:true}).text,/👋/);
 assert.match(unclearReply({...base,round:1}).text,/Den Link habe ich nicht geöffnet/);
 assert.match(unclearReply({...base,round:2}).text,/Praxisteam.*nicht geöffnet.*bei dir/);
});
