"use client";

import { useEffect, useState, useRef } from "react";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { FileText, Plus, Trash2, Eye, Search, Package, User, ChevronDown } from "lucide-react";

interface Patient { id: string; name: string; email?: string; }

interface Position {
  id: string; goz_nr: string; bezeichnung: string; faktor: number;
  anzahl: number; preis: number; gkv_abzug: number; endpreis: number; begruendung: string;
  datum?: string; region?: string; material?: number;
}

// GOZ Punktwert: 0,0562421 EUR pro Punkt
const PW = 0.0562421;
// BEMA KFO Punktwert Sachsen
const KFO_PW = 0.6550;

// Vollstaendiger GOZ KFO-Katalog (6000-6260) + Prophylaxe
// Quelle: Gebuehrenordnung fuer Zahnaerzte 2012, verifiziert ueber bzaek.de + abrechnungsstelle.com
const GOZ = [
  // Diagnostik
  { nr: "6000", bez: "Profil-/Enfacefotografie inkl. KFO-Auswertung", pkt: 80, bema: 0 },
  { nr: "6010", bez: "Kiefermodell-Analyse (3D, graphisch, metrisch)", pkt: 180, bema: 0 },
  { nr: "6020", bez: "Gesichtsschaedel-Untersuchung (Roentgen-Auswertung)", pkt: 360, bema: 0 },
  // Kieferumformung (Kernpositionen, je Kiefer, 4-Jahres-Pauschale)
  { nr: "6030", bez: "Kieferumformung inkl. Retention - gering", pkt: 1350, bema: 0 },
  { nr: "6040", bez: "Kieferumformung inkl. Retention - mittel", pkt: 2100, bema: 0 },
  { nr: "6050", bez: "Kieferumformung inkl. Retention - hoch", pkt: 3600, bema: 0 },
  // Regelbiss-Einstellung (Wachstumsphase)
  { nr: "6060", bez: "Regelbiss-Einstellung inkl. Retention - gering", pkt: 1800, bema: 0 },
  { nr: "6070", bez: "Regelbiss-Einstellung inkl. Retention - mittel", pkt: 2600, bema: 0 },
  { nr: "6080", bez: "Regelbiss-Einstellung inkl. Retention - hoch", pkt: 3600, bema: 0 },
  // Okklusion
  { nr: "6090", bez: "Einstellung Okklusion durch alveolaeren Ausgleich", pkt: 1350, bema: 0 },
  // Brackets & Baender
  { nr: "6100", bez: "Eingliederung Klebebracket", pkt: 165, bema: 18 },
  { nr: "6110", bez: "Entfernung Klebebracket inkl. Polieren", pkt: 70, bema: 6 },
  { nr: "6120", bez: "Eingliederung Band", pkt: 230, bema: 42 },
  { nr: "6130", bez: "Entfernung Band inkl. Polieren", pkt: 90, bema: 10 },
  // Boegen
  { nr: "6140", bez: "Eingliederung Teilbogen", pkt: 230, bema: 0 },
  { nr: "6150", bez: "Eingliederung ungeteilter Bogen", pkt: 500, bema: 32 },
  // Verankerung & Hilfsmittel
  { nr: "6160", bez: "Eingliederung intra-/extraorale Verankerung", pkt: 300, bema: 0 },
  { nr: "6170", bez: "Eingliederung Kopf-Kinn-Kappe", pkt: 165, bema: 0 },
  { nr: "6180", bez: "Wiederherstellung Funktionsfaehigkeit KFO-Geraet", pkt: 300, bema: 0 },
  // Beratung & Kontrolle
  { nr: "6190", bez: "Beratendes/belehrendes Gespraech (KFO)", pkt: 120, bema: 0 },
  { nr: "6200", bez: "Eingliedern Hilfsmittel bei Funktionsstoerungen", pkt: 230, bema: 0 },
  { nr: "6210", bez: "Kontrolle Behandlungsverlauf / Retention", pkt: 85, bema: 0 },
  { nr: "6220", bez: "Vorbereitende Massnahmen KFO-Behandlungsmittel", pkt: 165, bema: 0 },
  // Spezialleistungen
  { nr: "6230", bez: "Beseitigung Stoerung an KFO-Geraet", pkt: 165, bema: 0 },
  { nr: "6240", bez: "Ueberwachung/Motivation KFO-Behandlung", pkt: 85, bema: 0 },
  { nr: "6250", bez: "Eingliederung Einordnungsschiene/-bogen", pkt: 250, bema: 0 },
  { nr: "6260", bez: "Einordnung verlagerter/retinierter Zahn", pkt: 500, bema: 0 },
  // Prophylaxe (aus Praxis-Dokumenten)
  { nr: "4050", bez: "Entfernung harter Zahnbelaege", pkt: 11, bema: 0 },
  { nr: "1020", bez: "Lokale Fluoridierung (Lack/Gel)", pkt: 50, bema: 0 },
  // Analogpositionen (Praxis Dr. Schubert)
  { nr: "2000a", bez: "Bracketumfeldschutz (Analogberechnung)", pkt: 90, bema: 0 },
  { nr: "4050a", bez: "KFO-Prophylaxe / Airflow (Analogberechnung)", pkt: 12, bema: 0 },
  { nr: "4020a", bez: "Lokale Behandlung Mundschleimhaut (Analog)", pkt: 45, bema: 0 },
];

