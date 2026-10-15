"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CheckCircle2, ChevronRight, CircleDot, Clock3, Eye,
  FileCheck2, Link2, MailCheck, MousePointerClick, RefreshCw, Search, X,
} from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

type EventRow = { id: string; event_type: string; source: string; occurred_at: string };
type PortalEvent = { patient_id: string; event_type: string; created_at: string };
type MessageRow = {
  id: string; patient_id: string | null; patientName: string | null; patientNumber: string | null;
  campaign_key: string | null; channel: string; provider: string | null; recipient: string;
  subject: string; status: string; sent_at: string | null; delivered_at: string | null;
  first_opened_at: string | null; first_clicked_at: string | null; created_at: string;
  events: EventRow[]; portalEvents: PortalEvent[];
};
type Overview = {
  ready: boolean; schemaMissing?: boolean;
  summary: { total: number; accepted: number; delivered: number; opened: number; clicked: number; problems: number };
  messages: MessageRow[];
};

const statusTone: Record<string, string> = {
  queued: "text-slate-400", accepted: "text-sky-400", delayed: "text-amber-400",
  delivered: "text-emerald-400", opened: "text-teal-300", clicked: "text-cyan-300",
  failed: "text-red-400", bounced: "text-red-400", complained: "text-red-400", suppressed: "text-red-400",
};

