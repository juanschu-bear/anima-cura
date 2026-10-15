"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CheckCircle2, ChevronRight, CircleDot, Clock3, Eye,
  FileCheck2, MailCheck, MousePointerClick, RefreshCw, Search,
} from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { PatientCommunicationCenter } from "@/components/communication/PatientCommunicationCenter";
import type { DispatchMessage, InboundContact } from "@/lib/communication-insights";

type MessageRow = DispatchMessage;
type BillingReconciliation = {
  quarter: string;
  expectedInvoices: number;
  expectedPatients: number;
  publishedInvoices: number;
  publishedPatients: number;
  portalMissingInvoices: number;
  portalMissingPatients: number;
  preparedRecipients: number;
  preparedPatients: number;
  preparedInvoices: number;
  acceptedRecipients: number;
  acceptedPatients: number;
  acceptedInvoices: number;
  clarificationMessages: number;
  clarificationRecipients: number;
  noContactInvoices: number;
  noContactPatients: number;
  transportIssueInvoices: number;
  transportIssuePatients: number;
  unnotifiedInvoices: number;
  unnotifiedPatients: number;
};
type BillingReviewRow = {
  patientId: string;
  patientName: string;
  patientNumber: string | null;
  category: "no_contact" | "transport_issue";
  primaryReason: string;
  currentContactEmail: string | null;
  masterDataEmails: string[];
  alternativeContacts: string[];
};
type Overview = {
  ready: boolean; schemaMissing?: boolean;
  summary: { total: number; accepted: number; delivered: number; opened: number; clicked: number; problems: number };
  messages: MessageRow[];
  inbound?: InboundContact[];
  repliesAvailable?: boolean;
  truncated?: boolean;
  billingReconciliation: BillingReconciliation | null;
  billingReviewRows: BillingReviewRow[];
};

const statusTone: Record<string, string> = {
  queued: "text-slate-400", accepted: "text-sky-400", delayed: "text-amber-400",
  delivered: "text-emerald-400", opened: "text-teal-300", clicked: "text-cyan-300",
  failed: "text-red-400", bounced: "text-red-400", complained: "text-red-400", suppressed: "text-red-400",
};
const MESSAGE_PAGE_SIZE = 15;
const REVIEW_PAGE_SIZE = 15;

