import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

for (const filename of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals < 1 || line.trimStart().startsWith("#")) continue;
    const envKey = line.slice(0, equals).trim();
    if (!(envKey in process.env)) process.env[envKey] = line.slice(equals + 1).trim();
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase-Konfiguration fehlt");
const db = createClient(url, key);

const IMPORT_CUTOFF = "2026-06-03";
const EXCLUDED_PURPOSE = /\b(rate[n]?|monatsrate|ratenplan|voraus|anzahlung|abschlag|labor|material|aligner|guthaben|erstattung|rueckzahlung|rückzahlung)\b/i;
const REFERENCE = /(?:^|\D)\d{4,8}\s*-\s*\d+\s*[/.]\s*20\d{2}(?:\s*-\s*\d+)?/;
const INVOICE = /(?:rechn(?:ung)?(?:s)?(?:nr|nummer)?|re\.?\s*nr\.?)\s*[:.#-]?\s*0*\d{5,8}/i;

type Row = Record<string, any>;

async function fetchAll(table: string, select: string, configure: (query: any) => any) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(db.from(table).select(select)).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

function normalized(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function alreadyApplied(tx: Row) {
  const details = tx.matching_details || {};
  return Boolean(details.open_item_sync_applied_at || details.booking_applied_at ||
    details.referenz_repair_applied_at || details.invoice_repair_applied_at);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const [transactions, items, patients] = await Promise.all([
    fetchAll("transaktionen", "*", (query) => query.gte("datum", IMPORT_CUTOFF).gt("betrag", 0).order("datum").order("id")),
    fetchAll("offene_posten", "*", (query) => query.in("status", ["offen", "teilbezahlt"]).order("rechnung_datum").order("id")),
    fetchAll("patients", "id,ivoris_nummer,vorname,nachname,guthaben", (query) => query.order("id")),
  ]);
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const itemsByPatient = items.reduce((map: Map<string, Row[]>, item: Row) => {
    if (item.patient_id) map.set(item.patient_id, [...(map.get(item.patient_id) || []), item]);
    return map;
  }, new Map<string, Row[]>());

  const rejected = { applied: 0, noPatient: 0, weakMatch: 0, specialPurpose: 0, explicitReference: 0, noEligibleInvoice: 0 };
  const candidates: Array<{ tx: Row; patient: Row; allocations: Array<{ item: Row; amount: number }>; credit: number }> = [];
  const simulatedOpen = new Map(items.map((item) => [item.id, Number(item.offen || 0)]));

  for (const tx of transactions) {
    if (alreadyApplied(tx)) { rejected.applied++; continue; }
    if (!tx.matched_patient_id) { rejected.noPatient++; continue; }
    const patient = patientById.get(tx.matched_patient_id);
    if (!patient || !["auto", "manuell"].includes(tx.matching_status) || Number(tx.matching_score || 0) < 80) {
      rejected.weakMatch++; continue;
    }
    const purpose = String(tx.verwendungszweck || "");
    if (EXCLUDED_PURPOSE.test(purpose) || tx.matched_rate_id) { rejected.specialPurpose++; continue; }
    if (REFERENCE.test(purpose) || INVOICE.test(purpose)) { rejected.explicitReference++; continue; }
    const text = normalized(`${tx.absender_name || ""} ${purpose}`);
    const first = normalized(patient.vorname).split(" ")[0];
    const last = normalized(patient.nachname);
    const base = String(patient.ivoris_nummer || "");
    const explicitPatient = Boolean((first.length >= 3 && last.length >= 3 && text.includes(first) && text.includes(last)) ||
      (base.length === 8 && new RegExp(`(?:^|\\D)${base}(?:\\D|$)`).test(purpose)));
    if (!explicitPatient) { rejected.weakMatch++; continue; }

    const eligible = (itemsByPatient.get(patient.id) || []).filter((item) =>
      item.rechnung_datum <= tx.datum && (simulatedOpen.get(item.id) || 0) > 0
    );
    if (!eligible.length) { rejected.noEligibleInvoice++; continue; }
    let remaining = Number(tx.betrag);
    const allocations: Array<{ item: Row; amount: number }> = [];
    for (const item of eligible) {
      if (remaining <= 0) break;
      const open = simulatedOpen.get(item.id) || 0;
      const amount = Number(Math.min(open, remaining).toFixed(2));
      if (amount <= 0) continue;
      allocations.push({ item, amount });
      simulatedOpen.set(item.id, Number((open - amount).toFixed(2)));
      remaining = Number((remaining - amount).toFixed(2));
    }
    candidates.push({ tx, patient, allocations, credit: Math.max(0, remaining) });
  }

  const report = candidates.map(({ tx, patient, allocations, credit }) => ({
    txId: tx.id, datum: tx.datum, betrag: tx.betrag,
    patient: `${patient.nachname}, ${patient.vorname}`,
    zweck: tx.verwendungszweck,
    allocations: allocations.map(({ item, amount }) => ({ reference: item.unser_zeichen, date: item.rechnung_datum, amount })),
    credit,
  }));
  if (!apply) return console.log(JSON.stringify({ apply, cutoff: IMPORT_CUTOFF, scanned: transactions.length, rejected, candidates: report.length, report }, null, 2));

  const backupFile = `/tmp/anima-patient-fifo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backupFile, JSON.stringify({ candidates }, null, 2), { mode: 0o600 });
  const stamp = new Date().toISOString();
  for (const candidate of candidates) {
    for (const { item, amount } of candidate.allocations) {
      const currentOpen = Number(item.offen || 0);
      const nextOpen = Number((currentOpen - amount).toFixed(2));
      const { data, error } = await db.from("offene_posten").update({
        offen: nextOpen,
        gezahlt: Number((Number(item.gezahlt || 0) + amount).toFixed(2)),
        status: nextOpen === 0 ? "bezahlt" : "teilbezahlt",
        bezahlt_am: nextOpen === 0 ? candidate.tx.datum : null,
        nicht_mahnen: nextOpen !== 0,
      }).eq("id", item.id).eq("offen", currentOpen).select("id");
      if (error || data?.length !== 1) throw error || new Error(`Posten ${item.id} wurde parallel verändert`);
      item.offen = nextOpen;
      item.gezahlt = Number((Number(item.gezahlt || 0) + amount).toFixed(2));
    }
    if (candidate.credit > 0) {
      const currentCredit = Number(candidate.patient.guthaben || 0);
      let creditUpdate = db.from("patients").update({ guthaben: Number((currentCredit + candidate.credit).toFixed(2)) })
        .eq("id", candidate.patient.id);
      creditUpdate = candidate.patient.guthaben == null ? creditUpdate.is("guthaben", null) : creditUpdate.eq("guthaben", currentCredit);
      const { data, error } = await creditUpdate.select("id");
      if (error) throw error;
      if (data?.length !== 1) throw new Error(`Guthaben von Patient ${candidate.patient.id} wurde parallel verändert`);
      candidate.patient.guthaben = currentCredit + candidate.credit;
    }
    const { error } = await db.from("transaktionen").update({
      matching_details: {
        ...(candidate.tx.matching_details || {}), methode: "patient_fifo_nach_import",
        open_item_sync_applied_at: stamp,
        open_item_sync_applied_amount: candidate.allocations.reduce((sum, row) => sum + row.amount, 0),
        open_item_sync_remaining_amount: candidate.credit,
        open_item_sync_items: candidate.allocations.length,
      },
      geprueft_am: stamp,
    }).eq("id", candidate.tx.id);
    if (error) throw error;
  }
  console.log(JSON.stringify({ applied: true, backupFile, candidates: report.length, report }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
