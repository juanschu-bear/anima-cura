"use client";

import { useDashboardStats, useAlerts, useTransaktionen } from "@/hooks/useData";
import { StatCard, StatusBadge, CardSkeleton } from "@/components/ui";
import { ZahlungsverlaufChart, RatenstatusChart } from "@/components/charts";
import { Euro, Users, AlertTriangle, TrendingUp, CreditCard, Clock } from "lucide-react";
import Link from "next/link";

export default function UebersichtPage() {
  const { stats, loading } = useDashboardStats();
  const { alerts, markRead } = useAlerts();
  const { transaktionen } = useTransaktionen({ status: "unklar" });

  // Demo-Daten für Charts (werden durch echte Daten ersetzt)
  const zahlungsverlauf = [
    { monat: "Jan", eingänge: 18500, forderungen: 4200 },
    { monat: "Feb", eingänge: 21300, forderungen: 3800 },
    { monat: "Mär", eingänge: 19800, forderungen: 5100 },
    { monat: "Apr", eingänge: 23400, forderungen: 3200 },
    { monat: "Mai", eingänge: 22100, forderungen: 4600 },
    { monat: "Jun", eingänge: 24800, forderungen: 2900 },
  ];

  const ratenStatus = [
    { name: "Bezahlt", value: 142, color: "#2dd4a8" },
    { name: "Offen", value: 38, color: "#3b82f6" },
    { name: "Überfällig", value: 7, color: "#f97066" },
    { name: "Teilbezahlt", value: 4, color: "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-praxis-800">Übersicht</h1>
        <p className="text-sm text-praxis-400 mt-1">
          Willkommen zurück, Maria. Hier ist dein Tages-Briefing.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Offene Forderungen"
              value={stats?.offene_forderungen?.toLocaleString("de-DE") || "0"}
              suffix="€"
              icon={<Euro size={20} />}
              variant="default"
            />
            <StatCard
              label="Eingang diesen Monat"
              value={stats?.eingang_monat?.toLocaleString("de-DE") || "0"}
              suffix="€"
              trend={{ value: 12, label: "vs. Vormonat" }}
              icon={<TrendingUp size={20} />}
              variant="success"
            />
            <StatCard
              label="Pünktlichkeitsquote"
              value={Math.round(stats?.puenktlichkeit || 0)}
              suffix="%"
              icon={<Clock size={20} />}
              variant={stats?.puenktlichkeit >= 85 ? "success" : "warning"}
            />
            <StatCard
              label="Im Mahnverfahren"
              value={stats?.im_mahnverfahren || 0}
              icon={<AlertTriangle size={20} />}
              variant={stats?.im_mahnverfahren > 5 ? "danger" : "default"}
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 stat-card">
          <h3 className="text-sm font-semibold text-praxis-700 mb-4">Zahlungsverlauf</h3>
          <ZahlungsverlaufChart data={zahlungsverlauf} />
        </div>
        <div className="stat-card">
          <h3 className="text-sm font-semibold text-praxis-700 mb-4">Ratenstatus</h3>
          <RatenstatusChart data={ratenStatus} />
        </div>
      </div>

      {/* Bottom Row: Alerts + Unmatched */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alerts */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-praxis-700">Aktuelle Hinweise</h3>
            <span className="badge badge-danger">{alerts.filter((a) => !a.gelesen).length} neu</span>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-3 p-3 rounded-lg ${
                  alert.gelesen ? "bg-surface-50" : "bg-accent-amber/5 border border-accent-amber/20"
                }`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  alert.schweregrad === "kritisch" ? "bg-accent-coral" :
                  alert.schweregrad === "warnung" ? "bg-accent-amber" : "bg-accent-blue"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-praxis-700 truncate">{alert.titel}</p>
                  <p className="text-xs text-praxis-400 mt-0.5 line-clamp-2">{alert.beschreibung}</p>
                </div>
                {!alert.gelesen && (
                  <button
                    className="text-xs text-praxis-500 hover:text-praxis-700"
                    onClick={() => markRead(alert.id)}
                  >
                    gelesen
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Unzugeordnete Transaktionen */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-praxis-700">Offene Zuordnungen</h3>
            <Link href="/zahlungen?status=unklar" className="text-xs text-praxis-500 hover:text-praxis-700">
              Alle anzeigen →
            </Link>
          </div>
          <div className="space-y-2">
            {transaktionen.slice(0, 5).map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-50">
                <CreditCard size={16} className="text-praxis-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-praxis-700 truncate">
                    {tx.absender_name}
                  </p>
                  <p className="text-xs text-praxis-400">{tx.datum} · {tx.verwendungszweck?.substring(0, 40)}</p>
                </div>
                <span className="text-sm font-semibold text-praxis-800">
                  {tx.betrag?.toLocaleString("de-DE")} €
                </span>
                <StatusBadge status={tx.matching_status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
