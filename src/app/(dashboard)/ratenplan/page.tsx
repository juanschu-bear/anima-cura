"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import { StatusBadge, EmptyState } from "@/components/ui";
import { MonatseinnahmenChart } from "@/components/charts";
import { CalendarRange, Plus } from "lucide-react";
import Link from "next/link";

export default function RatenplanPage() {
  const [plaene, setPlaene] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("ratenplaene")
        .select("*, patients:patient_id(vorname, nachname), raten(id, status, betrag, bezahlt_betrag)")
        .order("start_datum", { ascending: false });
      setPlaene(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  // Demo-Daten für Monatseinnahmen-Chart
  const einnahmen = [
    { monat: "Jan", privat: 14200, kasse: 4300 },
    { monat: "Feb", privat: 16800, kasse: 4500 },
    { monat: "Mär", privat: 15100, kasse: 4700 },
    { monat: "Apr", privat: 18200, kasse: 5200 },
    { monat: "Mai", privat: 17400, kasse: 4700 },
    { monat: "Jun", privat: 19800, kasse: 5000 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-praxis-800">Ratenpläne</h1>
          <p className="text-sm text-praxis-400 mt-1">
            {plaene.length} Ratenpläne · {plaene.filter((p) => p.status === "aktiv").length} aktiv
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Neuer Ratenplan
        </button>
      </div>

      {/* Einnahmen-Chart */}
      <div className="stat-card">
        <h3 className="text-sm font-semibold text-praxis-700 mb-4">Monatliche Einnahmen nach Kassenart</h3>
        <MonatseinnahmenChart data={einnahmen} />
      </div>

      {/* Ratenpläne-Tabelle */}
      <div className="bg-white rounded-card shadow-card border border-surface-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50">
              <th className="table-header">Patient</th>
              <th className="table-header text-right">Gesamt</th>
              <th className="table-header text-center">Raten</th>
              <th className="table-header text-right">Rate/Monat</th>
              <th className="table-header">Fortschritt</th>
              <th className="table-header">Status</th>
              <th className="table-header">Start</th>
            </tr>
          </thead>
          <tbody>
            {plaene.map((plan) => {
              const raten = plan.raten || [];
              const bezahlt = raten.filter((r: any) => r.status === "bezahlt").length;
              const prozent = raten.length > 0 ? Math.round((bezahlt / raten.length) * 100) : 0;

              return (
                <tr key={plan.id} className="hover:bg-surface-50/50 transition-colors">
                  <td className="table-cell">
                    <Link
                      href={`/patienten/${plan.patient_id}`}
                      className="text-sm font-medium text-praxis-700 hover:text-praxis-500 transition-colors"
                    >
                      {plan.patients?.nachname}, {plan.patients?.vorname}
                    </Link>
                  </td>
                  <td className="table-cell text-sm font-semibold text-praxis-800 text-right">
                    {plan.gesamtbetrag?.toLocaleString("de-DE")} €
                  </td>
                  <td className="table-cell text-sm text-center text-praxis-600">
                    {bezahlt}/{plan.anzahl_raten}
                  </td>
                  <td className="table-cell text-sm text-right text-praxis-600">
                    {plan.rate_betrag?.toLocaleString("de-DE")} €
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-surface-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-emerald rounded-full transition-all"
                          style={{ width: `${prozent}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-praxis-500 w-8">{prozent}%</span>
                    </div>
                  </td>
                  <td className="table-cell">
                    <StatusBadge status={plan.status} />
                  </td>
                  <td className="table-cell text-sm text-praxis-500">
                    {new Date(plan.start_datum).toLocaleDateString("de-DE")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {plaene.length === 0 && !loading && (
          <EmptyState
            icon={<CalendarRange size={24} />}
            title="Keine Ratenpläne"
            description="Erstelle den ersten Ratenplan für einen Patienten."
          />
        )}
      </div>
    </div>
  );
}
