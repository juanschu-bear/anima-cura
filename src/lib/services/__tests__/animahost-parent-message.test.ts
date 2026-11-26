import test from 'node:test';import assert from 'node:assert/strict';
import {subjectNameText,subjectNameResolution,senderDeclaration,matchChatNames} from '../animahost-name-match';
const child={id:'child',vorname:'Carlo',nachname:'Schubert',geburtsdatum:'2015-04-12',versicherter_vorname:'Manuel',versicherter_nachname:'Schubert'};
test('explicit parent introduction separates sender from the child concerned',()=>{
 const message='Hallo, hier ist Manuel Schubert, ich bin der Vater von Carlo Schubert. Leider ist er krank und kann morgen um 14 Uhr nicht kommen.';
 assert.equal(subjectNameText(message),'Carlo Schubert');assert.equal(senderDeclaration(message),'Manuel Schubert');
 assert.equal(subjectNameResolution(message,[child])?.context.patientId,'child');
 assert.equal(subjectNameResolution(message,[child])?.context.role,'subject');
});
test('Mama von is a relationship, not a claimed sender name; first name resolves only in trusted family',()=>{
 const message='Hallo, hier ist die Mama von Carlo. Er ist krank.';
 assert.equal(senderDeclaration(message),null);assert.equal(subjectNameText(message),'Carlo');
 assert.equal(subjectNameResolution(message,[child],['child'])?.context.patientId,'child');
 assert.equal(subjectNameResolution(message,[child],[]),null);
});
test('matching child names ask only for missing DOB, never again for the supplied full name',()=>{
 const message='Ich bin die Mutter von Carlo Schubert. Er kann nicht kommen.';
 const resolved=subjectNameResolution(message,[child,{...child,id:'other',geburtsdatum:'2017-01-01'}]);
 assert.equal(resolved?.context.status,'ambiguous');assert.equal(resolved?.context.question,'Wie lautet das Geburtsdatum Ihres Kindes?');
});
test('third-person authorization never becomes sender identity',()=>{
 assert.equal(matchChatNames('Mein Bruder Manuel Schubert darf mit Ihnen sprechen.',[child]).length,0);
});

test('a supplied full sender or child name removes generic name requests but preserves the actual answer',async()=>{
 const {removeProvidedNameRequests}=await import('../animahost-provided-name-question');
 const text='Gute Besserung! Bitte nennen Sie mir Ihren vollständigen Namen. Das Team prüft den Terminwunsch.';
 assert.equal(removeProvidedNameRequests(text,'Hallo, hier ist Manuel Schubert.').text,'Gute Besserung!  Das Team prüft den Terminwunsch.');
 assert.equal(removeProvidedNameRequests('Bitte nennen Sie den vollständigen Namen Ihres Kindes.','Hier ist die Mama von Carlo Schubert.').text,'');
 assert.equal(removeProvidedNameRequests('Wie lautet das Geburtsdatum Ihres Kindes?','Hier ist die Mama von Carlo Schubert.').removed.length,0);
});
