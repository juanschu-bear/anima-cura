// Internal acceptance only. Supply a JSON export of the practice's rulebook and settings.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { NextRequest } = require('next/server');

const examples = [
  { name: 'Attachment und Vorbeikommen', text: 'Attachment abgegangen, kann ich spontan vorbeikommen?', topic: 'attachment', noLink: true },
  { name: 'Anfahrt mit dem Wagen', text: 'Gibt es einen Stellplatz für meinen Wagen, wenn ich zu euch komme?', rule: 'anfahrt-parken-und-zugang' },
  { name: 'Anfahrt auf Englisch', text: 'Where can I leave my car when I visit?', rule: 'anfahrt-parken-und-zugang' },
  { name: 'Besuchszeiten mit Tippfehler', text: 'An welchen Wochentagn ist eure Tür für Patienten auf?', rule: 'oeffnungszeiten-und-sprechzeiten' },
  { name: 'Mehrere Anliegen', text: 'Gibt es einen Stellplatz für meinen Wagen, und an welchen Wochentagn seid ihr da?', rules: ['anfahrt-parken-und-zugang', 'oeffnungszeiten-und-sprechzeiten'] },
  { name: 'Kosten umschrieben', text: 'Mit welcher Summe müsste ich für die ganze Behandlung rechnen?', rule: 'was-kostet-die-behandlung' },
  { name: 'Zusatz zur Kurzleistung', text: 'An meinem Plastikteil steht ein Zeichen, das ich nicht zuordnen kann.', action: 'klaerfall' },
  { name: 'Termin auf Türkisch', text: 'Randevumu başka bir güne almak istiyorum.', rule: 'appointment_notice:reschedule:routine' },
  { name: 'Termin auf Spanisch', text: 'No podré asistir a la cita que tengo hoy a las cuatro.', rule: 'appointment_notice:cancel:urgent' },
  { name: 'Anruf umschrieben', text: 'Wäre es möglich, dass sich jemand per Telefon bei mir meldet?', oneOf: ['rueckruf-gewuenscht', 'fallback:callback'] },
  { name: 'Erstattung umschrieben', text: 'Mein Versicherer lehnt die Rückzahlung für die Behandlung ab.', oneOf: ['erstattung-durch-krankenkasse-oder-versicherung', 'fallback:billing'] },
  { name: 'Start laut Rezeption', text: 'Am Empfang sagte man, ich soll mich bei euch melden, damit wir bei meiner Tochter mit der Behandlung anfangen können.', topic: 'appointment', link: true },
  { name: 'Gegenstand in der Praxis', text: 'Meine rote Jacke hängt noch an eurer Garderobe. Kann ich sie wieder holen?', oneOf: ['etwas-in-der-praxis-vergessen', 'fallback:practice'] },
  { name: 'Abholung auf Englisch', text: 'Could we swing by to collect the new mouthpiece you made for my daughter?', action: 'klaerfall', link: true },
  { name: 'Unbekanntes organisatorisches Anliegen', text: 'Ich komme mit meinem Hund. Wie handhaben Sie in der Praxis den Zutritt mit Tieren?', topic: 'practice' },
  { name: 'Individuelle Frage', text: 'Muss ich die Korrektur meines Kiefers bei einem ärztlichen Check für meinen Antrag erwähnen?', action: 'klaerfall' },
  { name: 'Heftige Beschwerden', text: 'Seit zwei Stunden ist das Pochen im Kiefer kaum auszuhalten.', action: 'notfall' },
  { name: 'Atemproblem umschrieben', text: 'Ich ringe gerade nach Atem und bekomme kaum etwas rein.', action: 'notfall', contains: '112' },
  { name: 'Verschlucktes Teil umschrieben', text: 'Das kleine Metallstück ist beim Essen in meinem Hals verschwunden.', action: 'notfall' },
  { name: 'Blutung umschrieben', text: 'Der Mund füllt sich sofort wieder mit Blut, es hört gar nicht auf.', action: 'notfall', contains: '112' },
];

async function run() {
  const practice = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  assert.equal(practice.active_rulebook_version, 6);
  assert.equal(practice.rules.length, 83);
  const modulePath = require.resolve('../src/lib/db/supabase.ts');
  const supabase = require(modulePath);
  const decisions = new Map();
  const notices = [];
  require.cache[modulePath].exports = { ...supabase, createServerClient: () => ({
    from(table) {
      let id;
      const chain = {
        select: () => chain, gte: () => chain, limit: () => chain, order: () => chain,
        eq(col, value) { if (col === 'message_id') id = value; return chain; },
        async maybeSingle() {
          assert.ok(['animahost_whatsapp_decisions', 'animahost_whatsapp_settings'].includes(table));
          return { data: table === 'animahost_whatsapp_settings' ? practice : decisions.get(id) ?? null, error: null };
        },
        async single() {
          assert.equal(table, 'animahost_whatsapp_rulebook_versions');
          return { data: { rules: practice.rules }, error: null };
        },
        async insert(row) {
          assert.equal(table, 'animahost_whatsapp_decisions');
          decisions.set(row.message_id, row);
          return { error: null };
        },
        async upsert(rows) {
          assert.equal(table, 'practice_notifications');
          notices.push(...rows);
          return { error: null };
        },
      };
      return chain;
    },
  }) };
  const secret = randomUUID();
  const tenantId = randomUUID();
  process.env.ANIMAHOST_LINE_SECRET = secret;
  process.env.ANIMAHOST_ACCEPTANCE_PASSED = 'true';
  const { POST } = require('../src/app/api/animahost/whatsapp/route.ts');
  const receivedAt = '2026-11-22T11:00:00+01:00';
  const keywordSet = practice.rules.flatMap(rule => rule.keywords.map(word => word.toLocaleLowerCase('de-DE')));
  const results = [];
  for (let offset = 0; offset < examples.length; offset += 4) {
    results.push(...await Promise.all(examples.slice(offset, offset + 4).map(async example => {
      const id = randomUUID();
      const start = performance.now();
      const response = await POST(new NextRequest('https://example.invalid/api/animahost/whatsapp', {
        method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, messageId: id, from: `${id}@test.invalid`, text: example.text, messageType: 'text', receivedAt }),
      }));
      const { action, rule, text } = await response.json();
      const elapsedMs = Math.round(performance.now() - start);
      const hits = [...new Set(keywordSet.filter(word => example.text.toLocaleLowerCase('de-DE').includes(word)))];
      const urgentNote = notices.some(row => row.source_key.includes(id) && row.kind === 'wichtig');
      const passed = response.ok && Boolean(text?.trim()) && elapsedMs < 20_000 && hits.length === 0 &&
        (!example.action || example.action === action) &&
        (!example.rule || rule?.split('|').includes(example.rule)) &&
        (!example.oneOf || example.oneOf.includes(rule)) &&
        (!example.rules || action === 'antworten' && example.rules.every(key => rule?.split('|').includes(key))) &&
        (!example.topic || rule?.startsWith(`fallback:${example.topic}`)) &&
        (!example.link || text?.includes(practice.doctolib_url)) &&
        (!example.noLink || !text?.includes('https://')) &&
        (!example.contains || text?.includes(example.contains)) &&
        (action !== 'notfall' || urgentNote);
      return { name: example.name, passed, elapsedMs, hits, action, rule, text };
    })));
  }
  console.log(JSON.stringify({ results, whatsappSent: 0, productionWrites: 0 }, null, 2));
  if (results.some(result => !result.passed)) process.exitCode = 1;
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
