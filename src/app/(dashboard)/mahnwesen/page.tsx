"use client";

import { useEffect, useMemo, useState, useRef, DragEvent } from "react";
import Link from "next/link";
import { AlertTriangle, Mail, Phone, Shield, GripVertical, Info } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";

interface MahnItem {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_email?: string;
  patient_telefon?: string;
  rate_nummer: number;
  betrag: number;
  faellig_am: string;
  mahnstufe: number;
  typ?: string;
}

type StufeKey = "karenz" | "stufe1" | "stufe2" | "stufe3";

const STUFEN: { key: StufeKey; title: string; icon: any; borderClass: string; desc: string }[] = [
  { key: "karenz", title: "Karenz (1-5 Tage)", icon: Shield, borderClass: "border-l-surface-300", desc: "Automatische Wartezeit. Keine Aktion nötig." },
  { key: "stufe1", title: "Stufe 1 (6-20 Tage)", icon: Mail, borderClass: "border-l-accent-amber", desc: "Freundliche E-Mail-Erinnerung wird automatisch versendet." },
  { key: "stufe2", title: "Stufe 2 (21-42 Tage)", icon: Phone, borderClass: "border-l-accent-coral", desc: "Formelles Schreiben + Telefonat-Aufgabe erstellt." },
  { key: "stufe3", title: "Eskalation (42+)", icon: AlertTriangle, borderClass: "border-l-red-800", desc: "Fall wird an Praxisleitung eskaliert." },
];

// Demo items for testing drag & drop
const DEMO_ITEMS: MahnItem[] = [
  { id: "demo-1", patient_id: "d1", patient_name: "Mustermann, Max", patient_email: "max@example.de", betrag: 180, rate_nummer: 5, faellig_am: "2026-05-10", mahnstufe: 0, typ: "demo" },
  { id: "demo-2", patient_id: "d2", patient_name: "Schmidt, Anna", patient_telefon: "0170-1234567", betrag: 250, rate_nummer: 3, faellig_am: "2026-04-28", mahnstufe: 1, typ: "demo" },
  { id: "demo-3", patient_id: "d3", patient_name: "Weber, Lisa", patient_email: "weber@mail.de", betrag: 180, rate_nummer: 7, faellig_am: "2026-04-05", mahnstufe: 2, typ: "demo" },
  { id: "demo-4", patient_id: "d4", patient_name: "Fischer, Klaus", betrag: 320, rate_nummer: 2, faellig_am: "2026-03-15", mahnstufe: 2, typ: "demo" },
  { id: "demo-5", patient_id: "d5", patient_name: "Hoffmann, Jan", patient_email: "hoffmann@web.de", betrag: 180, rate_nummer: 9, faellig_am: "2026-02-20", mahnstufe: 3, typ: "demo" },
];

