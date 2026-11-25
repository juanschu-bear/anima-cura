import test from 'node:test';import assert from 'node:assert/strict';import {removeProvidedNameRequests} from '../animahost-provided-name-question';
test('a known relative name is not requested again while an unknown DOB stays',()=>{
 const text='Nennen Sie mir bitte den vollen Namen und das Geburtsdatum von Mira Beispiel.';
 assert.equal(removeProvidedNameRequests(text,'Es geht um die Rechnung meiner Schwester Mira Beispiel.').text,'Nennen Sie mir bitte das Geburtsdatum von Mira Beispiel.');
 assert.equal(removeProvidedNameRequests(text,'Es geht um meine Schwester.').text,text);
});
test('a name-only repeated question is removed without removing other questions or inventing identity',()=>{
 const text='Nennen Sie mir den vollständigen Namen von Mira Beispiel. Worum geht es bei der Rechnung?';
 assert.equal(removeProvidedNameRequests(text,'Meine Schwester Mira Beispiel braucht ihre Rechnung.').text,'Worum geht es bei der Rechnung?');
 assert.equal(removeProvidedNameRequests('Wie heißt der Patient bei uns?','Mein Bruder hat einen Termin.').removed.length,0);
});
test('similar names and ordinary capitalized words are not evidence of a supplied name',()=>{
 const text='Nennen Sie mir den Namen von Mira Beispiel.';
 assert.equal(removeProvidedNameRequests(text,'Amira Beispiel hat einen Termin.').removed.length,0);
 assert.equal(removeProvidedNameRequests('Nennen Sie mir den Namen.','Nennen Sie mir den Namen der Behandlung.').removed.length,0);
});
