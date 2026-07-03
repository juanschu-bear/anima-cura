// ============================================================
// MATCHING ENGINE – Automatischer Ratenabgleich
// ============================================================
// Dieses Modul ist das Herzstück: Es nimmt eine Bankbuchung
// und findet automatisch den zugehörigen Patienten + Rate.
// ============================================================

import { createServerClient } from "../db/supabase";
import type { MatchingDetails } from "../types";
import { allocatePaymentToRates } from "../raten/reconciliation";

interface MatchResult {
  patient_id: string | null;
  rate_id: string | null;
  score: number;
  status: "auto" | "abweichung" | "unklar";
  details: MatchingDetails;
}

interface MatchingConfig {
  min_score: number;
  auto_approve_score: number;
  fuzzy_threshold: number;
}

interface RateCandidate {
  id: string;
  rate_nummer: number;
  betrag: number;
  faellig_am: string;
  status: string;
  ratenplan_id: string | null;
  bezahlt_betrag?: number | null;
}

interface PatientCandidate {
  id: string;
  vorname: string;
  nachname: string;
  normalizedNachname: string;
  raten: RateCandidate[];
}

type IbanHistoryMap = Map<string, Set<string>>;

const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  min_score: 70,
  auto_approve_score: 80,
  fuzzy_threshold: 0.7,
};

function createUnklarResult(): MatchResult {
  return {
    patient_id: null,
    rate_id: null,
    score: 0,
    status: "unklar",
    details: { name_score: 0, betrag_match: false, zweck_score: 0, methode: "manuell" },
  };
}

function normalizeMatchText(input: string): string {
  return input
    .toUpperCase()
    .replace(/[,.\-_\/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/UE/g, "Ü")
    .replace(/OE/g, "Ö")
    .replace(/AE/g, "Ä")
    .replace(/SS/g, "ß");
}

function normalizeIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  return iban.replace(/\s+/g, "").toUpperCase();
}

async function loadMatchingConfig(db: ReturnType<typeof createServerClient>): Promise<MatchingConfig> {
  const { data: settings } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", "matching")
    .single();

  return {
    ...DEFAULT_MATCHING_CONFIG,
    ...((settings?.value as Partial<MatchingConfig> | null) ?? {}),
  };
}

async function loadPatientCandidates(db: ReturnType<typeof createServerClient>): Promise<PatientCandidate[]> {
  const { data: patienten } = await db
    .from("patients")
    .select(`
      id, vorname, nachname, email,
      raten!inner (
        id, rate_nummer, betrag, faellig_am, status, ratenplan_id, bezahlt_betrag
      )
    `)
    .in("raten.status", ["offen", "teilbezahlt", "überfällig"])
    .order("faellig_am", { referencedTable: "raten", ascending: true });

  return (patienten ?? []).map((patient) => ({
    id: patient.id,
    vorname: patient.vorname,
    nachname: patient.nachname,
    normalizedNachname: normalizeMatchText(patient.nachname || ""),
    raten: ((patient as { raten?: RateCandidate[] }).raten ?? []).map((rate) => ({
      id: rate.id,
      rate_nummer: rate.rate_nummer,
      betrag: rate.status === "teilbezahlt"
        ? Math.max(0, Number(rate.betrag) - Number(rate.bezahlt_betrag || 0))
        : rate.betrag,
      faellig_am: rate.faellig_am,
      status: rate.status,
      ratenplan_id: rate.ratenplan_id,
      bezahlt_betrag: rate.bezahlt_betrag,
    })),
  }));
}

async function loadIbanHistoryMap(db: ReturnType<typeof createServerClient>): Promise<IbanHistoryMap> {
  const { data } = await db
    .from("transaktionen")
    .select("absender_iban, matched_patient_id")
    .eq("matching_status", "auto")
    .not("absender_iban", "is", null)
    .not("matched_patient_id", "is", null);

  const ibanHistory = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const iban = normalizeIban(row.absender_iban);
    const patientId = row.matched_patient_id;
    if (!iban || !patientId) continue;
    const known = ibanHistory.get(iban) ?? new Set<string>();
    known.add(patientId);
    ibanHistory.set(iban, known);
  }

  return ibanHistory;
}

