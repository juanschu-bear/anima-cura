"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Mail, Phone, Shield } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { demoPatientDetail, demoRaten } from "@/lib/mock-data";

interface MahnPipeline {
  karenz: any[];
  stufe1: any[];
  stufe2: any[];
  stufe3: any[];
}

export default function MahnwesenPage() {
  const [patientFilter, setPatientFilter] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<MahnPipeline>({ karenz: [], stufe1: [], stufe2: [], stufe3: [] });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPatientFilter(params.get("patient"));

    async function fetchData() {
      const next: MahnPipeline = { karenz: [], stufe1: [], stufe2: [], stufe3: [] };
      try {
        const supabase = createBrowserClient();
        const { data: raten } = await supabase
          .from("raten")
          .select("*, patients:patient_id(id, vorname, nachname, email, telefon)")
          .in("status", ["überfällig", "offen"])
          .lt("faellig_am", new Date().toISOString().split("T")[0])
          .order("faellig_am", { ascending: true });

        const source = raten?.length
          ? raten
          : demoRaten
              .filter((r) => r.status === "überfällig" || r.status === "offen")
              .map((r) => ({ ...r, patients: demoPatientDetail(r.patient_id) }));

        source.forEach((r: any) => {
          if (r.mahnstufe === 0) next.karenz.push(r);
          else if (r.mahnstufe === 1) next.stufe1.push(r);
          else if (r.mahnstufe === 2) next.stufe2.push(r);
          else next.stufe3.push(r);
        });
      } catch {
        demoRaten
          .filter((r) => r.status === "überfällig" || r.status === "offen")
          .forEach((r: any) => {
            const entry = { ...r, patients: demoPatientDetail(r.patient_id) };
            if (entry.mahnstufe === 0) next.karenz.push(entry);
            else if (entry.mahnstufe === 1) next.stufe1.push(entry);
            else if (entry.mahnstufe === 2) next.stufe2.push(entry);
            else next.stufe3.push(entry);
          });
      }
      setPipeline(next);
    }

    fetchData();
  }, []);

  const allItems = [...pipeline.karenz, ...pipeline.stufe1, ...pipeline.stufe2, ...pipeline.stufe3];
  const totalAmount = allItems.reduce((sum: number, r: any) => sum + Number(r.betrag || 0), 0);
  const avgDelay = allItems.length
    ? Math.round(
        allItems.reduce((sum: number, r: any) => {
          const days = Math.max(0, Math.floor((Date.now() - new Date(r.faellig_am).getTime()) / (1000 * 60 * 60 * 24)));
          return sum + days;
        }, 0) / allItems.length
      )
    : 0;
  const stage1Success = useMemo(() => {
    const base = pipeline.stufe1.length + pipeline.stufe2.length + pipeline.stufe3.length;
    if (!base) return 0;
    return Math.max(0, Math.min(100, Math.round((pipeline.stufe1.length / base) * 100)));
  }, [pipeline]);

  const columns = [
    {
      key: "karenz",
      title: "Karenz (1–5 Tage)",
      icon: <Shield size={16} />,
      className: "border-l-4 border-l-surface-300",
      count: pipeline.karenz.length,
      items: pipeline.karenz,
    },
    {
      key: "stufe1",
      title: "Stufe 1 (6–20 Tage)",
      icon: <Mail size={16} />,
      className: "border-l-4 border-l-accent-amber",
      count: pipeline.stufe1.length,
      items: pipeline.stufe1,
    },
    {
      key: "stufe2",
      title: "Stufe 2 (21–42 Tage)",
      icon: <Phone size={16} />,
      className: "border-l-4 border-l-accent-coral",
      count: pipeline.stufe2.length,
      items: pipeline.stufe2,
    },
    {
      key: "stufe3",
      title: "Eskalation (42+)",
      icon: <AlertTriangle size={16} />,
      className: "border-l-4 border-l-red-800",
      count: pipeline.stufe3.length,
      items: pipeline.stufe3,
    },
  ];

  const visibleColumns = columns.map((col) => ({
    ...col,
    items: patientFilter ? col.items.filter((item: any) => item.patient_id === patientFilter) : col.items,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight text-praxis-800">Mahnwesen</h1>
        <p className="text-sm text-praxis-400 mt-1">Pipeline, offene Volumen und Eskalationen im Blick</p>
      </div>

      <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm text-praxis-600">
        <p className="font-semibold text-praxis-700 mb-1">Wie die Pipeline arbeitet</p>
        <p>
          Fälle werden automatisch aus überfälligen Raten in Stufen eingeteilt: Karenz (1–5 Tage), Stufe 1 (6–20),
          Stufe 2 (21–42), Eskalation (ab 42 Tagen). Klick auf einen Fall öffnet direkt die Patientendetails.
        </p>
      </div>

      {patientFilter && (
        <div className="rounded-lg border border-accent-violet/20 bg-accent-violet/5 px-4 py-3 text-sm text-praxis-700">
          Patientenfilter aktiv.{" "}
          <Link href="/mahnwesen" className="font-semibold text-[#4b42d6] hover:text-[#3b32bf]">
            Filter zurücksetzen
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Im Mahnverfahren" value={String(allItems.length)} />
        <Kpi title="Offenes Volumen" value={`${totalAmount.toLocaleString("de-DE")}€`} accent />
        <Kpi title="Ø Verzugstage" value={String(avgDelay)} />
        <Kpi title="Erfolgsquote Stufe 1" value={`${stage1Success}%`} success />
      </div>

      <div className="stat-card">
        <h3 className="mb-4 text-[24px] font-extrabold tracking-tight text-praxis-700">Mahnpipeline</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {visibleColumns.map((col) => (
            <div key={col.key} className="rounded-xl border border-surface-200 bg-surface-50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-praxis-700">
                  {col.icon}
                  {col.title}
                </div>
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-semibold text-praxis-600">
                  {col.count}
                </span>
              </div>

              <div className="space-y-2">
                {col.items.map((rate: any) => {
                  const patient = rate.patients;
                  const days = Math.max(0, Math.floor((Date.now() - new Date(rate.faellig_am).getTime()) / (1000 * 60 * 60 * 24)));
                  return (
                    <Link
                      key={rate.id}
                      href={`/patienten/${patient?.id}`}
                      className={`block rounded-lg border border-surface-200 bg-white p-3 hover:shadow-card ${col.className}`}
                    >
                      <p className="text-sm font-semibold text-praxis-800">{patient?.nachname}, {patient?.vorname}</p>
                      <p className="mt-1 text-sm text-praxis-600">Rate {rate.rate_nummer}/{Math.max(rate.rate_nummer, 24)} · {Number(rate.betrag || 0).toLocaleString("de-DE")}€</p>
                      <p className="text-sm text-praxis-500">Tag {days} · fällig {new Date(rate.faellig_am).toLocaleDateString("de-DE")}</p>
                    </Link>
                  );
                })}
                {col.items.length === 0 && <p className="rounded-lg bg-white p-3 text-sm text-praxis-400">Keine Fälle</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ title, value, accent, success }: { title: string; value: string; accent?: boolean; success?: boolean }) {
  return (
    <div className="stat-card">
      <p className="text-sm font-medium text-praxis-400">{title}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ? "text-accent-coral" : success ? "text-[#4ca43f]" : "text-praxis-800"}`}>{value}</p>
    </div>
  );
}