function fmt(value: string | null | undefined, locale: string) {
  if (!value) return "–";
  return new Date(value).toLocaleString(locale === "de" ? "de-DE" : "en-GB", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function fmtNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB").format(value);
}

function messageKind(row: MessageRow): "invoice" | "clarification" | "other" {
  const key = row.campaign_key?.toLocaleLowerCase("en-GB") ?? "";
  if (key.includes("invoice")) return "invoice";
  if (key.includes("clarification")) return "clarification";
  return "other";
}

function messageKindBadge(kind: "invoice" | "clarification" | "other", dark: boolean) {
  if (kind === "invoice") return dark ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-[#b7ddc4] bg-[#eef8f1] text-[#176a40]";
  if (kind === "clarification") return dark ? "border-sky-400/25 bg-sky-400/10 text-sky-300" : "border-[#bfdcf4] bg-[#eef6fd] text-[#195c8f]";
  return dark ? "border-white/10 bg-white/[0.04] text-[#dce6f2]" : "border-[#d7e0e7] bg-[#f5f7fa] text-[#415468]";
}

function pageRange(total: number, page: number, pageSize: number) {
  if (total === 0) return { start: 0, end: 0 };
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return { start, end };
}

export default function VersandPage() {
  const { locale, theme } = useAppStore();
  const dark = theme === "dark";
  const [data, setData] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<MessageRow | null>(null);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [messagePage, setMessagePage] = useState(1);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ days, status });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/kommunikation?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      setData(await response.json() as Overview);
    } catch { setError(t("dispatch.loadError", locale)); }
    finally { setBusy(false); }
  }, [days, locale, query, status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [load, query]);

  useEffect(() => {
    setMessagePage(1);
  }, [days, query, status]);

  const surface = dark ? "border-white/10 bg-[#111722]" : "border-[#cbd6df] bg-white";
  const muted = dark ? "text-[#aab7c7]" : "text-[#53677b]";
  const rule = dark ? "border-white/10" : "border-[#d7e0e7]";
  const messages = data?.messages ?? [];
  const summary = data?.summary ?? { total: 0, accepted: 0, delivered: 0, opened: 0, clicked: 0, problems: 0 };
  const billing = data?.billingReconciliation ?? null;
  const billingReviewRows = data?.billingReviewRows ?? [];
  const messagePages = Math.max(1, Math.ceil(messages.length / MESSAGE_PAGE_SIZE));
  const visibleMessages = useMemo(() => messages.slice((messagePage - 1) * MESSAGE_PAGE_SIZE, messagePage * MESSAGE_PAGE_SIZE), [messagePage, messages]);
  const technicalSplitTotal = billing ? billing.acceptedRecipients + billing.clarificationMessages : summary.total;
  const stages = useMemo(() => [
    ["total", summary.total, MailCheck], ["accepted", summary.accepted, Clock3],
    ["delivered", summary.delivered, CheckCircle2], ["opened", summary.opened, Eye],
    ["clicked", summary.clicked, MousePointerClick],
  ] as const, [summary]);

  useEffect(() => {
    setMessagePage((current) => Math.min(current, messagePages));
  }, [messagePages]);

  return <div className="mx-auto max-w-[1580px] pb-12">
    <header className={`flex flex-wrap items-end justify-between gap-5 border-b pb-6 ${rule}`}>
      <div className="max-w-3xl">
        <div className="flex items-center gap-3"><MailCheck size={25} className="text-emerald-400" /><h1 className="text-[22px] font-bold tracking-[-0.025em]">{t("dispatch.title", locale)}</h1></div>
        <p className={`mt-2 text-base leading-7 ${muted}`}>{t("dispatch.subtitle", locale)}</p>
      </div>
      <button className="btn btn-secondary min-h-11" onClick={() => void load()} disabled={busy}><RefreshCw size={17} className={busy ? "animate-spin" : ""} />{t("dispatch.refresh", locale)}</button>
    </header>

    {!data?.ready && !busy && <section className={`mt-6 rounded-[14px] border p-5 ${surface}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${dark ? "bg-amber-400/12 text-amber-300" : "bg-[#fff3cf] text-[#9b6a12]"}`}><AlertCircle size={18} /></div>
        <div>
          <h2 className="text-lg font-bold">{t("dispatch.setupTitle", locale)}</h2>
          <p className={`mt-2 max-w-[80ch] text-sm leading-6 ${muted}`}>{t("dispatch.setupText", locale)}</p>
        </div>
      </div>
    </section>}
    {error && <div className="mt-6 border-l-4 border-red-400 bg-red-500/10 p-4 text-red-300">{error}</div>}

    <PatientCommunicationCenter messages={messages} inbound={data?.inbound ?? []} repliesAvailable={data?.repliesAvailable ?? false}
      selected={selected} onSelect={setSelected} locale={locale} dark={dark} busy={busy} />
    {data?.truncated && <p className="mt-3 text-sm text-amber-500">{t("dispatch.crm.truncated", locale)}</p>}

    <div hidden={Boolean(selected)}>
    {billing && <BillingReconciliationPanel billing={billing} reviewRows={billingReviewRows} locale={locale} dark={dark} surface={surface} rule={rule} muted={muted} />}

    <section className={`mt-6 overflow-hidden rounded-[14px] border ${surface}`}>
      <div className={`flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4 ${rule}`}>
        <div className="max-w-3xl">
          <h2 className="text-lg font-bold tracking-[-0.02em]">{t("dispatch.techSignalsTitle", locale)}</h2>
          <p className={`mt-1 text-sm leading-6 ${muted}`}>{t("dispatch.techSignalsText", locale)}</p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${rule} ${muted}`}>{t("dispatch.techSignalsBadge", locale)}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5">
        {stages.map(([key, value, Icon], index) => {
          const previous = summary.total;
          const ratio = previous > 0 ? Math.round(value / previous * 100) : 0;
          return <button key={key} type="button" onClick={() => setStatus(key === "total" ? "all" : key)} className={`relative min-h-[126px] border-b p-5 text-left transition-colors hover:bg-emerald-400/[0.04] md:border-b-0 ${index > 0 ? `border-l ${rule}` : ""} ${status === (key === "total" ? "all" : key) ? "bg-emerald-400/[0.06]" : ""}`}>
            <div className="flex items-center justify-between"><Icon size={19} className={key === "delivered" ? "text-emerald-400" : "text-slate-400"} />{index > 0 && <span className={`text-xs tabular-nums ${muted}`}>{ratio}%</span>}</div>
            <div className="mt-4 text-3xl font-bold tabular-nums">{value}</div>
            <div className={`mt-1 text-sm ${muted}`}>{t(`dispatch.metric.${key}`, locale)}</div>
            {index < stages.length - 1 && <ChevronRight size={15} className={`absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 md:block ${muted}`} />}
          </button>;
        })}
      </div>
      <div className={`grid gap-3 border-t px-5 py-4 md:grid-cols-2 ${rule}`}>
        <div className={`rounded-[12px] border px-4 py-3 text-sm leading-6 ${rule} ${dark ? "bg-white/[0.03]" : "bg-[#f7fafc]"}`}>
          <div className="font-semibold">{t("dispatch.techMeaningTitle", locale)}</div>
          <p className={`mt-1 ${muted}`}>{t("dispatch.techMeaningBody", locale)}</p>
        </div>
        {billing && <div className={`rounded-[12px] border px-4 py-3 text-sm leading-6 ${rule} ${dark ? "bg-white/[0.03]" : "bg-[#f7fafc]"}`}>
          <div className="font-semibold">{t("dispatch.techSplitTitle", locale)}</div>
          <p className={`mt-1 ${muted}`}>{t("dispatch.techSplitBody", locale, {
            total: fmtNumber(technicalSplitTotal, locale),
            invoice: fmtNumber(billing.acceptedRecipients, locale),
            clarification: fmtNumber(billing.clarificationMessages, locale),
          })}</p>
        </div>}
      </div>
      <div className={`flex items-center justify-between gap-4 border-t px-5 py-3 ${rule}`}><p className={`text-sm ${muted}`}>{t("dispatch.signalNote", locale)}</p><button type="button" onClick={() => setStatus("problem")} className={`shrink-0 text-sm font-semibold ${summary.problems ? "text-red-400" : "text-emerald-400"}`}><span className="tabular-nums">{summary.problems}</span> {t("dispatch.problems", locale)}</button></div>
    </section>

    <section className={`mt-6 overflow-hidden rounded-[14px] border ${surface}`}>
      <div className={`flex flex-wrap items-center gap-3 border-b p-4 ${rule}`}>
        <label className="relative min-w-[260px] flex-1"><Search size={17} className={`absolute left-3 top-1/2 -translate-y-1/2 ${muted}`} /><input className="input min-h-11 pl-10" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("dispatch.search", locale)} /></label>
        <select className="input min-h-11 w-auto" value={status} onChange={event => setStatus(event.target.value)} aria-label={t("dispatch.filterStatus", locale)}><option value="all">{t("dispatch.status.all", locale)}</option>{["accepted", "delivered", "opened", "clicked", "delayed", "problem"].map(value => <option key={value} value={value}>{t(`dispatch.status.${value}`, locale)}</option>)}</select>
        <select className="input min-h-11 w-auto" value={days} onChange={event => setDays(event.target.value)} aria-label={t("dispatch.filterPeriod", locale)}><option value="7">7 {t("dispatch.days", locale)}</option><option value="30">30 {t("dispatch.days", locale)}</option><option value="90">90 {t("dispatch.days", locale)}</option><option value="365">365 {t("dispatch.days", locale)}</option></select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className={`${muted} ${dark ? "bg-white/[0.025]" : "bg-slate-50"}`}><tr><th className="px-5 py-3">{t("dispatch.table.patient", locale)}</th><th className="px-5 py-3">{t("dispatch.table.message", locale)}</th><th className="px-5 py-3">{t("dispatch.table.recipient", locale)}</th><th className="px-5 py-3">{t("dispatch.table.sent", locale)}</th><th className="px-5 py-3">{t("dispatch.table.status", locale)}</th><th className="px-5 py-3 text-right">{t("dispatch.table.activity", locale)}</th></tr></thead>
          <tbody className={`divide-y ${rule}`}>{visibleMessages.map(row => {
            const kind = messageKind(row);
            return <tr
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(row);
                }
              }}
              className="cursor-pointer transition-colors hover:bg-emerald-400/[0.035] focus-visible:bg-emerald-400/[0.06] focus-visible:outline-none"
            >
              <td className="px-5 py-4"><div className="font-semibold">{row.patients?.map(patient => patient.name).join(" · ") || row.patientName || t("dispatch.notAssigned", locale)}</div><div className={`mt-1 text-xs ${muted}`}>{row.patients?.map(patient => patient.number).filter(Boolean).join(" · ") || row.patientNumber || "–"}</div></td>
              <td className="max-w-[360px] px-5 py-4">
                <div className="truncate font-medium">{row.subject || "–"}</div>
                <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${muted}`}>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${messageKindBadge(kind, dark)}`}>{t(`dispatch.messageKind.${kind}`, locale)}</span>
                  <span className="truncate">{row.campaign_key || row.channel}</span>
                </div>
              </td>
              <td className="px-5 py-4">{row.recipient}</td>
              <td className="whitespace-nowrap px-5 py-4 tabular-nums">{fmt(row.sent_at || row.created_at, locale)}</td>
              <td className={`px-5 py-4 font-semibold ${statusTone[row.status] || muted}`}><span className="inline-flex items-center gap-2"><CircleDot size={14} />{t(`dispatch.status.${row.status}`, locale)}</span></td>
              <td className="px-5 py-4 text-right"><span className={`inline-flex items-center gap-2 ${muted}`}>{row.events.length + row.portalEvents.length}<ChevronRight size={16} /></span></td>
            </tr>;
          })}</tbody>
        </table>
        {!busy && messages.length === 0 && <div className={`py-20 text-center ${muted}`}><MailCheck size={32} className="mx-auto mb-3 opacity-50" /><p>{t("dispatch.empty", locale)}</p></div>}
        {busy && <div className={`py-20 text-center ${muted}`}><RefreshCw size={24} className="mx-auto mb-3 animate-spin" />{t("dispatch.loading", locale)}</div>}
      </div>
      {!busy && messages.length > 0 && <PaginationFooter
        locale={locale}
        muted={muted}
        rule={rule}
        page={messagePage}
        pages={messagePages}
        total={messages.length}
        pageSize={MESSAGE_PAGE_SIZE}
        onPageChange={setMessagePage}
      />}
    </section>

    </div>
  </div>;
}

function BillingReconciliationPanel({
  billing,
  reviewRows,
  locale,
  dark,
  surface,
  rule,
  muted,
}: {
  billing: BillingReconciliation;
  reviewRows: BillingReviewRow[];
  locale: string;
  dark: boolean;
  surface: string;
  rule: string;
  muted: string;
}) {
  const portalComplete = billing.portalMissingInvoices === 0;
  const attention = billing.unnotifiedInvoices > 0;
  const quietSurface = dark ? "bg-white/[0.03]" : "bg-[#f7fafc]";
  const heroSurface = dark ? "bg-emerald-400/[0.07]" : "bg-[#eef8f1]";
  const alertSurface = attention ? (dark ? "bg-amber-400/[0.08]" : "bg-[#fff7df]") : heroSurface;
  const heroText = portalComplete ? "text-emerald-400" : "text-amber-400";
  const totalMessages = billing.acceptedRecipients + billing.clarificationMessages;
  const equation = `${fmtNumber(totalMessages, locale)} = ${fmtNumber(billing.acceptedRecipients, locale)} + ${fmtNumber(billing.clarificationMessages, locale)}`;
  const [reviewPage, setReviewPage] = useState(1);
  const reviewPages = Math.max(1, Math.ceil(reviewRows.length / REVIEW_PAGE_SIZE));
  const visibleReviewRows = useMemo(() => reviewRows.slice((reviewPage - 1) * REVIEW_PAGE_SIZE, reviewPage * REVIEW_PAGE_SIZE), [reviewPage, reviewRows]);

  useEffect(() => {
    setReviewPage((current) => Math.min(current, reviewPages));
  }, [reviewPages]);

  return <section className={`mt-6 overflow-hidden rounded-[14px] border ${surface}`}>
    <div className={`border-b px-5 py-5 ${rule}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-4xl">
          <h2 className="text-[22px] font-bold tracking-[-0.03em]">{t("dispatch.reconciliation.title", locale, { quarter: billing.quarter })}</h2>
          <p className={`mt-2 max-w-[72ch] text-sm leading-7 ${muted}`}>{t("dispatch.reconciliation.subtitle", locale)}</p>
        </div>
        <div className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${portalComplete ? "border-emerald-400/30 text-emerald-400" : `border-amber-400/30 ${heroText}`}`}>{portalComplete ? t("dispatch.reconciliation.portalComplete", locale) : t("dispatch.reconciliation.portalReview", locale)}</div>
      </div>
    </div>

    <div className="grid gap-6 px-5 py-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
      <div className="space-y-5">
        <div className={`rounded-[16px] border p-5 ${rule} ${heroSurface}`}>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className={`text-sm font-semibold uppercase tracking-[0.16em] ${muted}`}>{t("dispatch.reconciliation.portalLabel", locale)}</p>
              <div className={`mt-3 text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-[-0.05em] ${heroText}`}>{fmtNumber(billing.publishedInvoices, locale)} / {fmtNumber(billing.expectedInvoices, locale)}</div>
              <p className={`mt-2 text-base ${muted}`}>{t("dispatch.reconciliation.portalPatients", locale, { patients: fmtNumber(billing.publishedPatients, locale), expectedPatients: fmtNumber(billing.expectedPatients, locale) })}</p>
            </div>
            <div className={`min-w-[220px] rounded-[14px] border p-4 ${rule} ${quietSurface}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-full ${portalComplete ? "bg-emerald-400/15 text-emerald-400" : "bg-amber-400/15 text-amber-400"}`}><FileCheck2 size={18} /></div>
                <div>
                  <div className="text-sm font-semibold">{t("dispatch.reconciliation.statusTitle", locale)}</div>
                  <div className={`mt-1 text-sm leading-6 ${muted}`}>{portalComplete ? t("dispatch.reconciliation.statusComplete", locale) : t("dispatch.reconciliation.statusMissing", locale, { count: fmtNumber(billing.portalMissingInvoices, locale) })}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className={`rounded-[16px] border p-5 ${rule}`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${dark ? "bg-white/[0.06] text-[#dce6f2]" : "bg-[#eef4f8] text-[#21415d]"}`}><FileCheck2 size={18} /></div>
              <div>
                <h3 className="text-base font-bold tracking-[-0.02em]">{t("dispatch.reconciliation.invoiceFlow", locale)}</h3>
                <p className={`mt-1 text-sm leading-6 ${muted}`}>{t("dispatch.reconciliation.invoiceFlowText", locale)}</p>
              </div>
            </div>
            <div className={`mt-5 space-y-3 border-t pt-4 ${rule}`}>
              <FlowRow label={t("dispatch.reconciliation.expectedInvoices", locale)} value={fmtNumber(billing.expectedInvoices, locale)} muted={muted} />
              <FlowRow label={t("dispatch.reconciliation.portalInvoices", locale)} value={fmtNumber(billing.publishedInvoices, locale)} muted={muted} emphasize />
              <FlowRow label={t("dispatch.reconciliation.preparedInvoices", locale)} value={fmtNumber(billing.preparedInvoices, locale)} muted={muted} />
              <FlowRow label={t("dispatch.reconciliation.acceptedInvoices", locale)} value={fmtNumber(billing.acceptedInvoices, locale)} muted={muted} />
              <FlowRow label={t("dispatch.reconciliation.unnotifiedInvoices", locale)} value={fmtNumber(billing.unnotifiedInvoices, locale)} muted={muted} tone={attention ? "warn" : "neutral"} />
            </div>
          </div>

          <div className={`rounded-[16px] border p-5 ${rule}`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${dark ? "bg-white/[0.06] text-[#dce6f2]" : "bg-[#eef4f8] text-[#21415d]"}`}><MailCheck size={18} /></div>
              <div>
                <h3 className="text-base font-bold tracking-[-0.02em]">{t("dispatch.reconciliation.communicationFlow", locale)}</h3>
                <p className={`mt-1 text-sm leading-6 ${muted}`}>{t("dispatch.reconciliation.communicationFlowText", locale)}</p>
              </div>
            </div>
            <div className={`mt-5 space-y-3 border-t pt-4 ${rule}`}>
              <FlowRow label={t("dispatch.reconciliation.totalMessages", locale)} value={fmtNumber(totalMessages, locale)} muted={muted} emphasize />
              <FlowRow label={t("dispatch.reconciliation.invoiceEmails", locale)} value={fmtNumber(billing.acceptedRecipients, locale)} muted={muted} />
              <FlowRow label={t("dispatch.reconciliation.clarificationEmails", locale)} value={fmtNumber(billing.clarificationMessages, locale)} muted={muted} />
              <FlowRow label={t("dispatch.reconciliation.coveredPatients", locale)} value={fmtNumber(billing.acceptedPatients, locale)} muted={muted} />
              <FlowRow label={t("dispatch.reconciliation.coveredAddresses", locale)} value={fmtNumber(billing.acceptedRecipients, locale)} muted={muted} />
            </div>
            <div className={`mt-4 rounded-[12px] border px-4 py-3 text-sm leading-6 ${rule} ${quietSurface}`}>
              <div className="font-semibold">{t("dispatch.reconciliation.equationTitle", locale)}</div>
              <p className={`mt-1 ${muted}`}>{t("dispatch.reconciliation.equationBody", locale, {
                total: fmtNumber(totalMessages, locale),
                invoice: fmtNumber(billing.acceptedRecipients, locale),
                clarification: fmtNumber(billing.clarificationMessages, locale),
              })}</p>
              <div className="mt-2 font-semibold tabular-nums">{equation}</div>
            </div>
          </div>
        </div>
      </div>

      <aside className={`rounded-[16px] border p-5 ${rule} ${alertSurface}`}>
        <div className="flex items-start gap-3">
          <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${attention ? "bg-amber-400/15 text-amber-400" : "bg-emerald-400/15 text-emerald-400"}`}><AlertCircle size={18} /></div>
          <div>
            <h3 className="text-base font-bold tracking-[-0.02em]">{t("dispatch.reconciliation.attentionTitle", locale)}</h3>
            <p className={`mt-1 text-sm leading-6 ${muted}`}>{attention ? t("dispatch.reconciliation.attentionBody", locale, {
              invoices: fmtNumber(billing.unnotifiedInvoices, locale),
              patients: fmtNumber(billing.unnotifiedPatients, locale),
            }) : t("dispatch.reconciliation.attentionClear", locale)}</p>
          </div>
        </div>
        <div className={`mt-5 space-y-3 border-t pt-4 ${rule}`}>
          <FlowRow label={t("dispatch.reconciliation.noContact", locale)} value={`${fmtNumber(billing.noContactInvoices, locale)} · ${fmtNumber(billing.noContactPatients, locale)}`} muted={muted} />
          <FlowRow label={t("dispatch.reconciliation.transportIssues", locale)} value={`${fmtNumber(billing.transportIssueInvoices, locale)} · ${fmtNumber(billing.transportIssuePatients, locale)}`} muted={muted} />
        </div>
        <div className={`mt-5 rounded-[12px] border px-4 py-3 text-sm leading-6 ${rule} ${quietSurface}`}>
          <div className="font-semibold">{t("dispatch.reconciliation.interpretationTitle", locale)}</div>
          <p className={`mt-2 ${muted}`}>{t("dispatch.reconciliation.interpretationBody", locale)}</p>
        </div>
      </aside>
    </div>

    {reviewRows.length > 0 && <div className={`border-t px-5 py-5 ${rule}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h3 className="text-base font-bold tracking-[-0.02em]">{t("dispatch.review.title", locale)}</h3>
          <p className={`mt-1 text-sm leading-6 ${muted}`}>{t("dispatch.review.subtitle", locale)}</p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${rule} ${muted}`}>{fmtNumber(reviewRows.length, locale)} {t("dispatch.review.cases", locale)}</div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className={`${muted} ${dark ? "bg-white/[0.025]" : "bg-slate-50"}`}>
            <tr>
              <th className="px-4 py-3">{t("dispatch.review.patient", locale)}</th>
              <th className="px-4 py-3">{t("dispatch.review.category", locale)}</th>
              <th className="px-4 py-3">{t("dispatch.review.reason", locale)}</th>
              <th className="px-4 py-3">{t("dispatch.review.currentEmail", locale)}</th>
              <th className="px-4 py-3">{t("dispatch.review.practiceEmails", locale)}</th>
              <th className="px-4 py-3">{t("dispatch.review.alternatives", locale)}</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${rule}`}>
            {visibleReviewRows.map((row) => <tr key={row.patientId}>
              <td className="px-4 py-4">
                <div className="font-semibold">{row.patientName}</div>
                <div className={`mt-1 text-xs ${muted}`}>{row.patientNumber || "–"}</div>
              </td>
              <td className="px-4 py-4">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.category === "no_contact"
                  ? (dark ? "bg-amber-400/12 text-amber-300" : "bg-[#fff3cf] text-[#9b6a12]")
                  : (dark ? "bg-red-400/12 text-red-300" : "bg-[#fde8e6] text-[#ad342f]")}`}>
                  {t(`dispatch.review.category.${row.category}`, locale)}
                </span>
              </td>
              <td className="px-4 py-4 font-medium">{t(`dispatch.review.reason.${row.primaryReason}`, locale)}</td>
              <td className="px-4 py-4">{row.currentContactEmail || "–"}</td>
              <td className="px-4 py-4">{row.masterDataEmails.length ? row.masterDataEmails.join(", ") : "–"}</td>
              <td className="px-4 py-4">{row.alternativeContacts.length ? row.alternativeContacts.join(", ") : "–"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <PaginationFooter
        locale={locale}
        muted={muted}
        rule={rule}
        page={reviewPage}
        pages={reviewPages}
        total={reviewRows.length}
        pageSize={REVIEW_PAGE_SIZE}
        onPageChange={setReviewPage}
      />
    </div>}
  </section>;
}

