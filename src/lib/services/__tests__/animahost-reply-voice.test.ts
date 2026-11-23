import assert from 'node:assert/strict';
import test from 'node:test';
import {replyRegister,replyVoiceViolations,straightTone} from '../animahost-reply-voice';

test('patients are addressed with du and parents with Sie',()=>{
 assert.equal(replyRegister('Meine Schiene sitzt schief.',undefined,false,[]),'du');
 assert.equal(replyRegister('Meine Tochter muss den Termin absagen.', 'Patient',true,['Kannst du schauen?']),'Sie');
 assert.equal(replyRegister('Huhu', 'Patient',false,[]),'du');
 assert.equal(replyRegister('Huhu', 'Elternteil',true,[]),'Sie');
});

test('an unclear author starts with Sie and is mirrored only after the first reply',()=>{
 assert.equal(replyRegister('Kannst du kurz helfen?',undefined,false,[]),'Sie');
 assert.equal(replyRegister('Huhu',undefined,true,['Kannst du kurz helfen?']),'du');
 assert.equal(replyRegister('Können Sie helfen?',undefined,true,['Kannst du kurz helfen?']),'Sie');
});

test('one visual emoji at most, only for a casual du and never on serious topics',()=>{
 assert.deepEqual(replyVoiceViolations('Schreib mir gern 👋🏽', 'du',false),[]);
 assert.deepEqual(replyVoiceViolations('Schreib mir gern 👋🏽 🙂', 'du',false),['emoji']);
 assert.deepEqual(replyVoiceViolations('Schreiben Sie mir gern 👋', 'Sie',false),['emoji']);
 assert.deepEqual(replyVoiceViolations('Huhu 👋', 'du',straightTone('Schmerzen und Absage')) ,['emoji']);
 assert.ok(straightTone('Die Rechnung fehlt.'));
});
