import test from 'node:test';
import assert from 'node:assert/strict';
import {callbackDeadlineSentences,withoutCallbackDeadlines} from '../animahost-no-deadlines';
test('callback promises are forbidden in first and follow-up replies, regardless of calculated deadline',()=>{
 for(const text of ['Sie hören bis heute 12 Uhr von uns.','Wir melden uns heute noch.','Das Team prüft das morgen.','Die Rückmeldung kommt bis Mittwoch, 25. November, 10 Uhr.','Sie bekommen innerhalb von zwei Tagen eine Antwort.','Du hörst bald von uns.','We will get back to you tomorrow.','Wir geben Ihnen heute Bescheid.','Das Praxis-Team prüft das morgen.','Wir melden uns am 25. November.','Sie bekommen die Bestätigung morgen.'])assert.equal(callbackDeadlineSentences(text).length,1,text);
});
test('appointment, opening and recorded invoice-dispatch times are preserved',()=>{
 for(const text of ['Ihr Termin ist morgen um 12 Uhr.','Die Praxis öffnet heute um 9 Uhr.','Ihre Rechnungs-Mail wurde gestern um 15:37 Uhr versandt.','Das Team meldet sich bei Ihnen.','Bei Atemnot rufen Sie sofort 112.'])assert.deepEqual(callbackDeadlineSentences(text),[],text);
});
test('remove the whole callback sentence without leaving a date fragment',()=>{
 assert.equal(withoutCallbackDeadlines('Das Team prüft Ihr Anliegen. Sie hören bis Mittwoch, 25. November, 10 Uhr von uns.').text,'Das Team prüft Ihr Anliegen.');
});
