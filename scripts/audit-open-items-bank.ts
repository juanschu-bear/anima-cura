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

function normalizedText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string | null, expression: RegExp) {
  return Array.from((text || "").matchAll(expression), (match) => match[1]);
}

function invoiceNumberTokens(text: string | null) {
  const value = String(text || "");
  const candidates = new Set<string>();
  for (const match of Array.from(value.matchAll(/(?:^|\D)(\d{5,8})(?=\D|$)/g))) candidates.add(match[1].padStart(8, "0"));
  for (const match of Array.from(value.matchAll(/(?:^|\D)(00(?:\s*\d){6})(?=\D|$)/g))) {
    candidates.add(match[1].replace(/\s+/g, ""));
  }
  return Array.from(candidates);
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
  const value = String(text || "");
  const match = value.match(/(\d{8})\s*-\s*(\d+)\s*[/.]\s*(\d)\s*(\d)\s*(\d)\s*(\d)(?:\s*-\s*(\d+))?/)
    || value.match(/(\d{8})[\s,;]+(\d+)[\s,;/.]+(\d)\s*(\d)\s*(\d)\s*(\d)(?:[\s,;-]+(\d+))?/)
    || value.match(/(\d{8})(\d)[\s,;/.]+(\d)\s*(\d)\s*(\d)\s*(\d)(?:[\s,;-]+(\d+))?/)
    || value.match(/(?<!\d)(\d{4,7})\s*-\s*(\d+)\s*[/.]\s*(\d)\s*(\d)\s*(\d)\s*(\d)(?:\s*-\s*(\d+))?/);
  return match
    ? `${match[1].padStart(8, "0")}-${Number(match[2])}/${match[3]}${match[4]}${match[5]}${match[6]}${match[7] ? `-${Number(match[7])}` : ""}`
    : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const applyCash = process.argv.includes("--apply-cash");
  const applyBasisAmount = process.argv.includes("--apply-basis-amount");
  const applyInvoiceNumber = process.argv.includes("--apply-invoice-number");
  const applyIbanAmount = process.argv.includes("--apply-iban-amount");
  const applyNameAmount = process.argv.includes("--apply-name-amount");
  const protectRequested = process.argv.includes("--protect-requested");
  const protectAllOpen = process.argv.includes("--protect-all-open");
  const [items, allItems, transactions, cash, patients, rates] = await Promise.all([
    fetchAll(
      "offene_posten",
      "id, patient_id, basis_nr, rechnung_nr, unser_zeichen, rechnung_datum, betrag, gezahlt, offen, status, nicht_mahnen",
      (query) => query.in("status", ["offen", "teilbezahlt"]).order("rechnung_datum").order("id")
    ),
    fetchAll(
      "offene_posten",
      "id, patient_id, basis_nr, rechnung_nr, unser_zeichen, rechnung_datum, betrag, gezahlt, offen, status, patient_name, nicht_mahnen",
      (query) => query.order("rechnung_datum").order("id")
    ),
    fetchAll(
      "transaktionen",
      "id, datum, betrag, absender_name, absender_iban, verwendungszweck, matching_status, matching_score, matched_patient_id, matched_rate_id, matching_details",
      (query) => query.gt("betrag", 0).order("datum").order("id")
    ),
    fetchAll("kassen_zahlungen", "*"),
    fetchAll("patients", "id, ivoris_nummer, vorname, nachname, guthaben"),
    fetchAll("raten", "id, patient_id, betrag, bezahlt_betrag, status, transaktion_id, bezahlt_am")
  ]);
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const patientsByIvoris = patients.reduce((map, patient) => {
    if (!patient.ivoris_nummer) return map;
    map.set(patient.ivoris_nummer, [...(map.get(patient.ivoris_nummer) || []), patient]);
    return map;
  }, new Map<string, Row[]>());
  const rateById = new Map(rates.map((rate) => [rate.id, rate]));
  const patientNameCounts = patients.reduce((counts, patient) => {
    const key = `${normalizedText(patient.vorname)}|${normalizedText(patient.nachname)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  const byInvoice = new Map<string, Row[]>();
  const byPatient = new Map<string, Row[]>();
  const byFullReference = new Map<string, Row[]>();
  for (const item of items) {
    if (item.rechnung_nr) byInvoice.set(item.rechnung_nr, [...(byInvoice.get(item.rechnung_nr) || []), item]);
    if (item.patient_id) byPatient.set(item.patient_id, [...(byPatient.get(item.patient_id) || []), item]);
    if (item.unser_zeichen) byFullReference.set(item.unser_zeichen, [...(byFullReference.get(item.unser_zeichen) || []), item]);
  }

  const unused = transactions.filter((tx) => !alreadyApplied(tx));
  const misassignedBaseTransactions = transactions.flatMap((tx) => {
    const mentionedPatients = new Map<string, Row>();
    for (const base of tokens(tx.verwendungszweck, /(?:^|\D)(\d{8})(?=\D|$)/g)) {
      for (const patient of patientsByIvoris.get(base) || []) mentionedPatients.set(patient.id, patient);
    }
    if (mentionedPatients.size !== 1 || !tx.matched_patient_id) return [];
    const intendedPatient = Array.from(mentionedPatients.values())[0];
    if (intendedPatient.id === tx.matched_patient_id) return [];
    return [{ tx, intendedPatient, currentlyMatchedPatient: patientById.get(tx.matched_patient_id) || null }];
  });
  const invoiceCandidates: Array<{ tx: Row; item: Row }> = [];
  const patientAmountCandidates: Array<{ tx: Row; item: Row }> = [];

  for (const tx of unused) {
    const invoiceMatches = new Map<string, Row>();
    for (const token of invoiceNumberTokens(tx.verwendungszweck)) {
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
  const patientsByIban = new Map<string, Set<string>>();
  const confirmedPaymentsByIbanPatient = new Map<string, number>();
  for (const tx of transactions) {
    const iban = String(tx.absender_iban || "").replace(/\s+/g, "").toUpperCase();
    if (!iban || tx.matching_status !== "auto" || !tx.matched_patient_id) continue;
    const patientIds = patientsByIban.get(iban) || new Set<string>();
    patientIds.add(tx.matched_patient_id);
    patientsByIban.set(iban, patientIds);
    if (alreadyApplied(tx) || ["referenz", "rechnungsnummer_eindeutig", "basisnummer_plus_exakter_betrag"].includes(String(tx.matching_details?.methode || ""))) {
      const key = `${iban}:${tx.matched_patient_id}`;
      confirmedPaymentsByIbanPatient.set(key, (confirmedPaymentsByIbanPatient.get(key) || 0) + 1);
    }
  }
  const uniqueIbanAndExactAmountCandidates = patientAmountCandidates.filter(({ tx }) => {
    const iban = String(tx.absender_iban || "").replace(/\s+/g, "").toUpperCase();
    return tx.matching_status === "auto" &&
      Number(tx.matching_score || 0) >= 90 &&
      !tx.matched_rate_id &&
      !fullReference(tx.verwendungszweck) &&
      Boolean(
        iban &&
        patientsByIban.get(iban)?.size === 1 &&
        patientsByIban.get(iban)?.has(tx.matched_patient_id) &&
        (confirmedPaymentsByIbanPatient.get(`${iban}:${tx.matched_patient_id}`) || 0) >= 1
      );
  });
  const ibanItemCounts = uniqueIbanAndExactAmountCandidates.reduce((counts, { item }) => {
    counts.set(item.id, (counts.get(item.id) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const safeUniqueIbanAndExactAmount = uniqueIbanAndExactAmountCandidates.filter(({ item }) => ibanItemCounts.get(item.id) === 1);
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
  const safeBasisAndExactAmount = patientAmountStrong.filter(({ tx, item }) => {
    if (tx.matching_details?.methode !== "basisnummer" || fullReference(tx.verwendungszweck)) return false;
    const bases = tokens(tx.verwendungszweck, /(?:^|\D)(\d{8})(?=\D|$)/g);
    return Boolean(item.basis_nr && bases.includes(item.basis_nr));
  });
  const safeSingleInvoiceCandidates = invoiceCandidates.filter(({ tx, item }) => {
    const invoiceLikeNumbers = invoiceNumberTokens(tx.verwendungszweck).filter((number) => {
      const numeric = Number(number);
      return numeric >= 60000 && numeric <= 99999;
    });
    return new Set(invoiceLikeNumbers).size === 1 && invoiceLikeNumbers[0] === item.rechnung_nr;
  });
  const safeFullPatientNameAndExactAmount = patientAmountCandidates.filter(({ tx, item }) => {
    const patient = item.patient_id ? patientById.get(item.patient_id) : null;
    if (!patient || tx.matched_patient_id !== item.patient_id || tx.matched_rate_id || fullReference(tx.verwendungszweck)) return false;
    if (!["name_plus_posten", "name"].includes(String(tx.matching_details?.methode || ""))) return false;
    if (Number(tx.matching_details?.name_score || 0) < 75) return false;
    const bankText = normalizedText(`${tx.absender_name || ""} ${tx.verwendungszweck || ""}`);
    const first = normalizedText(patient.vorname);
    const firstPrimary = first.split(" ")[0];
    const last = normalizedText(patient.nachname);
    const nameKey = `${first}|${last}`;
    return Boolean(
      firstPrimary.length >= 3 &&
      last.length >= 3 &&
      patientNameCounts.get(nameKey) === 1 &&
      bankText.includes(firstPrimary) &&
      bankText.includes(last)
    );
  });
  const fullNameItemCounts = safeFullPatientNameAndExactAmount.reduce((counts, { item }) => {
    counts.set(item.id, (counts.get(item.id) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const safeUniqueFullNameAndExactAmount = safeFullPatientNameAndExactAmount.filter(({ item }) => fullNameItemCounts.get(item.id) === 1);
  const samePatientReferenceNameAmountCandidates = patientAmountCandidates.filter(({ tx, item }) => {
    const patient = item.patient_id ? patientById.get(item.patient_id) : null;
    const reference = fullReference(tx.verwendungszweck);
    if (!patient || !reference || reference.slice(0, 8) !== item.basis_nr || tx.matched_patient_id !== item.patient_id || tx.matched_rate_id) return false;
    const otherInvoice = invoiceNumberTokens(tx.verwendungszweck).some((number) => {
      const numeric = Number(number);
      return numeric >= 60000 && numeric <= 99999 && number !== item.rechnung_nr;
    });
    if (otherInvoice) return false;
    const bankText = normalizedText(`${tx.absender_name || ""} ${tx.verwendungszweck || ""}`);
    const first = normalizedText(patient.vorname);
    const firstPrimary = first.split(" ")[0];
    const last = normalizedText(patient.nachname);
    return firstPrimary.length >= 3 && last.length >= 3 &&
      patientNameCounts.get(`${first}|${last}`) === 1 && bankText.includes(firstPrimary) && bankText.includes(last);
  });
  const samePatientReferenceItemCounts = samePatientReferenceNameAmountCandidates.reduce((counts, { item }) => {
    counts.set(item.id, (counts.get(item.id) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const safeSamePatientReferenceNameAmount = samePatientReferenceNameAmountCandidates.filter(
    ({ item }) => samePatientReferenceItemCounts.get(item.id) === 1
  );
  const familyPayerCandidates = patientAmountCandidates.filter(({ tx, item }) => {
    const patient = item.patient_id ? patientById.get(item.patient_id) : null;
    if (!patient || tx.matched_patient_id !== item.patient_id || tx.matched_rate_id) return false;
    const bankText = normalizedText(`${tx.absender_name || ""} ${tx.verwendungszweck || ""}`);
    const last = normalizedText(patient.nachname);
    const reference = fullReference(tx.verwendungszweck);
    const conflictingInvoice = invoiceNumberTokens(tx.verwendungszweck).some((number) => {
      const numeric = Number(number);
      return numeric >= 60000 && numeric <= 99999 && number !== item.rechnung_nr;
    });
    return last.length >= 4 && bankText.includes(last) && !conflictingInvoice && (!reference || reference.slice(0, 8) === item.basis_nr);
  });
  const familyPatientCounts = familyPayerCandidates.reduce((counts, { item }) => {
    if (item.patient_id) counts.set(item.patient_id, (counts.get(item.patient_id) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const familyItemCounts = familyPayerCandidates.reduce((counts, { item }) => {
    counts.set(item.id, (counts.get(item.id) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const safeRecurringFamilyPayerAmount = familyPayerCandidates.filter(({ item }) =>
    Boolean(item.patient_id && (familyPatientCounts.get(item.patient_id) || 0) >= 2 && familyItemCounts.get(item.id) === 1)
  );
  const safeNameEvidenceCandidates = Array.from(new Map(
    [...safeUniqueFullNameAndExactAmount, ...safeSamePatientReferenceNameAmount, ...safeRecurringFamilyPayerAmount]
      .map((candidate) => [`${candidate.tx.id}:${candidate.item.id}`, candidate])
  ).values());
  const openItemById = new Map(items.map((item) => [item.id, item]));
  const directCashMatches = cash.filter((payment) => payment.posten_id && openItemById.has(payment.posten_id));
  const uniqueCashPatientAmount = cash.flatMap((payment) => {
    if (!payment.patient_id) return [];
    const matches = (byPatient.get(payment.patient_id) || []).filter((item) =>
      (!payment.kassen_datum || payment.kassen_datum >= item.rechnung_datum) && cents(payment.betrag) === cents(item.offen)
    );
    return matches.length === 1 ? [{ payment, item: matches[0] }] : [];
  });
  const uniqueCashPatientBaseCandidates = cash.flatMap((payment) => {
    if (!payment.patient_id || payment.posten_id || payment.abgleich_status !== "offen") return [];
    if (!/bezahlt/i.test(String(payment.notiz || ""))) return [];
    const base = String(payment.zeichen || "").match(/\d{8}/)?.[0] || null;
    if (!base) return [];
    const matches = (byPatient.get(payment.patient_id) || []).filter((item) =>
      item.basis_nr === base && (!payment.kassen_datum || payment.kassen_datum >= item.rechnung_datum) && cents(payment.betrag) <= cents(item.offen)
    );
    return matches.length === 1 ? [{ payment, item: matches[0] }] : [];
  });
  const safeCashCandidates = Array.from(new Map(
    [...uniqueCashPatientAmount, ...uniqueCashPatientBaseCandidates].map((candidate) => [`${candidate.payment.id}:${candidate.item.id}`, candidate])
  ).values());
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
  const invoiceCandidateItemIds = new Set(invoiceCandidates.map(({ item }) => item.id));
  const patientAmountCandidateItemIds = new Set(patientAmountCandidates.map(({ item }) => item.id));
  const ambiguousCandidateItemIds = new Set([...Array.from(invoiceCandidateItemIds), ...Array.from(patientAmountCandidateItemIds)]);
  const bankStart = transactions[0]?.datum || "9999-12-31";
  const beforeBankHistory = items.filter((item) => item.rechnung_datum < bankStart);
  const withinBankHistory = items.filter((item) => item.rechnung_datum >= bankStart);
  const withoutCandidate = items.filter((item) => !ambiguousCandidateItemIds.has(item.id));
  const currentYearItems = allItems.filter((item) => String(item.rechnung_datum || "").startsWith("2026-"));
  const requestedReferences = new Set(
    (process.argv.find((arg) => arg.startsWith("--references="))?.slice("--references=".length) || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const includeCurrentYearEvidence = process.argv.includes("--current-year-evidence");
  const requestedItemEvidence = allItems.filter((item) =>
    requestedReferences.has(item.unser_zeichen) || requestedReferences.has(item.rechnung_nr) ||
    (includeCurrentYearEvidence && String(item.rechnung_datum || "").startsWith("2026-") && ["offen", "teilbezahlt"].includes(item.status))
  ).map((item) => {
    const itemPatient = item.patient_id ? patientById.get(item.patient_id) : null;
    const firstName = normalizedText(itemPatient?.vorname || String(item.patient_name || "").split(",")[1]);
    const lastName = normalizedText(itemPatient?.nachname || String(item.patient_name || "").split(",")[0]);
    const evidenceStart = includeCurrentYearEvidence ? "2026-01-01" : item.rechnung_datum;
    const evidence = transactions.flatMap((tx) => {
      if (tx.datum < evidenceStart) return [];
      const bankText = normalizedText(`${tx.absender_name || ""} ${tx.verwendungszweck || ""}`);
      const reference = fullReference(tx.verwendungszweck);
      const invoiceMatch = invoiceNumberTokens(tx.verwendungszweck).includes(item.rechnung_nr);
      const baseMention = item.basis_nr && tokens(tx.verwendungszweck, /(?:^|\D)(\d{8})(?=\D|$)/g).includes(item.basis_nr);
      const patientMatch = item.patient_id && tx.matched_patient_id === item.patient_id;
      const amountMatch = cents(tx.betrag) === cents(item.offen) || cents(tx.betrag) === cents(item.betrag);
      const fullNameMention = firstName.length >= 3 && lastName.length >= 3 && bankText.includes(firstName) && bankText.includes(lastName);
      const uniqueLastNameMention = lastName.length >= 5 && bankText.includes(lastName) &&
        patients.filter((patient) => normalizedText(patient.nachname) === lastName).length === 1;
      if (reference !== item.unser_zeichen && !invoiceMatch && !baseMention && !(patientMatch && amountMatch) && !fullNameMention && !uniqueLastNameMention) return [];
      return [{
        txId: tx.id,
        datum: tx.datum,
        betrag: tx.betrag,
        zweck: tx.verwendungszweck,
        matchingStatus: tx.matching_status,
        matchingScore: tx.matching_score,
        matchedPatientId: tx.matched_patient_id,
        matchedPatient: tx.matched_patient_id ? patientById.get(tx.matched_patient_id) : null,
        matchedRateId: tx.matched_rate_id,
        matchedRate: tx.matched_rate_id ? rateById.get(tx.matched_rate_id) : null,
        relatedRateTransactions: tx.matched_rate_id ? transactions
          .filter((candidate) => candidate.matched_rate_id === tx.matched_rate_id)
          .map((candidate) => ({ id: candidate.id, datum: candidate.datum, betrag: candidate.betrag, zweck: candidate.verwendungszweck })) : [],
        alreadyApplied: alreadyApplied(tx),
        matchingDetails: tx.matching_details,
        reasons: {
          parsedReference: reference,
          exactReference: reference === item.unser_zeichen,
          invoiceNumber: invoiceMatch,
          patientBase: Boolean(baseMention),
          matchedPatientAndAmount: Boolean(patientMatch && amountMatch),
          fullPatientName: fullNameMention,
          uniquePatientLastName: uniqueLastNameMention,
        },
      }];
    });
    const cashEvidence = cash.filter((payment) =>
      payment.patient_id === item.patient_id && payment.kassen_datum >= evidenceStart
    );
    const patientItems = item.patient_id
      ? allItems.filter((candidate) => candidate.patient_id === item.patient_id)
      : allItems.filter((candidate) => candidate.basis_nr === item.basis_nr);
    return { item, patientItems, evidence, cashEvidence };
  });

  let protectedRequested = 0;
  if (protectRequested) {
    for (const { item } of requestedItemEvidence) {
      if (!["offen", "teilbezahlt"].includes(item.status) || item.nicht_mahnen === true) continue;
      const { data, error } = await db
        .from("offene_posten")
        .update({ nicht_mahnen: true })
        .eq("id", item.id)
        .in("status", ["offen", "teilbezahlt"])
        .select("id");
      if (error) throw error;
      protectedRequested += data?.length || 0;
    }
  }
  let protectedAllOpen = 0;
  if (protectAllOpen) {
    const { data, error } = await db
      .from("offene_posten")
      .update({ nicht_mahnen: true })
      .in("status", ["offen", "teilbezahlt"])
      .or("nicht_mahnen.is.null,nicht_mahnen.eq.false")
      .select("id");
    if (error) throw error;
    protectedAllOpen = data?.length || 0;
  }

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
    for (const { payment, item } of safeCashCandidates) {
      const cashBase = String(payment.zeichen || "").match(/\d{8}/)?.[0] || null;
      if (!cashBase || cashBase !== item.basis_nr || payment.abgleich_status !== "offen" || payment.posten_id) continue;
      const paymentAmount = Number(payment.betrag);
      const nextOpen = Number(Math.max(0, Number(item.offen) - paymentAmount).toFixed(2));
      const { data: updatedItems, error: itemError } = await db
        .from("offene_posten")
        .update({
          offen: nextOpen,
          gezahlt: Number((Number(item.gezahlt || 0) + paymentAmount).toFixed(2)),
          status: nextOpen === 0 ? "bezahlt" : "teilbezahlt",
          bezahlt_am: nextOpen === 0 ? payment.kassen_datum : null,
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
  let appliedBasisAmount = 0;
  if (applyBasisAmount) {
    for (const { tx, item } of safeBasisAndExactAmount) {
      const stamp = new Date().toISOString();
      const { data: updatedItems, error: itemError } = await db
        .from("offene_posten")
        .update({
          offen: 0,
          gezahlt: Number((Number(item.gezahlt || 0) + Number(tx.betrag)).toFixed(2)),
          status: "bezahlt",
          bezahlt_am: tx.datum,
        })
        .eq("id", item.id)
        .eq("offen", item.offen)
        .in("status", ["offen", "teilbezahlt"])
        .select("id");
      if (itemError || updatedItems?.length !== 1) throw new Error(`Basisnummer-Posten ${item.id} konnte nicht aktualisiert werden`);
      const { data: updatedTransactions, error: txError } = await db
        .from("transaktionen")
        .update({
          matching_status: "auto",
          matching_score: 100,
          matched_patient_id: item.patient_id,
          matching_details: {
            ...(tx.matching_details || {}),
            methode: "basisnummer_plus_exakter_betrag",
            basisnummer: item.basis_nr,
            basis_amount_repair_applied_at: stamp,
            open_item_sync_applied_at: stamp,
            open_item_sync_applied_amount: Number(tx.betrag),
            open_item_sync_remaining_amount: 0,
            open_item_sync_items: 1,
          },
          geprueft_am: stamp,
        })
        .eq("id", tx.id)
        .select("id");
      if (txError || updatedTransactions?.length !== 1) throw new Error(`Basisnummer-Zahlung ${tx.id} konnte nicht markiert werden`);
      appliedBasisAmount += 1;
    }
  }
  let appliedInvoiceTransactions = 0;
  let appliedInvoiceItems = 0;
  if (applyInvoiceNumber) {
    const groups = new Map<string, { item: Row; transactions: Row[] }>();
    for (const { tx, item } of safeSingleInvoiceCandidates) {
      const group = groups.get(item.id) || { item, transactions: [] };
      group.transactions.push(tx);
      groups.set(item.id, group);
    }
    for (const { item, transactions: groupTransactions } of Array.from(groups.values())) {
      groupTransactions.sort((left, right) => `${left.datum}-${left.id}`.localeCompare(`${right.datum}-${right.id}`));
      const total = groupTransactions.reduce((sum, tx) => sum + Number(tx.betrag), 0);
      const oldOpen = Number(item.offen || 0);
      const appliedToInvoice = Math.min(total, oldOpen);
      const excess = Number(Math.max(0, total - oldOpen).toFixed(2));
      const nextOpen = Number(Math.max(0, oldOpen - total).toFixed(2));
      const stamp = new Date().toISOString();
      const { data: updatedItems, error: itemError } = await db
        .from("offene_posten")
        .update({
          offen: nextOpen,
          gezahlt: Number((Number(item.gezahlt || 0) + appliedToInvoice).toFixed(2)),
          status: nextOpen === 0 ? "bezahlt" : "teilbezahlt",
          bezahlt_am: nextOpen === 0 ? groupTransactions.at(-1)?.datum : null,
        })
        .eq("id", item.id)
        .eq("offen", item.offen)
        .in("status", ["offen", "teilbezahlt"])
        .select("id");
      if (itemError || updatedItems?.length !== 1) throw new Error(`Rechnungsnummer-Posten ${item.id} konnte nicht aktualisiert werden`);

      if (excess > 0 && item.patient_id) {
        const { data: patient, error: patientError } = await db.from("patients").select("guthaben").eq("id", item.patient_id).single();
        if (patientError) throw patientError;
        const { data: updatedPatient, error: creditError } = await db
          .from("patients")
          .update({ guthaben: Number(patient?.guthaben || 0) + excess })
          .eq("id", item.patient_id)
          .select("id");
        if (creditError || updatedPatient?.length !== 1) throw new Error(`Rechnungsnummer-Ueberzahlung ${item.id} konnte nicht gesichert werden`);
      }

      let remainingInvoice = oldOpen;
      for (const tx of groupTransactions) {
        const amount = Number(tx.betrag);
        const invoiceChunk = Math.min(remainingInvoice, amount);
        const txExcess = Number(Math.max(0, amount - invoiceChunk).toFixed(2));
        remainingInvoice = Math.max(0, remainingInvoice - invoiceChunk);
        const { data: updatedTransactions, error: txError } = await db
          .from("transaktionen")
          .update({
            matching_status: "auto",
            matching_score: 100,
            matched_patient_id: item.patient_id,
            matching_details: {
              ...(tx.matching_details || {}),
              methode: "rechnungsnummer_eindeutig",
              rechnung_nr: item.rechnung_nr,
              invoice_repair_applied_at: stamp,
              invoice_repair_applied_amount: invoiceChunk,
              invoice_repair_excess_credit: txExcess,
              open_item_sync_applied_at: stamp,
              open_item_sync_applied_amount: invoiceChunk,
              open_item_sync_remaining_amount: txExcess,
              open_item_sync_items: 1,
            },
            geprueft_am: stamp,
          })
          .eq("id", tx.id)
          .select("id");
        if (txError || updatedTransactions?.length !== 1) throw new Error(`Rechnungsnummer-Zahlung ${tx.id} konnte nicht markiert werden`);
        appliedInvoiceTransactions += 1;
      }
      appliedInvoiceItems += 1;
    }
  }
  let appliedIbanAmount = 0;
  if (applyIbanAmount) {
    for (const { tx, item } of safeUniqueIbanAndExactAmount) {
      const stamp = new Date().toISOString();
      const { data: updatedItems, error: itemError } = await db
        .from("offene_posten")
        .update({
          offen: 0,
          gezahlt: Number((Number(item.gezahlt || 0) + Number(tx.betrag)).toFixed(2)),
          status: "bezahlt",
          bezahlt_am: tx.datum,
        })
        .eq("id", item.id)
        .eq("offen", item.offen)
        .in("status", ["offen", "teilbezahlt"])
        .select("id");
      if (itemError || updatedItems?.length !== 1) throw new Error(`IBAN-Posten ${item.id} konnte nicht aktualisiert werden`);
      const { data: updatedTransactions, error: txError } = await db
        .from("transaktionen")
        .update({
          matching_status: "auto",
          matching_score: 100,
          matched_patient_id: item.patient_id,
          matching_details: {
            ...(tx.matching_details || {}),
            methode: "eindeutige_iban_plus_exakter_betrag",
            iban_amount_repair_applied_at: stamp,
            open_item_sync_applied_at: stamp,
            open_item_sync_applied_amount: Number(tx.betrag),
            open_item_sync_remaining_amount: 0,
            open_item_sync_items: 1,
          },
          geprueft_am: stamp,
        })
        .eq("id", tx.id)
        .select("id");
      if (txError || updatedTransactions?.length !== 1) throw new Error(`IBAN-Zahlung ${tx.id} konnte nicht markiert werden`);
      appliedIbanAmount += 1;
    }
  }
  let appliedNameAmount = 0;
  if (applyNameAmount) {
    for (const { tx, item } of safeNameEvidenceCandidates) {
      const stamp = new Date().toISOString();
      const { data: updatedItems, error: itemError } = await db
        .from("offene_posten")
        .update({
          offen: 0,
          gezahlt: Number((Number(item.gezahlt || 0) + Number(tx.betrag)).toFixed(2)),
          status: "bezahlt",
          bezahlt_am: tx.datum,
        })
        .eq("id", item.id)
        .eq("offen", item.offen)
        .in("status", ["offen", "teilbezahlt"])
        .select("id");
      if (itemError || updatedItems?.length !== 1) throw new Error(`Namens-Posten ${item.id} konnte nicht aktualisiert werden`);
      const { data: updatedTransactions, error: txError } = await db
        .from("transaktionen")
        .update({
          matching_status: "auto",
          matching_score: 100,
          matched_patient_id: item.patient_id,
          matching_details: {
            ...(tx.matching_details || {}),
            methode: "eindeutiger_vollname_plus_exakter_betrag",
            name_amount_repair_applied_at: stamp,
            open_item_sync_applied_at: stamp,
            open_item_sync_applied_amount: Number(tx.betrag),
            open_item_sync_remaining_amount: 0,
            open_item_sync_items: 1,
          },
          geprueft_am: stamp,
        })
        .eq("id", tx.id)
        .select("id");
      if (txError || updatedTransactions?.length !== 1) throw new Error(`Namens-Zahlung ${tx.id} konnte nicht markiert werden`);
      appliedNameAmount += 1;
    }
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    openItems: items.length,
    openStatusItems: items.filter((item) => item.status === "offen").length,
    partialStatusItems: items.filter((item) => item.status === "teilbezahlt").length,
    openAmount: Number(items.reduce((sum, item) => sum + Number(item.offen || 0), 0).toFixed(2)),
    openItemsWithinBankHistory: withinBankHistory.length,
    openItemsBeforeBankHistory: beforeBankHistory.length,
    openItemsWithoutRemainingPaymentCandidate: withoutCandidate.length,
    openItemsWithAmbiguousPaymentCandidate: ambiguousCandidateItemIds.size,
    openItemsWithoutPatientLink: items.filter((item) => !item.patient_id).length,
    confirmedOpenItems: items.filter((item) => item.nicht_mahnen !== true).length,
    reviewOpenItems: items.filter((item) => item.nicht_mahnen === true).length,
    currentYear: {
      total: currentYearItems.length,
      open: currentYearItems.filter((item) => item.status === "offen").length,
      partial: currentYearItems.filter((item) => item.status === "teilbezahlt").length,
      paid: currentYearItems.filter((item) => item.status === "bezahlt").length,
      other: currentYearItems.filter((item) => !["offen", "teilbezahlt", "bezahlt"].includes(item.status)).length,
      openAmount: Number(currentYearItems
        .filter((item) => ["offen", "teilbezahlt"].includes(item.status))
        .reduce((sum, item) => sum + Number(item.offen || 0), 0).toFixed(2)),
      byMonth: currentYearItems.reduce((months, item) => {
        const month = String(item.rechnung_datum || "unbekannt").slice(0, 7);
        const bucket = months[month] || { total: 0, open: 0, partial: 0, paid: 0, openAmount: 0 };
        bucket.total += 1;
        if (item.status === "offen") bucket.open += 1;
        if (item.status === "teilbezahlt") bucket.partial += 1;
        if (item.status === "bezahlt") bucket.paid += 1;
        if (["offen", "teilbezahlt"].includes(item.status)) bucket.openAmount += Number(item.offen || 0);
        months[month] = bucket;
        return months;
      }, {} as Record<string, { total: number; open: number; partial: number; paid: number; openAmount: number }>),
    },
    requestedItemEvidence,
    protectedRequested,
    protectedAllOpen,
    bankTransactions: transactions.length,
    bankRange: [transactions[0]?.datum, transactions.at(-1)?.datum],
    unappliedIncomingTransactions: unused.length,
    transactionsAssignedAgainstExplicitPatientNumber: misassignedBaseTransactions.length,
    misassignedBaseSample: misassignedBaseTransactions.slice(0, 30).map(({ tx, intendedPatient, currentlyMatchedPatient }) => ({
      txId: tx.id,
      datum: tx.datum,
      betrag: tx.betrag,
      zweck: tx.verwendungszweck,
      intendedPatient,
      currentlyMatchedPatient,
      matchedRateId: tx.matched_rate_id,
      matchingDetails: tx.matching_details,
    })),
    cashPayments: cash.length,
    directCashMatchesToOpenItems: directCashMatches.length,
    uniqueCashPatientAndAmountMatches: uniqueCashPatientAmount.length,
    uniqueCashPatientAndBaseMatches: uniqueCashPatientBaseCandidates.length,
    uniqueInvoiceNumberCandidates: invoiceCandidates.length,
    invoiceCandidateSample: invoiceCandidates.slice(0, 30).map(({ tx, item }) => ({
      txId: tx.id,
      datum: tx.datum,
      zahlung: tx.betrag,
      zweck: tx.verwendungszweck,
      matchedPatientId: tx.matched_patient_id,
      matchingStatus: tx.matching_status,
      matchingScore: tx.matching_score,
      postenId: item.id,
      postenPatientId: item.patient_id,
      rechnung: item.rechnung_nr,
      offen: item.offen,
      amountWithinOpen: cents(tx.betrag) <= cents(item.offen),
      patientConsistent: !tx.matched_patient_id || !item.patient_id || tx.matched_patient_id === item.patient_id,
    })),
    strictReferenceItems: strictReferenceSummary.length,
    strictReferenceTransactions: strictReferenceSummary.reduce((sum, group) => sum + group.transactions.length, 0),
    strictReferenceOverpaymentGroups: strictReferenceSummary.filter((group) =>
      cents(group.transactions.reduce((sum, tx) => sum + Number(tx.betrag), 0)) > cents(group.item.offen)
    ).length,
    strictReferenceOverpaymentSample: strictReferenceSummary.filter((group) =>
      cents(group.transactions.reduce((sum, tx) => sum + Number(tx.betrag), 0)) > cents(group.item.offen)
    ).slice(0, 10).map((group) => ({
      postenId: group.item.id,
      patientId: group.item.patient_id,
      referenz: group.item.unser_zeichen,
      offen: group.item.offen,
      zahlungen: group.transactions.map((tx) => ({ id: tx.id, datum: tx.datum, betrag: tx.betrag, zweck: tx.verwendungszweck })),
    })),
    uniquePatientAndExactAmountCandidates: patientAmountCandidates.length,
    patientAmountCandidateBreakdown: Object.fromEntries(Object.entries(patientAmountCandidates.reduce((counts, { tx }) => {
      const key = `${tx.matching_status || "null"}|${tx.matching_score ?? "null"}|${tx.matching_details?.methode || "unbekannt"}|${tx.matched_rate_id ? "rate" : "keine_rate"}`;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {} as Record<string, number>)).sort((left, right) => right[1] - left[1])),
    ambiguousPatientAmountSample: patientAmountCandidates.slice(0, 100).map(({ tx, item }) => ({
      txId: tx.id,
      datum: tx.datum,
      zahlung: tx.betrag,
      absender: tx.absender_name,
      zweck: tx.verwendungszweck,
      matchingStatus: tx.matching_status,
      matchingScore: tx.matching_score,
      methode: tx.matching_details?.methode,
      nameScore: tx.matching_details?.name_score,
      matchedRateId: tx.matched_rate_id,
      patient: item.patient_id ? patientById.get(item.patient_id) : null,
      postenId: item.id,
      unserZeichen: item.unser_zeichen,
      rechnung: item.rechnung_nr,
      rechnungsdatum: item.rechnung_datum,
      offen: item.offen,
    })),
    namePlusPostenScoreBreakdown: Object.fromEntries(Object.entries(patientAmountCandidates
      .filter(({ tx }) => tx.matching_details?.methode === "name_plus_posten")
      .reduce((counts, { tx }) => {
        const score = String(tx.matching_details?.name_score ?? "null");
        counts[score] = (counts[score] || 0) + 1;
        return counts;
      }, {} as Record<string, number>)).sort((left, right) => Number(right[0]) - Number(left[0]))),
    patientAndExactAmountScore95WithoutRate: patientAmountStrong.length,
    safeUniqueIbanAndExactAmount: safeUniqueIbanAndExactAmount.length,
    patientAmountWithExplicitReferenceAndExactAmount: patientAmountDoubleEvidence.length,
    safeBasisAndExactAmountWithoutConflictingFullReference: safeBasisAndExactAmount.length,
    safeSingleInvoiceNumberCandidates: safeSingleInvoiceCandidates.length,
    safeUniqueFullPatientNameAndExactAmount: safeUniqueFullNameAndExactAmount.length,
    safeSamePatientReferenceFullNameAndExactAmount: safeSamePatientReferenceNameAmount.length,
    safeRecurringFamilyPayerAndExactAmount: safeRecurringFamilyPayerAmount.length,
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
    appliedBasisAmount,
    appliedInvoiceTransactions,
    appliedInvoiceItems,
    appliedIbanAmount,
    appliedNameAmount,
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
    cashPatientBaseSample: uniqueCashPatientBaseCandidates.slice(0, 10).map(({ payment, item }) => ({
      cashId: payment.id,
      datum: payment.kassen_datum,
      betrag: payment.betrag,
      zeichen: payment.zeichen,
      zweck: payment.zweck,
      notiz: payment.notiz,
      patientId: payment.patient_id,
      postenId: item.id,
      patientName: item.patient_name,
      unserZeichen: item.unser_zeichen,
      rechnung: item.rechnung_nr,
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
