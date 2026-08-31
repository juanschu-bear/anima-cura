import { createServerClient } from "../db/supabase";
import { applyReferenceMatch, extractUnserZeichen } from "./matching-engine";

type DatabaseClient = ReturnType<typeof createServerClient>;

type TxRow = {
  id: string;
  datum: string;
  betrag: number;
  verwendungszweck: string | null;
  matching_status: string | null;
  matched_patient_id: string | null;
  matching_details: Record<string, unknown> | null;
};

type OffenerPostenRow = {
  id: string;
  patient_id: string | null;
  unser_zeichen: string | null;
  offen: number | null;
  gezahlt: number | null;
  betrag: number | null;
  status: "offen" | "teilbezahlt" | "bezahlt" | "erloesminderung";
};

type ReferenceRepairResult = {
  patient_id: string | null;
  posten_id: string;
  status: "auto" | "abweichung";
  details: {
    name_score: number;
    betrag_match: boolean;
    zweck_score: number;
    methode: "referenz";
    referenz?: string;
    ueberzahlung?: number;
  };
  posten_update: {
    status: OffenerPostenRow["status"];
    gezahlt: number;
    offen: number;
    bezahlt_am: string | null;
  };
  ueberzahlung: number;
};

type MatchedCandidate = {
  tx: TxRow;
  posten: OffenerPostenRow;
  ref: ReferenceRepairResult;
};

const PLACEHOLDER_PATIENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function cents(n: number): number {
  return Math.round(n * 100);
}

function hasRepairMarker(details: Record<string, unknown> | null | undefined): boolean {
  return Boolean(details && typeof details === "object" && details.referenz_repair_applied_at);
}

function hasExactReference(purpose: string | null): boolean {
  if (!purpose) return false;
  return /\b\d{8}-\d+\/\d{4}(?:-\d+)?\b/.test(purpose.replace(/\s*([-/])\s*/g, "$1"));
}

async function fetchAllCandidates(db: DatabaseClient): Promise<TxRow[]> {
  const all: TxRow[] = [];
  let from = 0;
  const size = 1000;

  while (true) {
    const { data, error } = await db
      .from("transaktionen")
      .select("id, datum, betrag, verwendungszweck, matching_status, matched_patient_id, matching_details")
      .in("matching_status", ["auto", "manuell", "abweichung", "unklar"])
      .gt("betrag", 0)
      .range(from, from + size - 1)
      .order("datum", { ascending: true });

    if (error) throw error;
    const chunk = (data || []) as TxRow[];
    all.push(...chunk);
    if (chunk.length < size) break;
    from += size;
  }

  return all.filter((row) => hasExactReference(row.verwendungszweck));
}

async function fetchOpenPosten(db: DatabaseClient): Promise<Map<string, OffenerPostenRow>> {
  const byReference = new Map<string, OffenerPostenRow>();
  let from = 0;
  const size = 1000;

  while (true) {
    const { data, error } = await db
      .from("offene_posten")
      .select("id, patient_id, unser_zeichen, offen, gezahlt, betrag, status")
      .in("status", ["offen", "teilbezahlt"])
      .range(from, from + size - 1)
      .order("rechnung_datum", { ascending: true });

    if (error) throw error;
    const chunk = (data || []) as OffenerPostenRow[];
    for (const row of chunk) {
      if (row.unser_zeichen) byReference.set(row.unser_zeichen, row);
    }
    if (chunk.length < size) break;
    from += size;
  }

  return byReference;
}

function buildReferenceResult(tx: TxRow, posten: OffenerPostenRow): ReferenceRepairResult {
  const offenVorher = Number(posten.offen ?? posten.betrag ?? 0);
  const gezahltVorher = Number(posten.gezahlt ?? 0);
  const zahlung = Number(tx.betrag);
  const diff = cents(zahlung) - cents(offenVorher);

  let neuerStatus: OffenerPostenRow["status"];
  let ueberzahlung = 0;
  let offenNachher = offenVorher - zahlung;
  let bezahltAm: string | null = null;

  if (diff === 0) {
    neuerStatus = "bezahlt";
    offenNachher = 0;
    bezahltAm = tx.datum;
  } else if (diff < 0) {
    neuerStatus = "teilbezahlt";
  } else {
    neuerStatus = "bezahlt";
    offenNachher = 0;
    bezahltAm = tx.datum;
    ueberzahlung = diff / 100;
  }

  return {
    patient_id: posten.patient_id,
    posten_id: posten.id,
    status: ueberzahlung > 0 && !posten.patient_id ? "abweichung" : "auto",
    details: {
      name_score: 0,
      betrag_match: diff === 0,
      zweck_score: 100,
      methode: "referenz",
      referenz: posten.unser_zeichen || undefined,
      ueberzahlung: ueberzahlung || undefined,
    },
    posten_update: {
      status: neuerStatus,
      gezahlt: gezahltVorher + zahlung,
      offen: offenNachher,
      bezahlt_am: bezahltAm,
    },
    ueberzahlung,
  };
}

