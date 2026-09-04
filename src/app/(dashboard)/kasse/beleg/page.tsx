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
    ? "Patientenkopie der Quittung"
    : "Praxisquittung";
  const subline = zahlung.buchungstyp === "ausgabe"
    ? "Interner Nachweis aus dem Kassenbereich der Praxis."
    : isPatientCopy
    ? "Diese Kopie kann dem Patienten oder den Eltern als Zahlungsnachweis mitgegeben oder als PDF gespeichert werden."
    : "Interne Praxisansicht mit vollständigem Kassenkontext und eindeutiger Belegreferenz.";
  const cards: Array<[string, string]> = [
    ["Typ", zahlung.buchungstyp === "ausgabe" ? "Praxis-Ausgabe" : "Patienten-Einnahme"],
    ["Patient", zahlung.patient_id ? `${zahlung.patients?.nachname}, ${zahlung.patients?.vorname}` : "—"],
    ["Patientennummer", zahlung.patient_id ? (zahlung.patients?.ivoris_nummer || "—") : "—"],
    ["Leistung", zahlung.zweck || "—"],
    ["Zahlart", ZAHLART_LABEL[zahlung.zahlart] || zahlung.zahlart],
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
            className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-[#111b27] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] transition hover:bg-[#182434]"
          >
            <X size={16} />
            Schließen
          </button>
          <div className="inline-flex rounded-full border border-white/12 bg-[#0f1722] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
            <Link
              href={`/kasse/beleg?id=${id}&copy=praxis`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${!isPatientCopy ? "bg-white text-[#0e1825]" : "text-white/80 hover:text-white"}`}
            >
              Praxisquittung
            </Link>
            <Link
              href={`/kasse/beleg?id=${id}&copy=patient`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${isPatientCopy ? "bg-[#57e1a0] text-[#08281a]" : "text-white/80 hover:text-white"}`}
            >
              Patientenkopie
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={drucke}
          className="inline-flex items-center gap-2 rounded-full bg-[#2ac95a] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(42,201,90,0.28)] transition hover:bg-[#25b650]"
        >
          <Printer size={16} />
          Drucken / als PDF sichern
        </button>
      </div>

      <div className="beleg-print-shell">
        <article className="beleg-druck overflow-hidden rounded-[28px] border border-[#dbe4ee] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
          <header className="beleg-header flex items-start justify-between gap-6 px-9 py-8">
            <div className="min-w-0">
              <p className="beleg-kicker">{isPatientCopy ? "Patientenkopie" : "AnimaPay Kasse"}</p>
              <h1 className="beleg-title">{documentTitle}</h1>
              <p className="beleg-subline">{subline}</p>
            </div>
            <div className="min-w-[190px] text-right">
              <div className="beleg-badge">{ZAHLART_LABEL[zahlung.zahlart] || zahlung.zahlart}</div>
              <p className="beleg-meta mt-4">Beleg-Nr. {zahlung.beleg_nr || "—"}</p>
              <p className="beleg-meta mt-1">{datum}</p>
            </div>
          </header>

          <div className="grid gap-5 px-9 pt-7 md:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[20px] border border-[#dde6f0] bg-white p-5">
              <p className="beleg-section-label">{isPatientCopy ? "Praxis" : "Praxisansicht"}</p>
              <p className="mt-3 text-[22px] font-bold text-[#18263a]">{PRAXIS.name}</p>
              <p className="mt-1 font-sans text-[14px] text-[#52657c]">{PRAXIS.zusatz}</p>
              <p className="mt-3 font-sans text-[13px] leading-7 text-[#6b7a90]">
                {PRAXIS.strasse}
                <br />
                {PRAXIS.ort}
              </p>
            </section>

            <section className="rounded-[20px] border border-[rgba(84,166,124,0.26)] bg-[linear-gradient(135deg,#eef8f3_0%,#f7fbff_100%)] p-5">
              <p className="beleg-section-label text-[#5b7a69]">
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
              <div key={label} className="rounded-[18px] border border-[#e4ebf3] bg-white px-4 py-4">
                <p className="beleg-section-label">{label}</p>
                <p className="mt-2 text-[18px] font-bold leading-[1.35] text-[#1a2940]">{value}</p>
              </div>
            ))}
          </section>

          {!isPatientCopy && zahlung.notiz ? (
            <section className="mx-9 mb-6 rounded-[18px] border border-[#e4ebf3] bg-white px-5 py-4">
              <p className="beleg-section-label">Interne Notiz</p>
              <p className="mt-2 font-sans text-[15px] leading-7 text-[#3a4c61]">{zahlung.notiz}</p>
            </section>
          ) : null}

          <footer className="mx-9 mb-8 flex flex-wrap items-start justify-between gap-4 border-t border-[#e2e8f0] pt-4 font-sans text-[11px] text-[#8293a7]">
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
            radial-gradient(circle at top left, rgba(87, 225, 160, 0.18), transparent 34%),
            linear-gradient(135deg, #112033 0%, #1b3552 100%);
          color: #f4f8ff;
        }
        .beleg-kicker {
          margin: 0;
          font-family: Inter, Arial, sans-serif;
          font-size: 12px;
          letter-spacing: 3px;
          text-transform: uppercase;
          opacity: 0.72;
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
          color: rgba(244, 248, 255, 0.8);
        }
        .beleg-badge {
          display: inline-flex;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.12);
          font-family: Inter, Arial, sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }
        .beleg-meta {
          margin: 0;
          font-family: Inter, Arial, sans-serif;
          font-size: 12px;
          color: rgba(244, 248, 255, 0.72);
        }
        .beleg-section-label {
          margin: 0;
          font-family: Inter, Arial, sans-serif;
          font-size: 11px;
          letter-spacing: 1.6px;
          text-transform: uppercase;
          color: #7a8da6;
        }
        @media print {
          @page {
            size: A4;
            margin: 10mm;
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
            width: 190mm !important;
            margin: 0 auto !important;
          }
          .beleg-druck {
            width: 190mm !important;
            max-width: 190mm !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
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
