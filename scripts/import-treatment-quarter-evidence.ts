/** Additive historical SUMMARY evidence only. No invoices, charges, payments or messages.
 * Dry-run by default. Exact patient number + full fields; variants/conflicts stay unassigned.
 */
import { loadEnvConfig } from '@next/env';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { treatmentReadAll } from '../src/lib/treatment-account-api';
import { resolveTreatmentListIdentity } from '../src/lib/treatment-account';
loadEnvConfig(process.cwd());
async function main() {
  const path = process.argv[2];
  if (!path) throw Error('Provide extracted evidence JSON');
  const input = JSON.parse(await readFile(path, 'utf8'));
  const sourceDirectory = process.argv.find(arg => arg.startsWith('--sources='))?.slice(10);
  if (!sourceDirectory) throw Error('Provide --sources=directory to verify original PDF checksums');
  const verified = new Map<string, string>();
  for (const record of input.records) for (const file of [record.source, ...(record.identityEvidence ? [{ recordId: record.identityEvidence.file, checksum: record.identityEvidence.checksum }] : [])]) {
    if (basename(file.recordId) !== file.recordId) throw Error('Invalid source filename');
    if (!verified.has(file.recordId)) verified.set(file.recordId, createHash('sha256').update(await readFile(join(sourceDirectory, file.recordId))).digest('hex'));
    if (verified.get(file.recordId) !== file.checksum) throw Error('Source checksum changed');
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const patients = await treatmentReadAll<any>(() => db.from('patients').select('id,vorname,nachname,ivoris_nummer', { count: 'exact' }).order('id'));
  const existing = await treatmentReadAll<any>(() => db.from('billing_allocations').select('id', { count: 'exact' }).order('id'));
  const existingIds = new Set(existing.map(row => row.id));
  const pending: any[] = [], open = [...input.issues];
  const ids = new Set<string>();
  for (const record of input.records) {
    const [last, ...firstParts] = record.name.split(',');
    const first = firstParts.join(',').trim();
    const identity = resolveTreatmentListIdentity({ first, last, patientNumber: record.patientNumber }, patients, true);
    if (identity.status !== 'matched') {
      open.push({ patientNumber: record.patientNumber, source: record.source, reason: 'identity_review' }); continue;
    }
    const hex = createHash('sha256').update(JSON.stringify([identity.patientId, record.source])).digest('hex');
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    if (ids.has(id)) throw Error('Duplicate source row');
    ids.add(id);
    if (existingIds.has(id)) continue;
    pending.push({ id, patient_id: identity.patientId, evidence_kind: 'quarter_summary', state: 'historical_summary',
      data: { ...record, individualPositionsKnown: false, amountColumnsAssigned: record.schedule === 'GOZ' },
      source: record.source, created_by: '00000000-0000-4000-8000-000000000059' });
  }
  let inserted = 0;
  if (process.argv.includes('--apply')) for (let offset = 0; offset < pending.length; offset += 100) {
    const rows = pending.slice(offset, offset + 100);
    const { error } = await db.from('billing_allocations').insert(rows);
    if (error) throw Error(error.message);
    inserted += rows.length;
  }
  const summary = { mode: process.argv.includes('--apply') ? 'apply' : 'dry_run', pending: pending.length, alreadyPresent: ids.size - pending.length, inserted, openCount: open.length };
  const report = process.argv.find(arg => arg.startsWith('--report='))?.slice(9);
  if (report) await writeFile(report, JSON.stringify({ ...summary, open }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
