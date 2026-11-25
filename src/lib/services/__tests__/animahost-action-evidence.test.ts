import test from 'node:test';import assert from 'node:assert/strict';
import {unsupportedActionClaims,type CompletedAction} from '../animahost-action-evidence';
import {contradictoryFindings} from '../animahost-review-consistency';
test('performed actions and booking commitments require a receipt, while questions and next steps do not',()=>{
 for(const t of ['Ich habe Ihren Wunsch vermerkt.','Wir haben Ihren Termin verschoben.','Das habe ich dem Team weitergegeben.','Wir passen den Termin an.','Ich buche Ihnen einen Termin.'])assert.equal(unsupportedActionClaims(t).length,1,t);
 for(const t of ['Das Team prüft Ihren Wunsch.','Bitte verschieben Sie Ihren Termin im eigenen Konto.','Haben Sie den Termin verschoben?','Ihre Nachricht ist angekommen.','Wir haben den Termin noch nicht verschoben.'])assert.equal(unsupportedActionClaims(t).length,0,t);
});
test('receipts must belong to this patient, this action and a completed time',()=>{
 const at='2026-11-25T10:00:00Z',r:CompletedAction={kind:'team_note',patientId:'p',at:'2026-11-25T09:00:00Z',reference:'receipt-1',statement:'Ich habe Ihren Wunsch vermerkt.'};
 assert.equal(unsupportedActionClaims('Ich habe Ihren Wunsch vermerkt.',[r],'p',at).length,0);
 for(const wrong of [{...r,patientId:'other'},{...r,at:'2026-11-26T10:00:00Z'},{...r,reference:''},{...r,statement:'Ich habe etwas anderes vermerkt.'},{...r,kind:'document_send' as const}])assert.equal(unsupportedActionClaims('Ich habe Ihren Wunsch vermerkt.',[wrong],'p',at).length,1);
});
test('contradictory or ungrounded review findings require rechecking, not automatic approval',()=>{
 const quote='Das Team prüft das.';
 for(const r of [{passed:false,hard:[{kind:'confidential_unconfirmed',quote,reason:'Die Aussage ist zulässig; kein tatsächlicher Verstoß.'}]},{passed:true,hard:[{kind:'medical_advice',quote,reason:'Nicht erlaubt'}]},{passed:false,hard:[{kind:'medical_advice',quote:'nicht im Entwurf',reason:'Nicht erlaubt'}]}])assert.equal(contradictoryFindings(r,quote).length,1);
 assert.equal(contradictoryFindings({passed:false,hard:[{kind:'confidential_unconfirmed',quote,reason:'Betrag trotz fehlender Identität'}]},quote).length,0);
});
test('appointment flow guard blocks premature acceptance and links, not a correct self-reschedule or exception review',async()=>{
 const {appointmentFlowMistakes}=await import('../animahost-appointment-flow-check');
 assert.equal(appointmentFlowMistakes('Kein Problem, kommen Sie einfach. Wie viel später?','clarify').length,1);
 assert.equal(appointmentFlowMistakes('Bitte hier verschieben: {doctolib_link}','within').length,1);
 for(const [text,phase] of [['Wie viele Minuten später kommen Sie?','clarify'],['Verschieben Sie den bestehenden Termin im eigenen Konto: {doctolib_link}','reschedule'],['Ob es trotz der 20 Minuten geht, entscheidet das Team.','exception']])assert.equal(appointmentFlowMistakes(text,phase).length,0);
});
test('present-tense forwarding and an already informed team also need actual evidence',()=>{
 for(const text of ['Ich leite das Anliegen ans Team.','Ich gebe Ihre Frage direkt an das Team weiter.','Das Team weiß Bescheid.'])assert.equal(unsupportedActionClaims(text).length,1,text);
});
