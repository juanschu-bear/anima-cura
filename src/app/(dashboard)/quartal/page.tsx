"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/hooks/useAppStore";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { createBrowserClient } from "@/lib/db/supabase";
import { t, tData } from "@/lib/i18n";

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

interface QuartalFinance {
  bezahlt_gesamt: number;
  bezahlt_privat: number;
  bezahlt_gesetzlich: number;
  faellig_gesamt: number;
  faellig_privat: number;
  faellig_gesetzlich: number;
  offen_gesamt: number;
  offen_privat: number;
  offen_gesetzlich: number;
  teilbezahlt_gesamt: number;
  teilbezahlt_privat: number;
  teilbezahlt_gesetzlich: number;
}

function KPI({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "default" | "amber" | "blue";
}) {
  const valueColor =
    accent === "green"
      ? "text-[#3d9c46]"
      : accent === "red"
      ? "text-[#b9465b]"
      : accent === "amber"
      ? "text-[#c8942d]"
      : accent === "blue"
      ? "text-[#4b42d6]"
      : "text-praxis-800";

  return (
    <div className="stat-card">
      <p className="text-sm font-medium text-praxis-400">{title}</p>
      <p className={`mt-1 text-4xl font-semibold ${valueColor}`}>{value}</p>
      {sub && <p className="mt-1 text-sm text-praxis-500">{sub}</p>}
    </div>
  );
}

function euro(value: number) {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";
}

