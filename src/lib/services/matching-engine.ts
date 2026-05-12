// ============================================================
// MATCHING ENGINE – Automatischer Ratenabgleich
// ============================================================
// Dieses Modul ist das Herzstück: Es nimmt eine Bankbuchung
// und findet automatisch den zugehörigen Patienten + Rate.
// ============================================================

import { createServerClient } from "../db/supabase";
import type { Transaktion, Rate, Patient, MatchingDetails } from "../types";

interface MatchResult {
  patient_id: string | null;
  rate_id: string | null;
  score: number;
  status: "auto" | "abweichung" | "unklar";
  details: MatchingDetails;
}

// ─── Hauptfunktion ──────────────────────────────────────────
export async function matchTransaction(transaktion: {
  absender_name: string;
  absender_iban: string | null;
  betrag: number;
  verwendungszweck: string;
}): Promise<MatchResult> {
  const db = createServerClient();

  // 1. Alle Patienten mit offenen Raten laden
  const { data: patienten } = await db
    .from("patients")
    .select(`
      id, vorname, nachname, email,
      raten!inner (
        id, rate_nummer, betrag, faellig_am, status, ratenplan_id
      )
    `)
    .eq("raten.status", "offen")
    .order("faellig_am", { referencedTable: "raten", ascending: true });

  if (!patienten?.length) {
    return { patient_id: null, rate_id: null, score: 0, status: "unklar", details: { name_score: 0, betrag_match: false, zweck_score: 0, methode: "manuell" } };
  }

  // 2. Einstellungen laden
  const { data: settings } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", "matching")
    .single();

  const config = settings?.value as { min_score: number; auto_approve_score: number; fuzzy_threshold: number } || {
    min_score: 70,
    auto_approve_score: 90,
    fuzzy_threshold: 0.7,
  };

  // 3. Für jeden Patienten Score berechnen
  let bestMatch: MatchResult = {
    patient_id: null,
    rate_id: null,
    score: 0,
    status: "unklar",
    details: { name_score: 0, betrag_match: false, zweck_score: 0, methode: "manuell" },
  };

  for (const patient of patienten) {
    const nameScore = calculateNameScore(
      transaktion.absender_name,
      `${patient.nachname} ${patient.vorname}`
    );

    // IBAN-Matching (höchste Priorität)
    const ibanMatch = transaktion.absender_iban
      ? await checkIBANMatch(db, transaktion.absender_iban, patient.id)
      : false;

    // Offene Raten durchgehen
    for (const rate of (patient as any).raten || []) {
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
      }
    }
  }

  return bestMatch;
}

// ─── Name-Matching ──────────────────────────────────────────
function calculateNameScore(bankName: string, patientName: string): number {
  const normalize = (s: string) =>
    s.toUpperCase()
      .replace(/[,.\-_\/\\]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      // Deutsche Umlaute normalisieren (Bank schreibt oft UE statt Ü)
      .replace(/UE/g, "Ü")
      .replace(/OE/g, "Ö")
      .replace(/AE/g, "Ä")
      .replace(/SS/g, "ß");

  const a = normalize(bankName);
  const b = normalize(patientName);

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

// ─── IBAN prüfen ────────────────────────────────────────────
async function checkIBANMatch(db: any, iban: string, patientId: string): Promise<boolean> {
  // Prüfe ob diese IBAN schon mal für diesen Patienten verwendet wurde
  const { data } = await db
    .from("transaktionen")
    .select("id")
    .eq("absender_iban", iban)
    .eq("matched_patient_id", patientId)
    .eq("matching_status", "auto")
    .limit(1);

  return (data?.length || 0) > 0;
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
    .gt("betrag", 0) // Nur Eingänge
    .order("datum", { ascending: false });

  if (!unmatched?.length) return stats;

  for (const tx of unmatched) {
    stats.total++;
    const result = await matchTransaction({
      absender_name: tx.absender_name || "",
      absender_iban: tx.absender_iban,
      betrag: tx.betrag,
      verwendungszweck: tx.verwendungszweck || "",
    });

    // Transaktion aktualisieren
    await db.from("transaktionen").update({
      matching_status: result.status,
      matched_patient_id: result.patient_id,
      matched_rate_id: result.rate_id,
      matching_score: result.score,
      matching_details: result.details,
    }).eq("id", tx.id);

    // Bei Auto-Match: Rate als bezahlt markieren
    if (result.status === "auto" && result.rate_id) {
      await db.from("raten").update({
        status: "bezahlt",
        bezahlt_am: tx.datum,
        bezahlt_betrag: tx.betrag,
        transaktion_id: tx.id,
      }).eq("id", result.rate_id);

      stats.auto++;
    } else if (result.status === "abweichung") {
      stats.abweichung++;
    } else {
      stats.unklar++;
    }
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
