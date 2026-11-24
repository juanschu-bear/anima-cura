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
test('parent names stay sender candidates; a child subject is not the sender',()=>{
 assert.equal(matchChatNames('Hier ist Nora Beispiel',patients).length,2);
 assert.deepEqual(matchChatNames('Mein Sohn Mika braucht einen Termin. Grüße Nora Beispiel',patients).map(h=>h.patient.id),['a','b']);
});
test('ordinary appointment vocabulary is not a name match',()=>{
 assert.deepEqual(matchChatNames('Guten Tag, geht Montag im Mai ein Termin?', [{id:'x',vorname:'Mai',nachname:'Montag'}]),[]);
});
test('third-party consent never turns brother into sender; explicit self-introduction wins',()=>{const family=[{id:'s',vorname:'Mira',nachname:'Beispiel'},{id:'b',vorname:'Amir Leon',nachname:'Beispiel'}];assert.deepEqual(matchChatNames('Ich bestätige, dass mein Bruder Leon Beispiel mit Ihnen kommunizieren darf.',family),[]);assert.deepEqual(matchChatNames('Mein Name ist Mira Beispiel. Mein Bruder Leon Beispiel unterstützt mich.',family).map(h=>h.patient.id),['s']);assert.equal(matchChatNames('Mein Name ist Mira Beispiel.',[...family,{id:'s2',vorname:'Mira',nachname:'Beispiel'}]).length,2);});

test('mother and son mentions do not identify the sender',()=>{for(const relation of ['meine Mutter','mein Sohn','meine Schwester'])assert.deepEqual(matchChatNames('Ich bestätige, dass '+relation+' Mira Beispiel mit Ihnen sprechen darf.',patients),[]);});
