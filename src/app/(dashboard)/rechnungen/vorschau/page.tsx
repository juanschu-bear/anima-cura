"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/hooks/useAppStore";
import { ArrowLeft, Download, Printer } from "lucide-react";
import Link from "next/link";

interface PreviewData {
  patient: { id: string; name: string };
  patientArt: string;
  positionen: { goz_nr: string; bezeichnung: string; faktor: number; anzahl: number; preis: number; gkv_abzug: number; endpreis: number; begruendung: string }[];
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

  useEffect(() => {
    const raw = sessionStorage.getItem("ac-rechnung-preview");
    if (raw) setData(JSON.parse(raw));
  }, []);

  const fE = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const datum = new Date().toLocaleDateString("de-DE");
  const faellig = new Date(Date.now() + 14 * 864e5).toLocaleDateString("de-DE");
  const rNr = String(Math.floor(Math.random() * 90000) + 10000).padStart(8, "0");
  const uz = data ? "P-" + data.patient.id.slice(0, 4).toUpperCase() + "-UZ-1" : "";
  const isPrv = data?.patientArt === "privat";
  const artLabel = data?.patientArt === "kasse" ? "Kassenpatient (MKV)" : data?.patientArt === "privat" ? "Privatpatient (GOZ)" : "Kassenrechnung (80/20)";

  const handlePrint = () => window.print();

