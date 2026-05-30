// Rechnungs-Engine: GOZ/BEMA Gebührendatenbank
// Basierend auf den Praxis-Dokumenten Dr. Schubert
// GOZ 2012, BEMA 2004, Punktwerte Sachsen (seit 01.04.2004)

export interface GOZPosition {
  goz_nr: string;
  bezeichnung: string;
  beschreibung: string;
  punktzahl: number;        // GOZ Punktzahl
  goz_1_0: number;          // GOZ 1,0-facher Satz in EUR
  bema_punkte: number;      // BEMA Punktzahl (für Kassenabzug)
  standard_faktor: number;  // Üblicher Faktor
  begruendung?: string;     // Standard-Begründung für höheren Faktor
}

export const PUNKTWERTE = {
  bundesland: "Sachsen",
  gueltig_ab: "2004-04-01",
  kons: 1.3225,              // KONS-Punktwert EUR
  kfo: {
    aok: 0.6550,
    vdak: 0.6550,
    bkk: 0.6550,
    standard: 0.6550,
  },
  kfo_alt: 0.6340,           // Älterer KFO-Punktwert
};

export const GOZ_POSITIONEN: GOZPosition[] = [
  {
    goz_nr: "6100",
    bezeichnung: "Eingliederung eines Klebebrackets",
    beschreibung: "Klebebracket auf Zahnoberfläche befestigen",
    punktzahl: 160,
    goz_1_0: 9.28,
    bema_punkte: 18,
    standard_faktor: 2.30,
    begruendung: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand",
  },
  {
    goz_nr: "6110",
    bezeichnung: "Entfernung eines Klebebrackets",
    beschreibung: "Klebebracket von Zahnoberfläche entfernen",
    punktzahl: 68,
    goz_1_0: 3.94,
    bema_punkte: 6,
    standard_faktor: 2.30,
  },
  {
    goz_nr: "6120",
    bezeichnung: "Eingliederung eines Bandes",
    beschreibung: "Metallband um Backenzahn befestigen",
    punktzahl: 223,
    goz_1_0: 12.94,
    bema_punkte: 42,
    standard_faktor: 3.00,
    begruendung: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand",
  },
  {
    goz_nr: "6140",
    bezeichnung: "Eingliederung Retainer-Teilbogen",
    beschreibung: "Festsitzender Retainer-Draht befestigen",
    punktzahl: 223,
    goz_1_0: 12.94,
    bema_punkte: 0,
    standard_faktor: 2.55,
    begruendung: "schwieriger Zugang, schwierige Fixierung",
  },
  {
    goz_nr: "6150",
    bezeichnung: "Eingliederung eines ungeteilten Bogens",
    beschreibung: "Durchgehenden Drahtbogen in Brackets einsetzen",
    punktzahl: 485,
    goz_1_0: 28.12,
    bema_punkte: 32,
    standard_faktor: 2.00,
  },
  {
    goz_nr: "4050",
    bezeichnung: "Entfernung harter Zahnbeläge",
    beschreibung: "Zahnsteinentfernung/Airflow-Prophylaxe",
    punktzahl: 11,
    goz_1_0: 0.61,
    bema_punkte: 0,
    standard_faktor: 2.30,
  },
  {
    goz_nr: "2000a",
    bezeichnung: "Bracketumfeldschutz",
    beschreibung: "Schutzversiegelung um Brackets (Analogberechnung)",
    punktzahl: 0,
    goz_1_0: 0,
    bema_punkte: 0,
    standard_faktor: 1.80,
  },
  {
    goz_nr: "4050a",
    bezeichnung: "KFO-Prophylaxe/Airflow",
    beschreibung: "Professionelle Zahnreinigung bei KFO-Apparatur (Analogberechnung)",
    punktzahl: 0,
    goz_1_0: 0,
    bema_punkte: 0,
    standard_faktor: 1.15,
  },
  {
    goz_nr: "1020",
    bezeichnung: "Lokale Fluoridierung",
    beschreibung: "Auftragen von Fluoridlack/-gel",
    punktzahl: 49,
    goz_1_0: 2.81,
    bema_punkte: 0,
    standard_faktor: 1.00,
  },
  {
    goz_nr: "4020a",
    bezeichnung: "Lokale Behandlung Mundschleimhaut",
    beschreibung: "Behandlung der Mundschleimhaut (Analogberechnung)",
    punktzahl: 44,
    goz_1_0: 2.53,
    bema_punkte: 0,
    standard_faktor: 1.00,
  },
];

