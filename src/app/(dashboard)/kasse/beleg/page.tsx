"use client";

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

function BelegInhalt() {
  const router = useRouter();
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
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white/80 px-4 py-2 text-sm font-semibold text-praxis-700 transition hover:bg-white"
        >
          <X size={16} /> Schließen
        </button>
      </div>
      <div
        className="beleg-druck"
        style={{
          background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
          color: "#162338",
          borderRadius: 24,
          padding: "0",
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.12)",
          fontFamily: "\"Georgia\", \"Times New Roman\", serif",
          overflow: "hidden",
          border: "1px solid rgba(44, 78, 116, 0.12)",
        }}
      >
        <div style={{ background: "radial-gradient(circle at top left, rgba(87, 225, 160, 0.18), transparent 34%), linear-gradient(135deg, #112033 0%, #1b3552 100%)", color: "#f4f8ff", padding: "38px 48px 34px", display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start" }}>
          <div>
            <p style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", opacity: 0.72, margin: 0, fontFamily: "Inter, Arial, sans-serif" }}>AnimaPay Kasse</p>
            <p style={{ fontSize: 30, fontWeight: 700, margin: "10px 0 0" }}>{zahlung.buchungstyp === "ausgabe" ? "Interner Kassenbeleg" : "Zahlungsquittung"}</p>
            <p style={{ fontSize: 14, lineHeight: 1.55, margin: "14px 0 0", maxWidth: 420, color: "rgba(244,248,255,0.78)", fontFamily: "Inter, Arial, sans-serif" }}>
              Professioneller Beleg aus dem Patienten- und Kassenportal von {PRAXIS.name}.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "inline-flex", padding: "10px 14px", borderRadius: 999, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: "Inter, Arial, sans-serif" }}>
              {ZAHLART_LABEL[zahlung.zahlart] || zahlung.zahlart}
            </div>
            <p style={{ fontSize: 12, color: "rgba(244,248,255,0.72)", margin: "16px 0 0", fontFamily: "Inter, Arial, sans-serif" }}>Beleg-Nr. {zahlung.beleg_nr || "—"}</p>
            <p style={{ fontSize: 12, color: "rgba(244,248,255,0.72)", margin: "4px 0 0", fontFamily: "Inter, Arial, sans-serif" }}>{datum}</p>
          </div>
        </div>

        <div style={{ padding: "38px 48px 44px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 24, marginBottom: 28 }}>
            <div style={{ border: "1px solid #dde6f0", borderRadius: 20, padding: 24, background: "#ffffff" }}>
              <p style={{ margin: 0, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#68809c", fontFamily: "Inter, Arial, sans-serif" }}>Praxis</p>
              <p style={{ margin: "10px 0 0", fontSize: 22, fontWeight: 700 }}>{PRAXIS.name}</p>
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "#52657c", fontFamily: "Inter, Arial, sans-serif" }}>{PRAXIS.zusatz}</p>
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "#6b7a90", lineHeight: 1.7, fontFamily: "Inter, Arial, sans-serif" }}>{PRAXIS.strasse}<br />{PRAXIS.ort}</p>
            </div>
            <div style={{ borderRadius: 20, padding: 24, background: "linear-gradient(135deg, #eef8f3 0%, #f7fbff 100%)", border: "1px solid rgba(84, 166, 124, 0.24)" }}>
              <p style={{ margin: 0, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5b7a69", fontFamily: "Inter, Arial, sans-serif" }}>
                {zahlung.buchungstyp === "ausgabe" ? "Dokumentierter Betrag" : "Erhaltener Betrag"}
              </p>
              <p style={{ margin: "14px 0 0", fontSize: 38, fontWeight: 700, color: "#153a2b" }}>
                {signedAmount(zahlung.betrag, zahlung.buchungstyp)}
              </p>
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#527266", lineHeight: 1.6, fontFamily: "Inter, Arial, sans-serif" }}>
                {zahlung.buchungstyp === "ausgabe" ? "Interne Ausgabe im Kassenbuch dokumentiert." : "Zahlung wurde im Kassenbereich der Praxis erfasst."}
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginBottom: 28 }}>
            {[
              ["Typ", zahlung.buchungstyp === "ausgabe" ? "Praxis-Ausgabe" : "Patienten-Einnahme"],
              ["Patient", zahlung.patient_id ? `${zahlung.patients?.nachname}, ${zahlung.patients?.vorname}` : "—"],
              ["Patientennummer", zahlung.patient_id ? (zahlung.patients?.ivoris_nummer || "—") : "—"],
              ["Leistung", zahlung.zweck || "—"],
              ["Zahlart", ZAHLART_LABEL[zahlung.zahlart] || zahlung.zahlart],
              ["Quartal", zahlung.quartal_jahr && zahlung.quartal_nummer ? `Q${zahlung.quartal_nummer} ${zahlung.quartal_jahr}` : "—"],
            ].map(([k, v]) => (
              <div key={k as string} style={{ border: "1px solid #e4ebf3", borderRadius: 18, padding: "16px 18px", background: "#fff" }}>
                <p style={{ margin: 0, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#7a8da6", fontFamily: "Inter, Arial, sans-serif" }}>{k}</p>
                <p style={{ margin: "10px 0 0", fontSize: 18, fontWeight: 700 }}>{v}</p>
              </div>
            ))}
          </div>

          {zahlung.notiz ? (
            <div style={{ border: "1px solid #e4ebf3", borderRadius: 18, padding: 20, marginBottom: 28, background: "#fff" }}>
              <p style={{ margin: 0, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#7a8da6", fontFamily: "Inter, Arial, sans-serif" }}>Interne Notiz</p>
              <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.7, color: "#3a4c61", fontFamily: "Inter, Arial, sans-serif" }}>{zahlung.notiz}</p>
            </div>
          ) : null}

          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, display: "flex", justifyContent: "space-between", gap: 16, fontSize: 11, color: "#8293a7", fontFamily: "Inter, Arial, sans-serif" }}>
            <span>{PRAXIS.name} · {PRAXIS.strasse} · {PRAXIS.ort}</span>
            <span>{zahlung.buchungstyp === "ausgabe" ? "Interner Kassenbeleg, keine Rechnung." : "Quittung über eine erfasste Zahlung, keine Rechnung."}</span>
          </div>
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
          .beleg-druck { position: absolute; left: 0; top: 0; width: 100%; border-radius: 0 !important; box-shadow: none !important; border: none !important; }
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
