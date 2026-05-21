"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAlerts, useTransaktionen } from "@/hooks/useData";
import { CardSkeleton, StatusBadge } from "@/components/ui";
import { RatenstatusChart, ZahlungsverlaufChart } from "@/components/charts";
import { AlertTriangle, ArrowUp, Check, Circle, TriangleAlert, Users, Stethoscope, Shield, CreditCard } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { createBrowserClient } from "@/lib/db/supabase";
import { t, tData } from "@/lib/i18n";

interface PraxisStats {
  totalPatienten: number;
  behandlungVerteilung: { name: string; value: number }[];
  kasseVerteilung: { name: string; value: number; color: string }[];
  geschlechtVerteilung: { name: string; value: number }[];
  mitEmail: number;
  mitTelefon: number;
  offeneRaten: number;
  imMahnverfahren: number;
}

export default function UebersichtPage() {
  const router = useRouter();
  const { locale, theme } = useAppStore();
  const isDark = theme === "dark";
  const { alerts, markRead } = useAlerts();
  const { transaktionen } = useTransaktionen({ status: "alle" });
  const [stats, setStats] = useState<PraxisStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const supabase = createBrowserClient();

      // Gesamtzahl
      const { count: totalPatienten } = await supabase
        .from("patients")
        .select("*", { count: "exact", head: true });

      // Behandlung
      const { data: allPatients } = await supabase
        .from("patients")
        .select("behandlung, kasse, geschlecht, email, telefon, versicherung_status")
        .range(0, 9999);

      if (!allPatients) {
        setLoading(false);
        return;
      }

      const behandlungMap: Record<string, number> = {};
      const kasseMap: Record<string, number> = {};
      const geschlechtMap: Record<string, number> = {};
      let mitEmail = 0;
      let mitTelefon = 0;

      for (const p of allPatients) {
        const beh = p.behandlung || "Kein Status";
        behandlungMap[beh] = (behandlungMap[beh] || 0) + 1;

        const vs = p.versicherung_status === "Family" ? "Familienversichert"
          : p.versicherung_status === "Statutory" ? "Gesetzlich"
          : p.versicherung_status === "Private" ? "Privat"
          : p.versicherung_status === "Retired" ? "Rentner"
          : p.kasse === "gesetzlich" ? "Gesetzlich" : "Privat";
        kasseMap[vs] = (kasseMap[vs] || 0) + 1;

        const g = p.geschlecht === "w" ? "Weiblich" : p.geschlecht === "m" ? "Männlich" : "Andere";
        geschlechtMap[g] = (geschlechtMap[g] || 0) + 1;

        if (p.email) mitEmail++;
        if (p.telefon) mitTelefon++;
      }

      // Raten & Mahnungen
      const { count: offeneRaten } = await supabase
        .from("raten")
        .select("*", { count: "exact", head: true })
        .in("status", ["offen", "überfällig"]);

      const { count: imMahnverfahren } = await supabase
        .from("raten")
        .select("*", { count: "exact", head: true })
        .gt("mahnstufe", 0);

      setStats({
        totalPatienten: totalPatienten || 0,
        behandlungVerteilung: Object.entries(behandlungMap)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value]) => ({ name, value })),
        kasseVerteilung: Object.entries(kasseMap)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value]) => ({
            name,
            value,
            color: name === "Familienversichert" ? "#1aa57a"
              : name === "Gesetzlich" ? "#2cb88a"
              : name === "Privat" ? "#4b42d6"
              : name === "Rentner" ? "#7a6fe0"
              : "#999",
          })),
        geschlechtVerteilung: Object.entries(geschlechtMap)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value]) => ({ name, value })),
        mitEmail,
        mitTelefon,
        offeneRaten: offeneRaten || 0,
        imMahnverfahren: imMahnverfahren || 0,
      });
      setLoading(false);
    }
    fetchStats();
  }, []);

  function openAlert(alert: any) {
    markRead(alert.id);
    if (alert.action_url) { router.push(alert.action_url); return; }
    if (alert.typ === "mahnung") { router.push("/mahnwesen"); return; }
    if (alert.typ === "matching") { router.push("/zahlungen?status=abweichung"); return; }
    router.push("/zahlungen");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className={`ac-page-title ${isDark ? "text-white" : ""}`}>{t("overview.title", locale)}</h1>
        <p className={`mt-1 text-sm ${isDark ? "text-[#b6c2d6]" : "text-praxis-400"}`}>
          {t("overview.welcome", locale)}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              icon={<Users size={18} />}
              label={t("overview.totalPatients", locale)}
              value={String(stats?.totalPatienten || 0)}
              sub={`${stats?.mitEmail || 0} ${t("overview.withEmail", locale)} · ${stats?.mitTelefon || 0} ${t("overview.withPhone", locale)}`}
              dark={isDark}
            />
            <KpiCard
              icon={<Stethoscope size={18} />}
              label={t("overview.withTreatment", locale)}
              value={String(stats?.behandlungVerteilung?.reduce((s, b) => s + b.value, 0) || 0)}
              sub={`${stats?.behandlungVerteilung?.find(b => b.name === "Kein Status")?.value || 0} ${t("overview.withoutStatus", locale)}`}
              dark={isDark}
            />
            <KpiCard
              icon={<Shield size={18} />}
              label={t("overview.insurance", locale)}
              value={`${stats?.kasseVerteilung?.find(k => k.name === "Gesetzlich")?.value || 0} ${t("insurance.gkv", locale)}`}
              sub={`${stats?.kasseVerteilung?.find(k => k.name === "Privat")?.value || 0} ${t("overview.privatePatients", locale)}`}
              dark={isDark}
            />
            <KpiCard
              icon={<CreditCard size={18} />}
              label={t("overview.openInstallments", locale)}
              value={stats?.offeneRaten ? String(stats.offeneRaten) : "—"}
              sub={stats?.imMahnverfahren ? `${stats.imMahnverfahren} ${t("overview.inDunning", locale)}` : t("overview.noRatePlans", locale)}
              valueClass={stats?.offeneRaten ? "text-[#cb4a55]" : ""}
              dark={isDark}
            />
          </>
        )}
      </div>

      {/* Behandlungsverteilung */}
      {!loading && stats && (
        <div className="stat-card">
          <h3 className="ac-section-title mb-4 flex items-center gap-2">
            <Circle size={11} className="fill-[#5b4de1] text-[#5b4de1]" />
            {t("overview.treatmentDist", locale)}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.behandlungVerteilung.map((b) => (
              <div
                key={b.name}
                className={`rounded-xl border p-4 ${isDark ? "border-white/10 bg-[#0f1520]" : "border-surface-200 bg-white"}`}
              >
                <p className={`text-2xl font-bold ${isDark ? "text-white" : "text-praxis-800"}`}>{b.value}</p>
                <p className={`mt-1 text-xs ${isDark ? "text-[#9db0cc]" : "text-praxis-500"}`}>{b.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Versicherungs-Split */}
      {!loading && stats && (
        <div className="stat-card">
          <h3 className="ac-section-title mb-3 flex items-center gap-2">
            <Circle size={11} className="fill-[#5b4de1] text-[#5b4de1]" />
            {t("overview.insuranceDist", locale)}
          </h3>
          <RatenstatusChart data={stats.kasseVerteilung} />
        </div>
      )}

      {/* Alerts */}
      <div className="stat-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="ac-section-title flex items-center gap-2">
            <Circle size={11} className="fill-[#5b4de1] text-[#5b4de1]" />
            {t("overview.systemAlerts", locale)}
          </h3>
          <span className="badge badge-danger">{alerts.filter((a) => !a.gelesen).length} {t("overview.new", locale)}</span>
        </div>
        <div className="space-y-2">
          {alerts.length === 0 && (
            <p className={`text-sm py-4 text-center ${isDark ? "text-[#7a8da6]" : "text-praxis-400"}`}>
              {t("overview.noAlerts", locale)}
            </p>
          )}
          {alerts.slice(0, 6).map((alert) => (
            <button
              key={alert.id}
              onClick={() => openAlert(alert)}
              className={`w-full rounded-xl border p-4 text-left transition-all hover:-translate-y-[1px] ${
                isDark
                  ? "border-white/10 bg-[#0f1520] hover:bg-[#131b29]"
                  : "border-surface-200 bg-white hover:bg-surface-100/70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-3">
                  <div className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full ${
                    alert.typ === "mahnung" ? "bg-[#fdecec] text-[#cb4a55]" :
                    alert.schweregrad === "warnung" ? "bg-[#fff5e6] text-[#c79a3b]" :
                    alert.typ === "system" ? "bg-[#efedff] text-[#5b4de1]" : "bg-[#edf8ed] text-[#5a8d3a]"
                  }`}>
                    {alert.typ === "mahnung" ? <TriangleAlert size={16} /> : alert.schweregrad === "warnung" ? <AlertTriangle size={16} /> : alert.typ === "system" ? <ArrowUp size={16} /> : <Check size={16} />}
                  </div>
                  <div>
                    <p className={`truncate text-sm font-semibold ${isDark ? "text-[#e9eef8]" : "text-praxis-700"}`}>{alert.titel}</p>
                    <p className={`mt-0.5 text-sm ${isDark ? "text-[#b4c0d4]" : "text-praxis-500"}`}>{alert.beschreibung}</p>
                  </div>
                </div>
                <div className={`flex shrink-0 items-center gap-2 text-xs ${isDark ? "text-[#98a9c2]" : "text-praxis-400"}`}>
                  {alert.created_at ? new Date(alert.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Zahlungseingänge */}
      <div className="stat-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="ac-section-title flex items-center gap-2">
            <Circle size={11} className="fill-[#5b4de1] text-[#5b4de1]" />
            {t("overview.latestPayments", locale)}
          </h3>
          <Link
            href="/zahlungen"
            className={`text-xs ${isDark ? "text-[#9db0cc] hover:text-[#dbe6f8]" : "text-praxis-500 hover:text-praxis-700"}`}
          >
            {t("overview.viewAll", locale)} →
          </Link>
        </div>
        {transaktionen.length === 0 ? (
          <div className={`rounded-xl border p-8 text-center ${isDark ? "border-white/10 bg-[#0f1520]" : "border-surface-200 bg-surface-50"}`}>
            <CreditCard size={32} className={`mx-auto mb-3 ${isDark ? "text-[#4a5d7a]" : "text-praxis-300"}`} />
            <p className={`text-sm font-medium ${isDark ? "text-[#9db0cc]" : "text-praxis-500"}`}>
              {t("overview.noBankConnection", locale)}
            </p>
            <Link href="/einstellungen" className={`mt-2 inline-block text-xs ${isDark ? "text-[#7b93b4]" : "text-praxis-400"} hover:underline`}>
              {t("overview.connectInSettings", locale)}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={isDark ? "bg-white/5" : "bg-surface-50"}>
                  <th className="table-header">{t("overview.date", locale)}</th>
                  <th className="table-header">{t("overview.sender", locale)}</th>
                  <th className="table-header text-right">{t("overview.amount", locale)}</th>
                  <th className="table-header">{t("overview.purpose", locale)}</th>
                  <th className="table-header">{t("overview.status", locale)}</th>
                  <th className="table-header">{t("overview.assignment", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {transaktionen.slice(0, 8).map((tx) => (
                  <tr
                    key={tx.id}
                    className="cursor-pointer hover:bg-surface-50/60"
                    onClick={() => router.push(tx.matched_patient_id ? `/patienten/${tx.matched_patient_id}` : "/zahlungen")}
                  >
                    <td className="table-cell text-sm text-praxis-700">{new Date(tx.datum).toLocaleDateString(locale === "en" ? "en-GB" : "de-DE")}</td>
                    <td className="table-cell text-sm font-semibold text-praxis-800">{tx.absender_name}</td>
                    <td className="table-cell text-right text-sm font-semibold text-[#4ca43f]">+{Number(tx.betrag || 0).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€</td>
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
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  valueClass,
  subClass,
  dark,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  subClass?: string;
  dark?: boolean;
}) {
  return (
    <div className={`rounded-[16px] border px-6 py-5 shadow-card ${dark ? "border-white/12 bg-[#111824]" : "border-surface-200 bg-white"}`}>
      <div className="flex items-center gap-2">
        {icon && <span className={dark ? "text-[#7b93b4]" : "text-[#8797ac]"}>{icon}</span>}
        <p className={`text-[14px] font-semibold ${dark ? "text-[#9fb2cd]" : "text-[#8797ac]"}`}>{label}</p>
      </div>
      <p className={`mt-2 text-[48px] leading-none font-bold tracking-tight ${dark ? "text-[#f2f6ff]" : "text-[#1f2f43]"} ${valueClass || ""}`}>{value}</p>
      {sub ? <p className={`mt-2 text-sm ${dark ? "text-[#a7b8cf]" : "text-[#7f8ea2]"} ${subClass || ""}`}>{sub}</p> : null}
    </div>
  );
}
