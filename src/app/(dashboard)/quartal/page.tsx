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

function InfoCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[18px] border border-[#2a3d34] bg-[#151a22] px-5 py-5 shadow-[0_0_0_1px_rgba(61,156,70,0.08)]">
      <h3 className="text-[18px] font-extrabold tracking-tight text-[#f2f4f8]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-praxis-400">{body}</p>
    </div>
  );
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
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

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
        setLoadedAt(new Date());
      }

      setLoading(false);
    }

    void loadQuarterData();
  }, []);

  const quarterLabel = useMemo(() => {
    const now = new Date();
    return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
  }, []);

  const assignmentRate = useMemo(() => {
    if (!finance || finance.eingang_gesamt <= 0) return 0;
    return Math.round((finance.zugeordnet_gesamt / finance.eingang_gesamt) * 100);
  }, [finance]);

  const privateNeutral = (finance?.eingang_privat || 0) === 0;
  const statutoryNeutral = (finance?.eingang_gesetzlich || 0) === 0;

  const standLabel = useMemo(() => {
    if (!loadedAt) return null;
    return loadedAt.toLocaleString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [loadedAt]);

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
            ? "Nur quartalsrelevante Zahlungseingänge und deren Zuordnung"
            : "Only quarter payment metrics and assignment"}
        </p>
        {standLabel ? (
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-praxis-500">
            {locale === "de" ? `Stand: ${standLabel}` : `Updated: ${standLabel}`}
          </p>
        ) : null}
      </div>

      <div className="rounded-[24px] border border-[#2a3d34] bg-[radial-gradient(circle_at_top,rgba(61,156,70,0.18),rgba(17,20,28,0.96)_42%)] p-6 shadow-[0_0_30px_rgba(61,156,70,0.12)]">
        <h3 className="mb-4 text-[28px] font-extrabold tracking-tight text-praxis-700">
          {locale === "de" ? "Zahlungseingänge dieses Quartals" : "Quarter cash received"}
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <KPI
            title={locale === "de" ? "Gesamt eingegangen" : "Received total"}
            value={euro(finance.eingang_gesamt)}
            sub={locale === "de" ? "Alle patientenrelevanten Eingänge bis heute" : "All patient-related inflows to date"}
            accent="green"
          />
          <KPI
            title={locale === "de" ? "Davon Privat" : "Private"}
            value={euro(finance.eingang_privat)}
            sub={privateNeutral
              ? locale === "de" ? "Noch keine saubere Zuordnung zu Privat" : "No clean private assignment yet"
              : locale === "de" ? "GOZ / Privatpatienten" : "Private patients"}
            accent={privateNeutral ? "default" : "blue"}
          />
          <KPI
            title={locale === "de" ? "Davon Kasse" : "Statutory"}
            value={euro(finance.eingang_gesetzlich)}
            sub={statutoryNeutral
              ? locale === "de" ? "Noch keine saubere Zuordnung zu Kasse" : "No clean statutory assignment yet"
              : locale === "de" ? "BEMA / Kassenpatienten" : "Statutory patients"}
            accent={statutoryNeutral ? "default" : "green"}
          />
          <KPI
            title={locale === "de" ? "Im Quartal noch unklar" : "Still unclear"}
            value={euro(finance.eingang_unklar)}
            sub={locale === "de" ? "Eingänge dieses Quartals ohne saubere Zuordnung" : "Quarter inflows not fully assigned yet"}
            accent="amber"
          />
          <KPI
            title={locale === "de" ? "Zuordnungsquote" : "Assignment rate"}
            value={`${assignmentRate}%`}
            sub={locale === "de" ? "Anteil bereits klassifizierter Quartals-Eingänge" : "Share of classified quarter inflows"}
            accent={assignmentRate >= 80 ? "green" : assignmentRate >= 40 ? "amber" : "red"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <InfoCard
          title={locale === "de" ? "Was diese Seite zeigt" : "What this page shows"}
          body={locale === "de"
            ? "Hier stehen ausschließlich Quartalszahlen zu eingegangenen Zahlungen. Historische Patientenstruktur, Erreichbarkeit und Gesamtbestände werden absichtlich ausgeblendet, damit der Quartalsbericht sofort verständlich bleibt."
            : "Only quarter payment metrics are shown here."}
        />
        <div className="rounded-[18px] border border-[#232b39] bg-[#151a22] px-5 py-5 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
          <h3 className="text-[18px] font-extrabold tracking-tight text-[#f2f4f8]">
            {locale === "de" ? "Wenn mehr Details gebraucht werden" : "Need more detail?"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-praxis-400">
            {locale === "de"
              ? "Für offene Forderungen gehe zu Offene Posten. Für historische Entwicklungen und tieferes Reporting gehe zu Berichte."
              : "Use reports and open receivables for deeper detail."}
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
    </div>
  );
}
