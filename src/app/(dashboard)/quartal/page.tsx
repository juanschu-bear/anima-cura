"use client";

import { useMemo } from "react";
import { useAppStore } from "@/hooks/useAppStore";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const quarterRevenue = [
  { quartal: "Q1 25", value: 112000 },
  { quartal: "Q2 25", value: 118000 },
  { quartal: "Q3 25", value: 106000 },
  { quartal: "Q4 25", value: 123000 },
  { quartal: "Q1 26", value: 136000 },
  { quartal: "Q2 26", value: 47850 },
];

const insuranceSplit = [
  { name: "Privatpatienten", value: 193, color: "#4b42d6" },
  { name: "Gesetzlich", value: 119, color: "#1aa57a" },
];

const treatmentRevenue = [
  { label: "Aligner", patients: 124, revenue: 52000 },
  { label: "Multibracket", patients: 98, revenue: 41000 },
  { label: "Linguale KFO", patients: 52, revenue: 38000 },
  { label: "Retainer", patients: 38, revenue: 12000 },
];

function formatEuro(value: number) {
  return `${value.toLocaleString("de-DE")}€`;
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

  const current = quarterRevenue[quarterRevenue.length - 1]?.value ?? 0;
  const previous = quarterRevenue[quarterRevenue.length - 2]?.value ?? 0;

  const quarterTrend = useMemo(() => {
    if (!previous) return 0;
    return ((current - previous) / previous) * 100;
  }, [current, previous]);

  const totalPatients = insuranceSplit.reduce((sum, s) => sum + s.value, 0);
  const maxRevenue = Math.max(...treatmentRevenue.map((t) => t.revenue));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-praxis-800">{isGerman ? "Quartalsbericht" : "Quarter report"}</h1>
        <p className="mt-1 text-sm text-praxis-400">
          {isGerman ? "Kennzahlen, Vergleich und Umsatztreiber im Überblick" : "KPIs, comparison and revenue drivers at a glance"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          title={isGerman ? "Q2 2026 Umsatz (bisher)" : "Q2 2026 revenue (to date)"}
          value={formatEuro(current)}
          sub={`${quarterTrend >= 0 ? "↑" : "↓"} ${Math.abs(quarterTrend).toFixed(1).replace(".", ",")}% ${isGerman ? "vs. Q1" : "vs Q1"}`}
          accent={quarterTrend >= 0 ? "green" : "red"}
        />
        <KPI
          title={isGerman ? "Aktive Patienten" : "Active patients"}
          value={String(totalPatients)}
          sub={isGerman ? "von 487 gesamt" : "of 487 total"}
        />
        <KPI
          title={isGerman ? "Ø Rate pro Patient" : "Avg installment per patient"}
          value="228€"
          sub={isGerman ? "Median: 220€" : "Median: 220€"}
        />
        <KPI
          title={isGerman ? "Ausfallquote" : "Default rate"}
          value="2,1%"
          sub={isGerman ? "↓ -0,8% vs. Q1" : "↓ -0.8% vs Q1"}
          accent="green"
        />
      </div>

      <div className="stat-card">
        <h3 className="mb-4 text-lg font-semibold text-praxis-700">{isGerman ? "Quartalsvergleich - Zahlungseingang" : "Quarter comparison - incoming payments"}</h3>
        <div className="grid grid-cols-6 gap-4">
          {quarterRevenue.map((row, idx) => {
            const max = Math.max(...quarterRevenue.map((q) => q.value));
            const height = Math.max(28, Math.round((row.value / max) * 220));
            const active = idx === quarterRevenue.length - 1;
            return (
              <div key={row.quartal} className="flex flex-col items-center gap-2">
                <div className="text-xs text-praxis-400">{Math.round(row.value / 1000)}k€</div>
                <div className="flex h-[220px] items-end">
                  <div
                    className={`w-16 rounded-t-xl ${active ? "bg-[#4b42d6]" : "bg-[#c4befb]"}`}
                    style={{ height }}
                  />
                </div>
                <div className="text-sm font-medium text-praxis-500">{row.quartal}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="stat-card">
          <h3 className="mb-4 text-lg font-semibold text-praxis-700">{isGerman ? "Patienten nach Kassenart" : "Patients by insurance type"}</h3>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="h-[220px] w-full md:w-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={insuranceSplit} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" strokeWidth={0}>
                    {insuranceSplit.map((slice) => (
                      <Cell key={slice.name} fill={slice.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {insuranceSplit.map((slice) => {
                const pct = Math.round((slice.value / totalPatients) * 100);
                return (
                  <p key={slice.name} className="flex items-center gap-2 text-sm text-praxis-700">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                    {isGerman ? `${slice.name}: ${slice.value} (${pct}%)` : `${slice.name}: ${slice.value} (${pct}%)`}
                  </p>
                );
              })}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="mb-4 text-lg font-semibold text-praxis-700">{isGerman ? "Umsatz nach Behandlungsart" : "Revenue by treatment"}</h3>
          <div className="space-y-4">
            {treatmentRevenue.map((row) => {
              const width = Math.max(10, Math.round((row.revenue / maxRevenue) * 100));
              return (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-sm text-praxis-700">
                    <span>{row.label} ({row.patients} {isGerman ? "Pat." : "pts"})</span>
                    <span className="font-semibold">{Math.round(row.revenue / 1000)}k€</span>
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
    </div>
  );
}
