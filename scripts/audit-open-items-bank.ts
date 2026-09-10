import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

for (const filename of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals);
    if (!(key in process.env)) process.env[key] = trimmed.slice(equals + 1);
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase-Konfiguration fehlt");
const db = createClient(url, key);

type Row = Record<string, any>;

async function fetchAll(table: string, select: string, filters?: (query: any) => any) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let query = db.from(table).select(select).range(from, from + 999);
    if (filters) query = filters(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

function cents(value: unknown) {
  return Math.round(Number(value || 0) * 100);
}

function tokens(text: string | null, expression: RegExp) {
  return Array.from((text || "").matchAll(expression), (match) => match[1]);
}

function alreadyApplied(tx: Row) {
  const details = tx.matching_details || {};
  return Boolean(
    details.referenz_repair_applied_at ||
    details.open_item_sync_applied_at ||
    details.booking_applied_at
  );
}

function fullReference(text: string | null) {
  const match = String(text || "").match(/(\d{8})\s*-\s*(\d+)\s*[/.]\s*(\d)\s*(\d)\s*(\d)\s*(\d)(?:\s*-\s*(\d+))?/);
  return match ? `${match[1]}-${match[2]}/${match[3]}${match[4]}${match[5]}${match[6]}${match[7] ? `-${match[7]}` : ""}` : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const applyCash = process.argv.includes("--apply-cash");
  const [items, transactions, cash] = await Promise.all([
    fetchAll(
      "offene_posten",
      "id, patient_id, basis_nr, rechnung_nr, unser_zeichen, rechnung_datum, betrag, gezahlt, offen, status",
      (query) => query.in("status", ["offen", "teilbezahlt"]).order("rechnung_datum")
    ),
    fetchAll(
      "transaktionen",
      "id, datum, betrag, absender_name, absender_iban, verwendungszweck, matching_status, matching_score, matched_patient_id, matched_rate_id, matching_details",
      (query) => query.gt("betrag", 0).order("datum")
    ),
    fetchAll("kassen_zahlungen", "*")
  ]);

  const byInvoice = new Map<string, Row[]>();
  const byPatient = new Map<string, Row[]>();
  const byFullReference = new Map<string, Row[]>();
  for (const item of items) {
    if (item.rechnung_nr) byInvoice.set(item.rechnung_nr, [...(byInvoice.get(item.rechnung_nr) || []), item]);
    if (item.patient_id) byPatient.set(item.patient_id, [...(byPatient.get(item.patient_id) || []), item]);
    if (item.unser_zeichen) byFullReference.set(item.unser_zeichen, [...(byFullReference.get(item.unser_zeichen) || []), item]);
  }

  const unused = transactions.filter((tx) => !alreadyApplied(tx));
  const invoiceCandidates: Array<{ tx: Row; item: Row }> = [];
  const patientAmountCandidates: Array<{ tx: Row; item: Row }> = [];

  for (const tx of unused) {
    const invoiceMatches = new Map<string, Row>();
    for (const token of tokens(tx.verwendungszweck, /(?:^|\D)(00\d{6})(?=\D|$)/g)) {
      for (const item of byInvoice.get(token) || []) {
        if (tx.datum >= item.rechnung_datum) invoiceMatches.set(item.id, item);
      }
    }
    if (invoiceMatches.size === 1) invoiceCandidates.push({ tx, item: Array.from(invoiceMatches.values())[0] });

    if (tx.matched_patient_id) {
      const matches = (byPatient.get(tx.matched_patient_id) || []).filter(
        (item) => tx.datum >= item.rechnung_datum && cents(tx.betrag) === cents(item.offen)
      );
      if (matches.length === 1) patientAmountCandidates.push({ tx, item: matches[0] });
    }
  }

  const combined = new Map<string, { tx: Row; item: Row; evidence: string[] }>();
  for (const [evidence, candidates] of [
    ["rechnungsnummer", invoiceCandidates],
    ["patient+exakter_betrag", patientAmountCandidates],
  ] as const) {
    for (const candidate of candidates) {
      const key = `${candidate.tx.id}:${candidate.item.id}`;
      const current = combined.get(key) || { ...candidate, evidence: [] };
      current.evidence.push(evidence);
      combined.set(key, current);
    }
  }

  const safe = Array.from(combined.values()).filter(({ tx, item, evidence }) =>
    evidence.includes("rechnungsnummer") &&
    cents(tx.betrag) <= cents(item.offen) &&
    (!tx.matched_patient_id || !item.patient_id || tx.matched_patient_id === item.patient_id)
  );

  const txMultiplicity = new Map<string, number>();
  const itemMultiplicity = new Map<string, number>();
  for (const row of safe) {
    txMultiplicity.set(row.tx.id, (txMultiplicity.get(row.tx.id) || 0) + 1);
    itemMultiplicity.set(row.item.id, (itemMultiplicity.get(row.item.id) || 0) + 1);
  }
  const oneToOne = safe.filter(({ tx, item }) => txMultiplicity.get(tx.id) === 1 && itemMultiplicity.get(item.id) === 1);
  const patientAmountStrong = patientAmountCandidates.filter(({ tx }) =>
    ["auto", "manuell"].includes(tx.matching_status) &&
    Number(tx.matching_score || 0) >= 95 &&
    !tx.matched_rate_id
  );
  const patientAmountDoubleEvidence = patientAmountStrong.filter(({ tx, item }) => {
    const purpose = String(tx.verwendungszweck || "").replace(/\s*([-/])\s*/g, "$1");
    const method = String(tx.matching_details?.methode || "");
    if (method === "basisnummer") {
      return Boolean(item.basis_nr && tokens(purpose, /(?:^|\D)(\d{8})(?=\D|$)/g).includes(item.basis_nr));
    }
    if (method === "referenz") return Boolean(item.unser_zeichen && purpose.includes(item.unser_zeichen));
    if (method === "rechnungsnr") return Boolean(item.rechnung_nr && purpose.includes(item.rechnung_nr));
    return false;
  });
  const openItemById = new Map(items.map((item) => [item.id, item]));
  const directCashMatches = cash.filter((payment) => payment.posten_id && openItemById.has(payment.posten_id));
  const uniqueCashPatientAmount = cash.flatMap((payment) => {
    if (!payment.patient_id) return [];
    const matches = (byPatient.get(payment.patient_id) || []).filter((item) =>
      (!payment.kassen_datum || payment.kassen_datum >= item.rechnung_datum) && cents(payment.betrag) === cents(item.offen)
    );
    return matches.length === 1 ? [{ payment, item: matches[0] }] : [];
  });
  const strictReferenceGroups = new Map<string, { item: Row; transactions: Row[] }>();
  for (const tx of unused) {
    const reference = fullReference(tx.verwendungszweck);
    const matches = reference ? byFullReference.get(reference) || [] : [];
    if (matches.length !== 1) continue;
    const group = strictReferenceGroups.get(matches[0].id) || { item: matches[0], transactions: [] };
    group.transactions.push(tx);
    strictReferenceGroups.set(matches[0].id, group);
  }
  const strictReferenceSummary = Array.from(strictReferenceGroups.values());

  let applied = 0;
  if (apply) {
    const backupPath = `/tmp/anima-open-items-bank-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    fs.writeFileSync(backupPath, JSON.stringify({ oneToOne }, null, 2), { mode: 0o600 });

    for (const { tx, item } of oneToOne) {
      const oldOpen = Number(item.offen || 0);
      const payment = Number(tx.betrag || 0);
      const nextOpen = Number(Math.max(0, oldOpen - payment).toFixed(2));
      const nextPaid = Number((Number(item.gezahlt || 0) + payment).toFixed(2));
      const stamp = new Date().toISOString();

      const { data: updatedItems, error: itemError } = await db
        .from("offene_posten")
        .update({
          offen: nextOpen,
          gezahlt: nextPaid,
          status: nextOpen === 0 ? "bezahlt" : "teilbezahlt",
          bezahlt_am: nextOpen === 0 ? tx.datum : null,
        })
        .eq("id", item.id)
        .eq("offen", oldOpen)
        .in("status", ["offen", "teilbezahlt"])
        .select("id");
      if (itemError || updatedItems?.length !== 1) {
        throw new Error(`Posten ${item.id} konnte nicht exklusiv aktualisiert werden: ${itemError?.message || "kein Treffer"}`);
      }

      const nextDetails = {
        ...(tx.matching_details || {}),
        methode: "rechnungsnummer",
        referenz: item.rechnung_nr,
        invoice_repair_applied_at: stamp,
        invoice_repair_mode: "exact_unique_invoice_number",
        open_item_sync_applied_at: stamp,
        open_item_sync_applied_amount: payment,
        open_item_sync_remaining_amount: 0,
        open_item_sync_items: 1,
      };
      const { data: updatedTransactions, error: txError } = await db
        .from("transaktionen")
        .update({
          matched_patient_id: item.patient_id || tx.matched_patient_id,
          matching_status: "auto",
          matching_score: 100,
          matching_details: nextDetails,
          geprueft_am: stamp,
        })
        .eq("id", tx.id)
        .select("id");
      if (txError || updatedTransactions?.length !== 1) {
        throw new Error(`Transaktion ${tx.id} konnte nicht markiert werden: ${txError?.message || "kein Treffer"}`);
      }
      applied += 1;
    }
    console.error(`Backup: ${backupPath}`);
  }

  let appliedCash = 0;
  if (applyCash) {
    for (const { payment, item } of uniqueCashPatientAmount) {
      const cashBase = String(payment.zeichen || "").match(/\d{8}/)?.[0] || null;
      if (!cashBase || cashBase !== item.basis_nr || payment.abgleich_status !== "offen" || payment.posten_id) continue;
      const { data: updatedItems, error: itemError } = await db
        .from("offene_posten")
        .update({
          offen: 0,
          gezahlt: Number((Number(item.gezahlt || 0) + Number(payment.betrag)).toFixed(2)),
          status: "bezahlt",
          bezahlt_am: payment.kassen_datum,
        })
        .eq("id", item.id)
        .eq("offen", item.offen)
        .in("status", ["offen", "teilbezahlt"])
        .select("id");
      if (itemError || updatedItems?.length !== 1) {
        throw new Error(`Kassen-Posten ${item.id} konnte nicht exklusiv aktualisiert werden`);
      }
      const { data: updatedCash, error: cashError } = await db
        .from("kassen_zahlungen")
        .update({ posten_id: item.id, abgleich_status: "abgeglichen", eingang_am: new Date().toISOString(), eingang_typ: "bar" })
        .eq("id", payment.id)
        .eq("abgleich_status", "offen")
        .is("posten_id", null)
        .select("id");
      if (cashError || updatedCash?.length !== 1) {
        throw new Error(`Kassenzahlung ${payment.id} konnte nicht markiert werden`);
      }
      appliedCash += 1;
    }
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    openItems: items.length,
    bankTransactions: transactions.length,
    bankRange: [transactions[0]?.datum, transactions.at(-1)?.datum],
    unappliedIncomingTransactions: unused.length,
    cashPayments: cash.length,
    directCashMatchesToOpenItems: directCashMatches.length,
    uniqueCashPatientAndAmountMatches: uniqueCashPatientAmount.length,
    uniqueInvoiceNumberCandidates: invoiceCandidates.length,
    strictReferenceItems: strictReferenceSummary.length,
    strictReferenceTransactions: strictReferenceSummary.reduce((sum, group) => sum + group.transactions.length, 0),
    strictReferenceOverpaymentGroups: strictReferenceSummary.filter((group) =>
      cents(group.transactions.reduce((sum, tx) => sum + Number(tx.betrag), 0)) > cents(group.item.offen)
    ).length,
    uniquePatientAndExactAmountCandidates: patientAmountCandidates.length,
    patientAndExactAmountScore95WithoutRate: patientAmountStrong.length,
    patientAmountWithExplicitReferenceAndExactAmount: patientAmountDoubleEvidence.length,
    patientAmountMethods: Object.fromEntries(Object.entries(patientAmountStrong.reduce((counts, { tx }) => {
      const method = String(tx.matching_details?.methode || "unbekannt");
      counts[method] = (counts[method] || 0) + 1;
      return counts;
    }, {} as Record<string, number>)).sort()),
    safeInvoiceNumberCandidates: safe.length,
    safeOneToOneCandidates: oneToOne.length,
    safeOneToOneTotal: oneToOne.reduce((sum, row) => sum + Number(row.tx.betrag), 0),
    applied,
    appliedCash,
    safeCandidateSample: safe.slice(0, 20).map(({ tx, item, evidence }) => ({
      txId: tx.id,
      datum: tx.datum,
      zahlung: tx.betrag,
      zweck: tx.verwendungszweck,
      postenId: item.id,
      rechnung: item.rechnung_nr,
      offen: item.offen,
      evidence,
      transactionCandidateCount: txMultiplicity.get(tx.id),
      itemCandidateCount: itemMultiplicity.get(item.id),
    })),
    cashColumns: Object.keys(cash[0] || {}).sort(),
    cashPatientAmountSample: uniqueCashPatientAmount.slice(0, 10).map(({ payment, item }) => ({
      cashId: payment.id,
      datum: payment.kassen_datum,
      betrag: payment.betrag,
      zeichen: payment.zeichen,
      zweck: payment.zweck,
      abgleichStatus: payment.abgleich_status,
      transaktionId: payment.transaktion_id,
      postenId: item.id,
      unserZeichen: item.unser_zeichen,
      rechnung: item.rechnung_nr,
      rechnungsdatum: item.rechnung_datum,
      offen: item.offen,
    })),
    patientAmountDoubleEvidenceSample: patientAmountDoubleEvidence.slice(0, 20).map(({ tx, item }) => ({
      txId: tx.id,
      datum: tx.datum,
      zahlung: tx.betrag,
      zweck: tx.verwendungszweck,
      methode: tx.matching_details?.methode,
      postenId: item.id,
      unserZeichen: item.unser_zeichen,
      rechnung: item.rechnung_nr,
      rechnungsdatum: item.rechnung_datum,
      offen: item.offen,
    })),
    sample: oneToOne.slice(0, 20).map(({ tx, item, evidence }) => ({
      txId: tx.id,
      datum: tx.datum,
      zahlung: tx.betrag,
      zweck: tx.verwendungszweck,
      matchingStatus: tx.matching_status,
      matchingScore: tx.matching_score,
      postenId: item.id,
      rechnung: item.rechnung_nr,
      rechnungsdatum: item.rechnung_datum,
      offen: item.offen,
      evidence,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