function hasIbanHistory(ibanHistory: IbanHistoryMap, iban: string | null, patientId: string): boolean {
  const normalizedIban = normalizeIban(iban);
  if (!normalizedIban) return false;
  return ibanHistory.get(normalizedIban)?.has(patientId) ?? false;
}

function rememberIbanMatch(ibanHistory: IbanHistoryMap, iban: string | null, patientId: string | null) {
  const normalizedIban = normalizeIban(iban);
  if (!normalizedIban || !patientId) return;
  const known = ibanHistory.get(normalizedIban) ?? new Set<string>();
  known.add(patientId);
  ibanHistory.set(normalizedIban, known);
}

function applyRateUpdatesToCandidates(patienten: PatientCandidate[], updates: Array<{ id: string; status: string; bezahlt_betrag: number }>) {
  if (!updates.length) return;
  for (const patient of patienten) {
    patient.raten = patient.raten.flatMap((rate) => {
      const update = updates.find((item) => item.id === rate.id);
      if (!update) return [rate];
      if (update.status === "bezahlt") return [];
      const original = Number(rate.bezahlt_betrag || 0) + Number(rate.betrag || 0);
      return [{
        ...rate,
        status: update.status,
        bezahlt_betrag: update.bezahlt_betrag,
        betrag: Math.max(0, original - Number(update.bezahlt_betrag || 0)),
      }];
    });
  }
}

// ─── Hauptfunktion ──────────────────────────────────────────
export function matchTransaction(
  transaktion: {
  absender_name: string;
  absender_iban: string | null;
  betrag: number;
  verwendungszweck: string;
  },
  patienten: PatientCandidate[],
  ibanHistory: IbanHistoryMap,
  config: MatchingConfig
): MatchResult {
  if (!patienten.length) {
    return createUnklarResult();
  }

  // 3. Für jeden Patienten Score berechnen
  let bestMatch: MatchResult = createUnklarResult();
  let bestMatchNachname: string | null = null;
  const strongHitsByNachname = new Map<string, Set<string>>();

  for (const patient of patienten) {
    const nameScore = calculateNameScore(
      transaktion.absender_name,
      `${patient.nachname || ""} ${patient.vorname || ""}`
    );

    // IBAN-Matching (höchste Priorität)
    const ibanMatch = hasIbanHistory(ibanHistory, transaktion.absender_iban, patient.id);

    // Offene Raten durchgehen
    for (const rate of patient.raten || []) {
      const betragMatch = Math.abs(transaktion.betrag - rate.betrag) < 0.01;
      const betragNah = Math.abs(transaktion.betrag - rate.betrag) / rate.betrag < 0.1; // 10% Toleranz
      const zweckScore = calculateZweckScore(transaktion.verwendungszweck, rate.rate_nummer);

      // Gesamtscore berechnen
      let score = 0;
      let methode: MatchingDetails["methode"] = "fuzzy";

      if (ibanMatch) {
        score = 95;
        methode = "iban";
        if (betragMatch) score = 100;
      } else if (nameScore >= 0.9 && betragMatch) {
        score = 95;
        methode = "exakt";
      } else if (nameScore >= config.fuzzy_threshold) {
        score = Math.round(nameScore * 60);
        if (betragMatch) score += 30;
        else if (betragNah) score += 15;
        if (zweckScore > 0) score += 10;
        methode = "fuzzy";
      }

      if (score >= config.auto_approve_score && betragMatch) {
        const kandidaten = strongHitsByNachname.get(patient.normalizedNachname) ?? new Set<string>();
        kandidaten.add(patient.id);
        strongHitsByNachname.set(patient.normalizedNachname, kandidaten);
      }

      if (score > bestMatch.score) {
        const isAbweichung = score >= config.min_score && !betragMatch && betragNah;
        bestMatch = {
          patient_id: patient.id,
          rate_id: rate.id,
          score,
          status: score >= config.auto_approve_score
            ? "auto"
            : isAbweichung
            ? "abweichung"
            : score >= config.min_score
            ? "abweichung"
            : "unklar",
          details: {
            name_score: Math.round(nameScore * 100),
            betrag_match: betragMatch,
            zweck_score: Math.round(zweckScore * 100),
            methode,
          },
        };
        bestMatchNachname = patient.normalizedNachname;
      }
    }
  }

  if (
    bestMatch.patient_id &&
    bestMatchNachname &&
    bestMatch.details.betrag_match &&
    bestMatch.score >= config.auto_approve_score &&
    (strongHitsByNachname.get(bestMatchNachname)?.size ?? 0) >= 2
  ) {
    return {
      ...bestMatch,
      score: Math.min(79, config.auto_approve_score - 1),
      status: "abweichung",
      details: {
        ...bestMatch.details,
        mehrdeutig: true,
      },
    };
  }

  return bestMatch;
}

