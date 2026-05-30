"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/hooks/useAppStore";
import { ArrowLeft, Download, Printer } from "lucide-react";
import Link from "next/link";

interface Pos { goz_nr: string; bezeichnung: string; faktor: number; anzahl: number; preis: number; gkv_abzug: number; endpreis: number; begruendung: string; datum?: string; region?: string; material?: number; }
interface PreviewData {
  patient: { id: string; name: string };
  patientArt: string;
  positionen: Pos[];
  gesamtEndpreis: number;
  gesamtGKV: number;
  gesamtBrutto: number;
  ratenAnzahl: number;
  rateProMonat: number;
  startDatum: string;
  paketName: string;
}

export default function VorschauPage() {
  const { theme } = useAppStore();
  const dk = theme === "dark";
  const [data, setData] = useState<PreviewData | null>(null);
  const [rNr] = useState(() => String(Math.floor(Math.random() * 90000) + 10000).padStart(8, "0"));

  useEffect(() => {
    const raw = sessionStorage.getItem("ac-rechnung-preview");
    if (raw) setData(JSON.parse(raw));
  }, []);

  if (!data) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <p style={{ color: "#666", fontSize: 14 }}>Keine Rechnungsdaten gefunden.</p>
      <Link href="/rechnungen" style={{ color: "#4ade80", fontSize: 14, fontWeight: 600 }}>Zur Rechnungs-Engine</Link>
    </div>
  );

  const fE = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = new Date();
  const datum = today.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const faellig = new Date(today.getTime() + 14 * 864e5).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const uz = data.patient.id.slice(0, 8).toUpperCase() + "-1";
  const isGOZ = data.patientArt === "privat";

  // Separate honorar positions from material positions
  const honorarPos = data.positionen.filter(p => p.goz_nr !== "Material");
  const materialPos = data.positionen.filter(p => p.goz_nr === "Material");
  const honorarSumme = honorarPos.reduce((s, p) => s + p.endpreis, 0);
  const materialSumme = materialPos.reduce((s, p) => s + p.endpreis, 0);

  // Collect Begruendungen
  const bgrList = honorarPos.filter(p => p.begruendung).map((p, i) => ({ nr: i + 1, text: p.begruendung }));

  // Font: Arial as per VDDS Ausfuellhinweise
  const f = "Arial, Helvetica, sans-serif";

  // ============ GOZ-Rechnung (Anlage 2) ============
  const Anlage2Template = () => (
    <div style={{ fontFamily: f, fontSize: 10, color: "#000", lineHeight: 1.4 }}>

      {/* === BRIEFKOPF === */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 8, borderBottom: "1px solid #000" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: "bold" }}>Dr. Maria Elena Schubert</div>
          <div style={{ fontSize: 10 }}>Kieferorthop&auml;din</div>
          <div style={{ fontSize: 9, color: "#333" }}>04109 Leipzig, Nikolaistrasse 20 im Oelssner&apos;s Hof</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 9 }}>
          Telefon: 0341-9806457<br/>
          E-Mail: info@schubert-holi-dontics.de<br/>
          Internet: schubert-holi-dontics.de
        </div>
      </div>

      {/* === ABSENDER (Fensterbriefumschlag) === */}
      <div style={{ fontSize: 7, color: "#555", marginTop: 10, paddingBottom: 2, borderBottom: "0.5px solid #999" }}>
        Dr. Maria Elena Schubert &middot; Nikolaistrasse 20 im Oelssner&apos;s Hof &middot; 04109 Leipzig
      </div>

      {/* === EMPFAENGER === */}
      <div style={{ fontSize: 10, marginTop: 10, marginBottom: 20, lineHeight: 1.6, minHeight: 60 }}>
        {data.patient.name}
      </div>

      {/* === RECHNUNG === */}
      <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 12 }}>RECHNUNG</div>

      {/* === RECHNUNGSDATEN === */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 4 }}>
        <div>Unser Zeichen: <strong>{uz}</strong></div>
        <div>Rechnungsdatum: {datum}</div>
      </div>
      <div style={{ fontSize: 9, marginBottom: 2 }}>Bitte bei &Uuml;berweisung Unser Zeichen angeben.</div>
      <div style={{ fontSize: 9, marginBottom: 8 }}>Rechnungsnummer: {rNr}</div>

      {/* === BEHANDELTE PERSON === */}
      <div style={{ fontSize: 9, marginBottom: 4 }}>
        Behandelte Person: {data.patient.name}
      </div>

      <div style={{ height: 12 }} />

      {/* === LEISTUNGSUEBERSICHT (8 Spalten gemaess Anlage 2) === */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
        <thead>
          <tr style={{ borderTop: "1.5px solid #000", borderBottom: "1px solid #000" }}>
            <th style={{ textAlign: "left", padding: "4px 3px", fontWeight: "bold", width: "9%" }}>Datum</th>
            <th style={{ textAlign: "left", padding: "4px 3px", fontWeight: "bold", width: "7%" }}>Region</th>
            <th style={{ textAlign: "left", padding: "4px 3px", fontWeight: "bold", width: "6%" }}>Nr.</th>
            <th style={{ textAlign: "left", padding: "4px 3px", fontWeight: "bold" }}>Leistungsbeschreibung/Auslagen</th>
            <th style={{ textAlign: "center", padding: "4px 3px", fontWeight: "bold", width: "5%" }}>Bgr.</th>
            <th style={{ textAlign: "right", padding: "4px 3px", fontWeight: "bold", width: "8%" }}>Faktor</th>
            <th style={{ textAlign: "right", padding: "4px 3px", fontWeight: "bold", width: "5%" }}>Anz.</th>
            <th style={{ textAlign: "right", padding: "4px 3px", fontWeight: "bold", width: "10%" }}>EUR</th>
          </tr>
        </thead>
        <tbody>
          {honorarPos.map((p, i) => {
            const bgrIdx = bgrList.findIndex(b => b.text === p.begruendung);
            return (
              <tr key={i} style={{ borderBottom: "0.5px solid #ddd" }}>
                <td style={{ padding: "3px", verticalAlign: "top", fontSize: 8 }}>{p.datum ? new Date(p.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : ""}</td>
                <td style={{ padding: "3px", verticalAlign: "top", fontSize: 8 }}>{p.region || ""}</td>
                <td style={{ padding: "3px", verticalAlign: "top" }}>{p.goz_nr}</td>
                <td style={{ padding: "3px", verticalAlign: "top" }}>{p.bezeichnung}</td>
                <td style={{ padding: "3px", verticalAlign: "top", textAlign: "center" }}>{bgrIdx >= 0 ? `${bgrIdx + 1})` : ""}</td>
                <td style={{ padding: "3px", verticalAlign: "top", textAlign: "right" }}>{p.faktor.toFixed(2)}</td>
                <td style={{ padding: "3px", verticalAlign: "top", textAlign: "right" }}>{p.anzahl}</td>
                <td style={{ padding: "3px", verticalAlign: "top", textAlign: "right" }}>{fE(p.endpreis)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* === ZWISCHENSUMME HONORAR === */}
      <div style={{ borderTop: "1px solid #000", marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, padding: "4px 0" }}>
          <span>Zwischensumme Honorar:</span>
          <span>{fE(honorarSumme)}</span>
        </div>
      </div>

      {/* === AUSLAGEN === */}
      {materialSumme > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, padding: "2px 0" }}>
          <span>Auslagen nach &sect;9 GOZ gem&auml;&szlig; Praxislaborbeleg:</span>
          <span>{fE(materialSumme)}</span>
        </div>
      )}

      {/* === 2 LEERZEILEN (Pflicht) === */}
      <div style={{ height: 20 }} />

      {/* === RECHNUNGSBETRAG === */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: "bold", padding: "4px 0", borderTop: "1.5px solid #000", borderBottom: "1.5px solid #000" }}>
        <span>Rechnungsbetrag:</span>
        <span>{fE(data.gesamtEndpreis)}</span>
      </div>

      {/* === 2 LEERZEILEN (Pflicht) === */}
      <div style={{ height: 20 }} />

      {/* === ZAHLUNGSHINWEIS === */}
      <div style={{ fontSize: 9, lineHeight: 1.5, marginBottom: 12 }}>
        Bitte &uuml;berweisen Sie den Betrag in H&ouml;he von <strong>{fE(data.gesamtEndpreis)} EUR</strong> bis sp&auml;testens {faellig} auf eines unserer unten angegebenen Konten.
      </div>

      {/* === RATENPLAN === */}
      {data.ratenAnzahl > 1 && (
        <div style={{ fontSize: 9, marginBottom: 12 }}>
          <strong>Ratenplan:</strong> {data.ratenAnzahl} Raten &agrave; {fE(data.rateProMonat)} EUR/Monat, Beginn {new Date(data.startDatum).toLocaleDateString("de-DE")}
        </div>
      )}

      {/* === BEGRUENDUNGEN === */}
      {bgrList.length > 0 && (
        <div style={{ fontSize: 8, marginBottom: 12, borderTop: "0.5px solid #999", paddingTop: 6 }}>
          <div style={{ fontWeight: "bold", marginBottom: 3 }}>Bgr. Weitere Ausf&uuml;hrungen soweit in Spalte Begr&uuml;ndungen (Bgr.) Kennzeichen gesetzt wurde</div>
          {bgrList.map((b, i) => (
            <div key={i}>{b.nr}) {b.text}</div>
          ))}
        </div>
      )}

      {/* === BANKVERBINDUNG === */}
      <div style={{ fontSize: 8, color: "#333", padding: "6px 0", borderTop: "0.5px solid #999" }}>
        Konto: Sparkasse Leipzig / BLZ: 86055592 / Kto.-Nr.: 1090118941<br/>
        IBAN: DE03860555921090118941 / BIC: WELADE8LXXX
      </div>

      {/* === FOOTER === */}
      <div style={{ fontSize: 7, color: "#666", marginTop: 12, lineHeight: 1.4 }}>
        Konformit&auml;tserkl&auml;rung gem&auml;&szlig; Anhang XIII MDR f&uuml;r Sonderanfertigungen: Diese Sonderanfertigung ist ausschlie&szlig;lich f&uuml;r den genannten Patienten bestimmt. Wir sichern zu, dass diese Sonderanfertigung den in Anhang I der Verordnung (EU) 2017/745 angegebenen grundlegenden Sicherheits- und Leistungsanforderungen entspricht.
      </div>
      <div style={{ fontSize: 7, color: "#666", marginTop: 4, lineHeight: 1.4 }}>
        Alle kieferorthop&auml;dischen Ger&auml;te bleiben Eigentum des verordnenden Kieferorthop&auml;den. Alle erbrachten Leistungen sind nach &sect;4 Nr. 14 UStG. von der Umsatzsteuer befreit.
      </div>
    </div>
  );

  // ============ MKV-RECHNUNG (freies Format) ============
  const MKVTemplate = () => (
    <div style={{ fontFamily: f, fontSize: 10, color: "#000", lineHeight: 1.4 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 8, borderBottom: "1px solid #000" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: "bold" }}>Dr. Maria Elena Schubert</div>
          <div style={{ fontSize: 10 }}>Zahn&auml;rztin f&uuml;r Kieferorthop&auml;die</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 9 }}>
          04109 Leipzig &middot; Oelssner&apos;s Hof &middot; Nikolaistr. 20<br/>
          Tel.: 0341/9806457 &middot; Fax: 0341/9806458
        </div>
      </div>

      <div style={{ fontSize: 7, color: "#555", marginTop: 10, paddingBottom: 2, borderBottom: "0.5px solid #999" }}>
        Dr. Maria Elena Schubert &middot; Nikolaistrasse 20 im Oelssner&apos;s Hof &middot; 04109 Leipzig
      </div>

      <div style={{ fontSize: 10, marginTop: 10, marginBottom: 20, lineHeight: 1.6 }}>
        {data.patient.name}
      </div>

      <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 12 }}>RECHNUNG</div>

      {/* Rechnungsdaten */}
      <table style={{ fontSize: 9, marginBottom: 4, borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={{ fontWeight: "bold", paddingRight: 16, paddingBottom: 2 }}>Rechnungsdatum:</td><td>{datum}</td></tr>
          <tr><td style={{ fontWeight: "bold", paddingRight: 16, paddingBottom: 2 }}>Unser Zeichen:</td><td>{uz}</td></tr>
          <tr><td colSpan={2} style={{ fontSize: 8, paddingBottom: 2 }}>Bitte bei &Uuml;berweisung Unser Zeichen angeben.</td></tr>
          <tr><td style={{ fontWeight: "bold", paddingRight: 16, paddingBottom: 2 }}>Rechnungsnummer:</td><td>{rNr}</td></tr>
        </tbody>
      </table>

      <table style={{ fontSize: 9, marginBottom: 8, borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={{ fontWeight: "bold", paddingRight: 16 }}>Behandelte Person</td><td>{data.patient.name}</td></tr>
        </tbody>
      </table>

      <div style={{ fontSize: 9, marginBottom: 10 }}>F&uuml;r die erbrachten kieferorthop&auml;dischen und zahn&auml;rztlichen Leistungen erlaube ich mir in Rechnung zu stellen:</div>

      {/* MKV Positions Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
        <thead>
          <tr style={{ borderTop: "1.5px solid #000", borderBottom: "1px solid #000" }}>
            <th style={{ textAlign: "left", padding: "4px 3px", fontWeight: "bold", width: "9%" }}>Datum</th>
            <th style={{ textAlign: "left", padding: "4px 3px", fontWeight: "bold", width: "6%" }}>Nr.</th>
            <th style={{ textAlign: "left", padding: "4px 3px", fontWeight: "bold", width: "7%" }}>Zahn/<br/>Kiefer</th>
            <th style={{ textAlign: "left", padding: "4px 3px", fontWeight: "bold" }}>Leistung</th>
            <th style={{ textAlign: "right", padding: "4px 3px", fontWeight: "bold", width: "7%" }}>Anzahl</th>
            <th style={{ textAlign: "right", padding: "4px 3px", fontWeight: "bold", width: "8%" }}>Faktor</th>
            <th style={{ textAlign: "right", padding: "4px 3px", fontWeight: "bold", width: "10%" }}>Mat./Labor<br/>EUR</th>
            <th style={{ textAlign: "right", padding: "4px 3px", fontWeight: "bold", width: "10%" }}>Honorar<br/>EUR</th>
          </tr>
        </thead>
        <tbody>
          {data.positionen.map((p, i) => (
            <tr key={i} style={{ borderBottom: "0.5px solid #ddd" }}>
              <td style={{ padding: "3px", verticalAlign: "top", fontSize: 8 }}>{p.datum ? new Date(p.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""}</td>
              <td style={{ padding: "3px", verticalAlign: "top" }}>{p.goz_nr}</td>
              <td style={{ padding: "3px", verticalAlign: "top", fontSize: 8 }}>{p.region || ""}</td>
              <td style={{ padding: "3px", verticalAlign: "top" }}>
                {p.bezeichnung}
                {p.begruendung && <><br/><span style={{ fontSize: 7.5, color: "#666" }}>{p.begruendung}</span></>}
              </td>
              <td style={{ padding: "3px", verticalAlign: "top", textAlign: "right" }}>{p.anzahl}</td>
              <td style={{ padding: "3px", verticalAlign: "top", textAlign: "right" }}>{p.faktor.toFixed(2)}</td>
              <td style={{ padding: "3px", verticalAlign: "top", textAlign: "right" }}>{(p.material && p.material > 0) ? fE(p.material) : ""}</td>
              <td style={{ padding: "3px", verticalAlign: "top", textAlign: "right" }}>{fE(p.preis)}</td>
            </tr>
          ))}
          {/* Kassenabzuege */}
          {data.positionen.filter(p => p.gkv_abzug > 0).map((p, i) => (
            <tr key={"abz" + i} style={{ borderBottom: "0.5px solid #ddd", color: "#666" }}>
              <td style={{ padding: "3px", fontSize: 8 }}>abz&uuml;gl.</td>
              <td style={{ padding: "3px" }}></td>
              <td style={{ padding: "3px", fontSize: 8 }}>{p.bezeichnung} Kassenleistung</td>
              <td style={{ padding: "3px", textAlign: "right" }}>-{p.anzahl}</td>
              <td style={{ padding: "3px", textAlign: "right" }}></td>
              <td style={{ padding: "3px", textAlign: "right" }}></td>
              <td style={{ padding: "3px", textAlign: "right" }}>-{fE(p.gkv_abzug)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summen */}
      <div style={{ borderTop: "1px solid #000", marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, padding: "3px 0" }}>
          <span>Zwischensumme Honorar in EUR</span>
          <span style={{ display: "flex", gap: 30 }}>
            <span>{fE(data.gesamtGKV)}</span>
            <span>{fE(data.gesamtBrutto)}</span>
          </span>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: "bold", padding: "4px 0", borderTop: "1.5px solid #000", borderBottom: "1.5px solid #000" }}>
        <span>Gesamtbetrag in EUR</span>
        <span>{fE(data.gesamtEndpreis)}</span>
      </div>

      <div style={{ height: 16 }} />

      {data.ratenAnzahl > 1 && (
        <div style={{ fontSize: 9, marginBottom: 8 }}>
          <strong>Ratenplan:</strong> {data.ratenAnzahl} Raten &agrave; {fE(data.rateProMonat)} EUR/Monat, Beginn {new Date(data.startDatum).toLocaleDateString("de-DE")}
        </div>
      )}

      <div style={{ fontSize: 9, lineHeight: 1.5, marginBottom: 12 }}>
        Bitte &uuml;berweisen Sie den Betrag in H&ouml;he von <strong>{fE(data.gesamtEndpreis)} EUR</strong> bis sp&auml;testens {faellig} auf unser Konto Nr. 1090118941 bei der Sparkasse Leipzig Bankleitzahl: 86055592.<br/>
        IBAN: DE03860555921090118941 &middot; BIC: WELADE8LXXX
      </div>

      <div style={{ fontSize: 7, color: "#666", marginTop: 16, lineHeight: 1.4 }}>
        Konformit&auml;tserkl&auml;rung gem&auml;&szlig; Anhang XIII MDR f&uuml;r Sonderanfertigungen: Diese Sonderanfertigung ist ausschlie&szlig;lich f&uuml;r den genannten Patienten bestimmt. Wir sichern zu, dass diese Sonderanfertigung den in Anhang I der Verordnung (EU) 2017/745 angegebenen grundlegenden Sicherheits- und Leistungsanforderungen entspricht.
      </div>
      <div style={{ fontSize: 7, color: "#666", marginTop: 4, lineHeight: 1.4 }}>
        Alle kieferorthop&auml;dischen Ger&auml;te bleiben Eigentum des verordnenden Kieferorthop&auml;den. Alle erbrachten Leistungen sind nach &sect;4 Nr. 14 UStG. von der Umsatzsteuer befreit.
      </div>
    </div>
  );

  const Template = isGOZ ? Anlage2Template : MKVTemplate;
  const templateLabel = isGOZ ? "GOZ-Rechnung (Anlage 2)" : "MKV-Rechnung";

  return (
    <div>
      {/* Action Bar */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, padding: "12px 20px", borderRadius: 14, background: dk ? "rgba(16,18,28,0.75)" : "#fff", border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "#e5e8ef"}` }}>
        <Link href="/rechnungen" style={{ display: "flex", alignItems: "center", gap: 6, color: "#4ade80", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          <ArrowLeft size={15} /> Zur&uuml;ck
        </Link>
        <div style={{ fontSize: 12, color: dk ? "#888" : "#666" }}>
          {templateLabel} &middot; {data.patient.name} &middot; {data.paketName}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "#e5e8ef"}`, background: "transparent", color: dk ? "#f0f0f0" : "#1c3044", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            <Printer size={14} /> Drucken
          </button>
          <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: "#4ade80", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            <Download size={14} /> Als PDF
          </button>
        </div>
      </div>

      {/* A4 Document */}
      <div id="invoice" style={{ width: 210 * 2.83, minHeight: 297 * 2.83, margin: "0 auto", background: "#fff", color: "#000", padding: "20mm 18mm", borderRadius: dk ? 4 : 0, boxShadow: dk ? "0 2px 40px rgba(0,0,0,0.5)" : "0 1px 8px rgba(0,0,0,0.1)" }}>
        <Template />
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html { background: white !important; margin: 0 !important; padding: 0 !important; }
          #invoice { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; margin: 0 !important; width: auto !important; min-height: auto !important; }
          nav, aside, header, [class*="sidebar"], [class*="Sidebar"], [class*="ac-main"] > header, [class*="ac-sidebar"] { display: none !important; }
          [class*="ac-main"] { margin: 0 !important; padding: 0 !important; }
          [class*="ac-content"] { padding: 0 !important; overflow: visible !important; }
          main { overflow: visible !important; }
          @page { size: A4; margin: 20mm 18mm; }
        }
      `}</style>
    </div>
  );
}