function fmt(value: string | null | undefined, locale: string) {
  if (!value) return "–";
  return new Date(value).toLocaleString(locale === "de" ? "de-DE" : "en-GB", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
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

  const surface = dark ? "border-white/10 bg-[#111722]" : "border-[#cbd6df] bg-white";
  const muted = dark ? "text-[#aab7c7]" : "text-[#53677b]";
  const rule = dark ? "border-white/10" : "border-[#d7e0e7]";
  const messages = data?.messages ?? [];
  const summary = data?.summary ?? { total: 0, accepted: 0, delivered: 0, opened: 0, clicked: 0, problems: 0 };
  const stages = useMemo(() => [
    ["total", summary.total, MailCheck], ["accepted", summary.accepted, Clock3],
    ["delivered", summary.delivered, CheckCircle2], ["opened", summary.opened, Eye],
    ["clicked", summary.clicked, MousePointerClick],
  ] as const, [summary]);

  return <div className="mx-auto max-w-[1580px] pb-12">
    <header className={`flex flex-wrap items-end justify-between gap-5 border-b pb-6 ${rule}`}>
      <div className="max-w-3xl">
        <div className="flex items-center gap-3"><MailCheck size={25} className="text-emerald-400" /><h1 className="text-[26px] font-bold tracking-[-0.025em]">{t("dispatch.title", locale)}</h1></div>
        <p className={`mt-2 text-base leading-7 ${muted}`}>{t("dispatch.subtitle", locale)}</p>
      </div>
      <button className="btn btn-secondary min-h-11" onClick={() => void load()} disabled={busy}><RefreshCw size={17} className={busy ? "animate-spin" : ""} />{t("dispatch.refresh", locale)}</button>
    </header>

    {!data?.ready && !busy && <section className={`mt-6 border-l-4 border-amber-400 p-5 ${surface}`}><h2 className="font-bold">{t("dispatch.setupTitle", locale)}</h2><p className={`mt-2 max-w-[80ch] ${muted}`}>{t("dispatch.setupText", locale)}</p></section>}
    {error && <div className="mt-6 border-l-4 border-red-400 bg-red-500/10 p-4 text-red-300">{error}</div>}

    <section className={`mt-6 overflow-hidden rounded-[14px] border ${surface}`}>
      <div className="grid grid-cols-2 md:grid-cols-5">
        {stages.map(([key, value, Icon], index) => {
          const previous = index === 0 ? value : stages[index - 1][1];
          const ratio = previous > 0 ? Math.round(value / previous * 100) : 0;
          return <button key={key} type="button" onClick={() => setStatus(key === "total" ? "all" : key)} className={`relative min-h-[126px] border-b p-5 text-left transition-colors hover:bg-emerald-400/[0.04] md:border-b-0 ${index > 0 ? `border-l ${rule}` : ""} ${status === (key === "total" ? "all" : key) ? "bg-emerald-400/[0.06]" : ""}`}>
            <div className="flex items-center justify-between"><Icon size={19} className={key === "delivered" ? "text-emerald-400" : "text-slate-400"} />{index > 0 && <span className={`text-xs tabular-nums ${muted}`}>{ratio}%</span>}</div>
            <div className="mt-4 text-3xl font-bold tabular-nums">{value}</div>
            <div className={`mt-1 text-sm ${muted}`}>{t(`dispatch.metric.${key}`, locale)}</div>
            {index < stages.length - 1 && <ChevronRight size={15} className={`absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 md:block ${muted}`} />}
          </button>;
        })}
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
          <tbody className={`divide-y ${rule}`}>{messages.map(row => <tr key={row.id} onClick={() => setSelected(row)} className="cursor-pointer transition-colors hover:bg-emerald-400/[0.035]"><td className="px-5 py-4"><div className="font-semibold">{row.patientName || t("dispatch.notAssigned", locale)}</div><div className={`mt-1 text-xs ${muted}`}>{row.patientNumber || "–"}</div></td><td className="max-w-[330px] px-5 py-4"><div className="truncate font-medium">{row.subject || "–"}</div><div className={`mt-1 truncate text-xs ${muted}`}>{row.campaign_key || row.channel}</div></td><td className="px-5 py-4">{row.recipient}</td><td className="whitespace-nowrap px-5 py-4 tabular-nums">{fmt(row.sent_at || row.created_at, locale)}</td><td className={`px-5 py-4 font-semibold ${statusTone[row.status] || muted}`}><span className="inline-flex items-center gap-2"><CircleDot size={14} />{t(`dispatch.status.${row.status}`, locale)}</span></td><td className="px-5 py-4 text-right"><span className={`inline-flex items-center gap-2 ${muted}`}>{row.events.length + row.portalEvents.length}<ChevronRight size={16} /></span></td></tr>)}</tbody>
        </table>
        {!busy && messages.length === 0 && <div className={`py-20 text-center ${muted}`}><MailCheck size={32} className="mx-auto mb-3 opacity-50" /><p>{t("dispatch.empty", locale)}</p></div>}
        {busy && <div className={`py-20 text-center ${muted}`}><RefreshCw size={24} className="mx-auto mb-3 animate-spin" />{t("dispatch.loading", locale)}</div>}
      </div>
    </section>

    {selected && <TimelineDrawer row={selected} locale={locale} dark={dark} muted={muted} rule={rule} close={() => setSelected(null)} />}
  </div>;
}

function TimelineDrawer({ row, locale, dark, muted, rule, close }: { row: MessageRow; locale: string; dark: boolean; muted: string; rule: string; close: () => void }) {
  const timeline = [
    ...row.events.map(event => ({ type: event.event_type, at: event.occurred_at, source: event.source, portal: false })),
    ...row.portalEvents.map(event => ({ type: event.event_type, at: event.created_at, source: "patient_portal", portal: true })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const iconFor = (type: string) => type === "clicked" || type === "notification_clicked" ? Link2 : type === "opened" ? Eye : type.includes("document") ? FileCheck2 : type === "failed" || type === "bounced" ? AlertCircle : CheckCircle2;
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]" onMouseDown={event => event.target === event.currentTarget && close()}>
    <aside className={`h-full w-full max-w-[560px] overflow-y-auto border-l p-6 shadow-2xl ${rule} ${dark ? "bg-[#0d121b] text-[#f0f3f8]" : "bg-white text-[#1c3044]"}`}>
      <div className={`flex items-start justify-between gap-4 border-b pb-5 ${rule}`}><div><div className={`text-sm ${muted}`}>{t("dispatch.timeline", locale)}</div><h2 className="mt-1 text-xl font-bold">{row.patientName || row.recipient}</h2><p className={`mt-1 text-sm ${muted}`}>{row.subject}</p></div><button type="button" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-lg border border-current/15" aria-label={t("dispatch.close", locale)}><X size={19} /></button></div>
      <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 border-b py-5 text-sm ${rule}`}><div><dt className={muted}>{t("dispatch.table.recipient", locale)}</dt><dd className="mt-1 font-semibold">{row.recipient}</dd></div><div><dt className={muted}>{t("dispatch.table.status", locale)}</dt><dd className={`mt-1 font-semibold ${statusTone[row.status] || ""}`}>{t(`dispatch.status.${row.status}`, locale)}</dd></div><div><dt className={muted}>{t("dispatch.campaign", locale)}</dt><dd className="mt-1 font-semibold">{row.campaign_key || "–"}</dd></div><div><dt className={muted}>{t("dispatch.provider", locale)}</dt><dd className="mt-1 font-semibold">{row.provider || t("dispatch.ownSystem", locale)}</dd></div></dl>
      <div className="py-6"><h3 className="font-bold">{t("dispatch.history", locale)}</h3><p className={`mt-1 text-sm ${muted}`}>{t("dispatch.historyHint", locale)}</p><ol className="mt-6">{timeline.map((event, index) => { const Icon = iconFor(event.type); return <li key={`${event.type}-${event.at}-${index}`} className="relative flex gap-4 pb-7"><div className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${event.portal ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-400" : `${rule} ${dark ? "bg-[#151d29]" : "bg-white"}`}`}><Icon size={16} /></div>{index < timeline.length - 1 && <div className={`absolute left-[17px] top-9 h-[calc(100%-1.25rem)] border-l ${rule}`} />}<div className="min-w-0 pt-1"><div className="font-semibold">{t(`dispatch.event.${event.type}`, locale)}</div><div className={`mt-1 text-sm ${muted}`}>{fmt(event.at, locale)} · {event.portal ? t("dispatch.portalEvidence", locale) : t("dispatch.technicalSignal", locale)}</div></div></li>; })}{timeline.length === 0 && <li className={muted}>{t("dispatch.noEvents", locale)}</li>}</ol></div>
    </aside>
  </div>;
}