async function clearPlaceholderMatches(db: DatabaseClient, dryRun: boolean) {
  const { data, error } = await db
    .from("transaktionen")
    .select("id, verwendungszweck, matching_details")
    .eq("matched_patient_id", PLACEHOLDER_PATIENT_ID);

  if (error) throw error;
  const rows = data || [];

  if (!dryRun) {
    for (const row of rows) {
      const nextDetails = {
        ...((row.matching_details as Record<string, unknown> | null) || {}),
        placeholder_patient_cleared_at: new Date().toISOString(),
      };

      const { error: updateError } = await db
        .from("transaktionen")
        .update({
          matched_patient_id: null,
          matching_status: "unklar",
          geprueft_am: null,
          matching_details: nextDetails,
        })
        .eq("id", row.id);

      if (updateError) throw updateError;
    }
  }

  return {
    count: rows.length,
    sample: rows.slice(0, 5).map((row) => ({
      id: row.id,
      verwendungszweck: row.verwendungszweck,
    })),
  };
}

export async function syncOpenItemsByReference(options: {
  db?: DatabaseClient;
  dryRun?: boolean;
}) {
  const db = options.db ?? createServerClient();
  const dryRun = options.dryRun ?? false;
  const offenePostenByReference = await fetchOpenPosten(db);
  const candidates = await fetchAllCandidates(db);
  const placeholder = await clearPlaceholderMatches(db, dryRun);

  const summary = {
    dryRun,
    placeholderClears: placeholder.count,
    candidatesScanned: candidates.length,
    skippedAlreadyRepaired: 0,
    matchedByExactReference: 0,
    unmatchedAfterStrictReference: 0,
    updatedOpenItems: 0,
    sampleApplied: [] as Array<Record<string, unknown>>,
    sampleUnmatched: [] as Array<Record<string, unknown>>,
    placeholderSample: placeholder.sample,
  };

  const matchedCandidates: MatchedCandidate[] = [];

  for (const tx of candidates) {
    if (hasRepairMarker(tx.matching_details)) {
      summary.skippedAlreadyRepaired += 1;
      continue;
    }

    const token = extractUnserZeichen(tx.verwendungszweck || "");
    const posten = token.full ? offenePostenByReference.get(token.full) : null;
    const ref = posten ? buildReferenceResult(tx, posten) : null;

    if (!posten || !ref) {
      summary.unmatchedAfterStrictReference += 1;
      if (summary.sampleUnmatched.length < 10) {
        summary.sampleUnmatched.push({
          txId: tx.id,
          datum: tx.datum,
          betrag: tx.betrag,
          referenz: token.full,
          status: tx.matching_status,
          verwendungszweck: tx.verwendungszweck,
        });
      }
      continue;
    }

    summary.matchedByExactReference += 1;
    matchedCandidates.push({ tx, posten, ref });

    if (summary.sampleApplied.length < 15) {
      summary.sampleApplied.push({
        txId: tx.id,
        datum: tx.datum,
        betrag: tx.betrag,
        statusBefore: tx.matching_status,
        postenId: ref.posten_id,
        referenz: ref.details.referenz,
        newPostenStatus: ref.posten_update.status,
        newOffen: ref.posten_update.offen,
      });
    }
  }

  if (dryRun) {
    return summary;
  }

  const groups = new Map<string, MatchedCandidate[]>();
  for (const item of matchedCandidates) {
    const key = item.ref.details.referenz || item.posten.id;
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  const groupedItems = Array.from(groups.values()).map((items) =>
    items.sort((a, b) => `${a.tx.datum}-${a.tx.id}`.localeCompare(`${b.tx.datum}-${b.tx.id}`))
  );

  async function processGroup(items: MatchedCandidate[]) {
    for (const item of items) {
      const nextDetails = {
        ...((item.tx.matching_details || {}) as Record<string, unknown>),
        ...item.ref.details,
        referenz_repair_applied_at: new Date().toISOString(),
        referenz_repair_mode: "apply",
      };

      await applyReferenceMatch(db, item.tx.id, { datum: item.tx.datum }, item.ref, nextDetails);
      summary.updatedOpenItems += 1;

      const key = item.ref.details.referenz || "";
      if (!key) continue;
      if (item.ref.posten_update.status === "bezahlt") {
        offenePostenByReference.delete(key);
      } else {
        offenePostenByReference.set(key, {
          id: item.posten.id,
          patient_id: item.posten.patient_id,
          unser_zeichen: item.posten.unser_zeichen,
          offen: item.ref.posten_update.offen,
          gezahlt: item.ref.posten_update.gezahlt,
          betrag: item.posten.betrag,
          status: item.ref.posten_update.status,
        });
      }
    }
  }

  const concurrency = 20;
  for (let index = 0; index < groupedItems.length; index += concurrency) {
    await Promise.all(groupedItems.slice(index, index + concurrency).map((items) => processGroup(items)));
  }

  return summary;
}
