"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/hooks/useAppStore";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { createBrowserClient } from "@/lib/db/supabase";

interface QuartalData {
  totalPatienten: number;
  versicherungSplit: { name: string; value: number; color: string }[];
  behandlungSplit: { label: string; patients: number }[];
  kinderCount: number;
  erwachseneCount: number;
  mitEmail: number;
  mitTelefon: number;
  mitMobil: number;
}

function KPI({ title, value, sub, accent }: { title: string; value: string; sub?: string; accent?: "green" | "red" | "default" }) {
  const valueColor = accent === "green" ? "text-[#3d9c46]" : accent === "red" ? "text-[#b9465b]" : "text-praxis-800";
  return (
    <div className="stat-card">
      <p className="text-sm font-medium text-praxis-400">{title}</p>
      <p className={`mt-1 text-4xl font-semibold ${valueColor}`}>{value}</p>
      {sub && <p className="mt-1 text-sm text-praxis-500">{sub}</p>}
    </div>
  );
}

export default function QuartalPage() {
  const { locale } = useAppStore();
  const isGerman = locale === "de";
  const [data, setData] = useState<QuartalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const supabase = createBrowserClient();
      const { data: patients } = await supabase
        .from("patients")
        .select("geburtsdatum, versicherung_status, kasse, behandlung, email, telefon, mobiltelefon")
        .range(0, 9999);

      if (!patients) { setLoading(false); return; }

      const versMap: Record<string, number> = {};
      const behMap: Record<string, number> = {};
      let kinder = 0, erwachsene = 0, mitEmail = 0, mitTelefon = 0, mitMobil = 0;
      const now = Date.now();

      for (const p of patients) {
        const vs = p.versicherung_status === "Family" ? "Familienversichert"
          : p.versicherung_status === "Statutory" ? "Gesetzlich"
          : p.versicherung_status === "Private" ? "Privat"
          : p.versicherung_status === "Retired" ? "Rentner"
          : p.kasse === "gesetzlich" ? "Gesetzlich" : "Privat";
        versMap[vs] = (versMap[vs] || 0) + 1;

        const beh = p.behandlung || "Kein Status";
        behMap[beh] = (behMap[beh] || 0) + 1;

        if (p.geburtsdatum) {
          const age = Math.floor((now - new Date(p.geburtsdatum).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          if (age < 18) kinder++; else erwachsene++;
        }

        if (p.email) mitEmail++;
        if (p.telefon) mitTelefon++;
        if (p.mobiltelefon) mitMobil++;
      }

      const colorMap: Record<string, string> = {
        Familienversichert: "#1aa57a",
        Gesetzlich: "#2cb88a",
        Privat: "#4b42d6",
        Rentner: "#7a6fe0",
      };

      setData({
        totalPatienten: patients.length,
        versicherungSplit: Object.entries(versMap)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value]) => ({ name, value, color: colorMap[name] || "#999" })),
        behandlungSplit: Object.entries(behMap)
          .sort((a, b) => b[1] - a[1])
          .map(([label, patients]) => ({ label, patients })),
        kinderCount: kinder,
        erwachseneCount: erwachsene,
        mitEmail,
        mitTelefon,
        mitMobil,
      });
      setLoading(false);
    }
    fetch();
  }, []);

  if (loading) return <div className="text-praxis-400">Lade Quartalsdaten...</div>;
  if (!data) return <div className="text-praxis-400">Keine Daten verfügbar.</div>;

  const maxBeh = Math.max(...data.behandlungSplit.map(b => b.patients), 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight text-praxis-800">{isGerman ? "Quartalsbericht" : "Quarter report"}</h1>
        <p className="mt-1 text-sm text-praxis-400">
          {isGerman ? "Praxiskennzahlen auf Basis der aktuellen Patientendaten" : "Practice KPIs based on current patient data"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI title={isGerman ? "Patienten gesamt" : "Total patients"} value={String(data.totalPatienten)} />
        <KPI title={isGerman ? "Kinder (unter 18)" : "Children (under 18)"} value={String(data.kinderCount)} sub={`${data.erwachseneCount} Erwachsene`} />
        <KPI title={isGerman ? "Erreichbarkeit E-Mail" : "Email reachability"} value={`${Math.round((data.mitEmail / data.totalPatienten) * 100)}%`} sub={`${data.mitEmail} von ${data.totalPatienten}`} accent={data.mitEmail / data.totalPatienten > 0.5 ? "green" : "red"} />
        <KPI title={isGerman ? "Erreichbarkeit Telefon" : "Phone reachability"} value={`${Math.round((data.mitTelefon / data.totalPatienten) * 100)}%`} sub={`${data.mitTelefon} Festnetz, ${data.mitMobil} Mobil`} accent={data.mitTelefon / data.totalPatienten > 0.5 ? "green" : "red"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="stat-card">
          <h3 className="mb-4 text-[28px] font-extrabold tracking-tight text-praxis-700">{isGerman ? "Versicherungsverteilung" : "Insurance distribution"}</h3>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="h-[220px] w-full md:w-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.versicherungSplit} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" strokeWidth={0}>
                    {data.versicherungSplit.map((slice) => (
                      <Cell key={slice.name} fill={slice.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {data.versicherungSplit.map((slice) => {
                const pct = Math.round((slice.value / data.totalPatienten) * 100);
                return (
                  <p key={slice.name} className="flex items-center gap-2 text-sm text-praxis-700">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                    {slice.name}: {slice.value} ({pct}%)
                  </p>
                );
              })}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="mb-4 text-[28px] font-extrabold tracking-tight text-praxis-700">{isGerman ? "Behandlungsstatus" : "Treatment status"}</h3>
          <div className="space-y-4">
            {data.behandlungSplit.map((row) => {
              const width = Math.max(10, Math.round((row.patients / maxBeh) * 100));
              return (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-sm text-praxis-700">
                    <span>{row.label}</span>
                    <span className="font-semibold">{row.patients}</span>
                  </div>
                  <div className="h-3 rounded-full bg-[#e9e8ff]">
                    <div className="h-3 rounded-full bg-[#4b42d6]" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="mb-3 text-[24px] font-extrabold tracking-tight text-praxis-700">{isGerman ? "Hinweis" : "Note"}</h3>
        <p className="text-sm text-praxis-500">
          {isGerman
            ? "Finanzkennzahlen (Umsatz, Ausfallquote, durchschnittliche Raten) werden verfügbar sobald Ratenpläne angelegt und die Bankverbindung eingerichtet sind."
            : "Financial KPIs (revenue, default rate, average installments) will be available once rate plans are created and the bank connection is set up."}
        </p>
      </div>
    </div>
  );
}
