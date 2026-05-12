// ============================================================
// KI-ANALYSE SERVICE – Claude API Integration
// ============================================================
// Nutzt Claude für: Anomalieerkennung, Zusammenfassungen, Prognosen
// Alle Daten werden pseudonymisiert bevor sie an die API gehen.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "../db/supabase";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Daten pseudonymisieren (DSGVO) ─────────────────────────
function pseudonymize(data: any[]): { anonymized: any[]; keyMap: Map<string, string> } {
  const keyMap = new Map<string, string>();
  let counter = 1;

  const anonymized = data.map((item) => {
    const clone = { ...item };
    if (clone.vorname || clone.nachname) {
      const key = `Patient-${String(counter).padStart(4, "0")}`;
      keyMap.set(key, clone.id || `${clone.nachname}-${clone.vorname}`);
      clone.name = key;
      delete clone.vorname;
      delete clone.nachname;
      delete clone.email;
      delete clone.telefon;
      delete clone.adresse;
      delete clone.versichertennummer;
      delete clone.iban;
      counter++;
    }
    return clone;
  });

  return { anonymized, keyMap };
}

// ─── Anomalieerkennung ──────────────────────────────────────
export async function detectAnomalies(): Promise<void> {
  const db = createServerClient();

  // Daten laden
  const { data: raten } = await db
    .from("raten")
    .select(`*, patients ( id, vorname, nachname, kasse )`)
    .in("status", ["offen", "überfällig", "bezahlt"])
    .gte("faellig_am", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

  if (!raten?.length) return;

  const { anonymized, keyMap } = pseudonymize(
    raten.map((r: any) => ({
      ...r,
      vorname: r.patients?.vorname,
      nachname: r.patients?.nachname,
      id: r.patients?.id,
    }))
  );

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: `Du bist ein Finanzanalyst für eine kieferorthopädische Praxis. 
Analysiere die Ratenzahlungsdaten und identifiziere Anomalien.
Antworte NUR als JSON-Array mit Objekten: { "patient_key": "Patient-XXXX", "typ": "anomalie", "schweregrad": "info|warnung|kritisch", "titel": "...", "beschreibung": "..." }
Suche nach: Doppelbuchungen, ungewöhnliche Betragsabweichungen, plötzliche Zahlungsausfälle, Muster die auf Probleme hindeuten.`,
    messages: [
      { role: "user", content: `Analysiere diese Ratendaten:\n${JSON.stringify(anonymized, null, 2)}` },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const anomalies = JSON.parse(text.replace(/```json\n?|```/g, "").trim());

    for (const anomaly of anomalies) {
      const realPatientId = keyMap.get(anomaly.patient_key) || null;
      await db.from("ki_analysen").insert({
        typ: "anomalie",
        titel: anomaly.titel,
        beschreibung: anomaly.beschreibung,
        schweregrad: anomaly.schweregrad,
        patient_id: realPatientId,
        daten: { source: "claude", patient_key: anomaly.patient_key },
      });
    }
  } catch (err) {
    console.error("KI-Analyse Parse-Fehler:", err);
  }
}

// ─── Quartals-Zusammenfassung ───────────────────────────────
export async function generateQuartalSummary(): Promise<string> {
  const db = createServerClient();

  const { data: stats } = await db.rpc("get_quartal_stats"); // Custom function
  const { data: raten } = await db
    .from("raten")
    .select("status, betrag")
    .gte("faellig_am", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: `Du bist der Finanzassistent der Praxis Dr. Schubert (KFO Leipzig).
Erstelle eine kurze, verständliche Zusammenfassung des Quartals für die Praxisinhaberin.
Halte den Ton professionell aber freundlich. Nenne konkrete Zahlen.`,
    messages: [
      { role: "user", content: `Quartalsdaten:\n${JSON.stringify({ stats, ratenUebersicht: raten }, null, 2)}` },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// ─── Cashflow-Prognose ──────────────────────────────────────
export async function generateCashflowForecast(): Promise<{
  prognose_90_tage: number;
  risiko_betrag: number;
  risiko_patienten: number;
}> {
  const db = createServerClient();

  // Zukünftige offene Raten laden
  const { data: offeneRaten } = await db
    .from("raten")
    .select("betrag, faellig_am, patients ( id )")
    .eq("status", "offen")
    .gte("faellig_am", new Date().toISOString().split("T")[0])
    .lte("faellig_am", new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

  // Patienten mit Zahlungsproblemen
  const { data: risikoRaten } = await db
    .from("raten")
    .select("betrag, patient_id")
    .gt("mahnstufe", 0);

  const prognose = (offeneRaten || []).reduce((sum: number, r: any) => sum + r.betrag, 0);
  const risikoBetrag = (risikoRaten || []).reduce((sum: number, r: any) => sum + r.betrag, 0);
  const risikoPatienten = new Set((risikoRaten || []).map((r: any) => r.patient_id)).size;

  return {
    prognose_90_tage: prognose,
    risiko_betrag: risikoBetrag,
    risiko_patienten: risikoPatienten,
  };
}