  if (!data) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <p style={{ color: "#666", fontSize: 14 }}>Keine Rechnungsdaten gefunden. Bitte erstelle zuerst eine Rechnung.</p>
      <Link href="/rechnungen" style={{ color: "#4ade80", fontSize: 14, fontWeight: 600 }}>Zurueck zur Rechnungs-Engine</Link>
    </div>
  );

  return (
    <div>
      {/* Action bar - hidden when printing */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, padding: "12px 20px", borderRadius: 14, background: dk ? "rgba(16,18,28,0.75)" : "#fff", border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "#e5e8ef"}` }}>
        <Link href="/rechnungen" style={{ display: "flex", alignItems: "center", gap: 6, color: "#4ade80", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          <ArrowLeft size={15} /> Zurueck zur Engine
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handlePrint} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "#e5e8ef"}`, background: "transparent", color: dk ? "#f0f0f0" : "#1c3044", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            <Printer size={14} /> Drucken / PDF speichern
          </button>
          <button onClick={handlePrint} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: "#4ade80", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            <Download size={14} /> Als PDF
          </button>
        </div>
      </div>

      {/* Invoice - this is what prints */}
      <div id="invoice" style={{ maxWidth: 740, margin: "0 auto", background: "#fff", color: "#000", padding: "40px 50px", borderRadius: dk ? 16 : 0, boxShadow: dk ? "0 4px 40px rgba(0,0,0,0.4)" : "0 2px 12px rgba(0,0,0,0.08)", fontFamily: "'Times New Roman', Times, serif", fontSize: 11, lineHeight: 1.5 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: "bold" }}>Dr. Maria Elena Schubert</div>
            <div style={{ fontSize: 11 }}>Zahn&auml;rztin f&uuml;r Kieferorthop&auml;die</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, color: "#333" }}>
            04109 Leipzig &middot; Oelssner&apos;s Hof &middot; Nikolaistr. 20<br/>
            Tel.: 0341/9806457 &middot; Fax: 0341/9806458
          </div>
        </div>

        {/* Absender */}
        <div style={{ fontSize: 8, borderBottom: "1px solid #000", paddingBottom: 2, marginBottom: 16, color: "#444" }}>
          Dr. Maria Elena Schubert &middot; Nikolaistrasse 20 im Oelssner&apos;s Hof &middot; 04109 Leipzig
        </div>

        {/* Empfaenger */}
        <div style={{ fontSize: 12, marginBottom: 24, lineHeight: 1.6 }}>
          {data.patient.name}
        </div>

        {/* Titel */}
        <h1 style={{ fontSize: 18, fontWeight: "bold", margin: "20px 0 16px", letterSpacing: 2, fontFamily: "'Times New Roman', serif" }}>RECHNUNG</h1>

        {/* Meta */}
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "4px 0", fontSize: 11, marginBottom: 20 }}>
          <span style={{ fontWeight: "bold" }}>Rechnungsdatum:</span><span>{datum}</span>
          <span style={{ fontWeight: "bold" }}>Unser Zeichen:</span><span>{uz}</span>
          <span style={{ fontWeight: "bold" }}>Rechnungsnummer:</span><span>{rNr}</span>
          <span style={{ fontWeight: "bold" }}>Behandlungspaket:</span><span>{data.paketName}</span>
          <span style={{ fontWeight: "bold" }}>Versicherungsart:</span><span>{artLabel}</span>
        </div>

        <p style={{ fontSize: 10, marginBottom: 12 }}>
          Bitte bei &Uuml;berweisung <strong>Unser Zeichen</strong> angeben.
        </p>
        <p style={{ fontSize: 10, marginBottom: 16 }}>
          F&uuml;r die erbrachten kieferorthop&auml;dischen und zahn&auml;rztlichen Leistungen erlaube ich mir in Rechnung zu stellen:
        </p>

        {/* Positions Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: 16 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={{ textAlign: "left", padding: "6px 8px", border: "1px solid #ccc", fontWeight: "bold", fontSize: 9 }}>Nr.</th>
              <th style={{ textAlign: "left", padding: "6px 8px", border: "1px solid #ccc", fontWeight: "bold", fontSize: 9 }}>Leistung</th>
              <th style={{ textAlign: "center", padding: "6px 8px", border: "1px solid #ccc", fontWeight: "bold", fontSize: 9 }}>Anz.</th>
              <th style={{ textAlign: "center", padding: "6px 8px", border: "1px solid #ccc", fontWeight: "bold", fontSize: 9 }}>Faktor</th>
              {!isPrv && <th style={{ textAlign: "right", padding: "6px 8px", border: "1px solid #ccc", fontWeight: "bold", fontSize: 9 }}>GKV-Abzug</th>}
              <th style={{ textAlign: "right", padding: "6px 8px", border: "1px solid #ccc", fontWeight: "bold", fontSize: 9 }}>Endpreis EUR</th>
            </tr>
          </thead>
          <tbody>
            {data.positionen.map((p, i) => (
              <tr key={i}>
                <td style={{ padding: "5px 8px", border: "1px solid #ddd", verticalAlign: "top" }}>{p.goz_nr}</td>
                <td style={{ padding: "5px 8px", border: "1px solid #ddd", verticalAlign: "top" }}>
                  {p.bezeichnung}
                  {p.begruendung && <><br/><span style={{ fontSize: 8, color: "#666" }}>{p.begruendung}</span></>}
                </td>
                <td style={{ padding: "5px 8px", border: "1px solid #ddd", textAlign: "center", verticalAlign: "top" }}>{p.anzahl}</td>
                <td style={{ padding: "5px 8px", border: "1px solid #ddd", textAlign: "center", verticalAlign: "top" }}>{p.faktor.toFixed(2)}</td>
                {!isPrv && <td style={{ padding: "5px 8px", border: "1px solid #ddd", textAlign: "right", verticalAlign: "top", color: "#888" }}>{p.gkv_abzug > 0 ? `-${fE(p.gkv_abzug)}` : ""}</td>}
                <td style={{ padding: "5px 8px", border: "1px solid #ddd", textAlign: "right", verticalAlign: "top" }}>{fE(p.endpreis)}</td>
              </tr>
            ))}
            {!isPrv && data.gesamtGKV > 0 && (
              <tr>
                <td colSpan={isPrv ? 4 : 5} style={{ padding: "5px 8px", border: "1px solid #ddd", fontWeight: "bold", background: "#fafafa" }}>Zwischensumme Honorar / GKV-Abz&uuml;ge</td>
                <td style={{ padding: "5px 8px", border: "1px solid #ddd", textAlign: "right", fontWeight: "bold", background: "#fafafa" }}>{fE(data.gesamtBrutto)} / -{fE(data.gesamtGKV)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={isPrv ? 4 : 5} style={{ padding: "6px 8px", border: "1px solid #ccc", fontWeight: "bold", background: "#f0f0f0" }}>
                {isPrv ? "Gesamtbetrag" : "Eigenanteil"}
              </td>
              <td style={{ padding: "6px 8px", border: "1px solid #ccc", textAlign: "right", fontWeight: "bold", background: "#f0f0f0", fontSize: 12 }}>
                {fE(data.gesamtEndpreis)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Ratenplan */}
        {data.ratenAnzahl > 1 && (
          <p style={{ fontSize: 10, marginBottom: 16 }}>
            <strong>Ratenplan:</strong> {data.ratenAnzahl} Raten &agrave; {fE(data.rateProMonat)} EUR/Monat, Beginn {new Date(data.startDatum).toLocaleDateString("de-DE")}
          </p>
        )}

        {/* Payment Box */}
        <div style={{ border: "1.5px solid #000", padding: "14px 16px", marginBottom: 20, fontSize: 10, lineHeight: 1.6 }}>
          Bitte &uuml;berweisen Sie den Betrag in H&ouml;he von <strong>{fE(data.gesamtEndpreis)} EUR</strong> bis
          sp&auml;testens {faellig} auf unser Konto Nr. 1090118941 bei der Sparkasse Leipzig Bankleitzahl: 86055592.<br/>
          IBAN: DE03860555921090118941 &middot; BIC: WELADE8LXXX<br/><br/>
          <strong>Verwendungszweck: {uz}</strong>
        </div>

        {/* Footer */}
        <div style={{ fontSize: 8, color: "#555", lineHeight: 1.5, borderTop: "1px solid #ccc", paddingTop: 10 }}>
          Konformit&auml;tserkl&auml;rung gem&auml;&szlig; Anhang XIII MDR f&uuml;r Sonderanfertigungen: Diese Sonderanfertigung ist ausschlie&szlig;lich f&uuml;r den genannten Patienten bestimmt. Wir sichern zu, dass diese Sonderanfertigung den in Anhang I der Verordnung (EU) 2017/745 angegebenen grundlegenden Sicherheits- und Leistungsanforderungen entspricht.<br/><br/>
          Alle kieferorthop&auml;dischen Ger&auml;te bleiben Eigentum des verordnenden Kieferorthop&auml;den. Alle erbrachten Leistungen sind nach &sect;4 Nr. 14 UStG. von der Umsatzsteuer befreit.
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          #invoice { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; margin: 0 !important; max-width: none !important; }
          nav, aside, header, footer, [class*="sidebar"], [class*="Sidebar"], [class*="ac-main"] > header { display: none !important; }
          [class*="ac-main"] { margin: 0 !important; padding: 0 !important; }
          [class*="ac-content"] { padding: 0 !important; }
          @page { size: A4; margin: 18mm; }
        }
      `}</style>
    </div>
  );
}
