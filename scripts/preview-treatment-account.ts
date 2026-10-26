// Local isolated visual fixture. Synthetic data only; never connects to production.
import { build } from 'esbuild';
import { createServer } from 'node:http';
const id = '00000000-0000-4000-8000-000000000001';
const source = { system: 'scribe', recordId: 'synthetic-entry', version: '1', locator: 'sentence:0' };
const fixture = { patient: { id, vorname: 'Musterpatientin', nachname: 'Beispiel · synthetisch', ivoris_nummer: 'SYN-001', behandlung_start: null },
  plans: [], plan: null, quarter: null, calendarQuarter: '2026-Q4', history: { known: false, from: null, through: null },
  events: Array.from({ length: 17 }, (_, index) => ({ id: String(index), date: '2026-10-15', text: index ? 'Bogen Oberkiefer gewechselt. Synthetischer Belegtext.' : 'T-Loop beim nächsten Termin geplant. Synthetischer Prüffall.',
    component: 'arch', state: index ? 'performed' : 'planned', confirmed: false, copied: false, jaw: 'OK', teeth: [], material: null, quantity: null, evidence: source })),
  baseline: [], historicalReferences: [{ id: 'synthetic-invoice', rechnung_nr: 'SYN-2026-01', rechnung_datum: '2026-09-30', betrag: '45.28', source_file: 'Synthetische Beispielquelle' }],
  allocations: [], sourceEntries: [], documents: [], issues: ['missing_plan', 'history_unknown', 'legacy_scribe_proposals', 'summary_not_positions'], asOf: '2026-10-26' };
async function main() {
  const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Account from './src/components/billing/TreatmentAccount'; const q=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<Account patientId="${id}" locale={q.get('lang')==='en'?'en':'de'} theme={q.get('theme')==='dark'?'dark':'light'}/>);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, outdir: 'fixture', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'isolated-navigation', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ resolveDir: process.cwd(), loader: 'jsx', contents: `import React from 'react';export default function Link(props){return <a {...props}/>}` }));
    } }] });
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  const css = bundle.outputFiles.find(file => file.path.endsWith('.css'))!.text;
  createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url?.startsWith('/api/')) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(fixture)); return; }
    if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(js); return; }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:16px;font-family:Manrope,system-ui,sans-serif;background:#e9eef3}#root{max-width:1120px;margin:auto}h1{font-size:28px}a{color:inherit;text-underline-offset:3px}blockquote{margin:16px 0;white-space:pre-wrap}pre{white-space:pre-wrap;overflow-wrap:anywhere}${css}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
  }).listen(4176, '127.0.0.1', () => console.log('Synthetic treatment account: http://127.0.0.1:4176'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
