export type Behandlungskategorie =
  | "A1"
  | "A2"
  | "A3"
  | "MB1"
  | "MB2"
  | "MB3"
  | "H1"
  | "H2";

export interface ZahlungsSignal {
  monatlicheRate?: number | null;
  ersteZahlung?: number | null;
  zusatzkostenEinmalig?: number | null;
  gesamtsummeBisher?: number | null;
  ratenMonate?: number | null;
  privatleistung?: boolean | null;
  kassenfall?: boolean | null;
  alterBeiStart?: number | null;
}

export interface Kategorienregel {
  code: Behandlungskategorie;
  familie: "aligner" | "multiband" | "removable";
  label: string;
  beschreibung: string;
  typischeSignale: string[];
  score(signal: ZahlungsSignal): number;
}

function inRange(value: number | null | undefined, min: number, max: number): boolean {
  return typeof value === "number" && value >= min && value <= max;
}

function approx(value: number | null | undefined, target: number, tolerance = 1): boolean {
  return typeof value === "number" && Math.abs(value - target) <= tolerance;
}

function atLeast(value: number | null | undefined, min: number): boolean {
  return typeof value === "number" && value >= min;
}

function addAgeBias(score: number, age: number | null | undefined, options: { younger?: number; older?: number }) {
  if (typeof age !== "number") return score;
  if (typeof options.younger === "number" && age <= 13) return score + options.younger;
  if (typeof options.older === "number" && age >= 18) return score + options.older;
  return score;
}