// ─── Name-Matching ──────────────────────────────────────────
function calculateNameScore(bankName: string, patientName: string): number {
  const a = normalizeMatchText(bankName);
  const b = normalizeMatchText(patientName);

  // Exakte Übereinstimmung
  if (a === b) return 1.0;

  // Enthält den vollen Namen
  if (a.includes(b) || b.includes(a)) return 0.95;

  // Nachname-Matching
  const partsA = a.split(" ");
  const partsB = b.split(" ");

  // Nachname ist das erste oder letzte Wort
  const nachnameB = partsB[0]; // Nachname zuerst bei uns
  if (partsA.some(p => p === nachnameB)) {
    // Nachname gefunden, Vorname prüfen
    const vornameB = partsB[partsB.length - 1];
    if (partsA.some(p => p === vornameB)) return 0.95;
    if (partsA.some(p => p.startsWith(vornameB.substring(0, 3)))) return 0.85;
    return 0.7; // Nur Nachname gefunden
  }

  // Levenshtein-basierter Fuzzy-Match
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const similarity = 1 - distance / maxLen;

  return similarity;
}

// ─── Verwendungszweck-Analyse ───────────────────────────────
function calculateZweckScore(zweck: string, rateNummer: number): number {
  if (!zweck) return 0;
  const z = zweck.toLowerCase();
  let score = 0;

  // KFO-bezogene Keywords
  const keywords = ["kfo", "kieferorth", "rate", "behandlung", "zahnarzt", "aligner", "bracket", "retainer", "invisalign"];
  if (keywords.some(k => z.includes(k))) score += 0.5;

  // Ratennummer im Verwendungszweck
  if (z.includes(`rate ${rateNummer}`) || z.includes(`rate nr ${rateNummer}`) || z.includes(`nr. ${rateNummer}`)) {
    score += 0.5;
  }

  return Math.min(score, 1.0);
}

// ─── Levenshtein-Distanz ────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// ─── Batch-Matching (für Cron) ──────────────────────────────
// ─── Stufe 0: Referenz-Abgleich (deterministisch) ───────────
// Zieht das unser_zeichen aus dem Verwendungszweck und gleicht es direkt
// gegen offene_posten ab. Hoechste Sicherheit, schlaegt jeden Fuzzy-Treffer
// und funktioniert auch bei Fremdzahlern (Name egal, Referenz zaehlt).

interface OffenerPosten {
  id: string;
  unser_zeichen: string;
  basis_nr: string;
  offen: number | null;
  gezahlt: number | null;
  betrag: number | null;
  status: "offen" | "teilbezahlt" | "bezahlt" | "erloesminderung";
  patient_id: string | null;
}

