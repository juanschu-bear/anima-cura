import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { buildLedgerPatientCandidates } from "../src/lib/payment-ledger-matching";

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
    let query = db.from(table).select(select).range(start, start + 999);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const [patients, invoices, transactions] = await Promise.all([
    fetchAll("patients", "id,ivoris_nummer,vorname,nachname"),
    fetchAll("offene_posten", "id,patient_id,unser_zeichen,rechnung_nr"),
    fetchAll(
      "transaktionen",
      "id,betrag,absender_name,verwendungszweck,matching_status,matched_patient_id",
      (query) => query.gt("betrag", 0).neq("matching_status", "ignoriert")
    ),
  ]);

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
    const candidates = buildLedgerPatientCandidates({
      id: transaction.id,
      amountCents: Math.round(Number(transaction.betrag) * 100),
      senderName: transaction.absender_name,
      purpose: transaction.verwendungszweck,
      existingPatientId: transaction.matched_patient_id,
    }, Array.from(relevantPatients.values()), Array.from(relevantInvoices.values()));
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
      });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    transactions: transactions.length,
    autoConfirmed,
    ambiguous,
    withoutCandidate,
    legacyConflict,
    confirmedAmountCents,
    confirmedByEvidence,
    allocationRows: rows.length,
  }, null, 2));

  if (!apply) return;
  for (let start = 0; start < rows.length; start += 250) {
    const { error } = await db.from("payment_patient_allocations")
      .upsert(rows.slice(start, start + 250), { onConflict: "source_key", ignoreDuplicates: true });
    if (error) throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
