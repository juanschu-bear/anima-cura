"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
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
  girocard: "Girocard",
  kreditkarte: "Kreditkarte",
  bar: "Bar",
};

function BelegInhalt() {
  const params = useSearchParams();
  const id = params.get("id");
  const [zahlung, setZahlung] = useState<any | null>(null);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    if (!id) { setFehler("Kein Beleg angegeben."); return; }
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

  if (fehler) return <p className="p-8 text-sm text-praxis-400">{fehler}</p>;
  if (!zahlung) return <p className="p-8 text-sm text-praxis-400">Beleg wird geladen …</p>;

  const datum = new Date(zahlung.kassen_datum).toLocaleDateString("de-DE", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div
        className="beleg-druck"
        style={{
          background: "#ffffff",
          color: "#1c3044",
          borderRadius: 12,
          padding: "48px 56px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          fontFamily: "inherit",
        }}
      >
        {/* Briefkopf */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #1c3044", paddingBottom: 16, marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{PRAXIS.name}</p>
            <p style={{ fontSize: 13, margin: "2px 0 0" }}>{PRAXIS.zusatz}</p>
            <p style={{ fontSize: 11, color: "#6b7a90", margin: "4px 0 0" }}>{PRAXIS.strasse} · {PRAXIS.ort}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: 0.5 }}>Quittung</p>
            <p style={{ fontSize: 11, color: "#6b7a90", margin: "4px 0 0" }}>Beleg-Nr. {zahlung.beleg_nr || "—"}</p>
            <p style={{ fontSize: 11, color: "#6b7a90", margin: "2px 0 0" }}>{datum}</p>
          </div>
        </div>

        {/* Angaben */}
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginBottom: 24 }}>
          <tbody>
            {[
              ["Patient", `${zahlung.patients?.nachname}, ${zahlung.patients?.vorname}`],
              ["Patientennummer", zahlung.patients?.ivoris_nummer || "—"],
              ["Leistung", zahlung.zweck || "—"],
              ["Zahlart", ZAHLART_LABEL[zahlung.zahlart] || zahlung.zahlart],
            ].map(([k, v]) => (
              <tr key={k as string} style={{ borderBottom: "1px solid #e8ecf2" }}>
                <td style={{ padding: "8px 0", color: "#6b7a90", width: 180 }}>{k}</td>
                <td style={{ padding: "8px 0", fontWeight: 600, textAlign: "right" }}>{v}</td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: "14px 0", fontSize: 14, fontWeight: 700 }}>Erhaltener Betrag</td>
              <td style={{ padding: "14px 0", fontSize: 22, fontWeight: 800, textAlign: "right" }}>
                {Number(zahlung.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontSize: 13, margin: "0 0 36px" }}>Betrag dankend erhalten.</p>

        {/* Fusszeile */}
        <div style={{ borderTop: "1px solid #e8ecf2", paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9aa7b8" }}>
          <span>{PRAXIS.name} · {PRAXIS.strasse} · {PRAXIS.ort}</span>
          <span>Quittung über eine erhaltene Zahlung, keine Rechnung.</span>
        </div>
      </div>

      <button
        onClick={() => window.print()}
        className="druck-knopf btn-primary mx-auto mt-4 flex items-center gap-2"
      >
        <Printer size={16} /> Drucken / als PDF sichern
      </button>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .beleg-druck, .beleg-druck * { visibility: visible; }
          .beleg-druck { position: absolute; left: 0; top: 0; width: 100%; border-radius: 0 !important; box-shadow: none !important; }
          .druck-knopf { display: none; }
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
