import test from 'node:test';import assert from 'node:assert/strict';import {removeKnownIdentityQuestions as clean} from '../animahost-identity-question';
const known={name:true,birthDate:true};
test('recognize direct and polite sender questions without changing the remaining text',()=>{
 for(const question of ['Wie heißen Sie?','Unter welchem Namen sind Sie bei uns angemeldet?','Wann sind Sie geboren?','Wie lautet Ihr Geburtsdatum?','Bitte teilen Sie mir das Geburtsdatum mit.']){
  const r=clean('Danke.\n'+question+'  Wir kümmern uns.',known);assert.deepEqual(r.removed,[question]);assert.equal(r.text,'Danke.\n  Wir kümmern uns.');
 }
});
test('preserve supplied identity, unrelated requests, third-party identity and unknown fields',()=>{
 for(const text of ['Danke für Ihr Geburtsdatum.','Bitte schicken Sie die Vollmacht.','Wie heißt Ihr Bruder?','Wann passt Ihnen der Termin?'])assert.equal(clean(text,known).text,text);
 assert.equal(clean('Wie lautet Ihr Geburtsdatum?',{name:true,birthDate:false}).removed.length,0);
 assert.equal(clean('Wie heißen Sie?',{name:false,birthDate:true}).removed.length,0);
});
