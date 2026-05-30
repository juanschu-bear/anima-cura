"use client";

import { useEffect, useState, useRef } from "react";
import { generateGiroCodeString, defaultPraxisBank } from "@/lib/animapay";

interface AnimaPayProps {
  betrag: number;
  verwendungszweck: string;
  rateNummer: number;
  onClose: () => void;
  dark?: boolean;
  lang?: string;
}

export default function AnimaPayOverlay({ betrag, verwendungszweck, rateNummer, onClose, dark = true, lang = "de" }: AnimaPayProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState<string>("");
  const [showAnleitung, setShowAnleitung] = useState(false);

  const giroString = generateGiroCodeString({
    ...defaultPraxisBank,
    betrag,
    verwendungszweck,
  });

  const iban = defaultPraxisBank.iban;
  const empfaenger = defaultPraxisBank.empfaenger;

  useEffect(() => {
    // Dynamic import of qrcode to avoid SSR issues
    import("qrcode").then(QRCode => {
      QRCode.toDataURL(giroString, {
        width: 220,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M", // GiroCode requires M
      }).then((url: string) => setQrDataUrl(url));
    }).catch(() => {
      // Fallback: use a simple API if qrcode package not available
      setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(giroString)}`);
    });
  }, [giroString]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, ""));
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  const fg = dark ? "#f0f0f0" : "#1c3044";
  const muted = dark ? "#777" : "#999";
  const grn = "#22c55e";
  const border = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const cardBg = dark ? "rgba(16,18,28,0.95)" : "rgba(255,255,255,0.98)";

  const t = (key: string) => {
    const texts: Record<string, Record<string, string>> = {
      title: { de: "Rate bezahlen", en: "Pay installment", es: "Pagar cuota" },
      scanTitle: { de: "Mit Banking-App scannen", en: "Scan with banking app", es: "Escanear con app bancaria" },
      scanDesc: { de: "Öffne deine Banking-App, wähle \"QR-Code scannen\" und halte die Kamera auf den Code.", en: "Open your banking app, select \"Scan QR code\" and point the camera at the code.", es: "Abre tu app bancaria, selecciona \"Escanear QR\" y apunta la cámara al código." },
      orManual: { de: "Oder manuell überweisen", en: "Or transfer manually", es: "O transferir manualmente" },
      empfaenger: { de: "Empfänger", en: "Recipient", es: "Beneficiario" },
      betrag: { de: "Betrag", en: "Amount", es: "Importe" },
      zweck: { de: "Verwendungszweck", en: "Reference", es: "Referencia" },
      copy: { de: "Kopieren", en: "Copy", es: "Copiar" },
      copied: { de: "Kopiert!", en: "Copied!", es: "¡Copiado!" },
      wichtig: { de: "Wichtig: Verwendungszweck exakt so übernehmen, damit die Zahlung automatisch zugeordnet wird.", en: "Important: Use the reference exactly as shown so the payment is matched automatically.", es: "Importante: Usa la referencia exactamente como se muestra." },
      anleitung: { de: "Anleitung anzeigen", en: "Show instructions", es: "Mostrar instrucciones" },
      anleitungTitle: { de: "So funktioniert's", en: "How it works", es: "Cómo funciona" },
      step1: { de: "Öffne deine Banking-App auf dem Handy (Sparkasse, Volksbank, N26, etc.)", en: "Open your banking app on your phone (any bank)", es: "Abre tu app bancaria en el móvil" },
      step2: { de: "Suche nach \"QR-Code scannen\", \"Foto-Überweisung\" oder \"Scan to Pay\"", en: "Look for \"Scan QR code\", \"Photo transfer\" or similar", es: "Busca \"Escanear QR\" o similar" },
      step3: { de: "Halte die Kamera auf den QR-Code oben — alle Daten werden automatisch ausgefüllt", en: "Point the camera at the QR code above — all details are filled automatically", es: "Apunta la cámara al código QR — todos los datos se rellenan automáticamente" },
      step4: { de: "Prüfe die Daten und bestätige mit deiner TAN oder Face-ID", en: "Check the details and confirm with your TAN or Face ID", es: "Verifica los datos y confirma con tu TAN o Face ID" },
      step5: { de: "Fertig! Die Zahlung wird automatisch erkannt und verbucht.", en: "Done! The payment will be detected and booked automatically.", es: "¡Listo! El pago se detecta y registra automáticamente." },
      noApp: { de: "Keine Banking-App? Überweise manuell mit den Daten unten.", en: "No banking app? Transfer manually with the details below.", es: "¿Sin app bancaria? Transfiere manualmente con los datos de abajo." },
      close: { de: "Schließen", en: "Close", es: "Cerrar" },
      poweredBy: { de: "Powered by AnimaPay", en: "Powered by AnimaPay", es: "Powered by AnimaPay" },
    };
    return texts[key]?.[lang] || texts[key]?.de || key;
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: cardBg, borderRadius: 24, maxWidth: 400, width: "100%", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
        {/* Header */}
        <div style={{ padding: "24px 24px 0", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: grn, marginBottom: 8 }}>AnimaPay</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: fg, margin: "0 0 4px", fontFamily: "'Fraunces', serif" }}>{t("title")}</h2>
          <div style={{ fontSize: 32, fontWeight: 800, color: grn, fontFamily: "'Fraunces', serif", margin: "8px 0" }}>
            {betrag.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
          </div>
          <div style={{ fontSize: 13, color: muted }}>Rate {rateNummer} · {verwendungszweck}</div>
        </div>

        {/* QR Code */}
        <div style={{ padding: "20px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: fg, marginBottom: 8 }}>{t("scanTitle")}</p>
          <div style={{ display: "inline-block", padding: 12, borderRadius: 16, background: "#fff" }}>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="GiroCode" style={{ width: 200, height: 200, display: "block" }} />
            ) : (
              <div style={{ width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>Lädt...</div>
            )}
          </div>
          <p style={{ fontSize: 12, color: muted, marginTop: 8, lineHeight: 1.5 }}>{t("scanDesc")}</p>
        </div>

        {/* Anleitung toggle */}
        <div style={{ padding: "0 24px 12px", textAlign: "center" }}>
          <button onClick={() => setShowAnleitung(!showAnleitung)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 10, padding: "8px 16px", color: muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {showAnleitung ? "▲" : "▼"} {t("anleitung")}
          </button>
        </div>

        {showAnleitung && (
          <div style={{ padding: "0 24px 16px" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 10 }}>{t("anleitungTitle")}</p>
            {["step1", "step2", "step3", "step4", "step5"].map((s, i) => (
              <div key={s} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                <div style={{ width: 24, height: 24, minWidth: 24, borderRadius: "50%", background: grn, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                <p style={{ fontSize: 13, color: fg, lineHeight: 1.5, margin: 0 }}>{t(s)}</p>
              </div>
            ))}
            <p style={{ fontSize: 12, color: muted, marginTop: 8, fontStyle: "italic" }}>{t("noApp")}</p>
          </div>
        )}

        {/* Manual transfer details */}
        <div style={{ padding: "0 24px 20px" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: muted, marginBottom: 10, textAlign: "center" }}>{t("orManual")}</p>
          {[
            { label: t("empfaenger"), value: empfaenger, copyVal: empfaenger },
            { label: "IBAN", value: iban, copyVal: iban },
            { label: t("betrag"), value: `${betrag.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`, copyVal: betrag.toFixed(2) },
            { label: t("zweck"), value: verwendungszweck, copyVal: verwendungszweck },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", marginBottom: 6, borderRadius: 12, background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{row.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: fg, marginTop: 2, fontFamily: row.label === "IBAN" ? "monospace" : "inherit" }}>{row.value}</div>
              </div>
              <button onClick={() => copyToClipboard(row.copyVal, row.label)} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${border}`, background: copied === row.label ? grn : "transparent", color: copied === row.label ? "#fff" : muted, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", minWidth: 70 }}>
                {copied === row.label ? t("copied") : t("copy")}
              </button>
            </div>
          ))}
          <p style={{ fontSize: 11, color: dark ? "#ef4444" : "#dc2626", marginTop: 8, lineHeight: 1.5, textAlign: "center" }}>{t("wichtig")}</p>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px 20px", textAlign: "center", borderTop: `1px solid ${border}` }}>
          <button onClick={onClose} style={{ padding: "12px 32px", borderRadius: 14, border: "none", background: grn, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>{t("close")}</button>
          <p style={{ fontSize: 10, color: dark ? "#333" : "#ccc" }}>{t("poweredBy")} · Sichere SEPA-Überweisung</p>
        </div>
      </div>

      <style>{`
        @keyframes glowRotate {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}
