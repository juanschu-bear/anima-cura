import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySender,quietSenderRule,unknownSenderDecision } from '../animahost-sender-policy';

test('staff and non-patient numbers are normalized and take precedence over patient matches',()=>{
 const input={jid:'491790000111@lid',trustedPhone:'491790000111',hasPatient:true};
 assert.equal(classifySender({...input,teamPhones:'0049 179-0000111'}),'team');
 assert.equal(classifySender({...input,nonPatientPhones:'0179 0000111'}),'non_patient');
 assert.equal(classifySender({...input,jid:'1200000000@g.us'}),'group');
 assert.equal(classifySender(input),'patient');
 assert.equal(classifySender({...input,hasPatient:false}),'unknown');
});

test('an unknown sender gets one question and later messages stay with the practice',()=>{
 const first=unknownSenderDecision(false,'Wer schreibt?');
 const repeat=unknownSenderDecision(true,'Wer schreibt?');
 assert.equal(first.text,'Wer schreibt?');
 assert.equal(quietSenderRule.test(first.rule),false);
 assert.equal(repeat.text,'');
 assert.equal(quietSenderRule.test(repeat.rule),true);
});
