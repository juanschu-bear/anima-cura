import assert from 'node:assert/strict';
import test from 'node:test';
import {enforceConversationOutput,referenceHistory,type ConversationHistory} from '../animahost-whatsapp-conversation';
import {completeRuleReply,fallbackDecision,type FallbackTopic} from '../animahost-whatsapp-fallback';
import {teamReplyTime} from '../animahost-team-time';

test('the emergency brake uses one neutral sentence with written practice days',()=>{
 const receivedAt='2026-11-22T02:08:06+01:00';
 const time=teamReplyTime(receivedAt,undefined,[],'de');
 for(const topic of ['appointment','attachment','billing'] as FallbackTopic[]){
  const answer=fallbackDecision({topic,language:'de',appointment:true,doctolibUrl:'https://example.invalid',
    teamTime:time,safetyAck:true});
  assert.equal(answer.text,'Danke für Ihre Nachricht. Das sieht sich unser Praxisteam persönlich an und meldet sich am Montag, 23. November bei Ihnen.');
  assert.equal(answer.action,'klaerfall');
 }
});

test('matched rules answer first and a remaining question gets a timed handoff',()=>{
 const link='https://example.invalid/termin';
 const approved={id:'attachment',topic:'Attachment',keywords:['Knopf verloren'],action:'antworten' as const,
  patientText:'Bringen Sie das gelöste Teil mit.'};
 const handoff=fallbackDecision({topic:'appointment',language:'de',appointment:true,doctolibUrl:link,teamTime:'am Montag'});
 const answer=completeRuleReply(null,handoff,['attachment'],[approved],link);
 assert.equal(answer?.action,'klaerfall');
 assert.match(answer?.text??'',/^Bringen Sie das gelöste Teil mit\.[\s\S]*Terminanfrage[\s\S]*am Montag[\s\S]*https:/);
 assert.doesNotMatch(answer?.text??'',/Danke für Ihre Nachricht/);
});

test('a standalone new topic and a stale attachment do not share classification context',()=>{
 const history:ConversationHistory=[{direction:'incoming',at:'2026-11-22T00:00:00+01:00',text:'Attachment lose'},
  {direction:'incoming',at:'2026-11-22T02:05:00+01:00',text:'Muss ich das Portal benutzen?'},
  {direction:'outgoing',at:'2026-11-22T02:06:00+01:00',text:'Sie können das Portal im Browser öffnen.'}];
 const now='2026-11-22T02:06:29+01:00';
 assert.deepEqual(referenceHistory('Wo finde ich die Rechnung im Portal?',history,now),[]);
 const resolved=referenceHistory('Ja, aber geht das nicht auch ohne?',history,now);
 assert.equal(resolved.length,2);
 assert.ok(resolved.every(item=>!item.text.includes('Attachment')));
 assert.deepEqual(referenceHistory('Geht das auch ohne?',history.slice(0,1),now),[]);
});

test('consecutive identical texts yield a new timed response and a practice case',()=>{
 const last:ConversationHistory=[{direction:'outgoing',at:'2026-11-22T02:06:00+01:00',text:'Wir melden uns. Vielen Dank.'}];
 const answer=enforceConversationOutput({rule:'fallback:other',action:'klaerfall',text:'Wir melden uns.\nVielen Dank.'},last,'de',
  {teamTime:'am Montag',receivedAt:'2026-11-22T02:08:00+01:00'});
 assert.equal(answer.rule,'conversation:repeat_review');
 assert.equal(answer.action,'klaerfall');
 assert.match(answer.text,/am Montag/);
});

test('a previously sent link is referenced without duplication',()=>{
 const link='https://example.invalid/portal';
 const history:ConversationHistory=[{direction:'outgoing',at:'2026-11-22T02:06:00+01:00',text:`Portal: ${link}`}];
 const answer=enforceConversationOutput({rule:'portal',action:'antworten',text:`Öffnen Sie das Portal: ${link}`},history,'de');
 assert.equal(answer.text,'Öffnen Sie das Portal. Den Link finden Sie weiter oben im Chat.');
});

test('an emergency rule bypasses link cleanup and duplicate detection',()=>{
 const text='Bitte  rufen Sie sofort an. https://example.invalid/notdienst';
 const decision={rule:'practice-emergency',action:'notfall' as const,text};
 const history:ConversationHistory=[{direction:'outgoing',at:'2026-11-22T02:06:00+01:00',text}];
 assert.equal(enforceConversationOutput(decision,history,'de'),decision);
});
