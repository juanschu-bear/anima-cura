import test from 'node:test';
import assert from 'node:assert/strict';
import {unclearInput,unclearReply,clarificationRound} from '../animahost-unclear-input';
import {socialReply} from '../animahost-conversation-signals';
test('unclear links, greeting, sticker, code and fragment are recognized; substantive requests remain untouched',()=>{
 for(const [text,type] of [['https://example.invalid','text'],['Huhu','text'],['','sticker'],['123456','text'],['ich wollte …','text']])assert.ok(unclearInput(text,type));
 assert.equal(unclearInput('Hallo, die Rechnung fehlt und ich möchte den Termin verschieben','text'),null);
});
test('two warm questions then announced handoff, known names never trigger identity questions',()=>{
 const base={kind:'link',name:'Beispiel',teamTime:'morgen Vormittag',at:'2026-11-23T19:00:00Z'};
 const first=unclearReply({...base,round:0});assert.match(first.text,/Guten Abend Beispiel/);assert.match(first.text,/öffne/);assert.doesNotMatch(first.text,/wer schreibt|angemeldet/);
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
