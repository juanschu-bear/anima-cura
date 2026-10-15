// Render the real component with synthetic records; no patient or transport requests.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from 'playwright';

const directory = await mkdtemp(join(tmpdir(), 'anima-dispatch-ui-'));
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const patient = { id: uuid(1), name: 'Demo: Cornelia Alexandra Mustermann-Langenberg', number: '00007223' };
const message = number => ({ id: uuid(number + 100), patient_id: patient.id, patients: [patient], patientName: patient.name,
  campaign_key: number % 2 ? 'q3_2026_invoice_email' : 'patient_portal_clarification_20261015', channel: 'email', provider: 'resend',
  recipient: 'familie@example.invalid', subject: number % 2 ? 'Deine Rechnung für Q3/2026 – Praxis Dr. Schubert' : 'Wichtige Information zu deinem Rechnungszugang',
  status: 'accepted', sent_at: '2026-10-15T00:48:00Z', created_at: '2026-10-15T00:47:00Z', delivered_at: null,
  first_opened_at: null, first_clicked_at: null, events: [{ id: uuid(number + 300), event_type: 'accepted', source: 'transport', occurred_at: '2026-10-15T00:48:00Z' }], portalEvents: [] });
const messages = Array.from({ length: 18 }, (_, i) => message(i));
const indexRows = [messages[0], ...Array.from({ length: 20 }, (_, index) => ({ ...message(index + 30), patients: [{ ...patient, id: uuid(index + 2), name: `Demo Patient ${index + 2}` }] }))];
const dossier = { patients: [{ ...patient, login: { state: 'used', lastAt: '2026-10-15T01:05:00Z' } }], messages,
  portalEvents: [{ id: uuid(500), patient_id: patient.id, event_type: 'document_view', created_at: '2026-10-15T01:06:00Z' }],
  documents: [{ id: uuid(600), patient_id: patient.id, name: 'Rechnung 3/2026 · BEMA', openedAt: null }],
  inbound: [{ id: uuid(800), sender: 'familie@example.invalid', subject: 'Wo finde ich meine Rechnung?', receivedAt: '2026-10-15T01:02:00Z', autoReplied: true, manualReview: false, practiceNotified: false, failed: false }],
  availability: { replies: true, portal: true, documents: true }, truncated: false };
const source = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {PatientCommunicationCenter} from './src/components/communication/PatientCommunicationCenter';
function App(){const[selected,setSelected]=useState(null);return <main className="mx-auto max-w-[1400px] p-4"><PatientCommunicationCenter messages={${JSON.stringify(indexRows)}} inbound={${JSON.stringify(dossier.inbound)}} repliesAvailable={true} selected={selected} onSelect={setSelected} locale="de" dark={true} busy={false}/></main>};createRoot(document.getElementById('root')).render(<App/>);`;
const compiled = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } });
const css = await postcss([tailwind()]).process((await readFile('src/app/globals.css', 'utf8')).replace(/^@import.*$/gm, ''), { from: 'src/app/globals.css' });
const browser = await chromium.launch({ headless: true });
try {
  for (const [label, width, height] of [['desktop', 1440, 1050], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [], remote = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'dispatch.test') { remote.push(url.href); return route.abort(); }
      if (url.pathname.endsWith('/inhalt')) return route.fulfill({ json: { available: true, from: 'Praxisteam <praxisteam@animacura.io>', replyTo: ['praxisteam@animacura.io'], text: 'Hallo Cornelia, deine Rechnung findest du im Patientenportal.', html: '<div style="padding:24px;font:16px Arial"><h1>Praxis Dr. Schubert</h1><p>Hallo Cornelia,</p><p>deine Rechnung findest du im Patientenportal.</p><a href="https://tracking.invalid/click">Rechnung öffnen</a><img src="https://tracking.invalid/open"></div>', source: 'original' } });
      if (url.pathname.startsWith('/api/kommunikation/')) return route.fulfill({ json: dossier });
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'application/javascript', body: compiled.outputFiles[0].text });
      if (url.pathname === '/style.css') return route.fulfill({ contentType: 'text/css', body: css.css });
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
    });
    await page.goto('http://dispatch.test/');
    await page.getByRole('heading', { name: 'Patienten & Kommunikation' }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 15);
    await page.screenshot({ path: join(directory, `${label}-index.png`), fullPage: true });
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    assert.equal(await page.locator('tbody tr').count(), 6);
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await page.getByLabel('Patient, Nummer oder Kontaktadresse').fill('Cornelia');
    await page.getByRole('button', { name: /Demo: Cornelia Alexandra/, exact: false }).first().click();
    await page.getByText('Bereits angemeldet', { exact: true }).waitFor();
    await page.getByTitle('Verschickte E-Mail').waitFor();
    await page.frameLocator('iframe').getByText('Hallo Cornelia,', { exact: true }).waitFor();
    assert.ok(await page.getByText('familie@example.invalid', { exact: true }).count());
    assert.equal(await page.locator('button[aria-pressed][class*="w-full"]').count(), 15);
    await page.screenshot({ path: join(directory, `${label}-email.png`), fullPage: true });
    await page.getByRole('button', { name: 'Textansicht', exact: true }).click();
    assert.ok(await page.getByText('Hallo Cornelia, deine Rechnung findest du im Patientenportal.', { exact: true }).isVisible());
    await page.getByRole('button', { name: /^Rückmeldungen/ }).click();
    assert.ok(await page.getByText('Vom Support automatisch beantwortet', { exact: true }).isVisible());
    await page.getByRole('button', { name: /^Rechnungen & Zahlung/ }).click();
    assert.ok(await page.getByText('Kein Einzelabruf nachgewiesen', { exact: true }).isVisible());
    await page.getByRole('button', { name: /^Zeitachse/ }).click();
    assert.equal(await page.locator('ol li').count(), 15);
    assert.ok(await page.getByText('Dokumentenbereich geöffnet', { exact: true }).isVisible());
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `${label}: page overflow`);
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, [], 'Preview must not load remote images, links or tracking');
    console.log(`${label}: pagination, mail preview, replies, invoice evidence, timeline and tracking isolation passed`);
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(join(directory, 'result.txt'), 'Synthetic fixture only. Desktop and mobile tests passed.');
console.log(`Screenshots: ${directory}`);