export default function MahnwesenPage() {
  const [patientFilter, setPatientFilter] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<Record<StufeKey, MahnItem[]>>({ karenz: [], stufe1: [], stufe2: [], stufe3: [] });
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<StufeKey | null>(null);
  const [hasRealData, setHasRealData] = useState(false);
  const [showDemo, setShowDemo] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPatientFilter(params.get("patient"));

    async function fetchData() {
      const next: Record<StufeKey, MahnItem[]> = { karenz: [], stufe1: [], stufe2: [], stufe3: [] };
      const supabase = createBrowserClient();
      const { data: raten } = await supabase
        .from("raten")
        .select("*, patients:patient_id(id, vorname, nachname, email, telefon)")
        .in("status", ["überfällig", "offen"])
        .lt("faellig_am", new Date().toISOString().split("T")[0])
        .order("faellig_am", { ascending: true });

      if (raten && raten.length > 0) {
        setHasRealData(true);
        setShowDemo(false);
        raten.forEach((r: any) => {
          const item: MahnItem = {
            id: r.id,
            patient_id: r.patients?.id,
            patient_name: `${r.patients?.nachname}, ${r.patients?.vorname}`,
            patient_email: r.patients?.email,
            patient_telefon: r.patients?.telefon,
            rate_nummer: r.rate_nummer,
            betrag: r.betrag,
            faellig_am: r.faellig_am,
            mahnstufe: r.mahnstufe || 0,
          };
          const key: StufeKey = r.mahnstufe === 0 ? "karenz" : r.mahnstufe === 1 ? "stufe1" : r.mahnstufe === 2 ? "stufe2" : "stufe3";
          next[key].push(item);
        });
      } else {
        // Load demo items
        DEMO_ITEMS.forEach((item) => {
          const key: StufeKey = item.mahnstufe === 0 ? "karenz" : item.mahnstufe === 1 ? "stufe1" : item.mahnstufe === 2 ? "stufe2" : "stufe3";
          next[key].push(item);
        });
      }
      setPipeline(next);
    }
    fetchData();
  }, []);

  function handleDragStart(e: DragEvent, itemId: string) {
    setDragItem(itemId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: DragEvent, col: StufeKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(col);
  }

  function handleDragLeave() {
    setDragOverCol(null);
  }

  function handleDrop(e: DragEvent, targetCol: StufeKey) {
    e.preventDefault();
    setDragOverCol(null);
    if (!dragItem) return;

    setPipeline((prev) => {
      const next = { ...prev };
      let movedItem: MahnItem | null = null;
      let sourceCol: StufeKey | null = null;

      for (const key of Object.keys(next) as StufeKey[]) {
        const idx = next[key].findIndex((item) => item.id === dragItem);
        if (idx !== -1) {
          movedItem = next[key][idx];
          sourceCol = key;
          next[key] = [...next[key].slice(0, idx), ...next[key].slice(idx + 1)];
          break;
        }
      }

      if (movedItem && sourceCol !== targetCol) {
        const stufeMap: Record<StufeKey, number> = { karenz: 0, stufe1: 1, stufe2: 2, stufe3: 3 };
        movedItem = { ...movedItem, mahnstufe: stufeMap[targetCol] };
        next[targetCol] = [...next[targetCol], movedItem];

        // If real data, update DB
        if (!movedItem.typ) {
          const supabase = createBrowserClient();
          supabase.from("raten").update({ mahnstufe: stufeMap[targetCol] }).eq("id", movedItem.id);
        }
      }

      return next;
    });
    setDragItem(null);
  }

  const allItems = [...pipeline.karenz, ...pipeline.stufe1, ...pipeline.stufe2, ...pipeline.stufe3];
  const totalAmount = allItems.reduce((sum, r) => sum + Number(r.betrag || 0), 0);
  const avgDelay = allItems.length
    ? Math.round(allItems.reduce((sum, r) => {
        const days = Math.max(0, Math.floor((Date.now() - new Date(r.faellig_am).getTime()) / (1000 * 60 * 60 * 24)));
        return sum + days;
      }, 0) / allItems.length)
    : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight text-praxis-800">Mahnwesen</h1>
        <p className="text-sm text-praxis-400 mt-1">Pipeline, offene Volumen und Eskalationen im Blick</p>
      </div>

      {!hasRealData && showDemo && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800">
          <div className="flex items-start gap-3">
            <Info size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Demo-Modus</p>
              <p className="mt-1">Diese Karten sind Beispieldaten zum Testen. Ziehe sie per Drag & Drop zwischen den Stufen hin und her. Echte Fälle erscheinen automatisch sobald Ratenpläne angelegt und überfällige Zahlungen erkannt werden.</p>
              <p className="mt-2 text-blue-600">
                <strong>Rücklastschriften</strong> werden automatisch erkannt sobald die Bankverbindung aktiv ist. Negative Buchungen auf dem Praxiskonto lösen sofort eine Benachrichtigung aus und der betroffene Patient wird automatisch in die Pipeline aufgenommen.
              </p>
              <button onClick={() => setShowDemo(false)} className="mt-2 text-xs font-semibold text-blue-500 hover:text-blue-700">Demo ausblenden</button>
            </div>
          </div>
        </div>
      )}

      {patientFilter && (
        <div className="rounded-lg border border-accent-violet/20 bg-accent-violet/5 px-4 py-3 text-sm text-praxis-700">
          Patientenfilter aktiv.{" "}
          <Link href="/mahnwesen" className="font-semibold text-[#4b42d6] hover:text-[#3b32bf]">Filter zurücksetzen</Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Im Mahnverfahren" value={String(allItems.length)} />
        <Kpi title="Offenes Volumen" value={`${totalAmount.toLocaleString("de-DE")}€`} accent />
        <Kpi title="Ø Verzugstage" value={String(avgDelay)} />
        <Kpi title="Rücklastschriften" value="—" sub="Aktiv nach Bankanbindung" />
      </div>

      <div className="stat-card">
        <h3 className="mb-4 text-[24px] font-extrabold tracking-tight text-praxis-700">Mahnpipeline</h3>
        <p className="mb-4 text-sm text-praxis-400">Fälle per Drag & Drop zwischen Stufen verschieben</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STUFEN.map((stufe) => {
            const items = patientFilter
              ? pipeline[stufe.key].filter((item) => item.patient_id === patientFilter)
              : pipeline[stufe.key];
            const Icon = stufe.icon;
            const isOver = dragOverCol === stufe.key;

            return (
              <div
                key={stufe.key}
                className={`rounded-xl border p-3 transition-colors ${isOver ? "border-[#4b42d6] bg-[#f5f3ff]" : "border-surface-200 bg-surface-50"}`}
                onDragOver={(e) => handleDragOver(e, stufe.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stufe.key)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-praxis-700">
                    <Icon size={16} />
                    {stufe.title}
                  </div>
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-semibold text-praxis-600">
                    {items.length}
                  </span>
                </div>
                <p className="mb-3 text-xs text-praxis-400">{stufe.desc}</p>

                <div className="space-y-2 min-h-[60px]">
                  {items.map((item) => {
                    const days = Math.max(0, Math.floor((Date.now() - new Date(item.faellig_am).getTime()) / (1000 * 60 * 60 * 24)));
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        className={`block rounded-lg border border-surface-200 bg-white p-3 cursor-grab active:cursor-grabbing hover:shadow-card border-l-4 ${stufe.borderClass} ${dragItem === item.id ? "opacity-50" : ""} ${item.typ === "demo" ? "border-dashed" : ""}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-praxis-800">{item.patient_name}</p>
                            <p className="mt-1 text-sm text-praxis-600">Rate {item.rate_nummer} · {Number(item.betrag || 0).toLocaleString("de-DE")}€</p>
                            <p className="text-sm text-praxis-500">Tag {days} · fällig {new Date(item.faellig_am).toLocaleDateString("de-DE")}</p>
                            {item.patient_email && <p className="mt-1 text-xs text-praxis-400">✉ {item.patient_email}</p>}
                          </div>
                          <GripVertical size={16} className="mt-1 text-praxis-300" />
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && <p className="rounded-lg bg-white p-3 text-sm text-praxis-400">Keine Fälle</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ title, value, accent, success, sub }: { title: string; value: string; accent?: boolean; success?: boolean; sub?: string }) {
  return (
    <div className="stat-card">
      <p className="text-sm font-medium text-praxis-400">{title}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ? "text-accent-coral" : success ? "text-[#4ca43f]" : "text-praxis-800"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-praxis-400">{sub}</p>}
    </div>
  );
}
