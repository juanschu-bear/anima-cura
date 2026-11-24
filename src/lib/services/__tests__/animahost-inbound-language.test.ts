import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localizeInbound} from '../animahost-inbound-language';
import {teamReplyDeadline} from '../animahost-team-time';

test('saved metadata gives the language in German and uses the actual concern in a pasted translator output',async()=>{
 const input='Вставляю перевод: «оплата нет» Оригинал: где счёт?';
 const result=await localizeInbound(async call=>{
  assert.deepEqual(JSON.parse(call.prompt),{nachricht:input});
  return call.schema.parse({language:'ru',kind:'pasted',german:'Wo finde ich die Rechnung?'});
 },input);
 assert.equal(result.pasted,true);
 assert.deepEqual(result.translation,{language:'ru',languageLabel:'Russisch',text:'Wo finde ich die Rechnung?'});
 const unreadable=await localizeInbound(assert.fail,'%#@~!?');
 assert.equal(unreadable.unreadable,true);
 assert.equal(unreadable.translation,null);
});

test('deadlines use Berlin time, skip closures, and switch at 10 and 15 exactly',()=>{
 for(const [at,expected] of [
  ['2026-11-24T09:59:59+01:00','2026-11-24T11:00:00.000Z'],
  ['2026-11-24T10:00:00+01:00','2026-11-24T16:00:00.000Z'],
  ['2026-11-24T15:00:00+01:00','2026-11-25T09:00:00.000Z'],
  ['2026-03-27T15:00:00+01:00','2026-03-30T08:00:00.000Z'],
 ])assert.equal(teamReplyDeadline(at,[1,2,3,4,5],[])?.dueAt,expected);
 assert.equal(teamReplyDeadline('2026-11-27T16:00:00+01:00',[1,2,3,4,5],
  [{from:'2026-11-30',through:'2026-11-30',kind:'closure'}])?.dueAt,'2026-12-01T09:00:00.000Z');
});
