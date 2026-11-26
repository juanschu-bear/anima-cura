import test from 'node:test';import assert from 'node:assert/strict';import{practiceCallInvitations,unconfirmedOpeningHours,removeSentences}from'../animahost-practice-contact';
test('practice telephone invitations are detected including the previously sent variants',()=>{
 for(const text of ['Rufen Sie bitte kurz in der Praxis an.','Rufen Sie uns am besten gleich an: 0179 1234567.','Du kannst uns telefonisch erreichen.','Klingel bitte einmal lang, oder ruf durch: 0341 123456.','Sie erreichen uns unter 0341 123456.','Melden Sie sich bitte telefonisch in der Praxis.','Sie können kurz durchklingeln.'])assert.equal(practiceCallInvitations(text).length,1,text);
});
test('outbound callback, text channel and independent emergency numbers remain allowed',()=>{
 for(const text of ['Das Team meldet sich telefonisch bei Ihnen.','Wir rufen Sie zurück.','Bitte nicht auf dieser Nummer anrufen.','Bei akuter Atemnot rufen Sie 112 an.','Rufen Sie den zahnärztlichen Notdienst an.','Bitte schreiben Sie uns hier.'])assert.equal(practiceCallInvitations(text).length,0,text);
});
test('unverified practice hours are distinct from patient appointments and can be removed alone',()=>{
 assert.equal(unconfirmedOpeningHours('Unsere Sprechzeiten sind Dienstag bis Donnerstag von 9 bis 18:30 Uhr.').length,1);
 assert.equal(unconfirmedOpeningHours('Am Dienstag sind wir von 9 bis 13 und von 14 bis 18:30 Uhr für Sie da.').length,1);
 assert.equal(unconfirmedOpeningHours('Ihr Termin ist Donnerstag um 14 Uhr.').length,0);
 const text='Gute Besserung! Rufen Sie uns bitte an. Das Team prüft den Terminwunsch.';
 assert.equal(removeSentences(text,practiceCallInvitations(text)),'Gute Besserung!  Das Team prüft den Terminwunsch.');
});