// Standardfaktoren und Begruendungen
const STD_FAKTOREN: Record<string, { faktor: number; begr: string }> = {
  "6100": { faktor: 2.30, begr: "ueberdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
  "6110": { faktor: 2.30, begr: "" },
  "6120": { faktor: 3.00, begr: "ueberdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
  "6130": { faktor: 2.30, begr: "" },
  "6140": { faktor: 2.55, begr: "schwieriger Zugang, schwierige Fixierung" },
  "6150": { faktor: 2.00, begr: "" },
  "6160": { faktor: 2.30, begr: "" },
  "2000a": { faktor: 1.80, begr: "" },
  "4050a": { faktor: 1.15, begr: "" },
  "1020": { faktor: 1.00, begr: "" },
  "4020a": { faktor: 1.00, begr: "" },
  "4050": { faktor: 2.30, begr: "" },
};

// BEMA Abrechnungsnummern fuer Kassenabzuege
const BEMA_FAKTOR: Record<string, number> = {
  "6100": 1.27,   // BEMA 126a
  "6110": 1.27,   // BEMA 126c
  "6120": 2.127,  // BEMA 126b
  "6130": 1.27,   // BEMA 126d
  "6150": 0.745,  // BEMA 128a
};

// Behandlungspakete
const PAKETE = [
  { key: "keramik", name: "Keramikbrackets", preis: "1.795,74", typ: "Multiband" },
  { key: "mini", name: "Minibrackets", preis: "1.627,62", typ: "Multiband" },
  { key: "angel_leicht", name: "Angelalign Leicht", preis: "3.200", typ: "Aligner" },
  { key: "angel_mittel", name: "Angelalign Mittel", preis: "4.600", typ: "Aligner" },
  { key: "angel_komplex", name: "Angelalign Komplex", preis: "6.300", typ: "Aligner" },
  { key: "custom", name: "Individuell", preis: "", typ: "" },
];

// Vordefinierte Positionen pro Paket (aus ODS-Dateien der Praxis)
const PAKET_POSITIONEN: Record<string, Omit<Position, "id">[]> = {
  angel_leicht: [
    { goz_nr: "6000", bezeichnung: "KFO-Diagnostik/Fotodokumentation", faktor: 2.30, anzahl: 4, preis: 41.40, gkv_abzug: 0, endpreis: 41.40, begruendung: "" },
    { goz_nr: "6010", bezeichnung: "Kiefermodell-Analyse", faktor: 2.30, anzahl: 2, preis: 46.55, gkv_abzug: 0, endpreis: 46.55, begruendung: "" },
    { goz_nr: "6030", bezeichnung: "Kieferumformung gering inkl. Retention", faktor: 2.30, anzahl: 1, preis: 174.63, gkv_abzug: 0, endpreis: 174.63, begruendung: "" },
    { goz_nr: "6210", bezeichnung: "Kontrolle Behandlungsverlauf", faktor: 2.30, anzahl: 10, preis: 109.96, gkv_abzug: 0, endpreis: 109.96, begruendung: "" },
    { goz_nr: "6100", bezeichnung: "Attachment-Befestigung", faktor: 2.30, anzahl: 10, preis: 213.44, gkv_abzug: 0, endpreis: 213.44, begruendung: "" },
    { goz_nr: "6110", bezeichnung: "Attachment-Entfernung", faktor: 2.30, anzahl: 10, preis: 90.64, gkv_abzug: 0, endpreis: 90.64, begruendung: "" },
    { goz_nr: "6100", bezeichnung: "Festsitzender Retainer", faktor: 2.55, anzahl: 6, preis: 141.98, gkv_abzug: 0, endpreis: 141.98, begruendung: "schwieriger Zugang" },
    { goz_nr: "Material", bezeichnung: "Material- und Laborkosten Angelalign", faktor: 1.00, anzahl: 1, preis: 2381.40, gkv_abzug: 0, endpreis: 2381.40, begruendung: "Aligner-Schienen inkl. Planung und Produktion" },
  ],
  angel_mittel: [
    { goz_nr: "6000", bezeichnung: "KFO-Diagnostik/Fotodokumentation", faktor: 2.30, anzahl: 4, preis: 41.40, gkv_abzug: 0, endpreis: 41.40, begruendung: "" },
    { goz_nr: "6010", bezeichnung: "Kiefermodell-Analyse", faktor: 2.30, anzahl: 2, preis: 46.55, gkv_abzug: 0, endpreis: 46.55, begruendung: "" },
    { goz_nr: "6020", bezeichnung: "Gesichtsschaedel-Auswertung", faktor: 2.30, anzahl: 1, preis: 46.58, gkv_abzug: 0, endpreis: 46.58, begruendung: "" },
    { goz_nr: "6040", bezeichnung: "Kieferumformung mittel inkl. Retention", faktor: 2.30, anzahl: 1, preis: 271.65, gkv_abzug: 0, endpreis: 271.65, begruendung: "" },
    { goz_nr: "6210", bezeichnung: "Kontrolle Behandlungsverlauf", faktor: 2.30, anzahl: 18, preis: 197.93, gkv_abzug: 0, endpreis: 197.93, begruendung: "" },
    { goz_nr: "6100", bezeichnung: "Attachment-Befestigung", faktor: 2.30, anzahl: 16, preis: 341.50, gkv_abzug: 0, endpreis: 341.50, begruendung: "" },
    { goz_nr: "6110", bezeichnung: "Attachment-Entfernung", faktor: 2.30, anzahl: 16, preis: 145.02, gkv_abzug: 0, endpreis: 145.02, begruendung: "" },
    { goz_nr: "6100", bezeichnung: "Festsitzender Retainer OK+UK", faktor: 2.55, anzahl: 12, preis: 283.97, gkv_abzug: 0, endpreis: 283.97, begruendung: "schwieriger Zugang" },
    { goz_nr: "4050a", bezeichnung: "KFO-Prophylaxe", faktor: 1.15, anzahl: 108, preis: 75.60, gkv_abzug: 0, endpreis: 75.60, begruendung: "" },
    { goz_nr: "Material", bezeichnung: "Material- und Laborkosten Angelalign", faktor: 1.00, anzahl: 1, preis: 3149.80, gkv_abzug: 0, endpreis: 3149.80, begruendung: "Aligner-Schienen inkl. Planung und Produktion" },
  ],
  angel_komplex: [
    { goz_nr: "6000", bezeichnung: "KFO-Diagnostik/Fotodokumentation", faktor: 2.30, anzahl: 4, preis: 41.40, gkv_abzug: 0, endpreis: 41.40, begruendung: "" },
    { goz_nr: "6010", bezeichnung: "Kiefermodell-Analyse", faktor: 2.30, anzahl: 4, preis: 93.10, gkv_abzug: 0, endpreis: 93.10, begruendung: "" },
    { goz_nr: "6020", bezeichnung: "Gesichtsschaedel-Auswertung", faktor: 2.30, anzahl: 2, preis: 93.16, gkv_abzug: 0, endpreis: 93.16, begruendung: "" },
    { goz_nr: "6050", bezeichnung: "Kieferumformung hoch inkl. Retention", faktor: 2.30, anzahl: 1, preis: 465.68, gkv_abzug: 0, endpreis: 465.68, begruendung: "" },
    { goz_nr: "6210", bezeichnung: "Kontrolle Behandlungsverlauf", faktor: 2.30, anzahl: 28, preis: 308.00, gkv_abzug: 0, endpreis: 308.00, begruendung: "" },
    { goz_nr: "6100", bezeichnung: "Attachment-Befestigung", faktor: 2.30, anzahl: 20, preis: 426.88, gkv_abzug: 0, endpreis: 426.88, begruendung: "" },
    { goz_nr: "6110", bezeichnung: "Attachment-Entfernung", faktor: 2.30, anzahl: 20, preis: 181.28, gkv_abzug: 0, endpreis: 181.28, begruendung: "" },
    { goz_nr: "6100", bezeichnung: "Festsitzender Retainer OK+UK", faktor: 2.55, anzahl: 12, preis: 283.97, gkv_abzug: 0, endpreis: 283.97, begruendung: "schwieriger Zugang" },
    { goz_nr: "6140", bezeichnung: "Retainer Teilbogen", faktor: 2.55, anzahl: 2, preis: 60.23, gkv_abzug: 0, endpreis: 60.23, begruendung: "schwieriger Zugang" },
    { goz_nr: "4050a", bezeichnung: "KFO-Prophylaxe", faktor: 1.15, anzahl: 162, preis: 113.40, gkv_abzug: 0, endpreis: 113.40, begruendung: "" },
    { goz_nr: "Material", bezeichnung: "Material- und Laborkosten Angelalign", faktor: 1.00, anzahl: 1, preis: 4232.90, gkv_abzug: 0, endpreis: 4232.90, begruendung: "Aligner-Schienen inkl. Planung und Produktion" },
  ],
  keramik: [
    { goz_nr: "6100", bezeichnung: "Keramikbrackets", faktor: 5.00, anzahl: 12, preis: 556.80, gkv_abzug: 141.48, endpreis: 415.32, begruendung: "ueberdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
    { goz_nr: "6110", bezeichnung: "Keramikbrackets Entfernung", faktor: 5.00, anzahl: 12, preis: 165.48, gkv_abzug: 47.16, endpreis: 118.32, begruendung: "" },
    { goz_nr: "6120", bezeichnung: "Komfortbaender", faktor: 3.00, anzahl: 8, preis: 310.48, gkv_abzug: 220.08, endpreis: 90.04, begruendung: "ueberdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
    { goz_nr: "6150", bezeichnung: "Superelastische Boegen", faktor: 2.00, anzahl: 10, preis: 562.40, gkv_abzug: 209.60, endpreis: 352.80, begruendung: "" },
    { goz_nr: "2000a", bezeichnung: "Bracketumfeldschutz", faktor: 1.80, anzahl: 20, preis: 182.20, gkv_abzug: 0, endpreis: 182.20, begruendung: "" },
    { goz_nr: "6100", bezeichnung: "Metallbrackets", faktor: 2.30, anzahl: 8, preis: 170.72, gkv_abzug: 94.32, endpreis: 76.40, begruendung: "" },
    { goz_nr: "4050a", bezeichnung: "Airflow-KFO (9 Termine)", faktor: 1.15, anzahl: 216, preis: 151.80, gkv_abzug: 0, endpreis: 151.80, begruendung: "" },
    { goz_nr: "1020", bezeichnung: "Lokale Fluoridierung", faktor: 1.00, anzahl: 9, preis: 25.29, gkv_abzug: 0, endpreis: 25.29, begruendung: "" },
    { goz_nr: "4020a", bezeichnung: "Mundschleimhaut-Behandlung", faktor: 1.00, anzahl: 9, preis: 22.77, gkv_abzug: 0, endpreis: 22.77, begruendung: "" },
    { goz_nr: "6100", bezeichnung: "Festsitzender Retainer OK+UK", faktor: 2.55, anzahl: 12, preis: 283.97, gkv_abzug: 0, endpreis: 283.97, begruendung: "schwieriger Zugang, schwierige Fixierung" },
    { goz_nr: "6140", bezeichnung: "Retainer Teilbogen", faktor: 2.55, anzahl: 2, preis: 60.23, gkv_abzug: 0, endpreis: 60.23, begruendung: "schwieriger Zugang, schwierige Fixierung" },
    { goz_nr: "4050", bezeichnung: "Entfernung Zahnbelaege", faktor: 2.30, anzahl: 12, preis: 16.60, gkv_abzug: 0, endpreis: 16.60, begruendung: "" },
  ],
  mini: [
    { goz_nr: "6100", bezeichnung: "Minibrackets", faktor: 3.50, anzahl: 20, preis: 649.60, gkv_abzug: 235.80, endpreis: 413.80, begruendung: "ueberdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
    { goz_nr: "6120", bezeichnung: "Komfortbaender", faktor: 3.00, anzahl: 8, preis: 310.48, gkv_abzug: 220.08, endpreis: 90.04, begruendung: "ueberdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
    { goz_nr: "6150", bezeichnung: "Superelastische Boegen", faktor: 2.10, anzahl: 10, preis: 590.52, gkv_abzug: 209.60, endpreis: 380.92, begruendung: "" },
    { goz_nr: "2000a", bezeichnung: "Bracketumfeldschutz", faktor: 1.80, anzahl: 20, preis: 182.20, gkv_abzug: 0, endpreis: 182.20, begruendung: "" },
    { goz_nr: "4050a", bezeichnung: "Airflow-KFO (9 Termine)", faktor: 1.15, anzahl: 216, preis: 151.80, gkv_abzug: 0, endpreis: 151.80, begruendung: "" },
    { goz_nr: "1020", bezeichnung: "Lokale Fluoridierung", faktor: 1.00, anzahl: 9, preis: 25.29, gkv_abzug: 0, endpreis: 25.29, begruendung: "" },
    { goz_nr: "4020a", bezeichnung: "Mundschleimhaut-Behandlung", faktor: 1.00, anzahl: 9, preis: 22.77, gkv_abzug: 0, endpreis: 22.77, begruendung: "" },
    { goz_nr: "6100", bezeichnung: "Festsitzender Retainer OK+UK", faktor: 2.55, anzahl: 12, preis: 283.97, gkv_abzug: 0, endpreis: 283.97, begruendung: "schwieriger Zugang, schwierige Fixierung" },
    { goz_nr: "6140", bezeichnung: "Retainer Teilbogen", faktor: 2.55, anzahl: 2, preis: 60.23, gkv_abzug: 0, endpreis: 60.23, begruendung: "schwieriger Zugang, schwierige Fixierung" },
    { goz_nr: "4050", bezeichnung: "Entfernung Zahnbelaege", faktor: 2.30, anzahl: 12, preis: 16.60, gkv_abzug: 0, endpreis: 16.60, begruendung: "" },
  ],
};

type PatientArt = "kasse" | "privat" | "mkv";

export default function RechnungenPage() {
  const { theme, locale } = useAppStore();
  const dk = theme === "dark";
  const fg = dk ? "#f0f0f0" : "#1c3044";
  const muted = dk ? "#666" : "#999";
  const grn = "#4ade80";
  const border = dk ? "rgba(255,255,255,0.06)" : "#e5e8ef";
  const cardBg = dk ? "rgba(16,18,28,0.75)" : "#fff";
  const inputBg = dk ? "#0d0f1a" : "#f8f8f8";

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [showPDropdown, setShowPDropdown] = useState(false);
  const [patientArt, setPatientArt] = useState<PatientArt>("kasse");
  const [selectedPaket, setSelectedPaket] = useState("");
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [ratenAnzahl, setRatenAnzahl] = useState(12);
  const [startDatum, setStartDatum] = useState(new Date().toISOString().slice(0, 10));
  const [showGozPicker, setShowGozPicker] = useState(false);
  const [gozFilter, setGozFilter] = useState("");
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  // Live patient search
  useEffect(() => {
    if (patientSearch.length < 2) { setPatients([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const res = await fetch("/api/praxis/search?q=" + encodeURIComponent(patientSearch));
      if (res.ok) { const j = await res.json(); setPatients(j.results || []); }
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [patientSearch]);

  const selectPaket = (key: string) => {
    setSelectedPaket(key);
    if (PAKET_POSITIONEN[key]) {
      setPositionen(PAKET_POSITIONEN[key].map((p, i) => ({ ...p, id: `p-${i}`, datum: (p as any).datum || "", region: (p as any).region || "", material: (p as any).material || 0 })));
    } else {
      setPositionen([]);
    }
  };

  const addGozPosition = (g: typeof GOZ[0]) => {
    const std = STD_FAKTOREN[g.nr] || { faktor: 2.30, begr: "" };
    const honorar = g.pkt * PW * std.faktor;
    const gkvAbzug = patientArt === "privat" ? 0 : (g.bema > 0 ? g.bema * KFO_PW * (BEMA_FAKTOR[g.nr] || 1) : 0);
    setPositionen(prev => [...prev, {
      id: `p-${Date.now()}`, goz_nr: g.nr, bezeichnung: g.bez,
      faktor: std.faktor, anzahl: 1, preis: honorar, gkv_abzug: gkvAbzug,
      endpreis: honorar - gkvAbzug, begruendung: std.begr,
      datum: "", region: "", material: 0,
    }]);
    setShowGozPicker(false);
  };

  const updatePos = (id: string, field: string, value: any) => {
    setPositionen(prev => prev.map(p => {
      if (p.id !== id) return p;
      const u = { ...p, [field]: value };
      if (field === "faktor" || field === "anzahl") {
        const g = GOZ.find(x => x.nr === u.goz_nr);
        if (g) {
          u.preis = g.pkt * PW * u.faktor * u.anzahl;
          u.gkv_abzug = patientArt === "privat" ? 0 : (g.bema > 0 ? g.bema * KFO_PW * (BEMA_FAKTOR[g.nr] || 1) * u.anzahl : 0);
          u.endpreis = u.preis - u.gkv_abzug;
        }
      }
      return u;
    }));
  };

  const removePos = (id: string) => setPositionen(prev => prev.filter(p => p.id !== id));
  const gesamtEndpreis = positionen.reduce((s, p) => s + p.endpreis, 0);
  const gesamtGKV = positionen.reduce((s, p) => s + p.gkv_abzug, 0);
  const gesamtBrutto = positionen.reduce((s, p) => s + p.preis, 0);
  const rateProMonat = ratenAnzahl > 0 ? gesamtEndpreis / ratenAnzahl : 0;
  const fmtEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const filteredGoz = GOZ.filter(g =>
    gozFilter.length === 0 || g.nr.includes(gozFilter) || g.bez.toLowerCase().includes(gozFilter.toLowerCase())
  );

  const generatePDF = () => {
    if (!selectedPatient) { alert("Bitte Patient auswaehlen"); return; }
    if (positionen.length === 0) { alert("Bitte Positionen hinzufuegen"); return; }
    const data = {
      patient: selectedPatient,
      patientArt,
      positionen,
      gesamtEndpreis,
      gesamtGKV,
      gesamtBrutto,
      ratenAnzahl,
      rateProMonat,
      startDatum,
      paketName: PAKETE.find(p => p.key === selectedPaket)?.name || "Individuell",
    };
    sessionStorage.setItem("ac-rechnung-preview", JSON.stringify(data));
    window.open("/rechnungen/vorschau", "_blank");
  };

  const artLabels: Record<PatientArt, string> = { kasse: "Kassenpatient (MKV)", privat: "Privatpatient (GOZ)", mkv: "Kassenrechnung (80/20)" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: fg, margin: 0, fontFamily: "'Fraunces', serif" }}>Rechnungs-Engine</h1>
        <p style={{ fontSize: 13, color: muted, marginTop: 4 }}>Rechnungen erstellen mit GOZ-Katalog, Behandlungspaketen und automatischer Berechnung</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 1. Patient + Patientenart */}
          <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>1. Patient & Versicherungsart</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: muted }} />
                <input
                  value={selectedPatient ? selectedPatient.name : patientSearch}
                  onChange={e => { setPatientSearch(e.target.value); setSelectedPatient(null); setShowPDropdown(true); }}
                  onFocus={() => setShowPDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPDropdown(false), 200)}
                  placeholder="Patient suchen..."
                  style={{ width: "100%", padding: "10px 10px 10px 34px", borderRadius: 10, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 14, fontFamily: "inherit", outline: "none" }}
                />
                {showPDropdown && patients.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, borderRadius: 12, background: dk ? "#1a1d2e" : "#fff", border: `1px solid ${border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 50, maxHeight: 200, overflowY: "auto" }}>
                    {patients.slice(0, 8).map(p => (
                      <div key={p.id} onMouseDown={() => { setSelectedPatient(p); setPatientSearch(""); setShowPDropdown(false); }} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${border}`, fontSize: 13, color: fg }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(74,222,128,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        {p.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <select value={patientArt} onChange={e => setPatientArt(e.target.value as PatientArt)} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 13, fontFamily: "inherit", outline: "none", minWidth: 180 }}>
                <option value="kasse">Kassenpatient (MKV)</option>
                <option value="privat">Privatpatient (GOZ)</option>
                <option value="mkv">Kassenrechnung (80/20)</option>
              </select>
            </div>
          </div>

          {/* 2. Behandlungspaket */}
          <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>2. Behandlungspaket</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PAKETE.map(pk => (
                <button key={pk.key} onClick={() => selectPaket(pk.key)} style={{
                  padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, textAlign: "left",
                  border: `1px solid ${selectedPaket === pk.key ? grn : border}`,
                  background: selectedPaket === pk.key ? (dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.04)") : "transparent",
                  color: selectedPaket === pk.key ? grn : fg,
                }}>
                  <div>{pk.name}</div>
                  {pk.preis && <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{pk.typ} | {pk.preis} EUR</div>}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Positionen */}
          <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em" }}>3. GOZ-Positionen</div>
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{positionen.length} Positionen | GOZ 2012 | {GOZ.length} verfuegbar</div>
              </div>
              <button onClick={() => setShowGozPicker(!showGozPicker)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: grn, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                <Plus size={14} /> Hinzufuegen
              </button>
            </div>

            {showGozPicker && (
              <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: dk ? "rgba(74,222,128,0.04)" : "rgba(34,197,94,0.02)", border: `1px solid rgba(74,222,128,0.15)`, maxHeight: 300, overflowY: "auto" }}>
                <input value={gozFilter} onChange={e => setGozFilter(e.target.value)} placeholder="GOZ-Nr oder Bezeichnung filtern..." style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 12, fontFamily: "inherit", outline: "none", marginBottom: 8 }} />
                {filteredGoz.map(g => (
                  <button key={g.nr + g.bez} onClick={() => addGozPosition(g)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: fg }}><strong style={{ color: grn }}>{g.nr}</strong> {g.bez}</span>
                    <span style={{ fontSize: 10, color: muted, whiteSpace: "nowrap", marginLeft: 8 }}>{fmtEur(g.pkt * PW)} EUR</span>
                  </button>
                ))}
              </div>
            )}

            {positionen.length === 0 ? (
              <p style={{ color: muted, fontSize: 13, textAlign: "center", padding: 20 }}>Paket waehlen oder Positionen einzeln hinzufuegen</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${border}` }}>
                      <th style={{ textAlign: "left", padding: "8px 6px", color: muted, fontWeight: 600, width: 75 }}>Datum</th>
                      <th style={{ textAlign: "left", padding: "8px 6px", color: muted, fontWeight: 600, width: 45 }}>GOZ</th>
                      <th style={{ textAlign: "left", padding: "8px 6px", color: muted, fontWeight: 600, width: 65 }}>Zahn/Kiefer</th>
                      <th style={{ textAlign: "left", padding: "8px 6px", color: muted, fontWeight: 600 }}>Leistung</th>
                      <th style={{ textAlign: "center", padding: "8px 6px", color: muted, fontWeight: 600, width: 48 }}>Anz.</th>
                      <th style={{ textAlign: "center", padding: "8px 6px", color: muted, fontWeight: 600, width: 55 }}>Faktor</th>
                      <th style={{ textAlign: "right", padding: "8px 6px", color: muted, fontWeight: 600, width: 65 }}>Mat./Lab.</th>
                      {patientArt !== "privat" && <th style={{ textAlign: "right", padding: "8px 6px", color: muted, fontWeight: 600 }}>GKV</th>}
                      <th style={{ textAlign: "right", padding: "8px 6px", color: muted, fontWeight: 600 }}>Endpreis</th>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionen.map(p => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${border}` }}>
                        <td style={{ padding: "8px 4px" }}>
                          <input type="date" value={p.datum} onChange={e => updatePos(p.id, "datum", e.target.value)} style={{ width: 68, padding: 3, borderRadius: 5, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 10, fontFamily: "inherit" }} />
                        </td>
                        <td style={{ padding: "8px 4px", color: grn, fontWeight: 600, fontSize: 11 }}>{p.goz_nr}</td>
                        <td style={{ padding: "8px 4px" }}>
                          <input value={p.region} onChange={e => updatePos(p.id, "region", e.target.value)} placeholder="OK/UK" style={{ width: 52, padding: 3, borderRadius: 5, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 10, fontFamily: "inherit" }} />
                        </td>
                        <td style={{ padding: "8px 4px", color: fg }}>
                          <input value={p.bezeichnung} onChange={e => updatePos(p.id, "bezeichnung", e.target.value)} style={{ background: "transparent", border: "none", color: fg, fontSize: 12, width: "100%", outline: "none", fontFamily: "inherit" }} />
                          {p.begruendung && <div style={{ fontSize: 9, color: muted, marginTop: 1 }}>{p.begruendung}</div>}
                        </td>
                        <td style={{ padding: "8px 4px", textAlign: "center" }}>
                          <input type="number" value={p.anzahl} onChange={e => updatePos(p.id, "anzahl", Number(e.target.value))} style={{ width: 44, textAlign: "center", padding: 4, borderRadius: 6, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 12, fontFamily: "inherit" }} />
                        </td>
                        <td style={{ padding: "8px 4px", textAlign: "center" }}>
                          <input type="number" step="0.1" value={p.faktor} onChange={e => updatePos(p.id, "faktor", Number(e.target.value))} style={{ width: 52, textAlign: "center", padding: 4, borderRadius: 6, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 12, fontFamily: "inherit" }} />
                        </td>
                        <td style={{ padding: "8px 4px", textAlign: "right" }}>
                          <input type="number" step="0.01" value={p.material || ""} onChange={e => updatePos(p.id, "material", Number(e.target.value))} placeholder="0" style={{ width: 52, textAlign: "right", padding: 3, borderRadius: 5, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 10, fontFamily: "inherit" }} />
                        </td>
                        {patientArt !== "privat" && <td style={{ padding: "8px 6px", textAlign: "right", color: p.gkv_abzug > 0 ? "#ef4444" : muted, fontSize: 11 }}>{p.gkv_abzug > 0 ? `-${fmtEur(p.gkv_abzug)}` : "\u2014"}</td>}
                        <td style={{ padding: "8px 6px", textAlign: "right", color: fg, fontWeight: 700 }}>{fmtEur(p.endpreis)}</td>
                        <td style={{ padding: "8px 2px" }}><button onClick={() => removePos(p.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Trash2 size={13} color="#ef4444" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Ratenplan */}
          {positionen.length > 0 && (
            <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>4. Ratenplan</div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 4 }}>Anzahl Raten</label>
                  <input type="number" value={ratenAnzahl} onChange={e => setRatenAnzahl(Number(e.target.value))} min={1} max={48} style={{ width: 80, padding: "8px 10px", borderRadius: 8, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 14, fontFamily: "inherit" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 4 }}>Startdatum</label>
                  <input type="date" value={startDatum} onChange={e => setStartDatum(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 14, fontFamily: "inherit" }} />
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: muted }}>Monatliche Rate</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: grn, fontFamily: "'Fraunces', serif" }}>{fmtEur(rateProMonat)} EUR</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Zusammenfassung */}
        <div>
          <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, position: "sticky", top: 80 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>Zusammenfassung</div>

            {selectedPatient ? (
              <div style={{ padding: "10px 12px", borderRadius: 10, background: dk ? "rgba(74,222,128,0.04)" : "rgba(34,197,94,0.02)", border: `1px solid rgba(74,222,128,0.12)`, marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: fg }}>{selectedPatient.name}</div>
                <div style={{ fontSize: 11, color: muted }}>{artLabels[patientArt]}</div>
              </div>
            ) : (
              <div style={{ padding: 12, borderRadius: 10, border: `1px dashed ${border}`, marginBottom: 12, textAlign: "center" }}>
                <span style={{ fontSize: 12, color: muted }}>Kein Patient ausgewaehlt</span>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: muted }}>Positionen</span>
                <span style={{ color: fg, fontWeight: 600 }}>{positionen.length}</span>
              </div>
              {patientArt !== "privat" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: muted }}>Brutto-Honorar</span>
                    <span style={{ color: fg }}>{fmtEur(gesamtBrutto)} EUR</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: muted }}>GKV-Abzuege</span>
                    <span style={{ color: "#ef4444", fontWeight: 600 }}>-{fmtEur(gesamtGKV)} EUR</span>
                  </div>
                </>
              )}
              <div style={{ height: 1, background: border }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                <span style={{ color: fg, fontWeight: 700 }}>{patientArt === "privat" ? "Gesamtbetrag" : "Eigenanteil"}</span>
                <span style={{ color: grn, fontWeight: 800, fontSize: 22, fontFamily: "'Fraunces', serif" }}>{fmtEur(gesamtEndpreis)} EUR</span>
              </div>
              {ratenAnzahl > 0 && positionen.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: muted }}>{ratenAnzahl} Raten</span>
                  <span style={{ color: fg, fontWeight: 600 }}>{fmtEur(rateProMonat)} EUR/Monat</span>
                </div>
              )}
            </div>

            <button onClick={generatePDF} disabled={!selectedPatient || positionen.length === 0} style={{
              width: "100%", padding: 14, borderRadius: 12, border: "none", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: (!selectedPatient || positionen.length === 0) ? (dk ? "#222" : "#ddd") : grn,
              color: (!selectedPatient || positionen.length === 0) ? muted : "#fff",
              cursor: (!selectedPatient || positionen.length === 0) ? "not-allowed" : "pointer",
            }}>
              <Eye size={16} /> Vorschau & PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
