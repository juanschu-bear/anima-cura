import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { buildLedgerPatientCandidates } from "../src/lib/payment-ledger-matching";
import { reconcileLedgerTransaction, type ReconciliationState } from "../src/lib/payment-ledger-reconciliation";

function normalizedWords(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

for (const filename of [process.env.ANIMA_ENV_FILE, ".env.local", ".env"].filter(Boolean) as string[]) {
  const full = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals < 1 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, equals).trim();
    if (!(key in process.env)) process.env[key] = line.slice(equals + 1).trim();
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase configuration missing");
const db = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(table: string, select: string, configure?: (query: any) => any) {
  const rows: any[] = [];
  for (let start = 0; ; start += 1000) {
    let query = db.from(table).select(select).order("id").range(start, start + 999);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

async function main() {
  if (process.argv.includes("--apply")) {
    throw new Error("This audit is read-only. Historical imports require a separately verified transactional migration.");
  }
  const manifestPath = process.argv.includes("--manifest") ? path.resolve("tmp/verified-bank-payment-backfill.json") : null;
  let catalog: string | null = null;
  if (manifestPath) {
    const { data, error } = await db.rpc("payment_backfill_catalog_fingerprint");
    if (error) throw error;
    catalog = data;
  }
  const [patients, invoices, transactions, allocationRows] = await Promise.all([
    fetchAll("patients", "id,ivoris_nummer,vorname,nachname"),
    fetchAll("offene_posten", "id,patient_id,unser_zeichen,rechnung_nr"),
    fetchAll(
      "transaktionen",
      "id,betrag,absender_name,verwendungszweck,matching_status,matched_patient_id",
      (query) => query.gt("betrag", 0).or("matching_status.is.null,matching_status.neq.ignoriert")
    ),
    fetchAll("payment_patient_allocations", "id,transaction_id,patient_id,amount_cents,state,confidence_score,reversal_of_allocation_id"),
  ]);
  const historyByTransaction = new Map<string, any[]>();
  for (const row of allocationRows) {
    if (!row.transaction_id) continue;
    const history = historyByTransaction.get(row.transaction_id) || [];
    history.push({ id: row.id, transactionId: row.transaction_id, patientId: row.patient_id,
      amountCents: Number(row.amount_cents), state: row.state, confidenceScore: row.confidence_score,
      reversalOfAllocationId: row.reversal_of_allocation_id });
    historyByTransaction.set(row.transaction_id, history);
  }
  const reconciliation: Record<ReconciliationState, { count: number; amountCents: number }> = Object.fromEntries(
    ["covered", "partial", "overallocated", "conflict", "prior_decision", "ready", "needs_evidence"]
      .map(state => [state, { count: 0, amountCents: 0 }]),
  ) as Record<ReconciliationState, { count: number; amountCents: number }>;

  const ledgerPatients = patients.map((patient) => ({
    id: patient.id,
    ivorisNummer: patient.ivoris_nummer,
    vorname: patient.vorname,
    nachname: patient.nachname,
  }));
  const ledgerInvoices = invoices.map((invoice) => ({
    id: invoice.id,
    patientId: invoice.patient_id,
    reference: invoice.unser_zeichen,
    invoiceNumber: invoice.rechnung_nr,
  }));
  const patientsByNumber = new Map<string, typeof ledgerPatients>();
  const patientsByNameWord = new Map<string, typeof ledgerPatients>();
  for (const patient of ledgerPatients) {
    const number = String(patient.ivorisNummer || "").replace(/\D/g, "").padStart(8, "0");
    if (number !== "00000000") patientsByNumber.set(number, [...(patientsByNumber.get(number) || []), patient]);
    for (const word of normalizedWords(`${patient.vorname} ${patient.nachname}`)) {
      if (word.length < 3) continue;
      patientsByNameWord.set(word, [...(patientsByNameWord.get(word) || []), patient]);
    }
  }
  const invoicesByNumber = new Map<string, typeof ledgerInvoices>();
  const invoicesByBase = new Map<string, typeof ledgerInvoices>();
  for (const invoice of ledgerInvoices) {
    const invoiceNumber = String(invoice.invoiceNumber || "").replace(/\D/g, "");
    if (invoiceNumber) invoicesByNumber.set(invoiceNumber, [...(invoicesByNumber.get(invoiceNumber) || []), invoice]);
    const base = String(invoice.reference || "").match(/\d{8}/)?.[0];
    if (base) invoicesByBase.set(base, [...(invoicesByBase.get(base) || []), invoice]);
  }

  let autoConfirmed = 0;
  let ambiguous = 0;
  let withoutCandidate = 0;
  let legacyConflict = 0;
  let confirmedAmountCents = 0;
  const confirmedByEvidence: Record<string, number> = {};
  const rows: any[] = [];
  for (const transaction of transactions) {
    const rawText = `${transaction.absender_name || ""} ${transaction.verwendungszweck || ""}`;
    const words = normalizedWords(rawText);
    const digitTokens = Array.from(new Set(String(transaction.verwendungszweck || "").match(/\d{5,8}/g) || []));
    const relevantPatients = new Map<string, (typeof ledgerPatients)[number]>();
    const relevantInvoices = new Map<string, (typeof ledgerInvoices)[number]>();
    for (const word of words) {
      for (const patient of patientsByNameWord.get(word) || []) relevantPatients.set(patient.id, patient);
    }
    for (const token of digitTokens) {
      const padded = token.padStart(8, "0");
      for (const patient of patientsByNumber.get(padded) || []) relevantPatients.set(patient.id, patient);
      for (const invoice of invoicesByNumber.get(token) || []) relevantInvoices.set(invoice.id, invoice);
      for (const invoice of invoicesByNumber.get(padded) || []) relevantInvoices.set(invoice.id, invoice);
      for (const invoice of invoicesByBase.get(padded) || []) relevantInvoices.set(invoice.id, invoice);
    }
    const ledgerTransaction = {
      id: transaction.id,
      amountCents: Math.round(Number(transaction.betrag) * 100),
      senderName: transaction.absender_name,
      purpose: transaction.verwendungszweck,
      existingPatientId: transaction.matched_patient_id,
      existingMatchingStatus: transaction.matching_status,
    };
    const candidates = buildLedgerPatientCandidates(ledgerTransaction, Array.from(relevantPatients.values()), Array.from(relevantInvoices.values()));
    const result = reconcileLedgerTransaction(ledgerTransaction, candidates, historyByTransaction.get(transaction.id) || []);
    reconciliation[result.state].count += 1;
    reconciliation[result.state].amountCents += ledgerTransaction.amountCents;
    const conflictsWithLegacy = Boolean(
      transaction.matched_patient_id &&
      candidates.length === 1 &&
      candidates[0].patientId !== transaction.matched_patient_id
    );
    if (conflictsWithLegacy) {
      legacyConflict += 1;
      candidates[0].state = "candidate";
      candidates[0].reason = "Neuer Beleg widerspricht bestehender Patientenzuordnung; manuelle Prüfung erforderlich";
    }
    if (candidates.length === 0) withoutCandidate += 1;
    else if (candidates.length > 1) ambiguous += 1;
    else if (candidates[0].state === "confirmed_auto") {
      autoConfirmed += 1;
      confirmedAmountCents += candidates[0].amountCents;
      const kinds = candidates[0].evidence.map((evidence) => evidence.kind).sort().join("+");
      confirmedByEvidence[kinds] = (confirmedByEvidence[kinds] || 0) + 1;
    }
    for (const candidate of candidates) {
      // Historical import is deliberately stricter than candidate discovery.
      // Never repeat an existing booking, override a prior decision or import name-only matches.
      if (result.state !== "ready") continue;
      if (!candidate.evidence.some(e => e.kind === "patient_number")) continue;
      rows.push({
        source_key: `backfill-v1:${transaction.id}:${candidate.patientId}`,
        transaction_id: transaction.id,
        patient_id: candidate.patientId,
        amount_cents: candidate.amountCents,
        state: candidate.state,
        confidence_score: candidate.confidenceScore,
        evidence: candidate.evidence,
        decision_reason: candidate.reason,
        confirmed_at: candidate.state === "confirmed_auto" ? new Date().toISOString() : null,
        expected_transaction: transaction,
      });
    }
  }

  if (manifestPath) {
    const { data: after, error } = await db.rpc("payment_backfill_catalog_fingerprint");
    if (error) throw error;
    if (!catalog || after !== catalog) throw new Error("Identity catalogue changed during audit; no manifest created");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ version: "verified-bank-v1", catalog, createdAt: new Date().toISOString(), rows }), { mode: 0o600 });
    fs.chmodSync(manifestPath, 0o600);
  }

  console.log(JSON.stringify({
    mode: "dry-run",
    transactions: transactions.length,
    autoConfirmed,
    ambiguous,
    withoutCandidate,
    legacyConflict,
    confirmedAmountCents,
    confirmedByEvidence,
    allocationRows: rows.length,
    reconciliation,
    sourceAllocationRows: allocationRows.length,
    manifestCreated: Boolean(manifestPath),
    allocationsWithoutBankTransaction: allocationRows.filter(row => !row.transaction_id).length,
    allocationsOutsideAuditScope: allocationRows.filter(row => row.transaction_id && !transactions.some(tx => tx.id === row.transaction_id)).length,
    warning: "Ready means migration candidate, not a reconciled invoice balance. No account view is switched by this audit.",
  }, null, 2));

}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