// Cent-genauer Vergleich, vermeidet Fliesskomma-Fehler.
function cents(n: number): number {
  return Math.round(n * 100);
}

// Erkennt unser_zeichen wie "00005988-1/2026" und die 8-stellige Basis (ivoris_nummer).
export function extractUnserZeichen(verwendungszweck: string): { full: string | null; base: string | null } {
  if (!verwendungszweck) return { full: null, base: null };
  const norm = verwendungszweck.replace(/\s*([-/])\s*/g, "$1");
  const m = norm.match(/(\d{8})-(\d+)\/(\d{4})/);
  if (m) return { full: m[0], base: m[1] };
  const b = norm.match(/(?<!\d)(\d{8})(?!\d)/);
  return { full: null, base: b ? b[1] : null };
}

export interface ReferenceResult {
  patient_id: string | null;
  posten_id: string;
  status: "auto" | "abweichung";
  details: MatchingDetails;
  posten_update: { status: OffenerPosten["status"]; gezahlt: number; offen: number; bezahlt_am: string | null };
  ueberzahlung: number;
}

// Verrechnet eine Ueberzahlung mit den naechsten offenen Posten des Patienten
// (aeltester zuerst). Der unverbrauchte Rest wird als Guthaben am Patienten geparkt.
async function applyUeberzahlung(
  db: ReturnType<typeof createServerClient>,
  patientId: string | null,
  excess: number,
  excludePostenId: string,
  datum: string
): Promise<void> {
  if (!patientId || cents(excess) <= 0) return;
  let rest = excess;

  const { data: weitere } = await db
    .from("offene_posten")
    .select("id, offen, betrag, gezahlt")
    .eq("patient_id", patientId)
    .in("status", ["offen", "teilbezahlt"])
    .neq("id", excludePostenId)
    .order("rechnung_datum", { ascending: true });

  for (const p of (weitere || []) as { id: string; offen: number | null; betrag: number | null; gezahlt: number | null }[]) {
    if (cents(rest) <= 0) break;
    const offen = p.offen != null ? p.offen : (p.betrag || 0);
    if (cents(offen) <= 0) continue;
    const anrechnung = Math.min(rest, offen);
    const neuOffen = offen - anrechnung;
    const bezahlt = cents(neuOffen) === 0;
    await db.from("offene_posten").update({
      offen: neuOffen,
      gezahlt: (p.gezahlt || 0) + anrechnung,
      status: bezahlt ? "bezahlt" : "teilbezahlt",
      bezahlt_am: bezahlt ? datum : null,
    }).eq("id", p.id);
    rest -= anrechnung;
  }

  if (cents(rest) > 0) {
    const { data: pat } = await db
      .from("patients")
      .select("guthaben")
      .eq("id", patientId)
      .single();
    const aktuell = ((pat?.guthaben as number | null) ?? 0);
    await db.from("patients").update({ guthaben: aktuell + rest }).eq("id", patientId);
  }
}