export default function QuartalPage() {
  const { locale } = useAppStore();
  const [data, setData] = useState<QuartalData | null>(null);
  const [finance, setFinance] = useState<QuartalFinance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadQuarterData() {
      const supabase = createBrowserClient();
      const today = new Date();
      const quarterIndex = Math.floor(today.getMonth() / 3);
      const quarterStart = new Date(today.getFullYear(), quarterIndex * 3, 1);
      const quarterEnd = new Date(today.getFullYear(), quarterIndex * 3 + 3, 0);

      const [patientsRes, reportingRes] = await Promise.all([
        supabase
          .from("patients")
          .select(
            "geburtsdatum, versicherung_status, kasse, behandlung, email, telefon, mobiltelefon"
          )
          .range(0, 9999),
        fetch(
          `/api/reporting?von=${quarterStart.toISOString().slice(0, 10)}&bis=${quarterEnd
            .toISOString()
            .slice(0, 10)}`
        ),
      ]);

      const patients = patientsRes.data;
      if (patients) {
        const versMap: Record<string, number> = {};
        const behMap: Record<string, number> = {};
        let kinder = 0;
        let erwachsene = 0;
        let mitEmail = 0;
        let mitTelefon = 0;
        let mitMobil = 0;
        const now = Date.now();

        for (const patient of patients) {
          const vs =
            patient.versicherung_status === "Family"
              ? "Familienversichert"
              : patient.versicherung_status === "Statutory"
              ? "Gesetzlich"
              : patient.versicherung_status === "Private"
              ? "Privat"
              : patient.versicherung_status === "Retired"
              ? "Rentner"
              : patient.kasse === "gesetzlich"
              ? "Gesetzlich"
              : "Privat";
          versMap[vs] = (versMap[vs] || 0) + 1;

          const beh = patient.behandlung || "Kein Status";
          behMap[beh] = (behMap[beh] || 0) + 1;

          if (patient.geburtsdatum) {
            const age = Math.floor(
              (now - new Date(patient.geburtsdatum).getTime()) /
                (365.25 * 24 * 60 * 60 * 1000)
            );
            if (age < 18) kinder += 1;
            else erwachsene += 1;
          }

          if (patient.email) mitEmail += 1;
          if (patient.telefon) mitTelefon += 1;
          if (patient.mobiltelefon) mitMobil += 1;
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
            .map(([name, value]) => ({
              name,
              value,
              color: colorMap[name] || "#999",
            })),
          behandlungSplit: Object.entries(behMap)
            .sort((a, b) => b[1] - a[1])
            .map(([label, count]) => ({ label, patients: count })),
          kinderCount: kinder,
          erwachseneCount: erwachsene,
          mitEmail,
          mitTelefon,
          mitMobil,
        });
      }

      if (reportingRes.ok) {
        const reporting = await reportingRes.json();
        setFinance(reporting?.aktuell?.quartalsumsatz ?? null);
      }

      setLoading(false);
    }

    void loadQuarterData();
  }, []);

  const quarterLabel = useMemo(() => {
    const now = new Date();
    return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
  }, []);

  if (loading) return <div className="text-praxis-400">{t("quarterly.loading", locale)}</div>;
  if (!data) return <div className="text-praxis-400">{t("quarterly.noData", locale)}</div>;

  const maxBeh = Math.max(...data.behandlungSplit.map((entry) => entry.patients), 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight text-praxis-800">
          {t("quarterly.title", locale)}
        </h1>
        <p className="mt-1 text-sm text-praxis-400">
          {quarterLabel} · {locale === "de"
            ? "Patientenstruktur plus sofortiger Umsatzblick für Dr. Schubert"
            : "Patient structure plus instant quarter revenue view"}
        </p>
      </div>

      {finance && (
        <>
          <div className="stat-card">
            <h3 className="mb-4 text-[28px] font-extrabold tracking-tight text-praxis-700">
              {locale === "de" ? "Umsatz dieses Quartals" : "Quarter revenue"}
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KPI
                title={locale === "de" ? "Bereits bezahlt" : "Already paid"}
                value={euro(finance.bezahlt_gesamt)}
                sub={locale === "de" ? "Real eingegangen" : "Actually received"}
                accent="green"
              />
              <KPI
                title={locale === "de" ? "Davon Privat" : "Private"}
                value={euro(finance.bezahlt_privat)}
                sub={locale === "de" ? "GOZ / Privatpatienten" : "Private patients"}
                accent="blue"
              />
              <KPI
                title={locale === "de" ? "Davon Kasse" : "Statutory"}
                value={euro(finance.bezahlt_gesetzlich)}
                sub={locale === "de" ? "BEMA / Kassenpatienten" : "Statutory patients"}
                accent="green"
              />
              <KPI
                title={locale === "de" ? "Im Quartal fällig" : "Due this quarter"}
                value={euro(finance.faellig_gesamt)}
                sub={locale === "de" ? "Sollstellung gesamt" : "Total due volume"}
                accent="default"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="stat-card">
              <h3 className="mb-3 text-[22px] font-extrabold tracking-tight text-praxis-700">
                {locale === "de" ? "Offen im Quartal" : "Open in quarter"}
              </h3>
              <p className="text-4xl font-semibold text-[#c8942d]">
                {euro(finance.offen_gesamt)}
              </p>
              <p className="mt-2 text-sm text-praxis-500">
                {locale === "de"
                  ? `Privat: ${euro(finance.offen_privat)} · Kasse: ${euro(finance.offen_gesetzlich)}`
                  : `Private: ${euro(finance.offen_privat)} · Statutory: ${euro(finance.offen_gesetzlich)}`}
              </p>
            </div>

            <div className="stat-card">
              <h3 className="mb-3 text-[22px] font-extrabold tracking-tight text-praxis-700">
                {locale === "de" ? "Teilbezahlt im Quartal" : "Partially paid"}
              </h3>
              <p className="text-4xl font-semibold text-[#b96a2d]">
                {euro(finance.teilbezahlt_gesamt)}
              </p>
              <p className="mt-2 text-sm text-praxis-500">
                {locale === "de"
                  ? `Privat: ${euro(finance.teilbezahlt_privat)} · Kasse: ${euro(finance.teilbezahlt_gesetzlich)}`
                  : `Private: ${euro(finance.teilbezahlt_privat)} · Statutory: ${euro(finance.teilbezahlt_gesetzlich)}`}
              </p>
            </div>

            <div className="stat-card">
              <h3 className="mb-3 text-[22px] font-extrabold tracking-tight text-praxis-700">
                {locale === "de" ? "Fälligkeits-Split" : "Due split"}
              </h3>
              <p className="text-base font-semibold text-praxis-700">
                {locale === "de" ? "Privat" : "Private"}: {euro(finance.faellig_privat)}
              </p>
              <p className="mt-2 text-base font-semibold text-praxis-700">
                {locale === "de" ? "Kasse" : "Statutory"}: {euro(finance.faellig_gesetzlich)}
              </p>
              <p className="mt-3 text-sm text-praxis-500">
                {locale === "de"
                  ? "Damit sieht man sofort, welcher Quartalsanteil aus Privat- vs. Kassenfällen kommt."
                  : "Instant view of how much quarter volume comes from private vs statutory patients."}
              </p>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI title={t("quarterly.totalPatients", locale)} value={String(data.totalPatienten)} />
        <KPI
          title={t("quarterly.children", locale)}
          value={String(data.kinderCount)}
          sub={`${data.erwachseneCount} ${t("quarterly.adultsSuffix", locale)}`}
        />
        <KPI
          title={t("quarterly.emailReach", locale)}
          value={`${Math.round((data.mitEmail / data.totalPatienten) * 100)}%`}
          sub={`${data.mitEmail} ${t("quarterly.outOf", locale)} ${data.totalPatienten}`}
          accent={data.mitEmail / data.totalPatienten > 0.5 ? "green" : "red"}
        />
        <KPI
          title={t("quarterly.phoneReach", locale)}
          value={`${Math.round((data.mitTelefon / data.totalPatienten) * 100)}%`}
          sub={t("quarterly.landlineMobile", locale, {
            l: data.mitTelefon,
            m: data.mitMobil,
          })}
          accent={data.mitTelefon / data.totalPatienten > 0.5 ? "green" : "red"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="stat-card">
          <h3 className="mb-4 text-[28px] font-extrabold tracking-tight text-praxis-700">
            {t("quarterly.insuranceDist", locale)}
          </h3>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="h-[220px] w-full md:w-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.versicherungSplit}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    strokeWidth={0}
                  >
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
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    {tData(slice.name, locale)}: {slice.value} ({pct}%)
                  </p>
                );
              })}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="mb-4 text-[28px] font-extrabold tracking-tight text-praxis-700">
            {t("quarterly.treatmentStatus", locale)}
          </h3>
          <div className="space-y-4">
            {data.behandlungSplit.map((row) => {
              const width = Math.max(10, Math.round((row.patients / maxBeh) * 100));
              return (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-sm text-praxis-700">
                    <span>{tData(row.label, locale)}</span>
                    <span className="font-semibold">{row.patients}</span>
                  </div>
                  <div className="h-3 rounded-full bg-[#e9e8ff]">
                    <div
                      className="h-3 rounded-full bg-[#4b42d6]"
                      style={{ width: `${width}%` }}
                    />
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
