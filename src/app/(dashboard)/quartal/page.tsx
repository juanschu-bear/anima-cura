"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

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
  const [finance, setFinance] = useState<QuartalFinance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadQuarterData() {
      const today = new Date();
      const quarterIndex = Math.floor(today.getMonth() / 3);
      const quarterStart = new Date(today.getFullYear(), quarterIndex * 3, 1);

      const reportingRes = await fetch(
        `/api/reporting?von=${quarterStart.toISOString().slice(0, 10)}&bis=${today
          .toISOString()
          .slice(0, 10)}`
      );

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
  if (!finance) return <div className="text-praxis-400">{t("quarterly.noData", locale)}</div>;

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
            title={locale === "de" ? "Im Quartal noch unklar" : "Still unclear"}
            value={euro(finance.eingang_unklar)}
            sub={locale === "de" ? "Eingänge dieses Quartals ohne saubere Zuordnung" : "Quarter inflows not fully assigned yet"}
            accent="amber"
          />
        </div>
      </div>

      <div className="rounded-[18px] border border-[#d9d4c7] bg-[#fbf8f1] px-5 py-5 text-praxis-700 shadow-sm">
        <h3 className="text-[20px] font-extrabold tracking-tight">
          {locale === "de" ? 'Was diese Seite zeigt' : "What this page shows"}
        </h3>
        <p className="mt-2 text-sm text-praxis-600">
          {locale === "de"
            ? "Nur Zahlen zum aktuellen Quartal: eingegangene Zahlungen und deren Zuordnung. Patientenstruktur, Erreichbarkeit und historische Bestände werden bewusst nicht mehr hier angezeigt."
            : "Only current-quarter payment metrics are shown here."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/berichte" className="ac-chip ac-chip-active">
            {locale === "de" ? "Zu Berichte" : "To reports"}
          </Link>
          <Link href="/offene-posten" className="ac-chip">
            {locale === "de" ? "Zu Offene Posten" : "To open receivables"}
          </Link>
        </div>
      </div>
    </div>
  );
}
