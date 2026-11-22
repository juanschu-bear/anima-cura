import assert from 'node:assert/strict';
import test from 'node:test';
import {enforceConversationOutput,referenceHistory,type ConversationHistory} from '../animahost-whatsapp-conversation';
import {fallbackDecision,type FallbackTopic} from '../animahost-whatsapp-fallback';
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

test('consecutive identical texts yield a waiting decision without sendable text',()=>{
 const last:ConversationHistory=[{direction:'outgoing',at:'2026-11-22T02:06:00+01:00',text:'Wir melden uns. Vielen Dank.'}];
 const answer=enforceConversationOutput({rule:'fallback:other',action:'klaerfall',text:'Wir melden uns.\nVielen Dank.'},last,'de');
 assert.deepEqual(answer,{rule:'duplicate_reply_suppressed',action:'klaerfall',text:''});
});

test('a previously sent link is referenced without duplication',()=>{
 const link='https://example.invalid/portal';
 const history:ConversationHistory=[{direction:'outgoing',at:'2026-11-22T02:06:00+01:00',text:`Portal: ${link}`}];
 const answer=enforceConversationOutput({rule:'portal',action:'antworten',text:`Öffnen Sie das Portal: ${link}`},history,'de');
 assert.equal(answer.text,'Öffnen Sie das Portal. Den Link finden Sie weiter oben im Chat.');
});
