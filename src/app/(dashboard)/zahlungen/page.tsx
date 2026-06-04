"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePatienten, useTransaktionen, useTransaktionenStats } from "@/hooks/useData";
import { EmptyState, Modal, StatusBadge } from "@/components/ui";
import { ArrowRight, Check, CreditCard, Search, X } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

export default function ZahlungenPage() {
  const router = useRouter();
  const { locale, theme } = useAppStore();

  const [statusFilter, setStatusFilter] = useState("alle");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const { transaktionen, totalCount, refetch } = useTransaktionen({ status: statusFilter, page, pageSize });
  const { stats, refetch: refetchStats } = useTransaktionenStats();
  const [matchModal, setMatchModal] = useState<any>(null);
  const [patSearch, setPatSearch] = useState("");
  const { patienten } = usePatienten(patSearch);
  const [syncing, setSyncing] = useState(false);
  const [syncHint, setSyncHint] = useState("");
  const [statusHelpFor, setStatusHelpFor] = useState<string | null>(null);
  const [statusHelpPos, setStatusHelpPos] = useState<{ left: number; top: number } | null>(null);
  const [clientTx, setClientTx] = useState<any[]>([]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("status");
    if (status) setStatusFilter(status);
  }, []);

  useEffect(() => {
    setClientTx(transaktionen);
  }, [transaktionen]);

  useEffect(() => {
    const pages = Math.max(1, Math.ceil(totalCount / pageSize));
    if (page > pages) setPage(pages);
  }, [totalCount, page, pageSize]);

  const metrics = useMemo(() => {
    const confirmed = stats.auto + stats.manuell;
    return {
      total: stats.total,
      confirmed,
      vorschlag: stats.vorschlag,
      unklar: stats.unklar,
      incomingToday: stats.incomingToday,
      oldestDate: stats.oldestDate,
      confirmedRate: stats.total > 0 ? Math.round((confirmed / stats.total) * 100) : 0,
    };
  }, [stats]);

  async function handleManualMatch(txId: string, patientId: string) {
    const selectedPatient = patienten.find((p) => p.id === patientId);
    const supabase = createBrowserClient();
    const { error } = await supabase
      .from("transaktionen")
      .update({ matching_status: "manuell", matched_patient_id: patientId, matching_score: 100 })
      .eq("id", txId);
    if (error) {
      setSyncHint(t("payments.manualMatchedLocal", locale));
    } else {
      setSyncHint(t("payments.manualMatched", locale));
    }
    setClientTx((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? {
              ...tx,
              matching_status: "manuell",
              matched_patient_id: patientId,
              matching_score: 100,
              patients: selectedPatient
                ? { vorname: selectedPatient.vorname, nachname: selectedPatient.nachname }
                : tx.patients,
            }
          : tx
      )
    );
    setMatchModal(null);
    refetch();
    refetchStats();
  }

  async function handleIgnore(txId: string) {
    const supabase = createBrowserClient();
    const { error } = await supabase.from("transaktionen").update({ matching_status: "ignoriert" }).eq("id", txId);
    if (error) {
      setSyncHint(t("payments.ignoredMarkedLocal", locale));
    } else {
      setSyncHint(t("payments.ignoredMarked", locale));
    }
    setClientTx((prev) => prev.map((tx) => (tx.id === txId ? { ...tx, matching_status: "ignoriert" } : tx)));
    refetch();
    refetchStats();
  }

  async function handleConfirmSuggestion(tx: any) {
    if (!tx?.matched_patient_id) return;
    const supabase = createBrowserClient();
    const { error } = await supabase
      .from("transaktionen")
      .update({ matching_status: "auto", matching_score: Math.max(Number(tx.matching_score || 0), 90) })
      .eq("id", tx.id);
    if (error) {
      setSyncHint(t("payments.suggestionConfirmedLocal", locale));
    } else {
      setSyncHint(t("payments.suggestionConfirmed", locale));
    }
    setClientTx((prev) =>
      prev.map((row) =>
        row.id === tx.id
          ? {
              ...row,
              matching_status: "auto",
              matching_score: Math.max(Number(row.matching_score || 0), 90),
            }
          : row
      )
    );
    refetch();
    refetchStats();
  }

  // Dialog mit vorbefuellter Suche: Nachname aus dem Absender raten.
  function openAssignModal(tx: any) {
    const name = String(tx?.absender_name || "").trim();
    const guess = name.includes(",") ? name.split(",")[0] : name.split(/\s+/)[0] || "";
    setPatSearch(guess.trim());
    setMatchModal(tx);
  }

  function openStatusHelp(id: string, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const width = 340;
    const margin = 12;
    const left = Math.min(rect.left, window.innerWidth - width - margin);
    setStatusHelpPos({ left: Math.max(margin, left), top: rect.bottom + 8 });
    setStatusHelpFor(id);
  }

  async function handleBankSync() {
    setSyncing(true);
    setSyncHint("");
    try {
      const res = await fetch("/api/finapi/transactions", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setSyncHint(t("payments.syncFailed", locale));
      } else {
        const imported = payload.bankSync?.newTransactions ?? 0;
        const auto = payload.matching?.auto ?? 0;
        setSyncHint(t("payments.syncImported", locale, { imported, auto }));
      }
      refetch();
      refetchStats();
    } catch {
      setSyncHint(t("payments.syncFailed", locale));
    } finally {
      setSyncing(false);
    }
  }

  const filters = [
    { key: "alle", label: t("payments.filter.all", locale) },
    { key: "auto", label: t("payments.filter.auto", locale) },
    { key: "abweichung", label: t("payments.filter.deviation", locale) },
    { key: "manuell", label: t("payments.filter.manual", locale) },
    { key: "unklar", label: t("payments.filter.unclear", locale) },
    { key: "ignoriert", label: t("payments.filter.ignored", locale) },
  ];
  const visibleTransactions = clientTx.filter((tx) => (statusFilter === "alle" ? true : tx.matching_status === statusFilter));

  function getExpectedAmount(tx: any) {
    const matchedPatient = patienten.find((p) => p.id === tx.matched_patient_id);
    if (!matchedPatient) return null;
    const monthlyRate =
      (matchedPatient.raten || []).find((r: any) => typeof r?.betrag === "number")?.betrag ?? null;
    return typeof monthlyRate === "number" ? monthlyRate : null;
  }

  // Klartext: worueber wurde diese Zahlung gefunden?
  function reasonText(tx: any) {
    const details = tx.matching_details || {};
    const methode = details.methode || "";
    const score = Number(tx.matching_score || 0);
    if (methode === "kategorie") {
      const kat = details.kategorie || "";
      if (kat === "kzv") return t("payments.reason.kzv", locale);
      if (kat === "umbuchung") return t("payments.reason.umbuchung", locale);
      return t("payments.reason.kartenterminal", locale);
    }
    if (methode === "referenz" || score >= 95) return t("payments.reason.referenz", locale);
    if (methode === "iban" || score === 90) return t("payments.reason.iban", locale);
    if (score === 75) return t("payments.reason.nameParts", locale);
    if (score === 70) return t("payments.reason.siblingRate", locale);
    if (score === 65) return t("payments.reason.typo", locale);
    if (methode === "name" || score === 80) return t("payments.reason.name", locale);
    return null;
  }

  function amountHint(tx: any) {
    const expected = getExpectedAmount(tx);
    if (expected === null) return null;
    if (Math.abs(Number(tx.betrag || 0) - expected) > 0.005) return null;
    const dl = locale === "en" ? "en-GB" : "de-DE";
    return t("payments.reason.amountMatches", locale, { expected: expected.toLocaleString(dl) });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ac-page-title">{t("payments.title", locale)}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--ac-text-mute)" }}>
            {metrics.total.toLocaleString(locale === "en" ? "en-GB" : "de-DE")} {t("payments.transactions", locale)}
            {metrics.oldestDate
              ? ` · ${t("payments.range", locale, { from: new Date(metrics.oldestDate).toLocaleDateString(locale === "en" ? "en-GB" : "de-DE") })}`
              : ""}
          </p>
        </div>
        <button className="btn-primary" disabled={syncing} onClick={handleBankSync}>
          {syncing ? t("payments.syncing", locale) : t("payments.bankSync", locale)}
        </button>
      </div>

      {syncHint && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--ac-border)",
            background: "var(--ac-surface)",
            color: "var(--ac-text-soft)",
          }}
        >
          {syncHint}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("payments.incomingToday", locale)} value={`${metrics.incomingToday.toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€`} green theme={theme} />
        <MetricCard label={t("payments.autoAssigned", locale)} value={metrics.confirmed.toLocaleString(locale === "en" ? "en-GB" : "de-DE")} sub={`${metrics.confirmedRate}% ${t("payments.matchRate", locale)}`} theme={theme} />
        <MetricCard label={t("payments.needsReview", locale)} value={metrics.vorschlag.toLocaleString(locale === "en" ? "en-GB" : "de-DE")} amber theme={theme} />
        <MetricCard label={t("payments.unclearCard", locale)} value={metrics.unklar.toLocaleString(locale === "en" ? "en-GB" : "de-DE")} sub={t("payments.allTime", locale)} theme={theme} />
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => { setStatusFilter(f.key); setPage(1); }}
            className={`ac-chip ${statusFilter === f.key ? "ac-chip-active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        className="rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: "var(--ac-border)",
          background: "var(--ac-surface)",
          color: "var(--ac-text-soft)",
        }}
      >
        <p className="mb-1 font-semibold" style={{ color: "var(--ac-text)" }}>{t("payments.statusExplained", locale)}</p>
        <p>
          <span className="font-semibold">{t("payments.status.automatic", locale)}:</span> {t("payments.status.automaticDesc", locale)}
          {" · "}
          <span className="font-semibold">{t("payments.status.deviation", locale)}:</span> {t("payments.status.deviationDesc", locale)}
          {" · "}
          <span className="font-semibold">{t("payments.filter.manual", locale)}:</span> {t("payments.status.manualDesc", locale)}
          {" · "}
          <span className="font-semibold">{t("payments.status.unclear", locale)}:</span> {t("payments.status.unclearDesc", locale)}
          {" · "}
          <span className="font-semibold">{t("payments.filter.ignored", locale)}:</span> {t("payments.status.ignoredDesc", locale)}
        </p>
      </div>
      <div
        className="rounded-lg border px-4 py-3 text-xs"
        style={{
          borderColor: "var(--ac-border)",
          background: "var(--ac-surface)",
          color: "var(--ac-text-mute)",
        }}
      >
        <span className="font-semibold" style={{ color: "var(--ac-text)" }}>{t("payments.actions", locale)}</span>{" "}
        {t("payments.actionsDesc", locale)}
      </div>

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
              <th className="table-header">{t("payments.date", locale)}</th>
              <th className="table-header">{t("payments.sender", locale)}</th>
              <th className="table-header text-right">{t("payments.amount", locale)}</th>
              <th className="table-header">{t("payments.purpose", locale)}</th>
              <th className="table-header">{t("payments.status", locale)}</th>
              <th className="table-header">{t("payments.assignment", locale)}</th>
              <th className="table-header">{t("payments.actionsHeader", locale)}</th>
            </tr>
          </thead>
          <tbody>
            {visibleTransactions.map((tx) => (
              <tr
                key={tx.id}
                className={`transition-colors ${tx.matched_patient_id ? "cursor-pointer" : ""}`}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme === "dark" ? "#151c2a" : "#f8faff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                onClick={() => tx.matched_patient_id && router.push(`/patienten/${tx.matched_patient_id}`)}
              >
                <td className="table-cell py-3 text-sm" style={{ color: "var(--ac-text)" }}>{new Date(tx.datum).toLocaleDateString(locale === "en" ? "en-GB" : "de-DE")}</td>
                <td className="table-cell py-3 text-sm font-semibold" style={{ color: "var(--ac-text)" }}>{tx.absender_name}</td>
                <td className="table-cell py-3 text-right text-sm font-semibold text-[#4ca43f]">+{Number(tx.betrag || 0).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€</td>
                <td className="table-cell py-3 text-sm" style={{ color: "var(--ac-text-soft)" }}>{tx.verwendungszweck || "—"}</td>
                <td className="table-cell py-3">
                  <div className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      className="cursor-help"
                      onMouseEnter={(e) => openStatusHelp(tx.id, e.currentTarget)}
                      onFocus={(e) => openStatusHelp(tx.id, e.currentTarget)}
                      onMouseLeave={() => setStatusHelpFor((curr) => (curr === tx.id ? null : curr))}
                      onBlur={() => setStatusHelpFor((curr) => (curr === tx.id ? null : curr))}
                    >
                      <StatusBadge status={tx.matching_status} />
                    </button>
                    {tx.matching_status === "abweichung" && reasonText(tx) && (
                      <span className="text-[11px] font-semibold" style={{ color: theme === "dark" ? "#f0bf7e" : "#a16b15" }}>
                        {reasonText(tx)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="table-cell py-3 text-sm" style={{ color: "var(--ac-text-soft)" }}>
                  {tx.patients && tx.matched_patient_id ? (
                    <button
                      type="button"
                      className="font-medium hover:text-[#392fb8]"
                      style={{ color: theme === "dark" ? "#b8b4ff" : "#4b42d6" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/patienten/${tx.matched_patient_id}`);
                      }}
                    >
                      {tx.patients.nachname}, {tx.patients.vorname}
                    </button>
                  ) : "—"}
                </td>
                <td className="table-cell py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openAssignModal(tx);
                        setSyncHint(t("payments.selectPatient", locale));
                      }}
                      type="button"
                      className="rounded-lg p-1.5 text-accent-blue transition-colors hover:bg-accent-blue/10"
                      title={t("payments.manualAssign", locale)}
                    >
                      <ArrowRight size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIgnore(tx.id);
                      }}
                      type="button"
                      className="rounded-lg p-1.5 text-praxis-400 transition-colors hover:bg-surface-100"
                      style={{ color: theme === "dark" ? "#8fa2bf" : undefined }}
                      title={t("payments.ignore", locale)}
                    >
                      <X size={14} />
                    </button>
                    <button
                          onClick={(e) => {
                            e.stopPropagation();
                        if (tx.matched_patient_id) {
                          handleConfirmSuggestion(tx);
                        } else {
                          setSyncHint(t("payments.assignFirst", locale));
                          openAssignModal(tx);
                        }
                      }}
                      type="button"
                      className="rounded-lg p-1.5 text-accent-emerald transition-colors hover:bg-accent-emerald/10"
                      title={t("payments.confirmSuggestion", locale)}
                    >
                      <Check size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {visibleTransactions.length === 0 && (
          <div className="p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "var(--ac-surface-muted)" }}>
              <CreditCard size={28} style={{ color: "var(--ac-text-mute)" }} />
            </div>
            <h3 className="text-lg font-bold" style={{ color: "var(--ac-text)" }}>
              {t("payments.noTransactions", locale)}
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--ac-text-soft)" }}>
              {t("payments.noTransactionsDesc", locale)}
            </p>
            <a href="/einstellungen" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--ac-primary)" }}>
              {t("payments.setupBank", locale)}
            </a>
          </div>
        )}

        {totalCount > pageSize && (
          <div
            className="flex items-center justify-between border-t px-4 py-3"
            style={{ borderColor: "var(--ac-border)" }}
          >
            <button
              type="button"
              className="ac-chip"
              style={page <= 1 ? { opacity: 0.45, pointerEvents: "none" } : undefined}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("payments.prevPage", locale)}
            </button>
            <span className="text-sm" style={{ color: "var(--ac-text-soft)" }}>
              {t("payments.pageOf", locale, {
                page: String(page),
                pages: String(Math.max(1, Math.ceil(totalCount / pageSize))),
              })}
            </span>
            <button
              type="button"
              className="ac-chip"
              style={page >= Math.ceil(totalCount / pageSize) ? { opacity: 0.45, pointerEvents: "none" } : undefined}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("payments.nextPage", locale)}
            </button>
          </div>
        )}
      </div>

      {/* Rücklastschriften */}
      <div className="stat-card">
        <h3 className="mb-2 text-xl font-bold" style={{ color: "var(--ac-text)" }}>
          {t("payments.chargebacks", locale)}
        </h3>
        <p className="mb-4 text-sm" style={{ color: "var(--ac-text-soft)" }}>
          {t("payments.chargebacksDesc", locale)}
        </p>
        {clientTx.filter(tx => Number(tx.betrag || 0) < 0).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--ac-surface-muted)" }}>
                  <th className="table-header">{t("payments.date", locale)}</th>
                  <th className="table-header">{t("payments.chargebacks.patient", locale)}</th>
                  <th className="table-header text-right">{t("payments.amount", locale)}</th>
                  <th className="table-header">{t("payments.chargebacks.reason", locale)}</th>
                  <th className="table-header">{t("payments.chargebacks.bankFee", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {clientTx.filter(tx => Number(tx.betrag || 0) < 0).map((tx) => (
                  <tr key={tx.id}>
                    <td className="table-cell text-sm">{new Date(tx.datum).toLocaleDateString(locale === "en" ? "en-GB" : "de-DE")}</td>
                    <td className="table-cell text-sm font-semibold">{tx.patients ? `${tx.patients.nachname}, ${tx.patients.vorname}` : tx.absender_name || "—"}</td>
                    <td className="table-cell text-right text-sm font-bold" style={{ color: "var(--ac-danger)" }}>{Number(tx.betrag).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€</td>
                    <td className="table-cell text-sm">{tx.verwendungszweck || t("payments.chargebacks.defaultReason", locale)}</td>
                    <td className="table-cell text-sm" style={{ color: "var(--ac-warning)" }}>+3,50€</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface-muted)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--ac-text-mute)" }}>
              {t("payments.noChargebacks", locale)}
            </p>
          </div>
        )}
      </div>

      {statusHelpFor && statusHelpPos && (() => {
        const tx = visibleTransactions.find((item) => item.id === statusHelpFor) || clientTx.find((item) => item.id === statusHelpFor);
        if (!tx) return null;
        const score = tx.matching_score ? String(Math.round(Number(tx.matching_score))) : "—";
        const reason = reasonText(tx);
        const hint = amountHint(tx);
        const statusText: Record<string, string> = {
          auto: t("payments.status.auto", locale),
          abweichung: t("payments.status.deviationLong", locale),
          unklar: t("payments.status.unclearLong", locale),
          manuell: t("payments.status.manuell", locale),
          ignoriert: t("payments.status.ignoriert", locale),
        };
        return (
          <div
            className="fixed z-[100] w-[340px] rounded-lg border p-3 text-sm shadow-elevated"
            style={{
              left: statusHelpPos.left,
              top: statusHelpPos.top,
              borderColor: "var(--ac-border)",
              background: "var(--ac-surface)",
              color: "var(--ac-text-soft)",
            }}
            onMouseEnter={() => setStatusHelpFor(tx.id)}
            onMouseLeave={() => setStatusHelpFor((curr) => (curr === tx.id ? null : curr))}
            role="tooltip"
          >
            <p className="mb-1 font-semibold" style={{ color: "var(--ac-text)" }}>{t("payments.tooltipMatchingStatus", locale)}</p>
            <p>{statusText[tx.matching_status] || tx.matching_status}</p>
            {reason && (
              <p className="mt-2 text-xs" style={{ color: "var(--ac-text-mute)" }}>
                <span className="font-semibold" style={{ color: "var(--ac-text)" }}>{t("payments.tooltip.reason", locale)}:</span> {reason}
                {hint ? ` · ${hint}` : ""}
              </p>
            )}
            <p className="mt-2 text-xs" style={{ color: "var(--ac-text-mute)" }}>
              <span className="font-semibold" style={{ color: "var(--ac-text)" }}>{t("payments.tooltip.matchScore", locale)}:</span> {score}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--ac-text-mute)" }}>
              {t("payments.tooltip.matchScoreMeaning", locale)}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--ac-text-mute)" }}>
              <span className="font-semibold" style={{ color: "var(--ac-text)" }}>{t("payments.actions", locale)}</span>{" "}
              {t("payments.tooltip.actionsHint", locale)}
            </p>
          </div>
        );
      })()}

      <Modal open={!!matchModal} onClose={() => { setMatchModal(null); setPatSearch(""); }} title={t("payments.modalTitle", locale)} size="lg">
        {matchModal && (
          <div className="space-y-4">
            <div className="rounded-lg border border-accent-blue/25 bg-accent-blue/5 px-3 py-2 text-sm" style={{ color: "var(--ac-text)" }}>
              {t("payments.modalIntro", locale)}
            </div>
            <div className="rounded-lg p-4" style={{ background: "var(--ac-surface-muted)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--ac-text)" }}>{matchModal.absender_name}</p>
              <p className="text-xs" style={{ color: "var(--ac-text-mute)" }}>{matchModal.verwendungszweck}</p>
              <p className="mt-1 text-lg font-bold" style={{ color: "var(--ac-text)" }}>{matchModal.betrag?.toLocaleString(locale === "en" ? "en-GB" : "de-DE")} €</p>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
              <input
                type="text"
                placeholder={t("search.placeholder", locale)}
                className="input pl-9"
                value={patSearch}
                onChange={(e) => setPatSearch(e.target.value)}
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1">
              {patienten.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleManualMatch(matchModal.id, p.id)}
                  className="w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme === "dark" ? "#171f2e" : "#f5f8ff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-praxis-100 flex items-center justify-center text-xs font-semibold text-praxis-600">
                    {p.vorname[0]}{p.nachname[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: "var(--ac-text)" }}>{p.nachname}, {p.vorname}</p>
                    <p className="text-xs" style={{ color: "var(--ac-text-mute)" }}>{(p.raten || []).filter((r: any) => r.status === "offen").length} {t("payments.openRates", locale)}</p>
                  </div>
                  <ArrowRight size={14} style={{ color: "var(--ac-text-mute)" }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
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
