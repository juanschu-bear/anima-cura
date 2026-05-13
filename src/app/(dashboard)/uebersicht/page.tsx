"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAlerts, useDashboardStats, useTransaktionen } from "@/hooks/useData";
import { CardSkeleton, StatCard, StatusBadge } from "@/components/ui";
import { RatenstatusChart, ZahlungsverlaufChart } from "@/components/charts";
import { AlertTriangle, Clock, CreditCard, Euro, TrendingUp } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";

export default function UebersichtPage() {
  const router = useRouter();
  const { locale } = useAppStore();
  const isGerman = locale === "de";
  const { stats, loading } = useDashboardStats();
  const { alerts, markRead } = useAlerts();
  const { transaktionen } = useTransaktionen({ status: "alle" });

  const zahlungsverlauf = [
    { monat: "Dez", eingänge: 36800, forderungen: 38000 },
    { monat: "Jan", eingänge: 39200, forderungen: 39000 },
    { monat: "Feb", eingänge: 38200, forderungen: 39800 },
    { monat: "Mär", eingänge: 41500, forderungen: 42000 },
    { monat: "Apr", eingänge: 44100, forderungen: 43100 },
    { monat: "Mai", eingänge: 48000, forderungen: 47800 },
  ];

  const ratenStatus = [
    { name: "Bezahlt", value: 142, color: "#2dd4a8" },
    { name: "Offen", value: 38, color: "#3b82f6" },
    { name: "Überfällig", value: 7, color: "#f97066" },
    { name: "Teilbezahlt", value: 4, color: "#f59e0b" },
  ];

  function openAlert(alert: any) {
    markRead(alert.id);
    if (alert.action_url) {
      router.push(alert.action_url);
      return;
    }
    if (alert.typ === "mahnung") {
      router.push("/mahnwesen");
      return;
    }
    if (alert.typ === "matching") {
      router.push("/zahlungen?status=abweichung");
      return;
    }
    router.push("/zahlungen");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-praxis-800">Übersicht</h1>
        <p className="text-sm text-praxis-400 mt-1">
          {isGerman
            ? "Willkommen zurück, Maria. Hier ist dein Tages-Briefing."
            : "Welcome back, Maria. Here is your daily briefing."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label={isGerman ? "Offene Forderungen" : "Open claims"}
              value={stats?.offene_forderungen?.toLocaleString("de-DE") || "0"}
              suffix="€"
              icon={<Euro size={20} />}
              variant="danger"
            />
            <StatCard
              label={isGerman ? "Zahlungseingang Mai" : "Incoming this month"}
              value={stats?.eingang_monat?.toLocaleString("de-DE") || "0"}
              suffix="€"
              trend={{ value: 8, label: isGerman ? "vs. April" : "vs. April" }}
              icon={<TrendingUp size={20} />}
              variant="success"
            />
            <StatCard
              label={isGerman ? "Pünktlichkeitsquote" : "On-time rate"}
              value={Math.round(stats?.puenktlichkeit || 0)}
              suffix="%"
              icon={<Clock size={20} />}
              variant={stats?.puenktlichkeit >= 85 ? "success" : "warning"}
            />
            <StatCard
              label={isGerman ? "Im Mahnverfahren" : "In dunning"}
              value={stats?.im_mahnverfahren || 0}
              icon={<AlertTriangle size={20} />}
              variant={stats?.im_mahnverfahren > 5 ? "danger" : "default"}
            />
          </>
        )}
      </div>

      <div className="stat-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-praxis-700">{isGerman ? "Heutige Alerts" : "Today's alerts"}</h3>
          <span className="badge badge-danger">{alerts.filter((a) => !a.gelesen).length} {isGerman ? "neu" : "new"}</span>
        </div>
        <div className="space-y-2">
          {alerts.slice(0, 6).map((alert) => (
            <button
              key={alert.id}
              onClick={() => openAlert(alert)}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                alert.gelesen ? "border-surface-200 bg-surface-50" : "border-accent-amber/20 bg-accent-amber/5"
              } hover:bg-surface-100/70`}
            >
              <p className="text-sm font-semibold text-praxis-700">{alert.titel}</p>
              <p className="mt-0.5 text-sm text-praxis-500">{alert.beschreibung}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="stat-card lg:col-span-2">
          <h3 className="mb-3 text-lg font-semibold text-praxis-700">{isGerman ? "Cashflow letzte 6 Monate" : "Cashflow last 6 months"}</h3>
          <ZahlungsverlaufChart data={zahlungsverlauf} />
        </div>
        <div className="stat-card">
          <h3 className="mb-3 text-lg font-semibold text-praxis-700">{isGerman ? "Ratenstatus" : "Installment status"}</h3>
          <RatenstatusChart data={ratenStatus} />
        </div>
      </div>

      <div className="stat-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-praxis-700">{isGerman ? "Letzte Zahlungseingänge" : "Latest incoming payments"}</h3>
          <Link href="/zahlungen" className="text-xs text-praxis-500 hover:text-praxis-700">{isGerman ? "Alle anzeigen" : "View all"} →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-50">
                <th className="table-header">Datum</th>
                <th className="table-header">{isGerman ? "Absender" : "Sender"}</th>
                <th className="table-header text-right">{isGerman ? "Betrag" : "Amount"}</th>
                <th className="table-header">{isGerman ? "Verwendungszweck" : "Purpose"}</th>
                <th className="table-header">Status</th>
                <th className="table-header">{isGerman ? "Zuordnung" : "Assignment"}</th>
              </tr>
            </thead>
            <tbody>
              {transaktionen.slice(0, 8).map((tx) => (
                <tr
                  key={tx.id}
                  className="cursor-pointer hover:bg-surface-50/60"
                  onClick={() => router.push(tx.matched_patient_id ? `/patienten/${tx.matched_patient_id}` : "/zahlungen")}
                >
                  <td className="table-cell text-sm text-praxis-700">{new Date(tx.datum).toLocaleDateString("de-DE")}</td>
                  <td className="table-cell text-sm font-semibold text-praxis-800">{tx.absender_name}</td>
                  <td className="table-cell text-right text-sm font-semibold text-[#4ca43f]">+{Number(tx.betrag || 0).toLocaleString("de-DE")}€</td>
                  <td className="table-cell text-sm text-praxis-600">{tx.verwendungszweck || "—"}</td>
                  <td className="table-cell"><StatusBadge status={tx.matching_status} /></td>
                  <td className="table-cell text-sm text-praxis-600">
                    {tx.patients ? `${tx.patients.nachname}, ${tx.patients.vorname}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
