"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { FileText, Plus, Trash2, Download, Eye, ChevronDown, Search, Package } from "lucide-react";

interface Patient { id: string; name: string; vorname?: string; nachname?: string; geburtsdatum?: string; email?: string; }
interface Position { id: string; goz_nr: string; bezeichnung: string; faktor: number; anzahl: number; preis: number; gkv_abzug: number; endpreis: number; begruendung: string; }

const GOZ_KATALOG = [
  { goz_nr: "6100", bezeichnung: "Eingliederung Klebebracket", goz_1_0: 9.28, bema_punkte: 18, std_faktor: 2.30, begr: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
  { goz_nr: "6110", bezeichnung: "Entfernung Klebebracket", goz_1_0: 3.94, bema_punkte: 6, std_faktor: 2.30, begr: "" },
  { goz_nr: "6120", bezeichnung: "Eingliederung Band", goz_1_0: 12.94, bema_punkte: 42, std_faktor: 3.00, begr: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
  { goz_nr: "6140", bezeichnung: "Retainer-Teilbogen", goz_1_0: 12.94, bema_punkte: 0, std_faktor: 2.55, begr: "schwieriger Zugang, schwierige Fixierung" },
  { goz_nr: "6150", bezeichnung: "Ungeteilter Bogen", goz_1_0: 28.12, bema_punkte: 32, std_faktor: 2.00, begr: "" },
  { goz_nr: "4050", bezeichnung: "Entfernung Zahnbeläge", goz_1_0: 0.61, bema_punkte: 0, std_faktor: 2.30, begr: "" },
  { goz_nr: "2000a", bezeichnung: "Bracketumfeldschutz", goz_1_0: 5.06, bema_punkte: 0, std_faktor: 1.80, begr: "" },
  { goz_nr: "4050a", bezeichnung: "KFO-Prophylaxe/Airflow", goz_1_0: 0.70, bema_punkte: 0, std_faktor: 1.15, begr: "" },
  { goz_nr: "1020", bezeichnung: "Lokale Fluoridierung", goz_1_0: 2.81, bema_punkte: 0, std_faktor: 1.00, begr: "" },
  { goz_nr: "4020a", bezeichnung: "Behandlung Mundschleimhaut", goz_1_0: 2.53, bema_punkte: 0, std_faktor: 1.00, begr: "" },
];

const KFO_PUNKTWERT = 0.6550;

const PAKETE: Record<string, { name: string; positionen: Omit<Position, "id">[] }> = {
  keramik: {
    name: "Keramikbrackets (1.795,74 €)",
    positionen: [
      { goz_nr: "6100", bezeichnung: "Keramikbrackets", faktor: 5.00, anzahl: 12, preis: 556.80, gkv_abzug: 141.48, endpreis: 415.32, begruendung: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
      { goz_nr: "6110", bezeichnung: "Keramikbrackets Entfernung", faktor: 5.00, anzahl: 12, preis: 165.48, gkv_abzug: 47.16, endpreis: 118.32, begruendung: "" },
      { goz_nr: "6120", bezeichnung: "Komfortbänder", faktor: 3.00, anzahl: 8, preis: 310.48, gkv_abzug: 220.08, endpreis: 90.04, begruendung: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
      { goz_nr: "6150", bezeichnung: "Superelastische Bögen", faktor: 2.00, anzahl: 10, preis: 562.40, gkv_abzug: 209.60, endpreis: 352.80, begruendung: "" },
      { goz_nr: "2000a", bezeichnung: "Bracketumfeldschutz", faktor: 1.80, anzahl: 20, preis: 182.20, gkv_abzug: 0, endpreis: 182.20, begruendung: "" },
      { goz_nr: "6100", bezeichnung: "Metallbrackets", faktor: 2.30, anzahl: 8, preis: 170.72, gkv_abzug: 94.32, endpreis: 76.40, begruendung: "" },
      { goz_nr: "4050a", bezeichnung: "Airflow-KFO (9 Termine)", faktor: 1.15, anzahl: 216, preis: 151.80, gkv_abzug: 0, endpreis: 151.80, begruendung: "" },
      { goz_nr: "1020", bezeichnung: "Lokale Fluoridierung", faktor: 1.00, anzahl: 9, preis: 25.29, gkv_abzug: 0, endpreis: 25.29, begruendung: "" },
      { goz_nr: "4020a", bezeichnung: "Mundschleimhaut", faktor: 1.00, anzahl: 9, preis: 22.77, gkv_abzug: 0, endpreis: 22.77, begruendung: "" },
      { goz_nr: "6100", bezeichnung: "Festsitzender Retainer OK+UK", faktor: 2.55, anzahl: 12, preis: 283.97, gkv_abzug: 0, endpreis: 283.97, begruendung: "schwieriger Zugang, schwierige Fixierung" },
      { goz_nr: "6140", bezeichnung: "Retainer Teilbogen", faktor: 2.55, anzahl: 2, preis: 60.23, gkv_abzug: 0, endpreis: 60.23, begruendung: "schwieriger Zugang, schwierige Fixierung" },
      { goz_nr: "4050", bezeichnung: "Entfernung Zahnbeläge", faktor: 2.30, anzahl: 12, preis: 16.60, gkv_abzug: 0, endpreis: 16.60, begruendung: "" },
    ],
  },
  mini: {
    name: "Minibrackets (1.627,62 €)",
    positionen: [
      { goz_nr: "6100", bezeichnung: "Minibrackets", faktor: 3.50, anzahl: 20, preis: 649.60, gkv_abzug: 235.80, endpreis: 413.80, begruendung: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
      { goz_nr: "6120", bezeichnung: "Komfortbänder", faktor: 3.00, anzahl: 8, preis: 310.48, gkv_abzug: 220.08, endpreis: 90.04, begruendung: "überdurchschnittlicher Zeitbedarf und Positionierungsaufwand" },
      { goz_nr: "6150", bezeichnung: "Superelastische Bögen", faktor: 2.10, anzahl: 10, preis: 590.52, gkv_abzug: 209.60, endpreis: 380.92, begruendung: "" },
      { goz_nr: "2000a", bezeichnung: "Bracketumfeldschutz", faktor: 1.80, anzahl: 20, preis: 182.20, gkv_abzug: 0, endpreis: 182.20, begruendung: "" },
      { goz_nr: "4050a", bezeichnung: "Airflow-KFO (9 Termine)", faktor: 1.15, anzahl: 216, preis: 151.80, gkv_abzug: 0, endpreis: 151.80, begruendung: "" },
      { goz_nr: "1020", bezeichnung: "Lokale Fluoridierung", faktor: 1.00, anzahl: 9, preis: 25.29, gkv_abzug: 0, endpreis: 25.29, begruendung: "" },
      { goz_nr: "4020a", bezeichnung: "Mundschleimhaut", faktor: 1.00, anzahl: 9, preis: 22.77, gkv_abzug: 0, endpreis: 22.77, begruendung: "" },
      { goz_nr: "6100", bezeichnung: "Festsitzender Retainer OK+UK", faktor: 2.55, anzahl: 12, preis: 283.97, gkv_abzug: 0, endpreis: 283.97, begruendung: "schwieriger Zugang, schwierige Fixierung" },
      { goz_nr: "6140", bezeichnung: "Retainer Teilbogen", faktor: 2.55, anzahl: 2, preis: 60.23, gkv_abzug: 0, endpreis: 60.23, begruendung: "schwieriger Zugang, schwierige Fixierung" },
      { goz_nr: "4050", bezeichnung: "Entfernung Zahnbeläge", faktor: 2.30, anzahl: 12, preis: 16.60, gkv_abzug: 0, endpreis: 16.60, begruendung: "" },
    ],
  },
};

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
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [selectedPaket, setSelectedPaket] = useState<string>("");
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [ratenAnzahl, setRatenAnzahl] = useState(12);
  const [startDatum, setStartDatum] = useState(new Date().toISOString().slice(0, 10));
  const [showGozPicker, setShowGozPicker] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Fetch patients on mount
  useEffect(() => {
    fetch("/api/praxis/search?q=a").then(r => r.json()).then(j => {
      // Load a broader set
      fetch("/api/praxis/search?q=e").then(r2 => r2.json()).then(j2 => {
        const all = [...(j.results || []), ...(j2.results || [])];
        const unique = Array.from(new Map(all.map((p: any) => [p.id, p])).values()) as Patient[];
        setPatients(unique);
      });
    });
  }, []);

  const filteredPatients = patients.filter(p =>
    `${p.name || ""} ${p.vorname || ""} ${p.nachname || ""}`.toLowerCase().includes(patientSearch.toLowerCase())
  );

  // Select package → load positions
  const selectPaket = (key: string) => {
    setSelectedPaket(key);
    if (PAKETE[key]) {
      setPositionen(PAKETE[key].positionen.map((p, i) => ({ ...p, id: `pos-${i}` })));
    }
  };

  // Add position from GOZ catalog
  const addPosition = (goz: typeof GOZ_KATALOG[0]) => {
    const newPos: Position = {
      id: `pos-${Date.now()}`,
      goz_nr: goz.goz_nr,
      bezeichnung: goz.bezeichnung,
      faktor: goz.std_faktor,
      anzahl: 1,
      preis: goz.goz_1_0 * goz.std_faktor,
      gkv_abzug: goz.bema_punkte > 0 ? goz.bema_punkte * KFO_PUNKTWERT : 0,
      endpreis: (goz.goz_1_0 * goz.std_faktor) - (goz.bema_punkte > 0 ? goz.bema_punkte * KFO_PUNKTWERT : 0),
      begruendung: goz.begr,
    };
    setPositionen(prev => [...prev, newPos]);
    setShowGozPicker(false);
  };

  // Update position field
  const updatePosition = (id: string, field: string, value: any) => {
    setPositionen(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      // Recalculate if faktor or anzahl changed
      if (field === "faktor" || field === "anzahl") {
        const goz = GOZ_KATALOG.find(g => g.goz_nr === updated.goz_nr);
        if (goz) {
          updated.preis = goz.goz_1_0 * updated.faktor * updated.anzahl;
          updated.gkv_abzug = goz.bema_punkte > 0 ? goz.bema_punkte * KFO_PUNKTWERT * updated.anzahl : 0;
          updated.endpreis = updated.preis - updated.gkv_abzug;
        }
      }
      return updated;
    }));
  };

  const removePosition = (id: string) => setPositionen(prev => prev.filter(p => p.id !== id));

  const gesamtEndpreis = positionen.reduce((s, p) => s + p.endpreis, 0);
  const gesamtGKV = positionen.reduce((s, p) => s + p.gkv_abzug, 0);
  const rateProMonat = ratenAnzahl > 0 ? gesamtEndpreis / ratenAnzahl : 0;

  const fmtEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const generatePDF = () => {
    if (!selectedPatient) { alert("Bitte Patient auswählen"); return; }
    if (positionen.length === 0) { alert("Bitte Positionen hinzufügen"); return; }
    setGenerating(true);
    window.open(`/api/rechnungen/generate?patient_id=${selectedPatient.id}`, "_blank");
    setTimeout(() => setGenerating(false), 1000);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: fg, margin: 0, fontFamily: "'Fraunces', serif" }}>Rechnungs-Engine</h1>
          <p style={{ fontSize: 13, color: muted, marginTop: 4 }}>Rechnungen erstellen, Positionen verwalten, PDF generieren</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* Left: Editor */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Patient Selection */}
          <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>1. Patient auswählen</div>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: muted }} />
              <input
                value={selectedPatient ? `${(selectedPatient as any).name || (selectedPatient.vorname + " " + selectedPatient.nachname)}` : patientSearch}
                onChange={e => { setPatientSearch(e.target.value); setSelectedPatient(null); setShowPatientDropdown(true); }}
                onFocus={() => setShowPatientDropdown(true)}
                onBlur={() => setTimeout(() => setShowPatientDropdown(false), 200)}
                placeholder="Name eingeben..."
                style={{ width: "100%", padding: "10px 10px 10px 34px", borderRadius: 10, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 14, fontFamily: "inherit", outline: "none" }}
              />
              {showPatientDropdown && patientSearch.length >= 1 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, borderRadius: 12, background: dk ? "#1a1d2e" : "#fff", border: `1px solid ${border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 50, maxHeight: 200, overflowY: "auto" }}>
                  {filteredPatients.slice(0, 8).map(p => (
                    <div key={p.id} onMouseDown={() => { setSelectedPatient(p); setPatientSearch(""); setShowPatientDropdown(false); }} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${border}`, fontSize: 13, color: fg }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(74,222,128,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      {(p as any).name || `${p.vorname} ${p.nachname}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Package Selection */}
          <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>2. Behandlungspaket</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(PAKETE).map(([key, pak]) => (
                <button key={key} onClick={() => selectPaket(key)} style={{ padding: "10px 16px", borderRadius: 12, border: `1px solid ${selectedPaket === key ? grn : border}`, background: selectedPaket === key ? (dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.04)") : "transparent", color: selectedPaket === key ? grn : fg, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  <Package size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{pak.name}
                </button>
              ))}
              <button onClick={() => { setSelectedPaket("custom"); setPositionen([]); }} style={{ padding: "10px 16px", borderRadius: 12, border: `1px solid ${selectedPaket === "custom" ? grn : border}`, background: selectedPaket === "custom" ? (dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.04)") : "transparent", color: selectedPaket === "custom" ? grn : fg, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Individuell
              </button>
            </div>
          </div>

          {/* Positions Table */}
          <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em" }}>3. Positionen</div>
              <button onClick={() => setShowGozPicker(!showGozPicker)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: grn, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                <Plus size={14} /> Position hinzufügen
              </button>
            </div>

            {/* GOZ Picker */}
            {showGozPicker && (
              <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: dk ? "rgba(74,222,128,0.04)" : "rgba(34,197,94,0.02)", border: `1px solid rgba(74,222,128,0.15)` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 8 }}>GOZ-Position auswählen:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {GOZ_KATALOG.map(g => (
                    <button key={g.goz_nr + g.bezeichnung} onClick={() => addPosition(g)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                      <span style={{ fontSize: 12, color: fg }}><strong style={{ color: grn }}>{g.goz_nr}</strong> — {g.bezeichnung}</span>
                      <span style={{ fontSize: 11, color: muted }}>Faktor {g.std_faktor}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {positionen.length === 0 ? (
              <p style={{ color: muted, fontSize: 13, textAlign: "center", padding: 20 }}>Wähle ein Paket oder füge einzelne Positionen hinzu</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${border}` }}>
                      <th style={{ textAlign: "left", padding: "8px 6px", color: muted, fontWeight: 600 }}>GOZ</th>
                      <th style={{ textAlign: "left", padding: "8px 6px", color: muted, fontWeight: 600 }}>Leistung</th>
                      <th style={{ textAlign: "center", padding: "8px 6px", color: muted, fontWeight: 600, width: 60 }}>Anz.</th>
                      <th style={{ textAlign: "center", padding: "8px 6px", color: muted, fontWeight: 600, width: 70 }}>Faktor</th>
                      <th style={{ textAlign: "right", padding: "8px 6px", color: muted, fontWeight: 600 }}>GKV</th>
                      <th style={{ textAlign: "right", padding: "8px 6px", color: muted, fontWeight: 600 }}>Endpreis</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionen.map(p => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${border}` }}>
                        <td style={{ padding: "8px 6px", color: grn, fontWeight: 600 }}>{p.goz_nr}</td>
                        <td style={{ padding: "8px 6px", color: fg }}>
                          <input value={p.bezeichnung} onChange={e => updatePosition(p.id, "bezeichnung", e.target.value)} style={{ background: "transparent", border: "none", color: fg, fontSize: 12, width: "100%", outline: "none", fontFamily: "inherit" }} />
                          {p.begruendung && <div style={{ fontSize: 10, color: muted, marginTop: 1 }}>{p.begruendung}</div>}
                        </td>
                        <td style={{ padding: "8px 4px", textAlign: "center" }}>
                          <input type="number" value={p.anzahl} onChange={e => updatePosition(p.id, "anzahl", Number(e.target.value))} style={{ width: 48, textAlign: "center", padding: 4, borderRadius: 6, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 12, fontFamily: "inherit" }} />
                        </td>
                        <td style={{ padding: "8px 4px", textAlign: "center" }}>
                          <input type="number" step="0.1" value={p.faktor} onChange={e => updatePosition(p.id, "faktor", Number(e.target.value))} style={{ width: 56, textAlign: "center", padding: 4, borderRadius: 6, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 12, fontFamily: "inherit" }} />
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "right", color: p.gkv_abzug > 0 ? "#ef4444" : muted, fontSize: 11 }}>
                          {p.gkv_abzug > 0 ? `-${fmtEur(p.gkv_abzug)}` : "—"}
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "right", color: fg, fontWeight: 700 }}>{fmtEur(p.endpreis)}</td>
                        <td style={{ padding: "8px 2px" }}>
                          <button onClick={() => removePosition(p.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                            <Trash2 size={14} color="#ef4444" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Ratenplan */}
          {positionen.length > 0 && (
            <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>4. Ratenplan</div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 4 }}>Anzahl Raten</label>
                  <input type="number" value={ratenAnzahl} onChange={e => setRatenAnzahl(Number(e.target.value))} min={1} max={48} style={{ width: 80, padding: "8px 10px", borderRadius: 8, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 14, fontFamily: "inherit" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 4 }}>Start</label>
                  <input type="date" value={startDatum} onChange={e => setStartDatum(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${border}`, background: inputBg, color: fg, fontSize: 14, fontFamily: "inherit" }} />
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: muted }}>Rate pro Monat</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: grn, fontFamily: "'Fraunces', serif" }}>{fmtEur(rateProMonat)} €</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Summary Card */}
          <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, position: "sticky", top: 80 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>Zusammenfassung</div>

            {selectedPatient ? (
              <div style={{ padding: "10px 12px", borderRadius: 10, background: dk ? "rgba(74,222,128,0.04)" : "rgba(34,197,94,0.02)", border: `1px solid rgba(74,222,128,0.12)`, marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: fg }}>{(selectedPatient as any).name || `${selectedPatient.vorname} ${selectedPatient.nachname}`}</div>
                <div style={{ fontSize: 11, color: muted }}>Patient</div>
              </div>
            ) : (
              <div style={{ padding: 12, borderRadius: 10, border: `1px dashed ${border}`, marginBottom: 12, textAlign: "center" }}>
                <span style={{ fontSize: 12, color: muted }}>Kein Patient ausgewählt</span>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: muted }}>Positionen</span>
                <span style={{ color: fg, fontWeight: 600 }}>{positionen.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: muted }}>GKV-Abzüge</span>
                <span style={{ color: "#ef4444", fontWeight: 600 }}>-{fmtEur(gesamtGKV)} €</span>
              </div>
              <div style={{ height: 1, background: border }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                <span style={{ color: fg, fontWeight: 700 }}>Eigenanteil</span>
                <span style={{ color: grn, fontWeight: 800, fontSize: 22, fontFamily: "'Fraunces', serif" }}>{fmtEur(gesamtEndpreis)} €</span>
              </div>
              {ratenAnzahl > 0 && positionen.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: muted }}>{ratenAnzahl} Raten à</span>
                  <span style={{ color: fg, fontWeight: 600 }}>{fmtEur(rateProMonat)} €</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={generatePDF} disabled={!selectedPatient || positionen.length === 0} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: (!selectedPatient || positionen.length === 0) ? (dk ? "#222" : "#ddd") : grn, color: (!selectedPatient || positionen.length === 0) ? muted : "#fff", fontSize: 14, fontWeight: 700, cursor: (!selectedPatient || positionen.length === 0) ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Eye size={16} /> Vorschau & PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
