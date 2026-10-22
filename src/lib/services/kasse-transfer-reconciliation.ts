import { createServerClient } from "../db/supabase";
import type { MatchingDetails } from "../types";
import { applyConfirmedTransactionBooking } from "./matching-engine";

export interface PendingTransferIntent {
  id: string;
  patient_id: string | null;
  kassen_datum: string;
  betrag: number;
  zeichen: string | null;
  zweck?: string | null;
  patient_vorname?: string | null;
  patient_nachname?: string | null;
}

export interface ImportedBankTransaction {
  id: string;
  datum: string;
  betrag: number;
  verwendungszweck: string | null;
  finapi_id: number | string | null;
  matching_status?: string | null;
  matching_score?: number | null;
  matched_patient_id: string | null;
  matched_rate_id?: string | null;
  matching_details?: MatchingDetails | null;
  absender_name?: string | null;
  absender_iban?: string | null;
}

export interface TransferReconciliationMatch {
  intent: PendingTransferIntent;
  transaction: ImportedBankTransaction;
}

export interface TransferReconciliationPlan {
  matches: TransferReconciliationMatch[];
  ambiguousIntentIds: string[];
  unmatchedIntentIds: string[];
  staleUnmatchedIntentIds: string[];
}

function cents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

function compactReference(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizedWords(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function daysBetween(left: string, right: string) {
  return Math.round((new Date(right).getTime() - new Date(left).getTime()) / 86_400_000);
}

function hasStrongPatientIdentity(intent: PendingTransferIntent, transaction: ImportedBankTransaction) {
  if (
    transaction.matched_patient_id === intent.patient_id &&
    transaction.matching_status === "abweichung" &&
    Number(transaction.matching_score || 0) >= 60
  ) return true;

  const bankWords = normalizedWords(`${transaction.absender_name || ""} ${transaction.verwendungszweck || ""}`);
  const bankText = ` ${bankWords.join(" ")} `;
  const surname = normalizedWords(intent.patient_nachname).join(" ");
  if (surname.length >= 4 && bankText.includes(` ${surname} `)) return true;

  const patientWords = normalizedWords(`${intent.patient_vorname || ""} ${intent.patient_nachname || ""}`)
    .filter((word) => word.length >= 4);
  const sharedWords = patientWords.filter((word) => bankWords.includes(word));
  return new Set(sharedWords).size >= 2;
}

export function buildTransferReconciliationPlan(
  intents: PendingTransferIntent[],
  transactions: ImportedBankTransaction[],
  alreadyLinkedTransactionIds: Iterable<string> = [],
  today = new Date().toISOString().slice(0, 10)
): TransferReconciliationPlan {
  const linked = new Set(alreadyLinkedTransactionIds);
  const candidates = new Map<string, ImportedBankTransaction[]>();

  for (const intent of intents) {
    const reference = compactReference(intent.zeichen);
    if (!intent.patient_id || cents(intent.betrag) <= 0) {
      candidates.set(intent.id, []);
      continue;
    }

    const eligible = transactions.filter((transaction) => {
      if (!transaction.finapi_id || linked.has(transaction.id)) return false;
      if (transaction.matching_status === "ignoriert") return false;
      if (transaction.datum < intent.kassen_datum) return false;
      if (cents(transaction.betrag) !== cents(intent.betrag)) return false;
      return !transaction.matched_patient_id || transaction.matched_patient_id === intent.patient_id;
    });
    const referenceMatches = reference.length >= 5
      ? eligible.filter((transaction) => compactReference(transaction.verwendungszweck).includes(reference))
      : [];

    // Zweiter Beweisweg: Der allgemeine Bankabgleich hat den Umsatz bereits
    // eindeutig demselben Patienten bestaetigt. Dann fehlen nur noch die
    // Verknuepfung und der sichtbare Status in der Kasse.
    const confirmedPatientMatches = eligible.filter((transaction) =>
      transaction.matched_patient_id === intent.patient_id &&
      ["auto", "manuell"].includes(transaction.matching_status || "")
    );

    // Dritter Beweisweg fuer Zahlungen direkt nach einem QR-/Kassenvorgang:
    // exakter Betrag, maximal drei Banktage Abstand und ein eindeutiger
    // Patientenname im Zahler oder Verwendungszweck. So werden auch Eltern-
    // konten erkannt, ohne eine bloss gleich hohe Zahlung zu erraten.
    const identityMatches = eligible.filter((transaction) =>
      daysBetween(intent.kassen_datum, transaction.datum) <= 3 &&
      hasStrongPatientIdentity(intent, transaction)
    );

    candidates.set(
      intent.id,
      referenceMatches.length
        ? referenceMatches
        : confirmedPatientMatches.length
          ? confirmedPatientMatches
          : identityMatches
    );
  }

  const candidateUseCount = new Map<string, number>();
  candidates.forEach((rows) => {
    for (const transaction of rows) {
      candidateUseCount.set(transaction.id, (candidateUseCount.get(transaction.id) || 0) + 1);
    }
  });

  const matches: TransferReconciliationMatch[] = [];
  const ambiguousIntentIds: string[] = [];
  const unmatchedIntentIds: string[] = [];
  const staleUnmatchedIntentIds: string[] = [];

  for (const intent of intents) {
    const rows = candidates.get(intent.id) || [];
    if (rows.length === 1 && candidateUseCount.get(rows[0].id) === 1) {
      matches.push({ intent, transaction: rows[0] });
    } else if (rows.length > 0) {
      ambiguousIntentIds.push(intent.id);
    } else {
      unmatchedIntentIds.push(intent.id);
      if (daysBetween(intent.kassen_datum, today) > 5) staleUnmatchedIntentIds.push(intent.id);
    }
  }

  return { matches, ambiguousIntentIds, unmatchedIntentIds, staleUnmatchedIntentIds };
}

async function loadAllTransactionsSince(
  db: ReturnType<typeof createServerClient>,
  minDate: string
): Promise<ImportedBankTransaction[]> {
  const rows: ImportedBankTransaction[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("transaktionen")
      .select("id, datum, betrag, verwendungszweck, absender_name, absender_iban, finapi_id, matching_status, matching_score, matched_patient_id, matched_rate_id, matching_details")
      .gte("datum", minDate)
      .gt("betrag", 0)
      .not("finapi_id", "is", null)
      .order("datum", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const page = (data || []).map((row) => ({
      ...row,
      betrag: Number(row.betrag) || 0,
    })) as ImportedBankTransaction[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function reconcileWaitingKasseTransfers(): Promise<{
  checked: number;
  linked: number;
  ambiguous: number;
  unmatched: number;
  errors: string[];
}> {
  const db = createServerClient();
  const errors: string[] = [];

  const { data: pendingRows, error: pendingError } = await db
    .from("kassen_zahlungen")
    .select("id, patient_id, kassen_datum, betrag, zeichen, zweck, status")
    .eq("buchungstyp", "einnahme")
    .in("zahlart", ["qr_ueberweisung", "ueberweisung"])
    .is("transaktion_id", null)
    .order("kassen_datum", { ascending: true });
  if (pendingError) throw pendingError;

  const rawIntents = (pendingRows || [])
    .filter((row) => row.status !== "storniert")
    .map((row) => ({ ...row, betrag: Number(row.betrag) || 0 })) as PendingTransferIntent[];

  if (!rawIntents.length) {
    return { checked: 0, linked: 0, ambiguous: 0, unmatched: 0, errors };
  }

  const patientIds = Array.from(new Set(rawIntents.map((row) => row.patient_id).filter(Boolean))) as string[];
  const { data: patientRows, error: patientError } = patientIds.length
    ? await db.from("patients").select("id, vorname, nachname").in("id", patientIds)
    : { data: [], error: null };
  if (patientError) throw patientError;
  const patientsById = new Map((patientRows || []).map((row) => [row.id, row]));
  const intents = rawIntents.map((intent) => {
    const patient = intent.patient_id ? patientsById.get(intent.patient_id) : null;
    return {
      ...intent,
      patient_vorname: patient?.vorname || null,
      patient_nachname: patient?.nachname || null,
    };
  });

  const [{ data: linkedRows, error: linkedError }, transactions] = await Promise.all([
    db.from("kassen_zahlungen").select("transaktion_id").not("transaktion_id", "is", null),
    loadAllTransactionsSince(db, intents[0].kassen_datum),
  ]);
  if (linkedError) throw linkedError;

  const plan = buildTransferReconciliationPlan(
    intents,
    transactions,
    (linkedRows || []).map((row) => row.transaktion_id).filter(Boolean) as string[]
  );

  if (plan.ambiguousIntentIds.length) {
    const { error } = await db.from("kassen_zahlungen")
      .update({ abgleich_status: "mehrdeutig" })
      .in("id", plan.ambiguousIntentIds)
      .is("transaktion_id", null);
    if (error) errors.push(`Mehrdeutige Fälle: ${error.message}`);
  }
  if (plan.unmatchedIntentIds.length) {
    const staleIds = new Set(plan.staleUnmatchedIntentIds);
    const recentIds = plan.unmatchedIntentIds.filter((id) => !staleIds.has(id));
    if (recentIds.length) {
      const { error } = await db.from("kassen_zahlungen")
        .update({ abgleich_status: "offen" })
        .in("id", recentIds)
        .is("transaktion_id", null);
      if (error) errors.push(`Aktuelle offene Fälle: ${error.message}`);
    }
  }
  if (plan.staleUnmatchedIntentIds.length) {
    const { error } = await db.from("kassen_zahlungen")
      .update({ abgleich_status: "kein_geldeingang" })
      .in("id", plan.staleUnmatchedIntentIds)
      .is("transaktion_id", null);
    if (error) errors.push(`Überfällige offene Fälle: ${error.message}`);
  }

  let linked = 0;
  for (const { intent, transaction } of plan.matches) {
    const reconciledAt = new Date().toISOString();
    const realtime = transaction.datum === intent.kassen_datum ||
      /echtzeit|instant/i.test(transaction.verwendungszweck || "");

    const { data: updatedIntent, error: intentError } = await db
      .from("kassen_zahlungen")
      .update({
        transaktion_id: transaction.id,
        abgleich_status: "eingegangen",
        eingang_am: reconciledAt,
        eingang_typ: realtime ? "echtzeit" : "standard",
      })
      .eq("id", intent.id)
      .is("transaktion_id", null)
      .select("id")
      .maybeSingle();

    if (intentError || !updatedIntent) {
      errors.push(`Kassenbuchung ${intent.id}: ${intentError?.message || "parallel bereits bearbeitet"}`);
      continue;
    }
    linked += 1;

    const matchingDetails = {
      ...(transaction.matching_details || {}),
      name_score: transaction.matching_details?.name_score ?? 0,
      betrag_match: true,
      zweck_score: 100,
      methode: "animapay_kasse",
      quelle: "kasse",
      kassen_zahlung_id: intent.id,
      transfer_reconciled_at: reconciledAt,
    } as MatchingDetails & { kassen_zahlung_id: string; transfer_reconciled_at: string };
    const { error: transactionError } = await db
      .from("transaktionen")
      .update({
        matched_patient_id: intent.patient_id,
        matching_status: "auto",
        matching_score: 100,
        matching_details: matchingDetails,
        geprueft_am: reconciledAt,
      })
      .eq("id", transaction.id);

    if (transactionError) {
      errors.push(`Bankbuchung ${transaction.id}: ${transactionError.message}`);
      continue;
    }

    try {
      await applyConfirmedTransactionBooking(db, {
        id: transaction.id,
        betrag: transaction.betrag,
        datum: transaction.datum,
        verwendungszweck: transaction.verwendungszweck || "",
        matched_patient_id: intent.patient_id,
        matched_rate_id: transaction.matched_rate_id || null,
        matching_details: matchingDetails,
      });
    } catch (error) {
      errors.push(`Forderungsabgleich ${transaction.id}: ${String(error)}`);
    }

  }

  return {
    checked: intents.length,
    linked,
    ambiguous: plan.ambiguousIntentIds.length,
    unmatched: plan.unmatchedIntentIds.length,
    errors,
  };
}
