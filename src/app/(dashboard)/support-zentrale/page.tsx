"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Sparkles, XCircle, type LucideIcon } from "lucide-react";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/hooks/useAppStore";

type KnowledgeEntry = { id: string; title: string; categories: string[]; content: string };
type LearningNote = { id: string; category: string; title: string; content: string; status: string; created_at: string };
type RecentCase = { id: string; status: string; startedAt: string; category: string; subject: string; sender: string; manualReview: boolean; autoReplied: boolean };
type Overview = {
  knowledge: KnowledgeEntry[];
  knowledgeVersion: string;
  prompt: string;
  stats: { total: number; autoReplied: number; manualReview: number; failed: number; categories: Record<string, number> };
  recentCases: RecentCase[];
  learningNotes: LearningNote[];
};

const categories = ["login_password", "invoice_access", "payment_method", "portal_setup", "medical", "billing_specific", "other"];

export default function SupportZentralePage() {
  const { locale, theme } = useAppStore();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ category: "login_password", title: "", content: "" });
  const dark = theme === "dark";

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/support-zentrale", { cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      setData(await response.json());
    } catch { setError(t("support.loadError", locale)); }
    finally { setBusy(false); }
  }, [locale]);

  useEffect(() => { void load(); }, [load]);

  const topTopics = useMemo(() => Object.entries(data?.stats.categories ?? {}).sort((a, b) => b[1] - a[1]), [data]);
  const maxTopic = Math.max(1, ...topTopics.map(([, count]) => count));
  const panel = dark ? "border-white/10 bg-[#121722] text-white" : "border-surface-200 bg-white text-praxis-800";
  const muted = dark ? "text-white/60" : "text-praxis-500";
  const metrics: Array<[string, number, LucideIcon]> = [
    [t("support.metric.requests", locale), data?.stats.total ?? 0, BookOpenCheck],
    [t("support.metric.auto", locale), data?.stats.autoReplied ?? 0, CheckCircle2],
    [t("support.metric.manual", locale), data?.stats.manualReview ?? 0, Clock3],
    [t("support.metric.failed", locale), data?.stats.failed ?? 0, AlertTriangle],
  ];

  async function saveNote(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const response = await fetch("/api/support-zentrale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || t("support.loadError", locale));
    else { setForm((current) => ({ ...current, title: "", content: "" })); setNotice(t("support.noteSaved", locale)); await load(); }
    setBusy(false);
  }

  async function reviewNote(id: string, status: "reviewed" | "rejected") {
    setBusy(true); setError("");
    const response = await fetch("/api/support-zentrale", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (!response.ok) setError(t("support.loadError", locale)); else await load();
    setBusy(false);
  }

  if (!data && busy) return <div className={muted}>{t("support.loading", locale)}</div>;

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl"><h1 className="text-[22px] font-bold tracking-[-0.02em]">{t("support.title", locale)}</h1><p className={`mt-2 text-base leading-7 ${muted}`}>{t("support.subtitle", locale)}</p></div>
        <button className="btn btn-secondary min-h-11" onClick={() => void load()} disabled={busy}><RefreshCw size={17} className={busy ? "animate-spin" : ""} />{t("support.refresh", locale)}</button>
      </header>

      {error && <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-base text-red-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-4 text-base text-emerald-300">{notice}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, Icon]) => <div key={label} className={`rounded-[14px] border p-5 ${panel}`}><Icon size={20} className="mb-6 text-emerald-400" /><div className="text-3xl font-bold tabular-nums">{value}</div><div className={`mt-1 text-sm ${muted}`}>{label}</div></div>)}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <div className={`rounded-[14px] border p-6 ${panel}`}><h2 className="text-xl font-bold">{t("support.topics", locale)}</h2><div className="mt-6 space-y-4">{topTopics.length === 0 && <p className={muted}>{t("support.noCases", locale)}</p>}{topTopics.map(([category, count]) => <div key={category}><div className="mb-2 flex justify-between gap-4 text-sm"><span>{t(`support.category.${category}`, locale)}</span><span className="tabular-nums">{count}</span></div><div className={`h-2 overflow-hidden rounded-full ${dark ? "bg-white/10" : "bg-surface-100"}`}><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(3, count / maxTopic * 100)}%` }} /></div></div>)}</div></div>
        <div className={`rounded-[14px] border p-6 ${panel}`}><div className="flex items-start gap-3"><ShieldCheck size={24} className="mt-0.5 shrink-0 text-amber-400" /><div><h2 className="text-xl font-bold">{t("support.manualBoundary", locale)}</h2><p className={`mt-3 text-base leading-7 ${muted}`}>{t("support.manualBoundaryText", locale)}</p></div></div></div>
      </section>

      <section className={`rounded-[14px] border p-6 ${panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{t("support.knowledge", locale)}</h2><p className={`mt-2 max-w-4xl text-base leading-7 ${muted}`}>{t("support.knowledgeIntro", locale)}</p></div><span className="rounded-md border border-emerald-400/30 px-3 py-1.5 text-sm text-emerald-400">{t("support.version", locale)} {data?.knowledgeVersion}</span></div>
        <div className={`mt-6 divide-y border-y ${dark ? "divide-white/10 border-white/10" : "divide-surface-200 border-surface-200"}`}>{data?.knowledge.map((entry) => <details key={entry.id}><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold"><span>{entry.title}</span><span className={`text-right text-sm font-normal ${muted}`}>{entry.categories.map((category) => t(`support.category.${category}`, locale)).join(" · ")}</span></summary><p className={`max-w-4xl pb-5 text-base leading-7 ${muted}`}>{entry.content}</p></details>)}</div>
      </section>

      <section className={`rounded-[14px] border p-6 ${panel}`}><h2 className="text-xl font-bold">{t("support.rules", locale)}</h2><p className={`mt-2 text-base ${muted}`}>{t("support.rulesIntro", locale)}</p><pre className={`mt-5 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border p-5 font-mono text-sm leading-6 ${dark ? "border-white/10 bg-[#0b0f17] text-white/80" : "border-surface-200 bg-surface-50 text-praxis-700"}`}>{data?.prompt}</pre></section>

      <section className={`rounded-[14px] border p-6 ${panel}`}>
        <h2 className="text-xl font-bold">{t("support.recent", locale)}</h2>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className={muted}><tr><th className="pb-3 pr-4">Zeit</th><th className="pb-3 pr-4">Thema</th><th className="pb-3 pr-4">Betreff</th><th className="pb-3 pr-4">Kontakt</th><th className="pb-3">Bearbeitung</th></tr></thead><tbody className={dark ? "divide-y divide-white/10" : "divide-y divide-surface-200"}>{data?.recentCases.map((item) => <tr key={item.id}><td className="py-4 pr-4 tabular-nums">{new Date(item.startedAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}</td><td className="py-4 pr-4">{t(`support.category.${item.category}`, locale)}</td><td className="max-w-[340px] truncate py-4 pr-4">{item.subject || "–"}</td><td className="py-4 pr-4">{item.sender || "–"}</td><td className="py-4"><span className={item.autoReplied ? "text-emerald-400" : "text-amber-400"}>{item.autoReplied ? t("support.auto", locale) : t("support.manual", locale)}</span></td></tr>)}</tbody></table></div>
      </section>

      <section className={`rounded-[14px] border p-6 ${panel}`}>
        <div className="flex items-start gap-3"><Sparkles size={23} className="mt-1 shrink-0 text-emerald-400" /><div><h2 className="text-xl font-bold">{t("support.learning", locale)}</h2><p className={`mt-2 max-w-4xl text-base leading-7 ${muted}`}>{t("support.learningIntro", locale)}</p><p className="mt-2 text-sm text-amber-400">{t("support.learningSafety", locale)}</p></div></div>
        <form onSubmit={saveNote} className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-semibold">{t("support.noteTopic", locale)}<select className="input mt-2 min-h-11" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category} value={category}>{t(`support.category.${category}`, locale)}</option>)}</select></label>
          <label className="text-sm font-semibold">{t("support.noteTitle", locale)}<input className="input mt-2 min-h-11" required minLength={3} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className="text-sm font-semibold lg:col-span-2">{t("support.noteContent", locale)}<textarea className="input mt-2 min-h-28 resize-y py-3" required minLength={10} maxLength={1200} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label>
          <div className="lg:col-span-2"><button className="btn btn-primary min-h-11" disabled={busy}>{t("support.noteSave", locale)}</button></div>
        </form>
        <div className="mt-8 space-y-3">{data?.learningNotes.map((note) => <article key={note.id} className={`rounded-lg border p-4 ${dark ? "border-white/10 bg-white/[0.025]" : "border-surface-200 bg-surface-50"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{note.title}</h3><span className={`rounded-md px-2 py-1 text-xs ${note.status === "reviewed" ? "bg-emerald-500/10 text-emerald-400" : note.status === "rejected" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>{t(`support.note${note.status === "reviewed" ? "Reviewed" : note.status === "rejected" ? "Rejected" : "Pending"}`, locale)}</span></div><p className={`mt-2 max-w-4xl text-sm leading-6 ${muted}`}>{note.content}</p></div>{note.status === "pending" && <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary min-h-11" onClick={() => void reviewNote(note.id, "reviewed")}><CheckCircle2 size={16} />{t("support.noteMarkReviewed", locale)}</button><button type="button" className="btn min-h-11 border border-red-400/40 text-red-400" onClick={() => void reviewNote(note.id, "rejected")}><XCircle size={16} />{t("support.noteReject", locale)}</button></div>}</div></article>)}</div>
      </section>
    </div>
  );
}