// BEMA Abrechnungsnummern (Kassenleistung-Abzüge)
export const BEMA_ABZUEGE: Record<string, { bezeichnung: string; bema_nr: string; faktor: number }> = {
  "6100": { bezeichnung: "Eingliederung eines Klebebrackets", bema_nr: "126a", faktor: 1.27 },
  "6110": { bezeichnung: "Entfernung eines Klebebrackets", bema_nr: "126c", faktor: 1.27 },
  "6120": { bezeichnung: "Eingliederung eines Bandes", bema_nr: "126b", faktor: 2.127 },
  "6150": { bezeichnung: "Eingliederung eines ungeteilten Bogens", bema_nr: "128a", faktor: 0.745 },
};

// Behandlungspakete (aus den ODS-Dateien)
export interface BehandlungspaketPosition {
  goz_nr: string;
  bezeichnung: string;
  faktor: number;
  anzahl: number;
  preis: number;
  material: number;
  gkv_abzug: number;
  endpreis: number;
  begruendung?: string;
}

export interface Behandlungspaket {
  name: string;
  beschreibung: string;
  positionen: BehandlungspaketPosition[];
  endsumme: number;
}

export const PAKETE: Behandlungspaket[] = [
  {
    name: "Keramikbrackets",
    beschreibung: "Premium-Behandlung mit ästhetischen Keramikbrackets",
    endsumme: 1795.74,
    positionen: [
      { goz_nr: "6100", bezeichnung: "Keramikbrackets", faktor: 5.00, anzahl: 12, preis: 556.80, material: 0, gkv_abzug: 141.48, endpreis: 415.32, begruendung: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
      { goz_nr: "6110", bezeichnung: "Keramikbrackets Entfernung", faktor: 5.00, anzahl: 12, preis: 165.48, material: 0, gkv_abzug: 47.16, endpreis: 118.32 },
      { goz_nr: "6120", bezeichnung: "Komfortbänder", faktor: 3.00, anzahl: 8, preis: 310.48, material: 0, gkv_abzug: 220.08, endpreis: 90.04, begruendung: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
      { goz_nr: "6150", bezeichnung: "Superelastische Bögen", faktor: 2.00, anzahl: 10, preis: 562.40, material: 0, gkv_abzug: 209.60, endpreis: 352.80 },
      { goz_nr: "2000a", bezeichnung: "Bracketumfeldschutz", faktor: 1.80, anzahl: 20, preis: 182.20, material: 0, gkv_abzug: 0, endpreis: 182.20 },
      { goz_nr: "6100", bezeichnung: "Metallbrackets", faktor: 2.30, anzahl: 8, preis: 170.72, material: 0, gkv_abzug: 94.32, endpreis: 76.40 },
      { goz_nr: "4050a", bezeichnung: "Airflow-KFO (9 Termine)", faktor: 1.15, anzahl: 216, preis: 151.80, material: 0, gkv_abzug: 0, endpreis: 151.80 },
      { goz_nr: "1020", bezeichnung: "Lokale Fluoridierung", faktor: 1.00, anzahl: 9, preis: 25.29, material: 0, gkv_abzug: 0, endpreis: 25.29 },
      { goz_nr: "4020a", bezeichnung: "Lokale Behandlung Mundschleimhaut", faktor: 1.00, anzahl: 9, preis: 22.77, material: 0, gkv_abzug: 0, endpreis: 22.77 },
      { goz_nr: "6100", bezeichnung: "Festsitzender Retainer OK+UK", faktor: 2.55, anzahl: 12, preis: 283.97, material: 0, gkv_abzug: 0, endpreis: 283.97, begruendung: "schwieriger Zugang, schwierige Fixierung" },
      { goz_nr: "6140", bezeichnung: "Retainer Teilbogen", faktor: 2.55, anzahl: 2, preis: 60.23, material: 0, gkv_abzug: 0, endpreis: 60.23, begruendung: "schwieriger Zugang, schwierige Fixierung" },
      { goz_nr: "4050", bezeichnung: "Entfernung Zahnbeläge", faktor: 2.30, anzahl: 12, preis: 16.60, material: 0, gkv_abzug: 0, endpreis: 16.60 },
    ],
  },
  {
    name: "Minibrackets",
    beschreibung: "Standard-Behandlung mit Metall-Minibrackets",
    endsumme: 1627.62,
    positionen: [
      { goz_nr: "6100", bezeichnung: "Minibrackets", faktor: 3.50, anzahl: 20, preis: 649.60, material: 0, gkv_abzug: 235.80, endpreis: 413.80, begruendung: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
      { goz_nr: "6120", bezeichnung: "Komfortbänder", faktor: 3.00, anzahl: 8, preis: 310.48, material: 0, gkv_abzug: 220.08, endpreis: 90.04, begruendung: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
      { goz_nr: "6150", bezeichnung: "Superelastische Bögen", faktor: 2.10, anzahl: 10, preis: 590.52, material: 0, gkv_abzug: 209.60, endpreis: 380.92 },
      { goz_nr: "2000a", bezeichnung: "Bracketumfeldschutz", faktor: 1.80, anzahl: 20, preis: 182.20, material: 0, gkv_abzug: 0, endpreis: 182.20 },
      { goz_nr: "4050a", bezeichnung: "Airflow-KFO (9 Termine)", faktor: 1.15, anzahl: 216, preis: 151.80, material: 0, gkv_abzug: 0, endpreis: 151.80 },
      { goz_nr: "1020", bezeichnung: "Lokale Fluoridierung", faktor: 1.00, anzahl: 9, preis: 25.29, material: 0, gkv_abzug: 0, endpreis: 25.29 },
      { goz_nr: "4020a", bezeichnung: "Lokale Behandlung Mundschleimhaut", faktor: 1.00, anzahl: 9, preis: 22.77, material: 0, gkv_abzug: 0, endpreis: 22.77 },
      { goz_nr: "6100", bezeichnung: "Festsitzender Retainer OK+UK", faktor: 2.55, anzahl: 12, preis: 283.97, material: 0, gkv_abzug: 0, endpreis: 283.97, begruendung: "schwieriger Zugang, schwierige Fixierung" },
      { goz_nr: "6140", bezeichnung: "Retainer Teilbogen", faktor: 2.55, anzahl: 2, preis: 60.23, material: 0, gkv_abzug: 0, endpreis: 60.23, begruendung: "schwieriger Zugang, schwierige Fixierung" },
      { goz_nr: "4050", bezeichnung: "Entfernung Zahnbeläge", faktor: 2.30, anzahl: 12, preis: 16.60, material: 0, gkv_abzug: 0, endpreis: 16.60 },
    ],
  },
];

// Praxis-Bankdaten
export const PRAXIS_BANK = {
  name: "Dr. Maria Elena Schubert",
  titel: "Zahnärztin für Kieferorthopädie",
  adresse: "04109 Leipzig · Oelßner's Hof · Nikolaistr. 20",
  telefon: "0341/9806457",
  fax: "0341/9806458",
  email: "info@schubert-holi-dontics.de",
  web: "schubert-holi-dontics.de",
  iban: "DE03860555921090118941",
  bic: "WELADE8LXXX",
  bank: "Sparkasse Leipzig",
  blz: "86055592",
  konto: "1090118941",
};

// Rechnungs-Footer Texte
export const RECHNUNG_FOOTER = {
  konformitaet: "Konformitätserklärung gemäß Anhang XIII MDR für Sonderanfertigungen: Diese Sonderanfertigung ist ausschließlich für den genannten Patienten bestimmt. Wir sichern zu, dass diese Sonderanfertigung den in Anhang I der Verordnung (EU) 2017/745 angegebenen grundlegenden Sicherheits- und Leistungsanforderungen entspricht.",
  eigentum: "Alle kieferorthopädischen Geräte bleiben Eigentum des verordnenden Kieferorthopäden.",
  umsatzsteuer: "Alle erbrachten Leistungen sind nach §4 Nr. 14 UStG. von der Umsatzsteuer befreit.",
};

// Hilfsfunktion: Kassenleistung berechnen
export function berechneKassenabzug(goz_nr: string, anzahl: number): number {
  const abzug = BEMA_ABZUEGE[goz_nr];
  if (!abzug) return 0;
  return anzahl * abzug.faktor * PUNKTWERTE.kfo.standard;
}

// Hilfsfunktion: GOZ-Honorar berechnen
export function berechneHonorar(goz_1_0: number, faktor: number, anzahl: number): number {
  return goz_1_0 * faktor * anzahl;
}
