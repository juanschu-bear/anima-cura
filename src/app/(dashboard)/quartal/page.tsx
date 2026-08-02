"use client";

import Link from "next/link";
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

interface PatientRecord {
  geburtsdatum: string | null;
  versicherung_status: string | null;
  kasse: string | null;
  behandlung: string | null;
  behandlung_status: string | null;
  email: string | null;
  telefon: string | null;
  mobiltelefon: string | null;
}

interface QuartalFinance {
  eingang_gesamt: number;
  eingang_privat: number;
  eingang_gesetzlich: number;
  eingang_unklar: number;
  zugeordnet_gesamt: number;
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
  const [activeData, setActiveData] = useState<QuartalData | null>(null);
  const [historyData, setHistoryData] = useState<QuartalData | null>(null);
  const [finance, setFinance] = useState<QuartalFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [patientScope, setPatientScope] = useState<"aktiv" | "historie">("aktiv");

  useEffect(() => {
    async function loadQuarterData() {
      const supabase = createBrowserClient();
      const today = new Date();
      const quarterIndex = Math.floor(today.getMonth() / 3);
      const quarterStart = new Date(today.getFullYear(), quarterIndex * 3, 1);

      const [patientsRes, reportingRes] = await Promise.all([
        supabase
          .from("patients")
          .select(
            "geburtsdatum, versicherung_status, kasse, behandlung, behandlung_status, email, telefon, mobiltelefon"
          )
          .range(0, 9999),
        fetch(
          `/api/reporting?von=${quarterStart.toISOString().slice(0, 10)}&bis=${today
            .toISOString()
            .slice(0, 10)}`
        ),
      ]);

      const patients = patientsRes.data as PatientRecord[] | null;
      if (patients) {
        const activePatients = patients.filter(
          (patient) => (patient.behandlung_status || "").toLowerCase() === "aktiv"
        );

        const buildSummary = (rows: PatientRecord[]) => {
          const versMap: Record<string, number> = {};
          const behMap: Record<string, number> = {};
          let kinder = 0;
          let erwachsene = 0;
          let mitEmail = 0;
          let mitTelefon = 0;
          let mitMobil = 0;
          const now = Date.now();

          for (const patient of rows) {
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

          return {
            totalPatienten: rows.length,
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
          };
        };

        setActiveData(buildSummary(activePatients));
        setHistoryData(buildSummary(patients));
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

  const data = patientScope === "aktiv" ? activeData : historyData;

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
            ? "Quartalsblick und Patientenbasis klar getrennt"
            : "Patient structure plus instant quarter revenue view"}
        </p>
      </div>

      {finance && (
        <>
          <div className="stat-card">
            <h3 className="mb-4 text-[28px] font-extrabold tracking-tight text-praxis-700">
              {locale === "de" ? "Zahlungseingänge dieses Quartals" : "Quarter cash received"}
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KPI
                title={locale === "de" ? "Gesamt eingegangen" : "Received total"}
                value={euro(finance.eingang_gesamt)}
                sub={locale === "de" ? "Alle patientenrelevanten Eingänge bis heute" : "All patient-related inflows to date"}
                accent="green"
              />
              <KPI
                title={locale === "de" ? "Davon Privat" : "Private"}
                value={euro(finance.eingang_privat)}
                sub={locale === "de" ? "GOZ / Privatpatienten" : "Private patients"}
                accent="blue"
              />
              <KPI
                title={locale === "de" ? "Davon Kasse" : "Statutory"}
                value={euro(finance.eingang_gesetzlich)}
                sub={locale === "de" ? "BEMA / Kassenpatienten" : "Statutory patients"}
                accent="green"
              />
              <KPI
                title={locale === "de" ? "Bereits zugeordnet" : "Already assigned"}
                value={euro(finance.zugeordnet_gesamt)}
                sub={locale === "de" ? "Schon einem Patienten zugeordnet" : "Already assigned to a patient"}
                accent="default"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="stat-card">
              <h3 className="mb-3 text-[22px] font-extrabold tracking-tight text-praxis-700">
                {locale === "de" ? "Im Quartal noch unklar" : "Still unclear this quarter"}
              </h3>
              <p className="text-4xl font-semibold text-[#c8942d]">
                {euro(finance.eingang_unklar)}
              </p>
              <p className="mt-2 text-sm text-praxis-500">
                {locale === "de"
                  ? "Nur Zahlungseingänge aus diesem Quartal, die noch nicht sauber klassifiziert sind."
                  : "Only quarter inflows not yet fully classified."}
              </p>
            </div>

            <div className="rounded-[18px] border border-[#d9d4c7] bg-[#fbf8f1] px-5 py-5 text-praxis-700 shadow-sm">
              <h3 className="text-[20px] font-extrabold tracking-tight">
                {locale === "de" ? "Wichtig zur Einordnung" : "Important context"}
              </h3>
              <p className="mt-2 text-sm text-praxis-600">
                {locale === "de"
                  ? "Diese Seite zeigt bewusst nur Quartalszahlen und die Patientenbasis. Gesamtbestände wie offene Forderungen werden hier nicht mehr angezeigt, damit nichts mit dem aktuellen Quartal verwechselt wird."
                  : "This page only shows quarter numbers and patient base."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/offene-posten" className="ac-chip ac-chip-active">
                  {locale === "de" ? "Zu Offene Posten" : "Open receivables"}
                </Link>
                <Link href="/berichte" className="ac-chip">
                  {locale === "de" ? "Zu Berichte" : "Reports"}
                </Link>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="stat-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[24px] font-extrabold tracking-tight text-praxis-700">
              {locale === "de" ? "Patientenbasis" : "Patient base"}
            </h3>
            <p className="mt-1 text-sm text-praxis-500">
              {patientScope === "aktiv"
                ? locale === "de"
                  ? "Nur aktive Behandlungen. Keine Alt-Historie."
                  : "Only active treatments."
                : locale === "de"
                ? "Gesamte Historie aller importierten Patienten."
                : "Entire imported patient history."}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPatientScope("aktiv")}
              className={`ac-chip ${patientScope === "aktiv" ? "ac-chip-active" : ""}`}
            >
              {locale === "de" ? "Aktive Behandlung" : "Active treatment"}
            </button>
            <button
              type="button"
              onClick={() => setPatientScope("historie")}
              className={`ac-chip ${patientScope === "historie" ? "ac-chip-active" : ""}`}
            >
              {locale === "de" ? "Gesamthistorie" : "Full history"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          title={patientScope === "aktiv"
            ? locale === "de" ? "Aktive Patienten" : "Active patients"
            : locale === "de" ? "Patienten gesamt" : "Patients total"}
          value={String(data.totalPatienten)}
          sub={patientScope === "aktiv"
            ? locale === "de" ? "Aktuell laufende Behandlungen" : "Currently active treatments"
            : locale === "de" ? "Historischer Gesamtbestand" : "Historical patient base"}
        />
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
