import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackDecision, nextPracticeDay, withRuleReplies } from '../animahost-whatsapp-fallback';
import { decisionFromRule, type WhatsAppRule } from '../animahost-whatsapp';

const hours = 'Unsere regulären Sprechzeiten sind Dienstag bis Donnerstag von 9:00 bis 13:00 Uhr und von 14:00 bis 18:30 Uhr. Montag und Freitag sind wir nur nach gesonderter Vereinbarung für Sie da.';

test('handovers use the regular schedule and skip closures and appointment-only days', () => {
  const at = '2026-11-26T23:45:00+01:00';
  assert.equal(nextPracticeDay(at, hours, [], 'de'), 'Dienstag, 1. Dezember');
  assert.equal(nextPracticeDay(at, hours, [{ from: '2026-12-01', through: '2026-12-02', kind: 'closure' }], 'de'), 'Donnerstag, 3. Dezember');
  assert.equal(nextPracticeDay(at, undefined, [], 'de'), null);
});

test('an attachment handover names the issue, next day and online options', () => {
  const reply = fallbackDecision({
    topic: 'attachment', appointment: true, language: 'de', day: 'Dienstag, 24. November',
    doctolibUrl: 'https://example.invalid/termine',
  });
  assert.equal(reply.action, 'klaerfall');
  assert.equal(reply.rule, 'fallback:attachment');
  assert.match(reply.text, /Attachment.*Dienstag, 24. November.*https:\/\/example.invalid\/termine/);
});

test('multiple selected rules read as one reply with urgent information first', () => {
  const common = { topic: 'Example', keywords: ['example'] };
  const rules: WhatsAppRule[] = [
    { ...common, id: 'parking', action: 'antworten', patientText: 'Parken können Sie im Parkhaus.' },
    { ...common, id: 'urgency', action: 'notfall', patientText: 'Bitte rufen Sie sofort in der Praxis an.' },
  ];
  assert.deepEqual(withRuleReplies(null, ['parking', 'unknown', 'urgency', 'parking'], rules, null), {
    action: 'notfall', rule: 'urgency|parking',
    text: 'Bitte rufen Sie sofort in der Praxis an.\n\nParken können Sie im Parkhaus.',
  });
});

test('existing practice text offers an appointment without self-care instructions', () => {
  const reply = decisionFromRule({
    id: 'bracket', topic: 'Bracket', keywords: ['Bracket'], action: 'antworten',
    patientText: 'Bitte wählen Sie einen Kontrolltermin: {doctolib_link} Reibt etwas, hilft bis dahin ein kleines Stück Wachs auf der Stelle. Bei Schmerzen rufen Sie bitte an.',
  }, 'https://example.invalid/termine');
  assert.match(reply.text, /Kontrolltermin/);
  assert.doesNotMatch(reply.text, /Wachs/);
});