// Gibt null zurueck, wenn keine eindeutige Referenz gefunden wird (dann greift Stufe 1).
export async function reconcileByReference(
  db: ReturnType<typeof createServerClient>,
  tx: { betrag: number; verwendungszweck: string; datum: string }
): Promise<ReferenceResult | null> {
  const { full, base } = extractUnserZeichen(tx.verwendungszweck);
  if (!full && !base) return null;

  let posten: OffenerPosten | null = null;

  if (full) {
    const { data } = await db
      .from("offene_posten")
      .select("id, unser_zeichen, basis_nr, offen, gezahlt, betrag, status, patient_id")
      .eq("unser_zeichen", full)
      .neq("status", "bezahlt")
      .limit(1);
    posten = (data?.[0] as OffenerPosten) || null;
  }

  // Fallback: nur zuordnen, wenn genau ein offener Posten zur 8-stelligen Basis existiert.
  if (!posten && base) {
    const { data } = await db
      .from("offene_posten")
      .select("id, unser_zeichen, basis_nr, offen, gezahlt, betrag, status, patient_id")
      .eq("basis_nr", base)
      .neq("status", "bezahlt")
      .order("rechnung_datum", { ascending: true })
      .limit(2);
    if (data && data.length === 1) posten = data[0] as OffenerPosten;
  }

  if (!posten) return null;

  const offenVorher = posten.offen != null ? posten.offen : (posten.betrag || 0);
  const gezahltVorher = posten.gezahlt || 0;
  const zahlung = tx.betrag;
  const diff = cents(zahlung) - cents(offenVorher);

  let neuerStatus: OffenerPosten["status"];
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
    status: (ueberzahlung > 0 && !posten.patient_id) ? "abweichung" : "auto",
    details: { name_score: 0, betrag_match: diff === 0, zweck_score: 100, methode: "referenz", referenz: posten.unser_zeichen, ueberzahlung: ueberzahlung || undefined },
    posten_update: { status: neuerStatus, gezahlt: gezahltVorher + zahlung, offen: offenNachher, bezahlt_am: bezahltAm },
    ueberzahlung,
  };
}

// Die vier Konten der Praxis (Sparkasse Leipzig). Eingaenge von diesen
// IBANs sind Umbuchungen zwischen eigenen Konten, kein Patientengeld.
const EIGENE_IBANS = new Set([
  "DE28860555921090118976",
  "DE17860555921632044206",
  "DE03860555921090118941",
  "DE51860555921090118950",
]);

