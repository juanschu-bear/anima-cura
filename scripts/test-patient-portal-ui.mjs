/** Real patient components in Chromium; synthetic API/auth data; no production requests. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

const id = '00000000-0000-4000-8000-000000000001';
const upload = {
  id, patientId: id, typ: 'rechnungsbeleg', source: 'patient_upload', name: 'Rechnung als PDF',
  documentType: 'rechnung', rechnung_datum: null, uploadedAt: '2026-11-22T08:00:00Z',
  rechnung_nr: null, betrag: null, offen: 0, gezahlt: 0, status: 'beleg',
  paymentStatusKnown: false, paymentActionAllowed: false,
  beleg: {
    id, patientId: id, pdf: true, pdfUrl: `/api/patient/rechnungen/${id}/pdf?source=upload`,
    positionen: [], begruendungen: [], art: null, quartal: null,
  },
};
const structured = {
  ...upload, id: `${id}-structured`, source: undefined, betrag: 123.45, rechnung_nr: 'TEST-1',
  beleg: { ...upload.beleg, history:[{documentId:'history',pdfUrl:'/api/rechnungsakte?historyId=history',comparison:'different'}], positionen:[{datum:'2026-09-30',nr:'TEST',text:'Kontrolle',region:null,anzahl:1,anzahlText:'1',punkte:null,faktor:null,eur:123.45,abschnitt:'Test',tarif:'BEMA',begruendungen:[]}], art: 'BEMA', quartal: '2026-Q3', pdfUrl: `/api/patient/rechnungen/${id}/pdf` },
};
const available = {
  rechnungen: [upload], belegeStatus: 'available', hochgeladeneRechnungenStatus: 'available',
  zahlungsdatenStatus: 'available',
};
const payloads = {
  ratenplan: { plan: null, investiert: 0, offen_betrag: 0, raten_bezahlt: 0, raten_gesamt: 0,
    prozent: 0, streak: 0, naechste_rate: null, ueberfaellig: null, has_financial_data: false },
  consent: { consent: { portal_nutzung: true, datenschutz_akzeptiert: true } },
  behandlung: { phasen: [] }, badges: { badges: [] }, nachrichten: { nachrichten: [] },
  benachrichtigungen: { benachrichtigungen: [] }, dokumente: { dokumente: [] }, tipps: { tipps: [] },
  zahlungen: { zahlungen: [], ueberfaellige: [] }, rechnungen: available,
  'invoice-access/children': { children: [] },
};
const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import Portal from './src/components/patient/PatientPortalShell';
    import Login from './src/components/patient/PatientLoginForm';
    import PatientError from './src/app/patient/error';
    class Boundary extends React.Component {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      render() { return this.state.failed ? <PatientError error={new Error('fixture')} reset={()=>{}}/> : this.props.children; }
    }
    function Broken() { throw new Error('synthetic render failure'); }
    const mode = new URLSearchParams(location.search).get('mode');
    createRoot(document.getElementById('root')).render(mode === 'login' ? <Login/> :
      mode === 'error' ? <Boundary><Broken/></Boundary> : <Portal patientId="${id}" patientName="Test"/>);
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  plugins: [{ name: 'test-boundaries', setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
    b.onResolve({ filter: /^@\/lib\/db\/supabase$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
      contents: path === 'navigation' ? `
        const router={replace:(url)=>{window.__destination=url},refresh:()=>{}};
        export const useRouter=()=>router;
        const params=new URLSearchParams(location.search);
        export const useSearchParams=()=>params;
      ` : `
        const mode=new URLSearchParams(location.search).get('auth');
        export const createBrowserClient=()=>({auth:{
          signOut:async()=>({error:null}),
          signInWithPassword:async()=>{
            if(mode==='throw') throw new TypeError('Failed to fetch');
            return {error:mode==='invalid'?{message:'invalid credentials'}:null};
          },
          getUser:async()=>({data:{user:mode==='missing'?null:{id:'${id}',
            app_metadata:{role:'patient'},user_metadata:{patient_id:'${id}'}}},error:null})
        }});
      `, loader: 'js',
    }));
  } }],
});
const pdf = await PDFDocument.create();
pdf.addPage();
const pdfBytes = Buffer.from(await pdf.save());
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://fixture').pathname;
  if (path === '/bundle.js') {
    res.setHeader('content-type', 'text/javascript');
    res.end(bundle.outputFiles[0].text);
  } else if (path.endsWith('/pdf')) {
    res.setHeader('content-type', 'application/pdf');
    res.end(pdfBytes);
  } else if (path.startsWith('/api/')) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(payloads[path.replace('/api/patient/', '')] ?? {}));
  } else if (path === '/sw.js') {
    res.writeHead(404); res.end();
  } else {
    res.setHeader('content-type', 'text/html');
    res.end('<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  async function test(name, fn) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'de-DE' });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(id => localStorage.setItem(`ac_welcome_guide_dismissed:${id}`, '1'), id);
    try {
      await fn(page);
      assert.deepEqual(errors, [], `${name}: unexpected browser exception`);
      console.log(`PASS: ${name}`);
    } finally { await page.close(); }
  }
  await test('uploaded PDF with null quarter/type/amount; direct invoice link', async page => {
    const events=[];page.on('request',r=>{if(r.url().endsWith('/rechnungen/event'))events.push(r.postDataJSON());});
    await page.goto(`${origin}/patient/portal?section=rechnungen`);
    const invoices = page.locator('#portal-rechnungen');
    await invoices.getByText('Betrag siehe PDF', { exact: true }).waitFor();
    assert.doesNotMatch(await invoices.innerText(), /0,00\s*€|Krankenkasse|Kassenrechnung/);
    await invoices.getByRole('button', { name: 'PDF anzeigen' }).click();
    const link = invoices.locator(`a[href="${upload.beleg.pdfUrl}"]`);
    await link.waitFor();
    assert.equal(events.filter(e=>e.event==='invoice_opened').length,0,'An upload card with no invoice contents is not invoice viewing evidence');
    const response = await page.request.get(new URL(await link.getAttribute('href'), origin).href);
    assert.equal(response.status(), 200);
    assert.equal((await response.body()).subarray(0, 5).toString(), '%PDF-');
  });
  await test('structured invoice and remembered finance tab', async page => {
    await page.addInitScript(() => sessionStorage.setItem('ac_tab', 'progress'));
    await page.route('**/api/patient/rechnungen', route => route.fulfill({ json: { ...available, rechnungen: [structured] } }));
    await page.goto(`${origin}/patient/portal`);
    const invoices = page.locator('#portal-rechnungen');
    await invoices.getByText('Rechnung 3. Quartal 2026', { exact: true }).waitFor();
    assert.match(await invoices.innerText(), /123,45\s*€/);
    const event=page.waitForRequest(r=>r.url().endsWith('/rechnungen/event'));
    await invoices.getByRole('button', { name: 'Positionen und PDF' }).click();
    assert.deepEqual((await event).postDataJSON(),{event:'invoice_opened',documentId:id});
    await invoices.getByText('Quartal 3/2026', { exact: false }).waitFor();
    await invoices.getByText('Frühere Fassungen',{exact:true}).click();
    await invoices.getByRole('link',{name:'Frühere Kurzfassung öffnen'}).waitFor();
    await invoices.getByText('Betrag weicht vom vollständigen Beleg ab',{exact:false}).waitFor();
  });
  await test('unmatched historical summary stays in history, never an invoice card', async page => {
    await page.route('**/api/patient/rechnungen', route => route.fulfill({json:{...available,rechnungen:[],rechnungsverlaufOhneZuordnung:[{id:'history',patient_id:id}]}}));
    await page.goto(`${origin}/patient/portal?section=rechnungen`);
    const invoices=page.locator('#portal-rechnungen');
    await invoices.getByText('Frühere Fassungen',{exact:true}).click();
    const link=invoices.getByRole('link',{name:'Frühere Kurzfassung öffnen'});
    await link.waitFor();
    assert.equal(await link.getAttribute('href'),'/api/rechnungsakte?historyId=history');
    assert.equal(await invoices.getByRole('button',{name:'Positionen und PDF'}).count(),0);
  });
  for (const failure of ['belegeStatus', 'hochgeladeneRechnungenStatus', 'zahlungsdatenStatus', 'http', 'network', 'json']) {
    await test(`visible invoice failure and retry: ${failure}`, async page => {
      let recovered = false;
      await page.route('**/api/patient/rechnungen', route => {
        if (recovered) return route.fulfill({ json: available });
        if (failure === 'http') return route.fulfill({ status: 503, json: {} });
        if (failure === 'network') return route.abort();
        if (failure === 'json') return route.fulfill({ body: 'invalid json' });
        return route.fulfill({ json: { ...available, rechnungen: [], [failure]: 'unavailable' } });
      });
      await page.goto(`${origin}/patient/portal?section=rechnungen`);
      const invoices = page.locator('#portal-rechnungen');
      await invoices.getByRole('status').waitFor();
      assert.doesNotMatch(await invoices.innerText(), /gibt es noch keine Rechnung/);
      recovered = true;
      await invoices.getByRole('button', { name: 'Erneut laden' }).click();
      await invoices.getByText('Betrag siehe PDF', { exact: true }).waitFor();
      assert.equal(await invoices.getByRole('status').count(), 0);
    });
  }
  for (const auth of ['throw', 'invalid', 'missing', 'success']) {
    await test(`login handles ${auth} without hanging or losing the invoice target`, async page => {
      await page.goto(`${origin}/patient/login?mode=login&auth=${auth}&next=%2Fpatient%2Fportal%3Fsection%3Drechnungen`);
      await page.locator('input[type="email"]').fill('fixture@example.org');
      await page.locator('input[type="password"]').fill('synthetic-test-only');
      await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
      if (auth === 'success') {
        await page.waitForFunction(() => window.__destination === '/patient/portal?section=rechnungen');
      } else {
        await page.getByText(auth === 'invalid' ? 'E-Mail oder Passwort ist falsch.' : 'Die Anmeldung konnte gerade nicht abgeschlossen werden. Bitte versuche es erneut.', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Anmelden', exact: true }).isEnabled(), true);
        assert.equal(await page.evaluate(() => window.__destination), undefined);
      }
    });
  }
  await test('patient error screen returns to home without the failed remembered tab', async page => {
    await page.addInitScript(() => {
      if (location.search.includes('mode=error')) sessionStorage.setItem('ac_tab', 'progress');
      // The intentionally thrown exception is handled by the fixture boundary.
      window.addEventListener('error', e => { if (e.message.includes('synthetic render failure')) e.preventDefault(); });
    });
    await page.goto(`${origin}/patient/portal?mode=error`);
    await page.getByRole('heading', { name: 'Diese Seite konnte nicht angezeigt werden' }).waitFor();
    await page.getByRole('link', { name: 'Zur Portal-Startseite' }).click();
    await page.waitForURL(`${origin}/patient/portal`);
    assert.notEqual(await page.evaluate(() => sessionStorage.getItem('ac_tab')), 'progress');
  });
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
