"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAlerts, useDashboardStats, useTransaktionen } from "@/hooks/useData";
import { CardSkeleton, StatusBadge } from "@/components/ui";
import { RatenstatusChart, ZahlungsverlaufChart } from "@/components/charts";
import { AlertTriangle, ArrowUpRight, TriangleAlert, TrendingUp } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";

export default function UebersichtPage() {
  const router = useRouter();
  const { locale } = useAppStore();
  const isGerman = locale === "de";
  const { stats, loading } = useDashboardStats();
  const { alerts, markRead } = useAlerts();
  const { transaktionen } = useTransaktionen({ status: "alle" });

  const verlaufHistorie = [
    33800, 35200, 36100, 35800, 36900, 37500, 38900, 39200, 40100, 39800, 41200, 42100,
    36800, 39200, 38200, 41500, 44100, 48000,
  ];
  const prognoseSmoothing = verlaufHistorie.map((value, idx, all) => {
    const slice = all.slice(Math.max(0, idx - 5), idx + 1);
    return Math.round(slice.reduce((sum, n) => sum + n, 0) / slice.length);
  });
  const chartMonate = ["Dez", "Jan", "Feb", "Mär", "Apr", "Mai"];
  const zahlungsverlauf = chartMonate.map((monat, i) => ({
    monat,
    eingang: verlaufHistorie[12 + i],
    erwartet: prognoseSmoothing[12 + i],
  }));

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
    <div className="space-y-5">
      <div>
        <h1 className="ac-page-title">Übersicht</h1>
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
            <KpiCard
              label="Offene Forderungen"
              value={`${(stats?.offene_forderungen || 0).toLocaleString("de-DE")}€`}
              sub={`${Math.max(1, Math.round((stats?.offene_forderungen || 0) / 3900))} Patienten`}
              valueClass="text-[#cb4a55]"
            />
            <KpiCard
              label="Zahlungseingang Mai"
              value={`${(stats?.eingang_monat || 0).toLocaleString("de-DE")}€`}
              sub="↑ +8% vs. April"
              valueClass="text-[#5a8d3a]"
              subClass="text-[#5a8d3a]"
            />
            <KpiCard
              label="Pünktlichkeitsquote"
              value={`${Math.round(stats?.puenktlichkeit || 0)}%`}
              sub="↑ +2,4% vs. Q4"
              subClass="text-[#5a8d3a]"
            />
            <KpiCard
              label="Im Mahnverfahren"
              value={String(stats?.im_mahnverfahren || 0)}
              sub="2 Stufe 1 · 2 Stufe 2 · 1 Eskalation"
              valueClass="text-[#c79a3b]"
            />
          </>
        )}
      </div>

      <div className="stat-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="ac-section-title">{isGerman ? "Heutige Alerts" : "Today's alerts"}</h3>
          <span className="badge badge-danger">{alerts.filter((a) => !a.gelesen).length} {isGerman ? "neu" : "new"}</span>
        </div>
        <div className="space-y-2">
          {alerts.slice(0, 6).map((alert) => (
            <button
              key={alert.id}
              onClick={() => openAlert(alert)}
              className="w-full rounded-xl border border-surface-200 bg-white p-4 text-left transition-all hover:-translate-y-[1px] hover:bg-surface-100/70"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-3">
                  <div className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full ${
                    alert.typ === "mahnung" ? "bg-[#fdecec] text-[#cb4a55]" :
                    alert.schweregrad === "warnung" ? "bg-[#fff5e6] text-[#c79a3b]" :
                    "bg-[#edf8ed] text-[#5a8d3a]"
                  }`}>
                    {alert.typ === "mahnung" ? <TriangleAlert size={16} /> : alert.schweregrad === "warnung" ? <AlertTriangle size={16} /> : <TrendingUp size={16} />}
                  </div>
                  <div>
                  <p className="truncate text-sm font-semibold text-praxis-700">{alert.titel}</p>
                  <p className="mt-0.5 text-sm text-praxis-500">{alert.beschreibung}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-praxis-400">
                  {alert.created_at ? new Date(alert.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  <ArrowUpRight size={14} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="stat-card lg:col-span-2">
          <h3 className="ac-section-title mb-3">{isGerman ? "Cashflow letzte 6 Monate" : "Cashflow last 6 months"}</h3>
          <p className="mb-2 text-xs text-praxis-500">
            Erwartet wird aus Verlauf der letzten 18 Monate per gleitender Prognose berechnet.
          </p>
          <ZahlungsverlaufChart data={zahlungsverlauf} />
        </div>
        <div className="stat-card">
          <h3 className="ac-section-title mb-3">{isGerman ? "Ratenstatus" : "Installment status"}</h3>
          <RatenstatusChart data={ratenStatus} />
        </div>
      </div>

      <div className="stat-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="ac-section-title">{isGerman ? "Letzte Zahlungseingänge" : "Latest incoming payments"}</h3>
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

function KpiCard({
  label,
  value,
  sub,
  valueClass,
  subClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  subClass?: string;
}) {
  return (
    <div className="stat-card">
      <p className="text-[13px] font-semibold text-praxis-400">{label}</p>
      <p className={`mt-1 text-[46px] leading-none font-bold text-praxis-800 ${valueClass || ""}`}>{value}</p>
      {sub ? <p className={`mt-2 text-sm text-praxis-500 ${subClass || ""}`}>{sub}</p> : null}
    </div>
  );
}
