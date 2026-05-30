"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/hooks/useAppStore";
import { ArrowLeft, Download, Printer } from "lucide-react";
import Link from "next/link";

interface Pos { goz_nr: string; bezeichnung: string; faktor: number; anzahl: number; preis: number; gkv_abzug: number; endpreis: number; begruendung: string; }
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
  const datum = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const faellig = new Date(Date.now() + 14 * 864e5).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const uz = "P-" + data.patient.id.slice(0, 4).toUpperCase() + "-UZ-1";

  const footer = (
    <>
      <p style={{ fontSize: 7.5, color: "#555", lineHeight: 1.4, marginTop: 20, borderTop: "0.5px solid #999", paddingTop: 8 }}>
        Konformit&auml;tserkl&auml;rung gem&auml;&szlig; Anhang XIII MDR f&uuml;r Sonderanfertigungen: Diese Sonderanfertigung ist ausschlie&szlig;lich f&uuml;r den genannten Patienten bestimmt. Wir sichern zu, dass diese Sonderanfertigung den in Anhang I der Verordnung (EU) 2017/745 angegebenen grundlegenden Sicherheits- und Leistungsanforderungen entspricht.
      </p>
      <p style={{ fontSize: 7.5, color: "#555", lineHeight: 1.4, marginTop: 6 }}>
        Alle kieferorthop&auml;dischen Ger&auml;te bleiben Eigentum des verordnenden Kieferorthop&auml;den. Alle erbrachten Leistungen sind nach &sect;4 Nr. 14 UStG. von der Umsatzsteuer befreit.
      </p>
    </>
  );

  const paymentBox = (betrag: number) => (
    <div style={{ border: "1px solid #000", padding: "10px 12px", margin: "14px 0", fontSize: 9.5, lineHeight: 1.6 }}>
      Bitte &uuml;berweisen Sie den Betrag in H&ouml;he von <strong>{fE(betrag)} EUR</strong> bis sp&auml;testens {faellig} auf unser Konto Nr. 1090118941 bei der Sparkasse Leipzig Bankleitzahl: 86055592.<br/>
      IBAN: DE03860555921090118941 &middot; BIC: WELADE8LXXX<br/><br/>
      <strong>Verwendungszweck: {uz}</strong>
    </div>
  );

  // ========== MKV-RECHNUNG (Kassenpatient) ==========
  const MKVTemplate = () => (
    <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: 10.5, color: "#000", lineHeight: 1.45 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: "bold" }}>Dr. Maria Elena Schubert</div>
          <div>Zahn&auml;rztin f&uuml;r Kieferorthop&auml;die</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 10 }}>
          04109 Leipzig &middot; Oelssner&apos;s Hof &middot; Nikolaistr. 20<br/>
          Tel.: 0341/9806457 &middot; Fax: 0341/9806458
        </div>
      </div>
      <div style={{ fontSize: 7.5, borderBottom: "0.5px solid #000", paddingBottom: 2, marginTop: 8, marginBottom: 14, color: "#444" }}>
        Dr. Maria Elena Schubert &middot; Nikolaistrasse 20 im Oelssner&apos;s Hof &middot; 04109 Leipzig
      </div>

      {/* Empfaenger */}
      <div style={{ fontSize: 11, marginBottom: 20, lineHeight: 1.6 }}>
        {data.patient.name}
      </div>

      <div style={{ fontSize: 16, fontWeight: "bold", letterSpacing: 1.5, marginBottom: 14 }}>RECHNUNG</div>

      {/* Rechnungsdaten */}
      <table style={{ fontSize: 10, marginBottom: 6, borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={{ fontWeight: "bold", paddingRight: 20, paddingBottom: 2 }}>Rechnungsdatum:</td><td>{datum}</td></tr>
          <tr><td style={{ fontWeight: "bold", paddingRight: 20, paddingBottom: 2 }}>Unser Zeichen:</td><td>{uz}</td></tr>
          <tr><td style={{ fontWeight: "bold", paddingRight: 20, paddingBottom: 2 }}>Bitte bei &Uuml;berweisung Unser Zeichen angeben.</td><td></td></tr>
          <tr><td style={{ fontWeight: "bold", paddingRight: 20, paddingBottom: 2 }}>Rechnungsnummer:</td><td>{rNr}</td></tr>
        </tbody>
      </table>

      <table style={{ fontSize: 10, marginBottom: 10, borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={{ fontWeight: "bold", paddingRight: 20 }}>Behandelte Person</td><td>{data.patient.name}</td></tr>
        </tbody>
      </table>

      <p style={{ fontSize: 10, marginBottom: 12 }}>F&uuml;r die erbrachten kieferorthop&auml;dischen und zahn&auml;rztlichen Leistungen erlaube ich mir in Rechnung zu stellen:</p>

      {/* Positionen */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5, marginBottom: 4 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 4px", borderBottom: "1px solid #000", fontWeight: "bold", fontSize: 8.5 }}>Datum</th>
            <th style={{ textAlign: "left", padding: "4px 4px", borderBottom: "1px solid #000", fontWeight: "bold", fontSize: 8.5 }}>Nr.</th>
            <th style={{ textAlign: "left", padding: "4px 4px", borderBottom: "1px solid #000", fontWeight: "bold", fontSize: 8.5 }}>Zahn/<br/>Kiefer</th>
            <th style={{ textAlign: "left", padding: "4px 4px", borderBottom: "1px solid #000", fontWeight: "bold", fontSize: 8.5 }}>Leistung</th>
            <th style={{ textAlign: "center", padding: "4px 4px", borderBottom: "1px solid #000", fontWeight: "bold", fontSize: 8.5 }}>Anzahl</th>
            <th style={{ textAlign: "center", padding: "4px 4px", borderBottom: "1px solid #000", fontWeight: "bold", fontSize: 8.5 }}>Faktor</th>
            <th style={{ textAlign: "right", padding: "4px 4px", borderBottom: "1px solid #000", fontWeight: "bold", fontSize: 8.5 }}>Mat./Labor<br/>EUR</th>
            <th style={{ textAlign: "right", padding: "4px 4px", borderBottom: "1px solid #000", fontWeight: "bold", fontSize: 8.5 }}>Honorar<br/>EUR</th>
          </tr>
        </thead>
        <tbody>
          {data.positionen.map((p, i) => (
            <tr key={i}>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", verticalAlign: "top", fontSize: 9 }}></td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", verticalAlign: "top" }}>{p.goz_nr}</td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", verticalAlign: "top" }}></td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", verticalAlign: "top" }}>
                {p.bezeichnung}
                {p.begruendung && <><br/><span style={{ fontSize: 8, color: "#666" }}>{p.begruendung}</span></>}
              </td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "center", verticalAlign: "top" }}>{p.anzahl}</td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "center", verticalAlign: "top" }}>{p.faktor.toFixed(2)}</td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "right", verticalAlign: "top" }}></td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "right", verticalAlign: "top" }}>{fE(p.preis)}</td>
            </tr>
          ))}
          {data.positionen.filter(p => p.gkv_abzug > 0).length > 0 && data.positionen.filter(p => p.gkv_abzug > 0).map((p, i) => (
            <tr key={"abz-" + i} style={{ color: "#555" }}>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd" }}></td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", fontSize: 8.5 }}>abz&uuml;glich</td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd" }}></td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", fontSize: 8.5 }}>{p.bezeichnung} - Kassenleistung</td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "center" }}>-{p.anzahl}</td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "center" }}></td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "right" }}></td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "right" }}>-{fE(p.gkv_abzug)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summen */}
      <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse", marginBottom: 8 }}>
        <tbody>
          <tr style={{ borderTop: "1px solid #000" }}>
            <td style={{ padding: "4px 4px", fontWeight: "bold" }}>Zwischensumme Honorar in EUR</td>
            <td style={{ padding: "4px 4px", textAlign: "right", width: 100 }}>{fE(data.gesamtGKV)}</td>
            <td style={{ padding: "4px 4px", textAlign: "right", width: 100, fontWeight: "bold" }}>{fE(data.gesamtBrutto)}</td>
          </tr>
          <tr style={{ borderTop: "1.5px solid #000", fontWeight: "bold", fontSize: 11 }}>
            <td style={{ padding: "6px 4px" }}>Gesamtbetrag in EUR</td>
            <td colSpan={2} style={{ padding: "6px 4px", textAlign: "right" }}>{fE(data.gesamtEndpreis)}</td>
          </tr>
        </tbody>
      </table>

      {data.ratenAnzahl > 1 && (
        <p style={{ fontSize: 10 }}><strong>Ratenplan:</strong> {data.ratenAnzahl} Raten &agrave; {fE(data.rateProMonat)} EUR/Monat, Beginn {new Date(data.startDatum).toLocaleDateString("de-DE")}</p>
      )}

      {paymentBox(data.gesamtEndpreis)}
      {footer}
    </div>
  );

  // ========== GOZ-RECHNUNG (Privatpatient) ==========
  const GOZTemplate = () => (
    <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: 10.5, color: "#000", lineHeight: 1.45 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: "bold" }}>Dr. Maria Elena Schubert</div>
          <div>Kieferorthop&auml;din</div>
          <div style={{ fontSize: 10 }}>04109 Leipzig, Nikolaistrasse 20 im Oelssner&apos;s Hof</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 10 }}>
          Telefon: 0341-9806457<br/>
          E-Mail: info@schubert-holi-dontics.de<br/>
          Internet: schubert-holi-dontics.de
        </div>
      </div>
      <div style={{ fontSize: 7.5, borderBottom: "0.5px solid #000", paddingBottom: 2, marginBottom: 14, color: "#444" }}>
        Dr. Maria Elena Schubert &middot; Nikolaistrasse 20 im Oelssner&apos;s Hof &middot; 04109 Leipzig
      </div>

      {/* Empfaenger */}
      <div style={{ fontSize: 11, marginBottom: 24, lineHeight: 1.6 }}>
        {data.patient.name}
      </div>

      <div style={{ fontSize: 16, fontWeight: "bold", letterSpacing: 1.5, marginBottom: 14 }}>RECHNUNG</div>

      {/* Meta - GOZ style: inline */}
      <table style={{ fontSize: 10, marginBottom: 4, borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          <tr>
            <td style={{ fontWeight: "bold", paddingRight: 8 }}>Unser Zeichen: {uz}</td>
            <td style={{ textAlign: "right" }}>Rechnungsdatum: {datum}</td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 10, marginBottom: 4 }}>Bitte bei &Uuml;berweisung Unser Zeichen angeben.</p>
      <table style={{ fontSize: 10, marginBottom: 12, borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={{ paddingRight: 20 }}>Rechnungsnummer: {rNr}</td></tr>
          <tr><td>Behandelte Person: {data.patient.name}</td></tr>
        </tbody>
      </table>

      {/* Positionen - GOZ Format */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5, marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 4px", borderBottom: "1px solid #000", fontSize: 8.5, fontWeight: "bold" }}>Datum</th>
            <th style={{ textAlign: "left", padding: "4px 4px", borderBottom: "1px solid #000", fontSize: 8.5, fontWeight: "bold" }}>Region</th>
            <th style={{ textAlign: "left", padding: "4px 4px", borderBottom: "1px solid #000", fontSize: 8.5, fontWeight: "bold" }}>Nr.</th>
            <th style={{ textAlign: "left", padding: "4px 4px", borderBottom: "1px solid #000", fontSize: 8.5, fontWeight: "bold" }}>Leistungsbeschreibung/Auslagen</th>
            <th style={{ textAlign: "center", padding: "4px 4px", borderBottom: "1px solid #000", fontSize: 8.5, fontWeight: "bold" }}>Bgr.</th>
            <th style={{ textAlign: "center", padding: "4px 4px", borderBottom: "1px solid #000", fontSize: 8.5, fontWeight: "bold" }}>Faktor</th>
            <th style={{ textAlign: "center", padding: "4px 4px", borderBottom: "1px solid #000", fontSize: 8.5, fontWeight: "bold" }}>Anz.</th>
            <th style={{ textAlign: "right", padding: "4px 4px", borderBottom: "1px solid #000", fontSize: 8.5, fontWeight: "bold" }}>EUR</th>
          </tr>
        </thead>
        <tbody>
          {data.positionen.map((p, i) => (
            <tr key={i}>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", verticalAlign: "top", fontSize: 9 }}></td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", verticalAlign: "top" }}></td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", verticalAlign: "top" }}>{p.goz_nr}</td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", verticalAlign: "top" }}>
                {p.bezeichnung}
              </td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "center", verticalAlign: "top" }}>
                {p.begruendung ? `${i + 1})` : ""}
              </td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "center", verticalAlign: "top" }}>{p.faktor.toFixed(2)}</td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "center", verticalAlign: "top" }}>{p.anzahl}</td>
              <td style={{ padding: "3px 4px", borderBottom: "0.5px solid #ddd", textAlign: "right", verticalAlign: "top" }}>{fE(p.endpreis)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summen */}
      <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse", marginBottom: 6 }}>
        <tbody>
          <tr style={{ borderTop: "1px solid #000" }}>
            <td style={{ padding: "4px 4px" }}>Zwischensumme Honorar:</td>
            <td style={{ padding: "4px 4px", textAlign: "right", width: 100 }}>
              {fE(data.positionen.filter(p => p.goz_nr !== "Material").reduce((s, p) => s + p.endpreis, 0))}
            </td>
          </tr>
          {data.positionen.some(p => p.goz_nr === "Material") && (
            <tr>
              <td style={{ padding: "4px 4px" }}>Auslagen nach &sect;9 GOZ gem&auml;&szlig; Praxislaborbeleg:</td>
              <td style={{ padding: "4px 4px", textAlign: "right" }}>
                {fE(data.positionen.filter(p => p.goz_nr === "Material").reduce((s, p) => s + p.endpreis, 0))}
              </td>
            </tr>
          )}
          <tr style={{ borderTop: "1.5px solid #000", fontWeight: "bold", fontSize: 11 }}>
            <td style={{ padding: "6px 4px" }}>Rechnungsbetrag:</td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>{fE(data.gesamtEndpreis)}</td>
          </tr>
        </tbody>
      </table>

      {data.ratenAnzahl > 1 && (
        <p style={{ fontSize: 10 }}><strong>Ratenplan:</strong> {data.ratenAnzahl} Raten &agrave; {fE(data.rateProMonat)} EUR/Monat, Beginn {new Date(data.startDatum).toLocaleDateString("de-DE")}</p>
      )}

      {paymentBox(data.gesamtEndpreis)}

      {/* Begruendungen */}
      {data.positionen.some(p => p.begruendung) && (
        <div style={{ fontSize: 9, marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Bgr. Weitere Ausf&uuml;hrungen soweit in Spalte Begr&uuml;ndungen (Bgr.) Kennzeichen gesetzt wurde</div>
          {data.positionen.filter(p => p.begruendung).map((p, i) => (
            <div key={i}>{i + 1}) {p.begruendung}</div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 9, color: "#333", marginBottom: 8 }}>
        Konto: Sparkasse Leipzig / BLZ: 86055592 / Kto.-Nr.: 1090118941<br/>
        IBAN: DE03860555921090118941 / BIC: WELADE8LXXX
      </div>

      {footer}
    </div>
  );

  const Template = data.patientArt === "privat" ? GOZTemplate : MKVTemplate;

  return (
    <div>
      {/* Action bar */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, padding: "12px 20px", borderRadius: 14, background: dk ? "rgba(16,18,28,0.75)" : "#fff", border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "#e5e8ef"}` }}>
        <Link href="/rechnungen" style={{ display: "flex", alignItems: "center", gap: 6, color: "#4ade80", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          <ArrowLeft size={15} /> Zur&uuml;ck
        </Link>
        <div style={{ fontSize: 13, color: dk ? "#888" : "#666" }}>
          {data.patientArt === "privat" ? "GOZ-Rechnung" : "MKV-Rechnung"} &middot; {data.patient.name} &middot; {data.paketName}
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

      {/* Invoice Document */}
      <div id="invoice" style={{ maxWidth: 720, margin: "0 auto", background: "#fff", color: "#000", padding: "45px 55px", borderRadius: dk ? 4 : 0, boxShadow: dk ? "0 2px 40px rgba(0,0,0,0.5)" : "0 1px 8px rgba(0,0,0,0.1)" }}>
        <Template />
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html { background: white !important; }
          #invoice { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; margin: 0 !important; max-width: none !important; }
          nav, aside, header, [class*="sidebar"], [class*="Sidebar"], [class*="ac-main"] > header, [class*="ac-sidebar"] { display: none !important; }
          [class*="ac-main"] { margin: 0 !important; padding: 0 !important; }
          [class*="ac-content"] { padding: 0 !important; overflow: visible !important; }
          main { overflow: visible !important; }
          @page { size: A4; margin: 18mm 15mm; }
        }
      `}</style>
    </div>
  );
}