function PaginationFooter({
  locale,
  muted,
  rule,
  page,
  pages,
  total,
  pageSize,
  onPageChange,
}: {
  locale: string;
  muted: string;
  rule: string;
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (value: number | ((current: number) => number)) => void;
}) {
  if (total === 0) return null;
  const { start, end } = pageRange(total, page, pageSize);

  return <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 ${rule}`}>
    <div className={`text-sm ${muted}`}>
      {t("dispatch.pagination.summary", locale, {
        start: fmtNumber(start, locale),
        end: fmtNumber(end, locale),
        total: fmtNumber(total, locale),
      })}
      {pages > 1 && <> · {t("dispatch.pagination.pageOf", locale, {
        page: fmtNumber(page, locale),
        pages: fmtNumber(pages, locale),
      })}</>}
    </div>
    {pages > 1 && <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange((current) => Math.max(1, typeof current === "number" ? current - 1 : page - 1))}
        className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-emerald-400/[0.05] ${rule}`}
        disabled={page <= 1}
        style={page <= 1 ? { opacity: 0.45, pointerEvents: "none" } : undefined}
      >
        {t("dispatch.pagination.prev", locale)}
      </button>
      <button
        type="button"
        onClick={() => onPageChange((current) => Math.min(pages, typeof current === "number" ? current + 1 : page + 1))}
        className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-emerald-400/[0.05] ${rule}`}
        disabled={page >= pages}
        style={page >= pages ? { opacity: 0.45, pointerEvents: "none" } : undefined}
      >
        {t("dispatch.pagination.next", locale)}
      </button>
    </div>}
  </div>;
}

function FlowRow({
  label,
  value,
  muted,
  emphasize = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  muted: string;
  emphasize?: boolean;
  tone?: "neutral" | "warn";
}) {
  const toneClass = tone === "warn" ? "text-amber-400" : "text-current";
  return <div className="flex items-start justify-between gap-4">
    <div className={`text-sm leading-6 ${muted}`}>{label}</div>
    <div className={`shrink-0 text-right tabular-nums ${emphasize ? "text-lg font-bold tracking-[-0.03em]" : "font-semibold"} ${toneClass}`}>{value}</div>
  </div>;
}
