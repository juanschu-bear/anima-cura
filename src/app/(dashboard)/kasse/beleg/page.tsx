"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Printer, X } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";

const supabase = createBrowserClient();

const PRAXIS = {
  name: "Dr. Maria Elena Schubert",
  zusatz: "FZÄ für Kieferorthopädie",
  strasse: "Nikolaistr. 20 im Oelßner's Hof",
  ort: "04109 Leipzig",
};

const ZAHLART_LABEL: Record<string, string> = {
  qr_ueberweisung: "QR-Überweisung",
  ueberweisung: "Überweisung",
  girocard: "Girocard",
  kreditkarte: "Kreditkarte",
  bar: "Bar",
  guthaben: "Guthaben (Anima Balance)",
};

function signedAmount(betrag: number, buchungstyp?: string) {
  const sign = buchungstyp === "ausgabe" ? "-" : "";
  return `${sign}${Number(betrag || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function BelegInhalt() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const copy = params.get("copy") === "patient" ? "patient" : "praxis";
  const [zahlung, setZahlung] = useState<any | null>(null);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    if (!id) {
      setFehler("Kein Beleg angegeben.");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("kassen_zahlungen")
        .select("*, patients:patient_id(vorname, nachname, ivoris_nummer)")
        .eq("id", id)
        .single();
      if (error || !data) setFehler("Beleg nicht gefunden.");
      else setZahlung(data);
    })();
  }, [id]);

  const closeReceipt = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/kasse");
  };

  const drucke = () => {
    if (typeof window === "undefined") return;
    document.title = copy === "patient" ? "Patientenkopie Quittung" : "Praxisquittung";
    window.print();
  };

  if (fehler) return <p className="p-8 text-sm text-praxis-400">{fehler}</p>;
  if (!zahlung) return <p className="p-8 text-sm text-praxis-400">Beleg wird geladen …</p>;

  const datum = formatDate(zahlung.kassen_datum);
  const isPatientCopy = copy === "patient";
  const documentTitle = zahlung.buchungstyp === "ausgabe"
    ? "Interner Kassenbeleg"
    : isPatientCopy
    ? "Zahlungsquittung"
    : "Praxisquittung";
  const subline = zahlung.buchungstyp === "ausgabe"
    ? "Interner Nachweis aus dem Kassenbereich der Praxis."
    : isPatientCopy
    ? "Diese Quittung bestaetigt den Erhalt einer Zahlung und kann dem Patienten oder den Eltern als Nachweis mitgegeben oder gespeichert werden."
    : "Interne Praxisansicht mit vollständigem Kassenkontext und eindeutiger Belegreferenz.";
  const patientName = zahlung.patient_id ? `${zahlung.patients?.nachname}, ${zahlung.patients?.vorname}` : "—";
  const patientNumber = zahlung.patient_id ? (zahlung.patients?.ivoris_nummer || "—") : "—";
  const serviceLabel = zahlung.zweck || "Praxisleistung";
  const paymentLabel = ZAHLART_LABEL[zahlung.zahlart] || zahlung.zahlart;
  const cards: Array<[string, string]> = isPatientCopy
    ? [
        ["Patient", patientName],
        ["Patientennummer", patientNumber],
        ["Leistung", serviceLabel],
        ["Zahlart", paymentLabel],
        ["Zahlungsdatum", datum],
        ["Belegnummer", zahlung.beleg_nr || "—"],
      ]
    : [
        ["Buchungsart", zahlung.buchungstyp === "ausgabe" ? "Praxis-Ausgabe" : "Patientenzahlung"],
        ["Patient", patientName],
        ["Patientennummer", patientNumber],
        ["Leistung", serviceLabel],
        ["Zahlart", paymentLabel],
        ["Buchungsdatum", datum],
        ["Quartal", zahlung.quartal_jahr && zahlung.quartal_nummer ? `Q${zahlung.quartal_nummer} ${zahlung.quartal_jahr}` : "—"],
      ];

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={closeReceipt}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-[linear-gradient(180deg,#182434_0%,#101a29_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] transition hover:border-[#7dd3fc]/50 hover:bg-[linear-gradient(180deg,#1d2d42_0%,#122033_100%)]"
          >
            <X size={16} />
            Schließen
          </button>
          <div className="inline-flex rounded-full border border-white/12 bg-[#0f1722] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
            <Link
              href={`/kasse/beleg?id=${id}&copy=praxis`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${!isPatientCopy ? "bg-[linear-gradient(135deg,#8cf0d2_0%,#d5fff1_100%)] text-[#0d2b24] shadow-[0_10px_28px_rgba(104,255,210,0.22)]" : "text-white/80 hover:text-white"}`}
            >
              Praxisquittung
            </Link>
            <Link
              href={`/kasse/beleg?id=${id}&copy=patient`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${isPatientCopy ? "bg-[linear-gradient(135deg,#7cb8ff_0%,#dcecff_100%)] text-[#112646] shadow-[0_10px_28px_rgba(124,184,255,0.24)]" : "text-white/80 hover:text-white"}`}
            >
              Patientenkopie
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={drucke}
          className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#34d46f_0%,#1cb954_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(42,201,90,0.28)] transition hover:brightness-105"
        >
          <Printer size={16} />
          Drucken / als PDF sichern
        </button>
      </div>

      <div className="beleg-print-shell">
        <article className="beleg-druck screen-receipt overflow-hidden rounded-[28px] border border-white/12 bg-[#0d1320] shadow-[0_24px_60px_rgba(15,23,42,0.28)] print:hidden">
          <header className="beleg-header flex items-start justify-between gap-6 px-9 py-8">
            <div className="min-w-0">
              <p className="beleg-kicker">{isPatientCopy ? "Patientenkopie" : "AnimaPay Kasse"}</p>
              <h1 className="beleg-title">{documentTitle}</h1>
              <p className="beleg-subline">{subline}</p>
            </div>
            <div className="min-w-[190px] text-right">
              <div className="beleg-badge">{paymentLabel}</div>
              <p className="beleg-meta mt-4">Beleg-Nr. {zahlung.beleg_nr || "—"}</p>
              <p className="beleg-meta mt-1">{datum}</p>
            </div>
          </header>

          <div className="grid gap-5 px-9 pt-7 md:grid-cols-[1.1fr_0.9fr]">
            <section className="beleg-panel beleg-panel-strong p-5">
              <p className="beleg-section-label">{isPatientCopy ? "Praxis" : "Praxisansicht"}</p>
              <p className="beleg-panel-title mt-3 text-[22px] font-bold">{PRAXIS.name}</p>
              <p className="beleg-panel-copy mt-1 font-sans text-[14px]">{PRAXIS.zusatz}</p>
              <p className="beleg-panel-copy mt-3 font-sans text-[13px] leading-7">
                {PRAXIS.strasse}
                <br />
                {PRAXIS.ort}
              </p>
            </section>

            <section className="beleg-panel beleg-amount-card p-5">
              <p className="beleg-section-label text-[#2e6a58]">
                {zahlung.buchungstyp === "ausgabe" ? "Dokumentierter Betrag" : "Erhaltener Betrag"}
              </p>
              <p className="mt-4 text-[44px] font-bold leading-none text-[#153a2b]">{signedAmount(zahlung.betrag, zahlung.buchungstyp)}</p>
              <p className="mt-4 font-sans text-[13px] leading-6 text-[#527266]">
                {isPatientCopy
                  ? "Die Zahlung wurde in der Praxis erfasst und kann als Nachweis gespeichert oder vorgezeigt werden."
                  : zahlung.buchungstyp === "ausgabe"
                  ? "Interne Ausgabe im Kassenbuch dokumentiert."
                  : "Zahlung wurde im Kassenbereich der Praxis erfasst."}
              </p>
            </section>
          </div>

          <section className="grid gap-4 px-9 py-6 md:grid-cols-2">
            {cards.map(([label, value]) => (
              <div key={label} className="beleg-panel px-4 py-4">
                <p className="beleg-section-label">{label}</p>
                <p className="beleg-panel-title mt-2 text-[18px] font-bold leading-[1.35]">{value}</p>
              </div>
            ))}
          </section>

          {!isPatientCopy && zahlung.notiz ? (
            <section className="beleg-panel mx-9 mb-6 px-5 py-4">
              <p className="beleg-section-label">Interne Notiz</p>
              <p className="beleg-panel-copy mt-2 font-sans text-[15px] leading-7">{zahlung.notiz}</p>
            </section>
          ) : null}

          <footer className="beleg-footer mx-9 mb-8 flex flex-wrap items-start justify-between gap-4 border-t pt-4 font-sans text-[11px]">
            <span>{PRAXIS.name} · {PRAXIS.strasse} · {PRAXIS.ort}</span>
            <span>
              {zahlung.buchungstyp === "ausgabe"
                ? "Interner Kassenbeleg, keine Rechnung."
                : isPatientCopy
                ? "Patientenkopie einer erfassten Zahlung, keine Rechnung."
                : "Praxisquittung über eine erfasste Zahlung, keine Rechnung."}
            </span>
          </footer>
        </article>

        <article className="beleg-print-document hidden bg-white text-[#18263a] print:block">
          <header className="print-doc-header">
            <div>
              <p className="print-doc-kicker">{isPatientCopy ? "Patientenquittung" : "Praxisquittung"}</p>
              <h1 className="print-doc-title">{documentTitle}</h1>
              <p className="print-doc-copy">
                {isPatientCopy
                  ? "Quittung ueber eine erhaltene Zahlung. Diese Ausfertigung ist fuer Patient oder Eltern bestimmt."
                  : "Interne Dokumentation einer in der Praxis erfassten Zahlung."}
              </p>
            </div>
            <div className="print-doc-meta">
              <p><strong>Beleg-Nr.</strong> {zahlung.beleg_nr || "—"}</p>
              <p><strong>Datum</strong> {datum}</p>
              <p><strong>Zahlart</strong> {paymentLabel}</p>
            </div>
          </header>

          <section className="print-doc-topline">
            <div className="print-doc-block">
              <p className="print-doc-label">Praxis</p>
              <p className="print-doc-value">{PRAXIS.name}</p>
              <p className="print-doc-copy">{PRAXIS.zusatz}</p>
              <p className="print-doc-copy">{PRAXIS.strasse}<br />{PRAXIS.ort}</p>
            </div>
            <div className="print-doc-amount">
              <p className="print-doc-label">{zahlung.buchungstyp === "ausgabe" ? "Dokumentierter Betrag" : "Erhaltener Betrag"}</p>
              <p className="print-doc-total">{signedAmount(zahlung.betrag, zahlung.buchungstyp)}</p>
              <p className="print-doc-copy">
                {isPatientCopy ? "Betrag dankend erhalten." : "Zahlung im Kassenbereich erfasst."}
              </p>
            </div>
          </section>

          <section className="print-doc-grid">
            <div className="print-doc-row">
              <span className="print-doc-label">Patient</span>
              <span className="print-doc-row-value">{patientName}</span>
            </div>
            <div className="print-doc-row">
              <span className="print-doc-label">Patientennummer</span>
              <span className="print-doc-row-value">{patientNumber}</span>
            </div>
            <div className="print-doc-row">
              <span className="print-doc-label">{isPatientCopy ? "Leistung / Zahlungsgrund" : "Leistung"}</span>
              <span className="print-doc-row-value">{serviceLabel}</span>
            </div>
            <div className="print-doc-row">
              <span className="print-doc-label">{isPatientCopy ? "Quittungsart" : "Buchungsart"}</span>
              <span className="print-doc-row-value">
                {isPatientCopy
                  ? "Quittung ueber erhaltene Zahlung"
                  : zahlung.buchungstyp === "ausgabe"
                  ? "Praxis-Ausgabe"
                  : "Patientenzahlung"}
              </span>
            </div>
            {!isPatientCopy ? (
              <div className="print-doc-row">
                <span className="print-doc-label">Quartal</span>
                <span className="print-doc-row-value">
                  {zahlung.quartal_jahr && zahlung.quartal_nummer ? `Q${zahlung.quartal_nummer} ${zahlung.quartal_jahr}` : "—"}
                </span>
              </div>
            ) : null}
          </section>

          {!isPatientCopy && zahlung.notiz ? (
            <section className="print-doc-note">
              <p className="print-doc-label">Interne Notiz</p>
              <p className="print-doc-copy">{zahlung.notiz}</p>
            </section>
          ) : null}

          <footer className="print-doc-footer">
            <span>{PRAXIS.name} · {PRAXIS.strasse} · {PRAXIS.ort}</span>
            <span>
              {isPatientCopy
                ? "Dies ist eine Quittung und keine Rechnung."
                : "Interner Kassenbeleg, keine Rechnung."}
            </span>
          </footer>
        </article>
      </div>

      <style jsx global>{`
        .beleg-print-shell {
          display: flex;
          justify-content: center;
        }
        .beleg-druck {
          width: min(100%, 860px);
        }
        .beleg-header {
          background:
            radial-gradient(circle at top left, rgba(116, 246, 203, 0.28), transparent 34%),
            radial-gradient(circle at top right, rgba(117, 173, 255, 0.22), transparent 30%),
            linear-gradient(135deg, #143040 0%, #1a3151 48%, #24385f 100%);
          color: #f4f8ff;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .beleg-kicker {
          margin: 0;
          font-family: Inter, Arial, sans-serif;
          font-size: 12px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: rgba(214, 250, 242, 0.82);
        }
        .beleg-title {
          margin: 10px 0 0;
          font-size: 30px;
          font-weight: 700;
          color: #f8fbff;
        }
        .beleg-subline {
          margin: 14px 0 0;
          max-width: 480px;
          font-family: Inter, Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: rgba(234, 243, 255, 0.86);
        }
        .beleg-badge {
          display: inline-flex;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.18);
          font-family: Inter, Arial, sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: #ffffff;
        }
        .beleg-meta {
          margin: 0;
          font-family: Inter, Arial, sans-serif;
          font-size: 12px;
          color: rgba(244, 248, 255, 0.8);
        }
        .beleg-section-label {
          margin: 0;
          font-family: Inter, Arial, sans-serif;
          font-size: 11px;
          letter-spacing: 1.6px;
          text-transform: uppercase;
          color: #8fa6c6;
        }
        .beleg-panel {
          border-radius: 20px;
          border: 1px solid rgba(154, 176, 209, 0.18);
          background:
            linear-gradient(180deg, rgba(20, 28, 45, 0.94) 0%, rgba(13, 19, 32, 0.98) 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .beleg-panel-strong {
          background:
            radial-gradient(circle at top left, rgba(111, 214, 184, 0.08), transparent 34%),
            linear-gradient(180deg, rgba(18, 27, 42, 0.98) 0%, rgba(12, 18, 30, 0.98) 100%);
          border-color: rgba(127, 224, 192, 0.3);
        }
        .beleg-amount-card {
          border-radius: 24px;
          border: 1px solid rgba(126, 205, 176, 0.34);
          background:
            radial-gradient(circle at top right, rgba(72, 211, 160, 0.16), transparent 38%),
            linear-gradient(135deg, #f3fff8 0%, #e9faf2 54%, #f6fffd 100%);
          box-shadow:
            0 14px 40px rgba(33, 93, 70, 0.16),
            inset 0 1px 0 rgba(255, 255, 255, 0.88);
        }
        .beleg-panel-title {
          color: #edf4ff;
        }
        .beleg-panel-copy {
          color: #9cb2cf;
        }
        .beleg-footer {
          border-color: rgba(154, 176, 209, 0.16);
          color: #7f96b6;
        }
        .print-doc-header,
        .print-doc-topline,
        .print-doc-grid,
        .print-doc-note,
        .print-doc-footer {
          display: none;
        }
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          html,
          body {
            background: #ffffff !important;
          }
          body * {
            visibility: hidden;
          }
          .beleg-print-shell,
          .beleg-print-shell * {
            visibility: visible;
          }
          .beleg-print-shell {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
          }
          .beleg-druck {
            width: 100% !important;
            max-width: none !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            overflow: visible !important;
            break-inside: avoid;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .beleg-header {
            background:
              radial-gradient(circle at top left, rgba(87, 225, 160, 0.18), transparent 34%),
              linear-gradient(135deg, #112033 0%, #1b3552 100%) !important;
          }
          .beleg-panel,
          .beleg-panel-strong {
            background: #ffffff !important;
            border: 1px solid #e4ebf3 !important;
            box-shadow: none !important;
          }
          .beleg-panel-title {
            color: #1a2940 !important;
          }
          .beleg-panel-copy,
          .beleg-footer {
            color: #5f7087 !important;
          }
          .beleg-section-label {
            color: #7a8da6 !important;
          }
          .screen-receipt {
            display: none !important;
          }
          .beleg-print-document {
            display: block !important;
            width: 100%;
            min-height: auto;
            padding: 0;
            color: #18263a !important;
            background: #ffffff !important;
          }
          .print-doc-header,
          .print-doc-topline,
          .print-doc-grid,
          .print-doc-note,
          .print-doc-footer {
            display: block;
          }
          .print-doc-header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 220px;
            gap: 18px;
            padding-bottom: 10mm;
            border-bottom: 2px solid #1c3654;
          }
          .print-doc-kicker {
            margin: 0 0 3mm;
            font: 700 10pt Inter, Arial, sans-serif;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            color: #67809d;
          }
          .print-doc-title {
            margin: 0 0 3mm;
            font: 700 23pt Georgia, "Times New Roman", serif;
            color: #18324f;
          }
          .print-doc-copy {
            margin: 0;
            font: 11pt Inter, Arial, sans-serif;
            line-height: 1.55;
            color: #5a6f87;
          }
          .print-doc-meta {
            text-align: right;
            font: 10.5pt Inter, Arial, sans-serif;
            color: #31475f;
          }
          .print-doc-meta p {
            margin: 0 0 2.5mm;
          }
          .print-doc-topline {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 72mm;
            gap: 12mm;
            padding: 9mm 0 8mm;
          }
          .print-doc-block,
          .print-doc-amount {
            border: 1px solid #d7e2ee;
            border-radius: 4mm;
            padding: 5mm;
            background: #fbfdff;
          }
          .print-doc-amount {
            background: linear-gradient(135deg, #effbf5 0%, #f9fdfc 100%) !important;
            border-color: #cfe8db;
          }
          .print-doc-label {
            display: block;
            margin: 0 0 2mm;
            font: 700 9pt Inter, Arial, sans-serif;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: #7b91a9;
          }
          .print-doc-value {
            margin: 0 0 2mm;
            font: 700 14pt Inter, Arial, sans-serif;
            color: #18263a;
          }
          .print-doc-total {
            margin: 0 0 3mm;
            font: 700 24pt Georgia, "Times New Roman", serif;
            color: #174536;
          }
          .print-doc-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0 8mm;
            padding-top: 2mm;
          }
          .print-doc-row {
            display: flex;
            justify-content: space-between;
            gap: 8mm;
            padding: 4mm 0;
            border-bottom: 1px solid #e2eaf2;
          }
          .print-doc-row-value {
            flex: 1;
            text-align: right;
            font: 700 11pt Inter, Arial, sans-serif;
            color: #20344b;
          }
          .print-doc-note {
            margin-top: 8mm;
            padding: 5mm;
            border: 1px solid #e2eaf2;
            border-radius: 4mm;
            background: #fbfdff;
          }
          .print-doc-footer {
            display: flex;
            justify-content: space-between;
            gap: 8mm;
            margin-top: 10mm;
            padding-top: 4mm;
            border-top: 1px solid #d7e2ee;
            font: 9.5pt Inter, Arial, sans-serif;
            color: #667b92;
          }
        }
      `}</style>
    </div>
  );
}

export default function BelegPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-praxis-400">Beleg wird geladen …</p>}>
      <BelegInhalt />
    </Suspense>
  );
}
