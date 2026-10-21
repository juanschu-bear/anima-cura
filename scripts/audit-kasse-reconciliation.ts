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

async function fetchAll(table: string, select: string, configure?: (query: any) => any) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let query = db.from(table).select(select).range(from, from + 999);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

function cents(value: unknown) {
  return Math.round(Number(value || 0) * 100);
}

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIban(value: unknown) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function dayDistance(left: string, right: string) {
  return Math.round((new Date(right).getTime() - new Date(left).getTime()) / 86_400_000);
}

async function main() {
  const [pending, patients, transactions, linked] = await Promise.all([
    fetchAll(
      "kassen_zahlungen",
      "id, patient_id, kassen_datum, betrag, zeichen, zweck, notiz, status, abgleich_status, transaktion_id",
      (query) => query
        .eq("buchungstyp", "einnahme")
        .in("zahlart", ["qr_ueberweisung", "ueberweisung"])
        .is("transaktion_id", null)
        .neq("status", "storniert")
        .order("kassen_datum")
    ),
    fetchAll("patients", "id, ivoris_nummer, vorname, nachname"),
    fetchAll(
      "transaktionen",
      "id, datum, betrag, absender_name, absender_iban, verwendungszweck, matching_status, matching_score, matched_patient_id, matching_details, finapi_id",
      (query) => query.gt("betrag", 0).not("finapi_id", "is", null).order("datum")
    ),
    fetchAll("kassen_zahlungen", "transaktion_id", (query) => query.not("transaktion_id", "is", null)),
  ]);

  const patientById = new Map(patients.map((row) => [row.id, row]));
  const linkedIds = new Set(linked.map((row) => row.transaktion_id).filter(Boolean));
  const ibanPatients = new Map<string, Set<string>>();
  const ibanHistoryCount = new Map<string, number>();
  for (const tx of transactions) {
    const iban = normalizeIban(tx.absender_iban);
    if (!iban || !tx.matched_patient_id || !["auto", "manuell"].includes(tx.matching_status)) continue;
    const patientIds = ibanPatients.get(iban) || new Set<string>();
    patientIds.add(tx.matched_patient_id);
    ibanPatients.set(iban, patientIds);
    const historyKey = `${iban}:${tx.matched_patient_id}`;
    ibanHistoryCount.set(historyKey, (ibanHistoryCount.get(historyKey) || 0) + 1);
  }

  const result = pending.map((intent) => {
    const patient = patientById.get(intent.patient_id);
    const first = normalize(patient?.vorname).split(" ")[0];
    const last = normalize(patient?.nachname);
    const reference = String(intent.zeichen || patient?.ivoris_nummer || "").replace(/\D/g, "");
    const candidates = transactions
      .filter((tx) => !linkedIds.has(tx.id) && cents(tx.betrag) === cents(intent.betrag))
      .map((tx) => {
        const days = dayDistance(intent.kassen_datum, tx.datum);
        const bankText = normalize(`${tx.absender_name || ""} ${tx.verwendungszweck || ""}`);
        const iban = normalizeIban(tx.absender_iban);
        const ibanIds = ibanPatients.get(iban) || new Set<string>();
        return {
          id: tx.id,
          datum: tx.datum,
          days,
          absender: tx.absender_name,
          iban: iban ? `***${iban.slice(-4)}` : null,
          zweck: tx.verwendungszweck,
          matching_status: tx.matching_status,
          matching_score: tx.matching_score,
          matched_patient_id: tx.matched_patient_id,
          same_patient: tx.matched_patient_id === intent.patient_id,
          reference: reference.length >= 5 && normalize(tx.verwendungszweck).replace(/\s/g, "").includes(reference),
          full_name: Boolean(first?.length >= 3 && last?.length >= 3 && bankText.includes(first) && bankText.includes(last)),
          surname: Boolean(last?.length >= 4 && bankText.includes(last)),
          iban_unique_patient: Boolean(iban && ibanIds.size === 1 && ibanIds.has(intent.patient_id)),
          iban_history_count: iban ? ibanHistoryCount.get(`${iban}:${intent.patient_id}`) || 0 : 0,
        };
      })
      .filter((tx) => tx.days >= -45 && tx.days <= 90)
      .filter((tx) => tx.same_patient || tx.reference || tx.full_name || tx.surname || tx.iban_unique_patient || Math.abs(tx.days) <= 3)
      .sort((left, right) => {
        const leftEvidence = Number(left.same_patient) + Number(left.reference) + Number(left.full_name) + Number(left.iban_unique_patient);
        const rightEvidence = Number(right.same_patient) + Number(right.reference) + Number(right.full_name) + Number(right.iban_unique_patient);
        return rightEvidence - leftEvidence || Math.abs(left.days) - Math.abs(right.days);
      });
    const relatedBankEvidence = transactions
      .filter((tx) => !linkedIds.has(tx.id))
      .map((tx) => {
        const days = dayDistance(intent.kassen_datum, tx.datum);
        const bankWords = normalize(`${tx.absender_name || ""} ${tx.verwendungszweck || ""}`).split(/\s+/).filter(Boolean);
        const bankText = ` ${bankWords.join(" ")} `;
        const patientWords = normalize(`${patient?.vorname || ""} ${patient?.nachname || ""}`).split(/\s+/).filter((word) => word.length >= 4);
        const sharedNameWords = new Set(patientWords.filter((word) => bankWords.includes(word))).size;
        const exactReference = reference.length >= 5 && normalize(tx.verwendungszweck).replace(/\s/g, "").includes(reference);
        const surname = normalize(patient?.nachname);
        const surnameMention = surname.length >= 4 && bankText.includes(` ${surname} `);
        return {
          id: tx.id,
          datum: tx.datum,
          days,
          betrag: tx.betrag,
          absender: tx.absender_name,
          zweck: tx.verwendungszweck,
          matching_status: tx.matching_status,
          matched_patient_id: tx.matched_patient_id,
          exact_amount: cents(tx.betrag) === cents(intent.betrag),
          exact_reference: exactReference,
          surname: surnameMention,
          shared_name_words: sharedNameWords,
        };
      })
      .filter((tx) => tx.days >= -45 && tx.days <= 120)
      .filter((tx) => tx.exact_reference || tx.surname || tx.shared_name_words >= 2 || tx.matched_patient_id === intent.patient_id)
      .sort((left, right) => Math.abs(left.days) - Math.abs(right.days));
    return {
      intent: {
        id: intent.id,
        datum: intent.kassen_datum,
        betrag: intent.betrag,
        patient_id: intent.patient_id,
        patient: patient ? `${patient.vorname} ${patient.nachname}` : null,
        reference,
        zweck: intent.zweck,
        notiz: intent.notiz,
        abgleich_status: intent.abgleich_status,
      },
      candidates,
      relatedBankEvidence,
    };
  });

  console.log(JSON.stringify({ count: result.length, cases: result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
