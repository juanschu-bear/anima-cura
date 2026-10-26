/** Three real, read-only acceptance candidates. Does not constitute Sabine's approval. */
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { readTreatmentAccount } from '../src/lib/treatment-account-api';
loadEnvConfig(process.cwd());
async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const cases = [
    { kind: 'simple', id: '7ede1e8b-d9be-4985-b2ca-a4fd490a2581' },
    { kind: 'arch_entries', id: 'b35e24ec-3e8a-440b-9d16-a1c008bd1b51' },
    { kind: 'long_history', id: '02516707-9d47-4e26-86a7-4c8879a4fc90' },
  ];
  for (const candidate of cases) {
    const account = await readTreatmentAccount(db, candidate.id, '2026-10-26');
    if (!account || account.identity.status !== 'matched') throw Error('Acceptance identity failed');
    const q3 = account.allocations.filter(row => row.data.quarter === '2026-Q3');
    if (!q3.length || q3.some(row => row.itemLevelProof)) throw Error('Summary evidence contract failed');
    console.log(JSON.stringify({ kind: candidate.kind, patientNumber: account.patient.ivoris_nummer,
      scribeEntries: account.sourceEntries.length, eventSuggestions: account.events.length,
      historicReferences: account.historicalReferences.length, quarterEvidence: account.allocations.length,
      q3: q3.map(row => ({ text: row.data.raw, source: row.source })),
      confirmedPlan: !!account.plan?.confirmed_at, treatmentQuarter: account.quarter,
      historyKnown: account.history.known, acceptedByPractice: false }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
