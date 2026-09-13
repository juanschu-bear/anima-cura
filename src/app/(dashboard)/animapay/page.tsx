"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CreditCard,
  FileText,
  QrCode,
  Receipt,
} from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { Badge, CardSkeleton, EmptyState, StatusBadge } from "@/components/ui";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

interface KassenEintrag {
  id: string;
  betrag: number | null;
  zahlart: string | null;
  abgleich_status: string | null;
  kassen_datum: string | null;
  created_at: string;
  patients?: { vorname?: string | null; nachname?: string | null } | null;
}

interface Zahlungseintrag {
  id: string;
  datum: string | null;
  betrag: number | null;
  absender_name: string | null;
  matching_status: string | null;
  patients?: { vorname?: string | null; nachname?: string | null } | null;
}

interface OffenerPosten {
  id: string;
  offen: number | null;
  status: string | null;
}

interface CockpitState {
  kasseHeuteSumme: number;
  kasseHeuteAnzahl: number;
  qrOffenAnzahl: number;
  qrOffenSumme: number;
  offenePostenAnzahl: number;
  offenePostenSumme: number;
  bestaetigtMonatAnzahl: number;
  bestaetigtMonatSumme: number;
}

const EMPTY_STATE: CockpitState = {
  kasseHeuteSumme: 0,
  kasseHeuteAnzahl: 0,
  qrOffenAnzahl: 0,
  qrOffenSumme: 0,
  offenePostenAnzahl: 0,
  offenePostenSumme: 0,
  bestaetigtMonatAnzahl: 0,
  bestaetigtMonatSumme: 0,
};

