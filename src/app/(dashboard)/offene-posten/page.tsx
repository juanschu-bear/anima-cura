"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, StatusBadge, CardSkeleton } from "@/components/ui";
import { Receipt } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

interface OffenerPosten {
  id: string;
  typ: string | null;
  rechnung_datum: string | null;
  patient_name: string | null;
  rechnung_nr: string | null;
  unser_zeichen: string | null;
  basis_nr: string | null;
  betrag: number | null;
  gebuehr: number | null;
  offen: number | null;
  gezahlt: number | null;
  mahnung_datum: string | null;
  status: string;
  bezahlt_am: string | null;
  patient_id: string | null;
}

const OPEN_LIKE = new Set(["offen", "teilbezahlt"]);

export default function OffenePostenPage() {
  const router = useRouter();
  const { locale, theme } = useAppStore();

  const [posten, setPosten] = useState<OffenerPosten[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErrorMsg("");
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("offene_posten")
        .select(
          "id, typ, rechnung_datum, patient_name, rechnung_nr, unser_zeichen, basis_nr, betrag, gebuehr, offen, gezahlt, mahnung_datum, status, bezahlt_am, patient_id"
        )
        .order("rechnung_datum", { ascending: false });
      if (!active) return;
      if (error) {
        setErrorMsg(error.message || t("openItems.error", locale));
        setPosten([]);
      } else {
        setPosten((data ?? []) as OffenerPosten[]);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [locale]);

  const metrics = useMemo(() => {
    const openTotal = posten
      .filter((p) => OPEN_LIKE.has(p.status))
      .reduce((sum, p) => sum + Number(p.offen || 0), 0);
    const openCount = posten.filter((p) => p.status === "offen").length;
    const partialCount = posten.filter((p) => p.status === "teilbezahlt").length;
    const paidCount = posten.filter((p) => p.status === "bezahlt").length;
    return { openTotal, openCount, partialCount, paidCount };
  }, [posten]);

  const filters = [
    { key: "alle", label: t("openItems.filter.all", locale) },
    { key: "offen", label: t("openItems.filter.open", locale) },
    { key: "teilbezahlt", label: t("openItems.filter.partial", locale) },
    { key: "bezahlt", label: t("openItems.filter.paid", locale) },
    { key: "erloesminderung", label: t("openItems.filter.writeoff", locale) },
  ];

  const visiblePosten = useMemo(() => {
    if (statusFilter === "alle") return posten;
    return posten.filter((p) => p.status === statusFilter);
  }, [posten, statusFilter]);

  const numberLocale = locale === "en" ? "en-GB" : "de-DE";
  const fmtEur = (v: number | null) => `${Number(v || 0).toLocaleString(numberLocale)}€`;
  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString(numberLocale) : "—");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ac-page-title">{t("openItems.title", locale)}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--ac-text-mute)" }}>
            {t("openItems.subtitle", locale)}
          </p>
        </div>
      </div>

      {errorMsg && (
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
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("openItems.kpi.openTotal", locale)} value={fmtEur(metrics.openTotal)} amber theme={theme} />
        <MetricCard label={t("openItems.kpi.openCount", locale)} value={String(metrics.openCount)} theme={theme} />
        <MetricCard label={t("openItems.kpi.partial", locale)} value={String(metrics.partialCount)} theme={theme} />
        <MetricCard label={t("openItems.kpi.paid", locale)} value={String(metrics.paidCount)} green theme={theme} />
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`ac-chip ${statusFilter === f.key ? "ac-chip-active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : visiblePosten.length === 0 ? (
        <div
          className="rounded-[16px] border"
          style={{
            borderColor: "var(--ac-border)",
            background: "var(--ac-surface)",
            boxShadow: "var(--ac-shadow-soft)",
          }}
        >
          <EmptyState
            icon={<Receipt size={20} />}
            title={t("openItems.empty.title", locale)}
            description={t("openItems.empty.desc", locale)}
          />
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-[16px] border"
          style={{
            borderColor: "var(--ac-border)",
            background: "var(--ac-surface)",
            boxShadow: "var(--ac-shadow-soft)",
          }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--ac-surface-muted)" }}>
                <th className="table-header">{t("openItems.col.date", locale)}</th>
                <th className="table-header">{t("openItems.col.reference", locale)}</th>
                <th className="table-header">{t("openItems.col.patient", locale)}</th>
                <th className="table-header">{t("openItems.col.type", locale)}</th>
                <th className="table-header text-right">{t("openItems.col.amount", locale)}</th>
                <th className="table-header text-right">{t("openItems.col.paid", locale)}</th>
                <th className="table-header text-right">{t("openItems.col.open", locale)}</th>
                <th className="table-header">{t("openItems.col.status", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {visiblePosten.map((p) => (
                <tr
                  key={p.id}
                  className={`transition-colors ${p.patient_id ? "cursor-pointer" : ""}`}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme === "dark" ? "#151c2a" : "#f8faff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                  onClick={() => p.patient_id && router.push(`/patienten/${p.patient_id}`)}
                >
                  <td className="table-cell py-3 text-sm" style={{ color: "var(--ac-text)" }}>{fmtDate(p.rechnung_datum)}</td>
                  <td className="table-cell py-3 text-sm font-mono" style={{ color: "var(--ac-text-soft)" }}>{p.unser_zeichen || "—"}</td>
                  <td className="table-cell py-3 text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
                    {p.patient_id && p.patient_name ? (
                      <button
                        type="button"
                        className="font-semibold hover:text-[#392fb8]"
                        style={{ color: theme === "dark" ? "#b8b4ff" : "#4b42d6" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/patienten/${p.patient_id}`);
                        }}
                      >
                        {p.patient_name}
                      </button>
                    ) : (
                      p.patient_name || "—"
                    )}
                  </td>
                  <td className="table-cell py-3 text-xs font-semibold uppercase" style={{ color: "var(--ac-text-soft)" }}>{p.typ || "—"}</td>
                  <td className="table-cell py-3 text-right text-sm" style={{ color: "var(--ac-text)" }}>{fmtEur(p.betrag)}</td>
                  <td className="table-cell py-3 text-right text-sm" style={{ color: "var(--ac-text-soft)" }}>{fmtEur(p.gezahlt)}</td>
                  <td className="table-cell py-3 text-right text-sm font-semibold" style={{ color: "var(--ac-text)" }}>{fmtEur(p.offen)}</td>
                  <td className="table-cell py-3">
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  green,
  amber,
  theme,
}: {
  label: string;
  value: string;
  sub?: string;
  green?: boolean;
  amber?: boolean;
  theme: "light" | "dark";
}) {
  return (
    <div
      className="rounded-[16px] border px-6 py-5"
      style={{
        borderColor: "var(--ac-border)",
        background: "var(--ac-surface)",
        boxShadow: "var(--ac-shadow-soft)",
      }}
    >
      <p className="text-[14px] font-semibold" style={{ color: "var(--ac-text-mute)" }}>{label}</p>
      <p className={`mt-2 text-[44px] leading-none tracking-tight font-bold ${green ? "text-[#5f9339]" : amber ? "text-[#c8942d]" : ""}`} style={!green && !amber ? { color: theme === "dark" ? "#eef2fb" : "#1f2f43" } : undefined}>{value}</p>
      {sub ? <p className="mt-2 text-sm" style={{ color: "var(--ac-text-soft)" }}>{sub}</p> : null}
    </div>
  );
}