export async function runBatchMatching(): Promise<{
  total: number;
  auto: number;
  abweichung: number;
  unklar: number;
}> {
  const db = createServerClient();
  const stats = { total: 0, auto: 0, abweichung: 0, unklar: 0 };

  // Alle ungematchten Transaktionen laden
  const { data: unmatched } = await db
    .from("transaktionen")
    .select("*")
    .eq("matching_status", "unklar")
    .is("geprueft_am", null)
    .gt("betrag", 0) // Nur Eingänge
    .order("datum", { ascending: false })
    .limit(500);

  if (!unmatched?.length) return stats;

  const [config, patienten, ibanHistory] = await Promise.all([
    loadMatchingConfig(db),
    loadPatientCandidates(db),
    loadIbanHistoryMap(db),
  ]);

  for (const tx of unmatched) {
    stats.total++;

    // Kategorisierer: Nicht-Patientenzahlungen sofort aussortieren.
    // kzv: Quartalsgelder der Kassenseite. umbuchung: Transfers zwischen
    // den eigenen Praxiskonten. kartenterminal: Sammler und Rueckgaben.
    const zweckUndAbsender = `${tx.verwendungszweck || ""} ${tx.absender_name || ""}`;
    const absenderIban = (tx.absender_iban || "").replace(/\s/g, "").toUpperCase();
    let kategorie: string | null = null;
    if (/\bkzv\b/i.test(tx.absender_name || "")) {
      kategorie = "kzv";
    } else if (EIGENE_IBANS.has(absenderIban)) {
      kategorie = "umbuchung";
    } else if (/kartenumsaetze|payone|rueckueberweisung/i.test(zweckUndAbsender)) {
      kategorie = "kartenterminal";
    } else if (/eink\.st|aufl(ö|oe)sung konto|kontoaufl(ö|oe)sung|kontosaldos wegen|kartenbeladung|miet(ü|ue)berschuss|schaden-nr|maximalentschaedigung/i.test(zweckUndAbsender)) {
      // Sonderverkehr: Steuererstattungen, Kontoaufloesungen, Versicherung,
      // Miete u.ae. - legitime Eingaenge, aber kein Patientengeld.
      kategorie = "sonderverkehr";
    }
    if (kategorie) {
      await db.from("transaktionen").update({
        matching_status: "ignoriert",
        matching_details: { methode: "kategorie", name_score: 0, betrag_match: false, zweck_score: 0, kategorie },
        // Terminal-Buendel warten auf den Abgleich mit den Praxis-Listen.
        ...(kategorie === "kartenterminal" ? { abgleich_status: "offen" } : {}),
        geprueft_am: new Date().toISOString(),
      }).eq("id", tx.id);
      continue;
    }

    // Stufe 0: deterministischer Referenz-Abgleich gegen offene_posten.
    const ref = await reconcileByReference(db, {
      betrag: tx.betrag,
      verwendungszweck: tx.verwendungszweck || "",
      datum: tx.datum,
    });
    if (ref) {
      await db.from("offene_posten").update({
        status: ref.posten_update.status,
        gezahlt: ref.posten_update.gezahlt,
        offen: ref.posten_update.offen,
        bezahlt_am: ref.posten_update.bezahlt_am,
      }).eq("id", ref.posten_id);

      await db.from("transaktionen").update({
        matching_status: ref.status,
        matched_patient_id: ref.patient_id,
        matching_score: 100,
        matching_details: ref.details,
        geprueft_am: new Date().toISOString(),
      }).eq("id", tx.id);

      if (ref.ueberzahlung > 0) {
        await applyUeberzahlung(db, ref.patient_id, ref.ueberzahlung, ref.posten_id, tx.datum);
      }

      if (ref.status === "auto") stats.auto++;
      else stats.abweichung++;
      continue;
    }

    const result = matchTransaction(
      {
        absender_name: tx.absender_name || "",
        absender_iban: tx.absender_iban,
        betrag: tx.betrag,
        verwendungszweck: tx.verwendungszweck || "",
      },
      patienten,
      ibanHistory,
      config
    );

    // Transaktion aktualisieren
    await db.from("transaktionen").update({
      matching_status: result.status,
      matched_patient_id: result.patient_id,
      matched_rate_id: result.rate_id,
      matching_score: result.score,
      matching_details: result.details,
      geprueft_am: new Date().toISOString(),
    }).eq("id", tx.id);

    // Bei Auto-Match: Zahlung sequentiell ueber offene/teiloffene Raten verteilen.
    if (result.status === "auto" && result.rate_id) {
      const { data: offeneRaten } = await db
        .from("raten")
        .select("id, rate_nummer, betrag, faellig_am, status, ratenplan_id, bezahlt_betrag")
        .eq("patient_id", result.patient_id)
        .in("status", ["offen", "teilbezahlt", "überfällig"])
        .order("faellig_am", { ascending: true })
        .order("rate_nummer", { ascending: true });

      const allocation = allocatePaymentToRates(offeneRaten || [], Number(tx.betrag) || 0, tx.datum, tx.id);
      for (const update of allocation.updates) {
        await db.from("raten").update({
          status: update.status,
          bezahlt_am: update.bezahlt_am,
          bezahlt_betrag: update.bezahlt_betrag,
          transaktion_id: update.transaktion_id,
        }).eq("id", update.id);
      }

      rememberIbanMatch(ibanHistory, tx.absender_iban, result.patient_id);
      applyRateUpdatesToCandidates(patienten, allocation.updates);
      stats.auto++;
    } else if (result.status === "abweichung") {
      stats.abweichung++;
    } else {
      stats.unklar++;
    }
  }

  // Stufe 2: set-basierte Nachlaeufe in der Datenbank, alle nur als
  // Vorschlag (status 'abweichung') bei genau einem Kandidaten.
  // Reihenfolge nach Verlaesslichkeit:
  // Rechnungszeichen (95, korrigiert auch schwaechere Namens-Vorschlaege)
  // -> exakte Namen (80) -> Namensbausteine/Geschwister (75/70)
  // -> Tippfehler (65).
  const { data: refMatches } = await db.rpc("ac_match_referenz");
  if (Array.isArray(refMatches) && refMatches[0]) {
    const neu = Number(refMatches[0].neu) || 0;
    stats.total += neu;
    stats.abweichung += neu;
  }

  const { data: nameMatches, error: nameError } = await db.rpc("ac_match_names");
  if (!nameError && typeof nameMatches === "number" && nameMatches > 0) {
    stats.total += nameMatches;
    stats.abweichung += nameMatches;
  }

  const { data: v2Matches } = await db.rpc("ac_match_names_v2");
  if (Array.isArray(v2Matches)) {
    for (const zeile of v2Matches) {
      const n = Number(zeile.zugeordnet) || 0;
      stats.total += n;
      stats.abweichung += n;
    }
  }

  const { data: typoMatches } = await db.rpc("ac_match_typos");
  if (typeof typoMatches === "number" && typoMatches > 0) {
    stats.total += typoMatches;
    stats.abweichung += typoMatches;
  }

  // AUFLADUNG-Eingaenge: Guthaben-Gutschrift (Anima Balance).
  // Den Zweck 'AUFLADUNG <Patientennummer> <Name>' erzeugt unser
  // eigenes Portal, der Eingang ist also Beweisklasse 100. Jede
  // Gutschrift referenziert die Bankzahlung und ist dadurch
  // dublettensicher (eine Transaktion, eine Buchung).
  const { data: aufladungsKandidaten } = await db
    .from("transaktionen")
    .select("id, betrag, verwendungszweck")
    .gt("betrag", 0)
    .ilike("verwendungszweck", "%AUFLADUNG%");
  for (const tx of aufladungsKandidaten || []) {
    const nummer = (tx.verwendungszweck || "").match(/AUFLADUNG\s+(\d{8})/i)?.[1];
    if (!nummer) continue;
    const { data: vorhandene } = await db
      .from("anima_balance_buchungen")
      .select("id")
      .eq("referenz_transaktion_id", tx.id)
      .limit(1);
    if (vorhandene?.length) continue;
    const { data: pat } = await db
      .from("patients")
      .select("id")
      .eq("ivoris_nummer", nummer)
      .maybeSingle();
    if (!pat) continue;
    await db.from("anima_balance_buchungen").insert({
      patient_id: pat.id,
      betrag: tx.betrag,
      typ: "aufladung",
      beschreibung: "per QR",
      referenz_transaktion_id: tx.id,
    });
    await db.from("transaktionen").update({
      matched_patient_id: pat.id,
      matching_status: "auto",
      matching_score: 100,
      matching_details: { methode: "animapay_aufladung", quelle: "portal" },
      geprueft_am: new Date().toISOString(),
    }).eq("id", tx.id);
  }

  // Beweisklasse 90+ bucht die Engine selbst fest: Was per Nummern-
  // oder Kombibeweis gefunden wurde, braucht keinen menschlichen
  // Haken mehr. (Vorsichtsregel vom 05.06.2026 aufgehoben; der
  // Ideal-Flow QR -> Eingang -> auto soll ohne Handgriff schliessen.)
  const { data: festgebucht } = await db
    .from("transaktionen")
    .update({ matching_status: "auto", geprueft_am: new Date().toISOString() })
    .eq("matching_status", "abweichung")
    .gte("matching_score", config.auto_approve_score)
    .select("id");
  const autoGebucht = Array.isArray(festgebucht) ? festgebucht.length : 0;
  if (autoGebucht > 0) {
    stats.abweichung = Math.max(0, stats.abweichung - autoGebucht);
  }

  // Alert erstellen
  await db.from("alerts").insert({
    typ: "matching",
    titel: `Ratenabgleich: ${stats.auto} automatisch, ${stats.abweichung} Abweichungen`,
    beschreibung: `${stats.total} Transaktionen verarbeitet. ${stats.auto} automatisch zugeordnet, ${stats.abweichung} mit Abweichung, ${stats.unklar} manuell zu prüfen.`,
    schweregrad: stats.abweichung > 0 ? "warnung" : "info",
    empfaenger: "sabine",
  });

  return stats;
}