export default function AnimaPayPage() {
  const { locale, theme } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [cockpit, setCockpit] = useState<CockpitState>(EMPTY_STATE);
  const [kassenliste, setKassenliste] = useState<KassenEintrag[]>([]);
  const [zahlungen, setZahlungen] = useState<Zahlungseintrag[]>([]);
  const numberLocale = locale === "en" ? "en-GB" : "de-DE";

  useEffect(() => {
    let active = true;
    const supabase = createBrowserClient();
    const heute = new Date().toISOString().slice(0, 10);
    const monatStart = new Date();
    monatStart.setDate(1);
    const monthFrom = monatStart.toISOString().slice(0, 10);

    (async () => {
      setLoading(true);
      setErrorMsg("");

      const [
        kasseHeuteRes,
        qrOffenRes,
        offenePostenRes,
        bestaetigtRes,
        kassenlisteRes,
        zahlungenRes,
      ] = await Promise.all([
        supabase
          .from("kassen_zahlungen")
          .select("id, betrag", { count: "exact" })
          .eq("kassen_datum", heute),
        supabase
          .from("kassen_zahlungen")
          .select("id, betrag", { count: "exact" })
          .eq("zahlart", "qr_ueberweisung")
          .is("transaktion_id", null),
        supabase
          .from("offene_posten")
          .select("id, offen, status"),
        supabase
          .from("transaktionen")
          .select("id, betrag", { count: "exact" })
          .in("matching_status", ["auto", "manuell"])
          .gte("datum", monthFrom),
        supabase
          .from("kassen_zahlungen")
          .select("id, betrag, zahlart, abgleich_status, kassen_datum, created_at, patients:patient_id(vorname, nachname)")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("transaktionen")
          .select("id, datum, betrag, absender_name, matching_status, patients:matched_patient_id(vorname, nachname)")
          .in("matching_status", ["auto", "manuell", "abweichung"])
          .order("datum", { ascending: false })
          .limit(6),
      ]);

      if (!active) return;

      const hasRelevantError = [
        kasseHeuteRes.error,
        qrOffenRes.error,
        offenePostenRes.error,
        bestaetigtRes.error,
        kassenlisteRes.error,
        zahlungenRes.error,
      ].find(Boolean);

      if (hasRelevantError) {
        setErrorMsg(hasRelevantError.message || t("animapay.loadError", locale));
      }

      const offenePostenRows = (offenePostenRes.data ?? []) as OffenerPosten[];
      const offeneRows = offenePostenRows.filter(
        (row) => row.status === "offen" || row.status === "teilbezahlt"
      );

      setCockpit({
        kasseHeuteSumme: (kasseHeuteRes.data ?? []).reduce(
          (sum, row) => sum + Number(row.betrag || 0),
          0
        ),
        kasseHeuteAnzahl: kasseHeuteRes.count ?? 0,
        qrOffenAnzahl: qrOffenRes.count ?? 0,
        qrOffenSumme: (qrOffenRes.data ?? []).reduce(
          (sum, row) => sum + Number(row.betrag || 0),
          0
        ),
        offenePostenAnzahl: offeneRows.length,
        offenePostenSumme: offeneRows.reduce(
          (sum, row) => sum + Number(row.offen || 0),
          0
        ),
        bestaetigtMonatAnzahl: bestaetigtRes.count ?? 0,
        bestaetigtMonatSumme: (bestaetigtRes.data ?? []).reduce(
          (sum, row) => sum + Number(row.betrag || 0),
          0
        ),
      });

      setKassenliste((kassenlisteRes.data ?? []) as KassenEintrag[]);
      setZahlungen((zahlungenRes.data ?? []) as Zahlungseintrag[]);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [locale]);

  const quickActions = useMemo(
    () => [
      {
        href: "/kasse",
        icon: QrCode,
        title: t("animapay.action.kasse.title", locale),
        body: t("animapay.action.kasse.body", locale),
      },
      {
        href: "/rechnungen",
        icon: FileText,
        title: t("animapay.action.invoices.title", locale),
        body: t("animapay.action.invoices.body", locale),
      },
      {
        href: "/offene-posten",
        icon: Receipt,
        title: t("animapay.action.openItems.title", locale),
        body: t("animapay.action.openItems.body", locale),
      },
      {
        href: "/zahlungen",
        icon: CreditCard,
        title: t("animapay.action.payments.title", locale),
        body: t("animapay.action.payments.body", locale),
      },
    ],
    [locale]
  );

  const fmtEur = (value: number) =>
    `${value.toLocaleString(numberLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} €`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-500">
            {t("animapay.kicker", locale)}
          </div>
          <h1 className="ac-page-title mt-3">{t("animapay.title", locale)}</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--ac-text-mute)" }}>
            {t("animapay.subtitle", locale)}
          </p>
        </div>
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--ac-border)",
            background: "var(--ac-surface)",
            color: "var(--ac-text-soft)",
          }}
        >
          <span className="font-semibold" style={{ color: "var(--ac-text)" }}>
            {t("animapay.flow.title", locale)}
          </span>{" "}
          {t("animapay.flow.body", locale)}
        </div>
      </div>

      {errorMsg ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--ac-border)",
            background: "var(--ac-surface)",
            color: "var(--ac-text-soft)",
          }}
        >
          {errorMsg}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)
        ) : (
          <>
            <MetricCard
              title={t("animapay.metric.kasseHeute", locale)}
              value={fmtEur(cockpit.kasseHeuteSumme)}
              subtitle={t("animapay.metric.kasseHeuteSub", locale, {
                count: cockpit.kasseHeuteAnzahl,
              })}
              theme={theme}
            />
            <MetricCard
              title={t("animapay.metric.qrOffen", locale)}
              value={String(cockpit.qrOffenAnzahl)}
              subtitle={t("animapay.metric.qrOffenSub", locale, {
                amount: fmtEur(cockpit.qrOffenSumme),
              })}
              theme={theme}
              accent="amber"
            />
            <MetricCard
              title={t("animapay.metric.offenePosten", locale)}
              value={fmtEur(cockpit.offenePostenSumme)}
              subtitle={t("animapay.metric.offenePostenSub", locale, {
                count: cockpit.offenePostenAnzahl,
              })}
              theme={theme}
              accent="rose"
            />
            <MetricCard
              title={t("animapay.metric.bestaetigt", locale)}
              value={fmtEur(cockpit.bestaetigtMonatSumme)}
              subtitle={t("animapay.metric.bestaetigtSub", locale, {
                count: cockpit.bestaetigtMonatAnzahl,
              })}
              theme={theme}
              accent="emerald"
            />
          </>
        )}
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div
          className="rounded-[24px] border p-5"
          style={{
            borderColor: "var(--ac-border)",
            background: "var(--ac-surface)",
            boxShadow: "var(--ac-shadow-soft)",
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="ac-section-title">{t("animapay.actionsTitle", locale)}</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--ac-text-mute)" }}>
                {t("animapay.actionsSubtitle", locale)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {quickActions.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-[18px] border p-4 transition-transform hover:-translate-y-[1px]"
                  style={{
                    borderColor: "var(--ac-border)",
                    background: "var(--ac-surface-muted)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-500">
                      <Icon size={18} />
                    </div>
                    <ArrowRight
                      size={16}
                      className="transition-transform group-hover:translate-x-0.5"
                      style={{ color: "var(--ac-text-mute)" }}
                    />
                  </div>
                  <p className="mt-4 text-base font-semibold" style={{ color: "var(--ac-text)" }}>
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--ac-text-mute)" }}>
                    {item.body}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <div
          className="rounded-[24px] border p-5"
          style={{
            borderColor: "var(--ac-border)",
            background: "var(--ac-surface)",
            boxShadow: "var(--ac-shadow-soft)",
          }}
        >
          <h2 className="ac-section-title">{t("animapay.todayTitle", locale)}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--ac-text-mute)" }}>
            {t("animapay.todaySubtitle", locale)}
          </p>
          <div className="mt-4 space-y-3">
            {kassenliste.length === 0 && !loading ? (
              <EmptyState
                icon={<Banknote size={18} />}
                title={t("animapay.emptyKasseTitle", locale)}
                description={t("animapay.emptyKasseBody", locale)}
              />
            ) : null}
            {kassenliste.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-[18px] border px-4 py-3"
                style={{
                  borderColor: "var(--ac-border)",
                  background: "var(--ac-surface-muted)",
                }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
                    {[entry.patients?.vorname, entry.patients?.nachname].filter(Boolean).join(" ") ||
                      t("animapay.unknownPatient", locale)}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--ac-text-mute)" }}>
                    {entry.zahlart === "qr_ueberweisung"
                      ? t("animapay.methodQr", locale)
                      : entry.zahlart === "girocard"
                      ? t("animapay.methodCard", locale)
                      : entry.zahlart === "kreditkarte"
                      ? t("animapay.methodCreditCard", locale)
                      : entry.zahlart === "bar"
                      ? t("animapay.methodCash", locale)
                      : entry.zahlart === "guthaben"
                      ? t("animapay.methodBalance", locale)
                      : t("animapay.methodUnknown", locale)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
                    {fmtEur(Number(entry.betrag || 0))}
                  </p>
                  <div className="mt-1">
                    {entry.abgleich_status === "eingegangen" ? (
                      <Badge variant="success">{t("animapay.statusMatched", locale)}</Badge>
                    ) : (
                      <Badge variant="warning">{t("animapay.statusWaiting", locale)}</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="rounded-[24px] border p-5"
        style={{
          borderColor: "var(--ac-border)",
          background: "var(--ac-surface)",
          boxShadow: "var(--ac-shadow-soft)",
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="ac-section-title">{t("animapay.recentPaymentsTitle", locale)}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--ac-text-mute)" }}>
              {t("animapay.recentPaymentsSubtitle", locale)}
            </p>
          </div>
          <Link href="/zahlungen" className="btn-secondary">
            {t("animapay.openPayments", locale)}
          </Link>
        </div>

        {zahlungen.length === 0 && !loading ? (
          <EmptyState
            icon={<CreditCard size={18} />}
            title={t("animapay.emptyPaymentsTitle", locale)}
            description={t("animapay.emptyPaymentsBody", locale)}
          />
        ) : (
          <div className="space-y-3">
            {zahlungen.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-3 rounded-[18px] border px-4 py-3 md:flex-row md:items-center md:justify-between"
                style={{
                  borderColor: "var(--ac-border)",
                  background: "var(--ac-surface-muted)",
                }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
                    {[entry.patients?.vorname, entry.patients?.nachname].filter(Boolean).join(" ") ||
                      entry.absender_name ||
                      t("animapay.unknownSender", locale)}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--ac-text-mute)" }}>
                    {entry.datum
                      ? new Date(entry.datum).toLocaleDateString(numberLocale)
                      : t("animapay.noDate", locale)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge
                    status={
                      entry.matching_status === "auto"
                        ? "auto"
                        : entry.matching_status === "manuell"
                        ? "manuell"
                        : "abweichung"
                    }
                  />
                  <p className="text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
                    {fmtEur(Number(entry.betrag || 0))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  theme,
  accent = "blue",
}: {
  title: string;
  value: string;
  subtitle: string;
  theme: "light" | "dark";
  accent?: "blue" | "amber" | "rose" | "emerald";
}) {
  const color =
    accent === "amber"
      ? "#f59e0b"
      : accent === "rose"
      ? "#fb7185"
      : accent === "emerald"
      ? "#10b981"
      : "#5b6cff";

  return (
    <div
      className="rounded-[22px] border p-5"
      style={{
        borderColor: "var(--ac-border)",
        background:
          theme === "dark"
            ? `linear-gradient(180deg, rgba(15,23,36,0.98), color-mix(in srgb, ${color} 8%, rgba(15,23,36,0.98)))`
            : `linear-gradient(180deg, #ffffff, color-mix(in srgb, ${color} 10%, #ffffff))`,
        boxShadow: "var(--ac-shadow-soft)",
      }}
    >
      <p className="text-xs font-medium uppercase tracking-[0.12em]" style={{ color }}>
        {title}
      </p>
      <p className="mt-3 text-[28px] font-bold tracking-tight" style={{ color: "var(--ac-text)" }}>
        {value}
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--ac-text-mute)" }}>
        {subtitle}
      </p>
    </div>
  );
}
