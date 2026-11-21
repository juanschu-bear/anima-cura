import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidateRules,decisionFromRule,emergencyDecision,explicitOptOut,mandatoryAppointmentClarification,
 isAppointmentLinkRule,safeRuleText,whatsappRulesSchema} from '../animahost-whatsapp';
import {appointmentNoticeDecision,appointmentNoticeFromDecision} from '../animahost-appointment-notices';
import {closureDecision,closurePeriodsSchema} from '../animahost-practice-closures';

const rule={id:'doctolib',topic:'Termine online buchen',keywords:['termin','buchen'],
 action:'antworten' as const,patientText:'Termine können Sie direkt über Doctolib buchen.'};

test('notfall overrides any rule and places 112 first',()=>{
 assert.deepEqual(emergencyDecision('Mein Kind bekommt keine Luft'),
  {action:'notfall',text:'Bei Atemnot, starker Blutung oder akuter Gefahr rufen Sie bitte sofort die 112.',rule:'emergency_112'});
 assert.equal(emergencyDecision('Ein Bracket wurde verschluckt')?.action,'notfall');
 assert.equal(emergencyDecision('Der Draht sticht und es blutet')?.action,'notfall');
 assert.equal(emergencyDecision('Die Lippe ist angeschwollen und ich kriege schlecht Luft')?.rule,'emergency_112');
});
test('only a documented matching rule may answer',()=>{
 assert.equal(candidateRules('Wie kann ich einen Termin buchen?',[rule]).length,1);
 assert.equal(candidateRules('Was kostet eine Spange?',[rule]).length,0);
 assert.equal(decisionFromRule(null).action,'klaerfall');
 assert.equal(decisionFromRule(rule).text,rule.patientText);
});
test('rulebook rejects duplicate IDs and appointment commitments',()=>{
 assert.equal(whatsappRulesSchema.safeParse([rule,rule]).success,false);
 assert.equal(safeRuleText({...rule,patientText:'Ihr Termin ist bestätigt.'}),false);
 assert.equal(safeRuleText({...rule,patientText:'Nehmen Sie 20 mg.'}),false);
});
test('practice arrangements and appliance appointments override a possible online match',()=>{
 for(const message of [
  'In der Praxis wurde gesagt, ich soll hier wegen des Behandlungsbeginns meiner Tochter schreiben.',
  'Können wir die Spange nächste Woche einsetzen lassen?',
  'Die Schiene ist fertig; wann kann ich sie abholen?',
  'An der Rezeption wurde mit uns etwas anderes vereinbart.',
 ])assert.equal(mandatoryAppointmentClarification(message),true,message);
 assert.equal(mandatoryAppointmentClarification('Ich möchte eine Routinekontrolle für die feste Spange buchen.'),false);
});
test('approved appointment types are complete and unique; other rules can render a Doctolib placeholder',()=>{
 const appointment={...rule,appointmentTypeId:'routine_control',
  appointmentDescription:'Reguläre Verlaufskontrolle einer bestehenden Zahnspange'};
 assert.equal(whatsappRulesSchema.safeParse([appointment]).success,true);
 assert.equal(whatsappRulesSchema.safeParse([{...rule,appointmentTypeId:'routine_control'}]).success,false);
 assert.equal(whatsappRulesSchema.safeParse([appointment,{...appointment,id:'other'}]).success,false);
 assert.equal(isAppointmentLinkRule(appointment),true);
 assert.equal(isAppointmentLinkRule(rule),false);
 const rebook={...rule,patientText:'Wenn Sie neu buchen möchten: {doctolib_link}'};
 assert.equal(decisionFromRule(rebook,'https://www.doctolib.de/praxis').text,
  'Wenn Sie neu buchen möchten: https://www.doctolib.de/praxis');
 assert.equal(decisionFromRule(rebook).action,'klaerfall');
 assert.equal(decisionFromRule(rebook,'http://www.doctolib.de/praxis').action,'klaerfall');
});
test('appointment notices respect Berlin date and the strict 15-minute threshold',()=>{
 const received='2026-11-19T23:05:00Z';
 const late={kind:'late' as const,appointmentDate:'2026-11-20',delayMinutes:16};
 const decide=(notice:Parameters<typeof appointmentNoticeDecision>[0])=>appointmentNoticeDecision(notice,received,'de',null,null);
 assert.equal(decide({...late,delayMinutes:15}),null);
 assert.equal(decide({...late,delayMinutes:null}),null);
 assert.deepEqual(appointmentNoticeFromDecision(decide(late)!),{kind:'late',urgent:true});
 assert.deepEqual(appointmentNoticeFromDecision(decide({...late,kind:'cancel'})!),{kind:'cancel',urgent:true});
 assert.deepEqual(appointmentNoticeFromDecision(decide({...late,kind:'reschedule'})!),{kind:'reschedule',urgent:false});
 assert.deepEqual(appointmentNoticeFromDecision(decide({...late,kind:'missed'})!),{kind:'missed',urgent:false});
 assert.deepEqual(appointmentNoticeFromDecision(decide({...late,kind:'cancel',appointmentDate:'2026-11-21'})!),{kind:'cancel',urgent:false});
});
test('a closure answers only for the stored period, including both ends',()=>{
 const periods=[{from:'2026-12-24',through:'2027-01-03',kind:'holiday'}];
 assert.equal(closurePeriodsSchema.safeParse([{...periods[0],through:'2026-12-23'}]).success,false);
 assert.equal(closureDecision(periods,'2026-12-24','de')?.rule,'practice_closure:holiday');
 assert.equal(closureDecision(periods,'2027-01-03','en')?.action,'antworten');
 assert.equal(closureDecision(periods,'2027-01-04','de'),null);
});
test('common stop wording is recognized even before model acceptance',()=>{
 for(const text of ['Stopp','Bitte keine WhatsApp-Nachrichten mehr',
  'Schreiben Sie mir bitte nicht mehr','Do not message me anymore'])
  assert.equal(explicitOptOut(text),true,text);
 assert.equal(explicitOptOut('Können Sie mich morgen anrufen?'),false);
});
