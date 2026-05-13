"use client";

import { AlertTriangle, Phone, Mail, Shield } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import { demoPatientDetail, demoRaten } from "@/lib/mock-data";

interface MahnPipeline {
  karenz: any[];
  stufe1: any[];
  stufe2: any[];
  stufe3: any[];
}

export default function MahnwesenPage() {
  const [pipeline, setPipeline] = useState<MahnPipeline>({ karenz: [], stufe1: [], stufe2: [], stufe3: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const p: MahnPipeline = { karenz: [], stufe1: [], stufe2: [], stufe3: [] };
      try {
        const supabase = createBrowserClient();
        const { data: raten } = await supabase
          .from("raten")
          .select("*, patients:patient_id(id, vorname, nachname, email, telefon), ratenplaene:ratenplan_id(rate_betrag)")
          .in("status", ["überfällig", "offen"])
          .lt("faellig_am", new Date().toISOString().split("T")[0])
          .order("faellig_am", { ascending: true });

        const source = raten && raten.length > 0
          ? raten
          : demoRaten
              .filter((r) => r.status === "überfällig" || r.status === "offen")
              .map((r) => ({
                ...r,
                patients: demoPatientDetail(r.patient_id),
              }));

        source.forEach((r: any) => {
          if (r.mahnstufe === 0) p.karenz.push(r);
          else if (r.mahnstufe === 1) p.stufe1.push(r);
          else if (r.mahnstufe === 2) p.stufe2.push(r);
          else p.stufe3.push(r);
        });
      } catch {
        demoRaten
          .filter((r) => r.status === "überfällig" || r.status === "offen")
          .forEach((r: any) => {
            const entry = {
              ...r,
              patients: demoPatientDetail(r.patient_id),
            };
            if (entry.mahnstufe === 0) p.karenz.push(entry);
            else if (entry.mahnstufe === 1) p.stufe1.push(entry);
            else if (entry.mahnstufe === 2) p.stufe2.push(entry);
            else p.stufe3.push(entry);
          });
      }
      setPipeline(p);
      setLoading(false);
    }
    fetch();
  }, []);

  const columns = [
    {
      key: "karenz",
      title: "Karenzzeit",
      subtitle: "5 Tage Schonfrist",
      icon: <Shield size={16} />,
      color: "bg-accent-blue/10 text-accent-blue border-accent-blue/30",
      items: pipeline.karenz,
    },
    {
      key: "stufe1",
      title: "Stufe 1",
      subtitle: "Freundliche Erinnerung",
      icon: <Mail size={16} />,
      color: "bg-accent-amber/10 text-accent-amber border-accent-amber/30",
      items: pipeline.stufe1,
    },
    {
      key: "stufe2",
      title: "Stufe 2",
      subtitle: "1. Mahnung + Anruf",
      icon: <Phone size={16} />,
      color: "bg-accent-coral/10 text-accent-coral border-accent-coral/30",
      items: pipeline.stufe2,
    },
    {
      key: "stufe3",
      title: "Stufe 3",
      subtitle: "Eskalation an Maria",
      icon: <AlertTriangle size={16} />,
      color: "bg-red-100 text-red-700 border-red-300",
      items: pipeline.stufe3,
    },
  ];

  const totalOverdue = Object.values(pipeline).reduce((s, arr) => s + arr.length, 0);
  const totalAmount = Object.values(pipeline)
    .flat()
    .reduce((s: number, r: any) => s + r.betrag, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-praxis-800">Mahnwesen</h1>
        <p className="text-sm text-praxis-400 mt-1">
          {totalOverdue} überfällige Raten · {totalAmount.toLocaleString("de-DE")} € ausstehend
        </p>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((col) => (
          <div key={col.key} className="flex flex-col">
            {/* Column Header */}
            <div className={`rounded-t-card px-4 py-3 border ${col.color} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                {col.icon}
                <div>
                  <p className="text-sm font-semibold">{col.title}</p>
                  <p className="text-xs opacity-70">{col.subtitle}</p>
                </div>
              </div>
              <span className="text-lg font-bold">{col.items.length}</span>
            </div>

            {/* Column Body */}
            <div className="flex-1 bg-surface-50 border border-t-0 border-surface-200 rounded-b-card p-2 space-y-2 min-h-[200px]">
              {col.items.map((rate: any) => {
                const patient = rate.patients;
                const tageUeber = Math.floor(
                  (Date.now() - new Date(rate.faellig_am).getTime()) / (1000 * 60 * 60 * 24)
                );

                return (
                  <Link
                    key={rate.id}
                    href={`/patienten/${patient?.id}`}
                    className="block bg-white rounded-lg p-3 shadow-sm border border-surface-200 hover:shadow-card transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-praxis-700">
                        {patient?.nachname}, {patient?.vorname}
                      </p>
                      <span className="text-xs font-mono text-accent-coral">
                        +{tageUeber}d
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-praxis-400">
                        Rate {rate.rate_nummer}
                      </span>
                      <span className="text-sm font-semibold text-praxis-800">
                        {rate.betrag.toLocaleString("de-DE")} €
                      </span>
                    </div>
                    {patient?.email && col.key !== "karenz" && (
                      <div className="mt-2 pt-2 border-t border-surface-100 flex items-center gap-1 text-xs text-praxis-400">
                        <Mail size={10} /> {patient.email}
                      </div>
                    )}
                  </Link>
                );
              })}

              {col.items.length === 0 && (
                <div className="text-center py-8 text-xs text-praxis-300">
                  Keine Fälle
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
