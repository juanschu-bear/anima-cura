import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidateRules,decisionFromRule,emergencyDecision,safeRuleText,whatsappRulesSchema} from '../animahost-whatsapp';

const rule={id:'doctolib',topic:'Termine online buchen',keywords:['termin','buchen'],
 action:'antworten' as const,patientText:'Termine können Sie direkt über Doctolib buchen.'};

test('notfall overrides any rule and places 112 first',()=>{
 assert.deepEqual(emergencyDecision('Mein Kind bekommt keine Luft'),
  {action:'notfall',text:'Bei Atemnot oder akuter Gefahr rufen Sie bitte sofort die 112.',rule:'emergency_112'});
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
