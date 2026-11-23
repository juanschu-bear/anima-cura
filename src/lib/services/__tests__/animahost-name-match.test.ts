import test from 'node:test';
import assert from 'node:assert/strict';
import {matchChatNames} from '../animahost-name-match';
const patients=[{id:'a',vorname:'Leon Mika',nachname:'Beispiel',versicherter_vorname:'Nora',versicherter_nachname:'Beispiel'},
 {id:'b',vorname:'Mira',nachname:'Beispiel',versicherter_vorname:'Nora',versicherter_nachname:'Beispiel'},
 {id:'c',vorname:'Leon',nachname:'Muster'}];
test('given name alone stays ambiguous; no arbitrary first child',()=>{
 assert.deepEqual(matchChatNames('Hier ist Leon',patients).map(h=>h.patient.id),['a','c']);
 assert.deepEqual(matchChatNames('Mira',patients).map(h=>h.patient.id),['b']);
});
test('signature, inverted order and middle names match without proving identity',()=>{
 for(const text of ['Bitte Termin verschieben. Viele Grüße Mika Beispiel','Beispiel Leon','Hier ist Leon Mika Beispiel'])assert.deepEqual(matchChatNames(text,patients).map(h=>h.patient.id),['a']);
});
test('parent names alone are ambiguous; explicitly named child wins',()=>{
 assert.equal(matchChatNames('Hier ist Nora Beispiel',patients).length,2);
 assert.deepEqual(matchChatNames('Mein Sohn Mika braucht einen Termin. Grüße Nora Beispiel',patients).map(h=>h.patient.id),['a']);
});
test('ordinary appointment vocabulary is not a name match',()=>{
 assert.deepEqual(matchChatNames('Guten Tag, geht Montag im Mai ein Termin?', [{id:'x',vorname:'Mai',nachname:'Montag'}]),[]);
});
