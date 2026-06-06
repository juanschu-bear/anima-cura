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
    <div className="mx-auto max-w-md p-6">
      <div className="beleg-druck rounded-xl border border-surface-200 bg-white p-8 text-[#1c3044]">
        <div className="mb-6 text-center">
          <p className="text-lg font-bold">{PRAXIS.name}</p>
          <p className="text-sm">{PRAXIS.zusatz}</p>
          <p className="text-xs text-[#6b7a90]">{PRAXIS.strasse} · {PRAXIS.ort}</p>
        </div>

        <h1 className="mb-1 text-center text-xl font-bold">Quittung</h1>
        <p className="mb-6 text-center text-xs text-[#6b7a90]">
          Beleg-Nr. {zahlung.beleg_nr || "—"} · {datum}
        </p>

        <div className="mb-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#6b7a90]">Patient</span>
            <span className="font-semibold">{zahlung.patients?.nachname}, {zahlung.patients?.vorname}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7a90]">Patientennummer</span>
            <span>{zahlung.patients?.ivoris_nummer || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7a90]">Leistung</span>
            <span>{zahlung.zweck || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7a90]">Zahlart</span>
            <span>{ZAHLART_LABEL[zahlung.zahlart] || zahlung.zahlart}</span>
          </div>
        </div>

        <div className="mb-6 rounded-lg bg-[#f4f6f9] p-4 text-center">
          <p className="text-xs text-[#6b7a90]">Betrag</p>
          <p className="text-3xl font-bold">
            {Number(zahlung.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
          </p>
        </div>

        <p className="text-center text-sm">Betrag dankend erhalten.</p>
        <p className="mt-4 text-center text-[10px] text-[#9aa7b8]">
          Dies ist eine Quittung über eine erhaltene Zahlung, keine Rechnung.
        </p>
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
          .beleg-druck { position: absolute; left: 0; top: 0; width: 100%; border: none; }
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