export const BEHANDLUNGSART_REGELN: Kategorienregel[] = [
  {
    code: "A1",
    familie: "aligner",
    label: "Aligner umfangreich",
    beschreibung: "Umfangreiche Alignerbehandlung mit Gesamtkosten über 6.000 €.",
    typischeSignale: [
      "Privatleistung",
      "Anfangszahlung ca. 450 €",
      "Laborkosten ca. 800–1.600 €",
      "Gesamtkosten über 6.000 €",
      "Zahlungsdauer meist 24 Monate",
    ],
    score(signal) {
      let score = 0;
      if (signal.privatleistung) score += 20;
      if (approx(signal.ersteZahlung, 450, 40)) score += 20;
      if (inRange(signal.zusatzkostenEinmalig, 800, 1600)) score += 20;
      if (atLeast(signal.gesamtsummeBisher, 6000)) score += 30;
      if (inRange(signal.ratenMonate, 20, 26)) score += 10;
      return addAgeBias(score, signal.alterBeiStart, { older: 8 });
    },
  },
  {
    code: "A2",
    familie: "aligner",
    label: "Aligner mittel",
    beschreibung: "Mittlere Alignerbehandlung mit Gesamtkosten zwischen 4.000 € und 6.000 €.",
    typischeSignale: [
      "Privatleistung",
      "Anfangszahlung ca. 450 €",
      "Laborkosten ca. 800–1.600 €",
      "Gesamtkosten 4.000–6.000 €",
      "Zahlungsdauer meist 24 Monate",
    ],
    score(signal) {
      let score = 0;
      if (signal.privatleistung) score += 20;
      if (approx(signal.ersteZahlung, 450, 40)) score += 20;
      if (inRange(signal.zusatzkostenEinmalig, 800, 1600)) score += 20;
      if (inRange(signal.gesamtsummeBisher, 4000, 6000)) score += 30;
      if (inRange(signal.ratenMonate, 20, 26)) score += 10;
      return addAgeBias(score, signal.alterBeiStart, { older: 8 });
    },
  },
  {
    code: "A3",
    familie: "aligner",
    label: "Aligner klein",
    beschreibung: "Kleinere Alignerbehandlung mit Gesamtkosten zwischen 2.000 € und 4.000 €.",
    typischeSignale: [
      "Privatleistung",
      "Anfangszahlung ca. 450 €",
      "Laborkosten ca. 800–1.600 €",
      "Gesamtkosten 2.000–4.000 €",
      "Zahlungsdauer meist 24 Monate",
    ],
    score(signal) {
      let score = 0;
      if (signal.privatleistung) score += 20;
      if (approx(signal.ersteZahlung, 450, 40)) score += 20;
      if (inRange(signal.zusatzkostenEinmalig, 800, 1600)) score += 20;
      if (inRange(signal.gesamtsummeBisher, 2000, 4000)) score += 30;
      if (inRange(signal.ratenMonate, 20, 26)) score += 10;
      return addAgeBias(score, signal.alterBeiStart, { older: 6 });
    },
  },
  {
    code: "MB1",
    familie: "multiband",
    label: "Multiband rein",
    beschreibung: "Reine Multibandbehandlung ohne vorgeschaltete herausnehmbare Apparatur.",
    typischeSignale: [
      "Kassenfall",
      "Zusatzkosten 1.627,68 €",
      "24 Monatsraten à 67,82 €",
      "16 Quartale Behandlungsplan",
    ],
    score(signal) {
      let score = 0;
      if (signal.kassenfall) score += 18;
      if (approx(signal.monatlicheRate, 67.82, 1)) score += 42;
      if (approx(signal.gesamtsummeBisher, 1627.68, 120)) score += 24;
      if (inRange(signal.ratenMonate, 20, 26)) score += 10;
      return addAgeBias(score, signal.alterBeiStart, { younger: 6 });
    },
  },
  {
    code: "MB2",
    familie: "multiband",
    label: "Multiband mit vorgeschalteter Spange",
    beschreibung:
      "16-Quartale-Multibandplan mit vorheriger herausnehmbarer Apparatur im selben Gesamtplan.",
    typischeSignale: [
      "Kassenfall",
      "Gesamter Plan läuft als Multiband",
      "Frühe kleinere Zahlungen vor dem Multiband-Teil möglich",
      "Keine reinen H1/H2-Muster über die gesamte Laufzeit",
    ],
    score(signal) {
      let score = 0;
      if (signal.kassenfall) score += 20;
      if (!approx(signal.monatlicheRate, 103.02, 1) && !approx(signal.monatlicheRate, 67.82, 1)) score += 12;
      if (inRange(signal.ratenMonate, 20, 26)) score += 16;
      if (inRange(signal.ersteZahlung, 100, 1200)) score += 10;
      if (inRange(signal.gesamtsummeBisher, 1500, 4000)) score += 18;
      return addAgeBias(score, signal.alterBeiStart, { younger: 12 });
    },
  },
  {
    code: "MB3",
    familie: "multiband",
    label: "Multiband besonders / Chirurgie",
    beschreibung: "Besondere Multibandbehandlung, oft mit Chirurgie oder Zusatzgeräten wie GNE.",
    typischeSignale: [
      "Kassenfall plus private Zusatzleistungen",
      "Zusätzliche chirurgische Kosten ca. 1.236,23 €",
      "12 Monatsraten à 103,02 €",
    ],
    score(signal) {
      let score = 0;
      if (signal.kassenfall) score += 16;
      if (approx(signal.monatlicheRate, 103.02, 1)) score += 46;
      if (approx(signal.gesamtsummeBisher, 1236.23, 100)) score += 22;
      if (inRange(signal.ratenMonate, 10, 14)) score += 12;
      return addAgeBias(score, signal.alterBeiStart, { younger: 4 });
    },
  },
  {
    code: "H1",
    familie: "removable",
    label: "Herausnehmbar kurz",
    beschreibung: "Nur herausnehmbare Geräte mit kürzerer Laufzeit.",
    typischeSignale: [
      "Kassenfall",
      "Nur herausnehmbare Apparatur",
      "Kostenrahmen 1.400–2.000 €",
      "Dauer 6 Quartale",
    ],
    score(signal) {
      let score = 0;
      if (signal.kassenfall) score += 16;
      if (inRange(signal.gesamtsummeBisher, 1400, 2000)) score += 34;
      if (inRange(signal.ratenMonate, 12, 20)) score += 10;
      if (!signal.monatlicheRate) score += 8;
      return addAgeBias(score, signal.alterBeiStart, { younger: 16 });
    },
  },
  {
    code: "H2",
    familie: "removable",
    label: "Herausnehmbar lang",
    beschreibung: "Nur herausnehmbare Geräte mit längerer Laufzeit.",
    typischeSignale: [
      "Kassenfall",
      "Nur herausnehmbare Apparatur",
      "Kostenrahmen 2.000–3.500 €",
      "Dauer 12 Quartale",
    ],
    score(signal) {
      let score = 0;
      if (signal.kassenfall) score += 16;
      if (inRange(signal.gesamtsummeBisher, 2000, 3500)) score += 34;
      if (inRange(signal.ratenMonate, 18, 30)) score += 12;
      if (!signal.monatlicheRate) score += 8;
      return addAgeBias(score, signal.alterBeiStart, { younger: 14 });
    },
  },
];

export function rankBehandlungsarten(signal: ZahlungsSignal) {
  return BEHANDLUNGSART_REGELN
    .map((regel) => ({
      code: regel.code,
      familie: regel.familie,
      label: regel.label,
      score: regel.score(signal),
      beschreibung: regel.beschreibung,
    }))
    .sort((a, b) => b.score - a.score);
}

export function getConfidenceLabel(score: number) {
  if (score >= 75) return "sehr wahrscheinlich";
  if (score >= 50) return "wahrscheinlich";
  return "unklar";
}
