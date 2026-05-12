"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import { StatCard, Dropdown } from "@/components/ui";
import { MonatseinnahmenChart, ZahlungsverlaufChart, RatenstatusChart } from "@/components/charts";
import { Euro, Users, TrendingUp, AlertTriangle, FileText } from "lucide-react";

export default function QuartalPage() {
  const [quartal, setQuartal] = useState("Q2 2026");
  const [kiSummary, setKiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadKISummary() {
    setLoading(true);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quartal_summary" }),
      });
      const data = await res.json();
      setKiSummary(data.summary);
    } catch (err) {
      setKiSummary("KI-Zusammenfassung konnte nicht geladen werden.");
    }
    setLoading(false);
  }

  // Demo-Daten
  const zahlungsverlauf = [
    { monat: "Apr", eingänge: 23400, forderungen: 3200 },
    { monat: "Mai", eingänge: 22100, forderungen: 4600 },
    { monat: "Jun", eingänge: 24800, forderungen: 2900 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-praxis-800">Quartalsbericht</h1>
          <p className="text-sm text-praxis-400 mt-1">
            Finanzbericht & KI-Analyse
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Dropdown
            label=""
            value={quartal}
            onChange={setQuartal}
            options={[
              { value: "Q2 2026", label: "Q2 2026 (aktuell)" },
              { value: "Q1 2026", label: "Q1 2026" },
              { value: "Q4 2025", label: "Q4 2025" },
            ]}
          />
          <button className="btn-secondary flex items-center gap-2">
            <FileText size={16} /> PDF Export
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Umsatz Quartal" value="70.300" suffix="€" icon={<Euro size={20} />} trend={{ value: 8, label: "vs. Vorquartal" }} />
        <StatCard label="Aktive Patienten" value={87} icon={<Users size={20} />} />
        <StatCard label="Pünktlichkeit" value={89} suffix="%" icon={<TrendingUp size={20} />} variant="success" />
        <StatCard label="Ausfallquote" value="2,1" suffix="%" icon={<AlertTriangle size={20} />} variant="warning" />
      </div>

      {/* Chart */}
      <div className="stat-card">
        <h3 className="text-sm font-semibold text-praxis-700 mb-4">Verlauf {quartal}</h3>
        <ZahlungsverlaufChart data={zahlungsverlauf} />
      </div>

      {/* KI-Zusammenfassung */}
      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-praxis-700 flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-accent-violet/15 flex items-center justify-center text-accent-violet text-xs">✦</span>
            KI-Zusammenfassung
          </h3>
          <button
            onClick={loadKISummary}
            className="btn-secondary text-xs"
            disabled={loading}
          >
            {loading ? "Wird erstellt..." : "Zusammenfassung generieren"}
          </button>
        </div>

        {kiSummary ? (
          <div className="bg-accent-violet/5 border border-accent-violet/20 rounded-lg p-4">
            <p className="text-sm text-praxis-700 leading-relaxed whitespace-pre-wrap">
              {kiSummary}
            </p>
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-praxis-400">
            Klicke auf „Zusammenfassung generieren" für eine KI-gestützte Quartal-Analyse.
          </div>
        )}
      </div>
    </div>
  );
}
