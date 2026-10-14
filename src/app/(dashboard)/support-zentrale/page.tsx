"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BookOpenCheck, Bot, CheckCircle2, ChevronRight,
  FileSearch, Filter, FlaskConical, RefreshCw, Search, ShieldCheck, Sparkles,
  UserCheck, XCircle,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/hooks/useAppStore";

type KnowledgeEntry = {
  id: string; title: string; categories: string[]; content: string;
  kind?: "procedure" | "explanation" | "policy"; answerScope?: string;
};
type LearningNote = { id: string; category: string; title: string; content: string; status: string; created_at: string };
type RecentCase = {
  id: string; status: string; startedAt: string; category: string; subject: string;
  sender: string; manualReview: boolean; autoReplied: boolean; replyMode: string;
  knowledgeSourceIds: string[]; knowledgeVersion: string; error?: string | null;
};
type AnswerPreview = {
  id: string; subject: string; excerpt: string; category: string; autoReply: boolean;
  reason: string; reply: string | null; sources: string[];
};
type Overview = {
  knowledge: KnowledgeEntry[]; knowledgeVersion: string; prompt: string;
  stats: {
    total: number; autoReplied: number; manualReview: number; failed: number;
    categories: Record<string, number>; sourceUsage: Record<string, number>;
    automatedCoverage: number; protectedBoundaries: number;
  };
  answerPreviews: AnswerPreview[]; recentCases: RecentCase[]; learningNotes: LearningNote[];
};

type Tab = "overview" | "knowledge" | "lab" | "cases" | "learning" | "rules";
const categories = ["login_password", "invoice_access", "payment_method", "portal_setup", "medical", "billing_specific", "other"];
const automaticCategories = new Set(["login_password", "invoice_access", "payment_method", "portal_setup"]);

export default function SupportZentralePage() {
  const { locale, theme } = useAppStore();
  const [data, setData] = useState<Overview | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("password");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeCategory, setKnowledgeCategory] = useState("all");
  const [caseFilter, setCaseFilter] = useState("all");
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
      const next = await response.json() as Overview;
      setData(next);
      setSelectedKnowledgeId((current) => current || next.knowledge[0]?.id || "");
    } catch { setError(t("support.loadError", locale)); }
    finally { setBusy(false); }
  }, [locale]);

  useEffect(() => { void load(); }, [load]);

  const filteredKnowledge = useMemo(() => {
    const query = knowledgeQuery.trim().toLocaleLowerCase("de-DE");
    return (data?.knowledge ?? []).filter((entry) => {
      const categoryMatch = knowledgeCategory === "all" || entry.categories.includes(knowledgeCategory);
      const queryMatch = !query || `${entry.title} ${entry.content} ${entry.answerScope ?? ""}`.toLocaleLowerCase("de-DE").includes(query);
      return categoryMatch && queryMatch;
    });
  }, [data, knowledgeCategory, knowledgeQuery]);
  const selectedKnowledge = data?.knowledge.find((entry) => entry.id === selectedKnowledgeId) ?? filteredKnowledge[0] ?? null;
  const selectedScenario = data?.answerPreviews.find((scenario) => scenario.id === selectedScenarioId) ?? data?.answerPreviews[0] ?? null;
  const filteredCases = useMemo(() => (data?.recentCases ?? []).filter((item) => caseFilter === "all" || (caseFilter === "auto" ? item.autoReplied : item.manualReview)), [caseFilter, data]);
  const topTopics = useMemo(() => Object.entries(data?.stats.categories ?? {}).sort((a, b) => b[1] - a[1]), [data]);
  const maxTopic = Math.max(1, ...topTopics.map(([, count]) => count));

  const surface = dark ? "border-white/10 bg-[#111722] text-[#f0f3f8]" : "border-[#cbd6df] bg-white text-[#1c3044]";
  const soft = dark ? "bg-[#171e2b]" : "bg-[#f3f6f8]";
  const muted = dark ? "text-[#b0bdcd]" : "text-[#4b6076]";
  const rule = dark ? "border-white/10" : "border-[#cbd6df]";
  const selectedBg = dark ? "bg-emerald-400/[0.09]" : "bg-emerald-700/[0.08]";

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

  const tabs: Array<[Tab, string, typeof Activity, number | null]> = [
    ["overview", t("support.tab.overview", locale), Activity, null],
    ["knowledge", t("support.tab.knowledge", locale), BookOpenCheck, data?.knowledge.length ?? null],
    ["lab", t("support.tab.lab", locale), FlaskConical, data?.answerPreviews.length ?? null],
    ["cases", t("support.tab.cases", locale), FileSearch, data?.stats.manualReview ?? null],
    ["learning", t("support.tab.learning", locale), Sparkles, data?.learningNotes.length ?? null],
    ["rules", t("support.tab.rules", locale), ShieldCheck, null],
  ];

  if (!data && busy) return <SupportSkeleton dark={dark} />;

  return (
    <div className="mx-auto max-w-[1540px] pb-12">
      <header className={`border-b pb-6 ${rule}`}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <h1 className="text-[22px] font-bold tracking-[-0.02em]">{t("support.title", locale)}</h1>
            <p className={`mt-2 max-w-[72ch] text-base leading-7 ${muted}`}>{t("support.subtitleRich", locale)}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`hidden border-r pr-4 text-right md:block ${rule}`}><div className="text-sm font-semibold text-emerald-400">{t("support.systemLive", locale)}</div><div className={`mt-1 text-sm ${muted}`}>{t("support.version", locale)} {data?.knowledgeVersion}</div></div>
            <button className="btn btn-secondary min-h-11" onClick={() => void load()} disabled={busy}><RefreshCw size={17} className={busy ? "animate-spin" : ""} />{t("support.refresh", locale)}</button>
          </div>
        </div>
      </header>

      <nav className={`sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto border-b px-1 py-3 ${dark ? "border-white/10 bg-[#080b11]/95" : "border-[#cbd6df] bg-[#f7f9fb]/95"}`} aria-label={t("support.navigation", locale)}>
        {tabs.map(([id, label, Icon, count]) => <button key={id} type="button" onClick={() => setActiveTab(id)} aria-pressed={activeTab === id} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3.5 text-sm font-semibold transition-colors ${activeTab === id ? `${selectedBg} border-emerald-400/40 text-emerald-400` : `${rule} ${muted} hover:text-current`}`}><Icon size={17} /><span>{label}</span>{count !== null && <span className={`min-w-6 rounded-md px-1.5 py-0.5 text-center tabular-nums ${dark ? "bg-white/10" : "bg-slate-200"}`}>{count}</span>}</button>)}
      </nav>

      {error && <div className="mt-5 rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-base text-red-300">{error}</div>}
      {notice && <div className="mt-5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-4 text-base text-emerald-300">{notice}</div>}

      <main className="mt-6">
        {activeTab === "overview" && data && <OverviewPanel data={data} locale={locale} surface={surface} soft={soft} muted={muted} rule={rule} selectedBg={selectedBg} setActiveTab={setActiveTab} setCaseFilter={setCaseFilter} />}
        {activeTab === "knowledge" && data && <KnowledgePanel data={data} locale={locale} surface={surface} muted={muted} rule={rule} selectedBg={selectedBg} filteredKnowledge={filteredKnowledge} selectedKnowledge={selectedKnowledge} selectedKnowledgeId={selectedKnowledgeId} setSelectedKnowledgeId={setSelectedKnowledgeId} knowledgeQuery={knowledgeQuery} setKnowledgeQuery={setKnowledgeQuery} knowledgeCategory={knowledgeCategory} setKnowledgeCategory={setKnowledgeCategory} />}
        {activeTab === "lab" && data && selectedScenario && <LabPanel data={data} selectedScenario={selectedScenario} locale={locale} surface={surface} soft={soft} muted={muted} rule={rule} selectedBg={selectedBg} setSelectedScenarioId={setSelectedScenarioId} setSelectedKnowledgeId={setSelectedKnowledgeId} setActiveTab={setActiveTab} />}
        {activeTab === "cases" && data && <CasesPanel filteredCases={filteredCases} caseFilter={caseFilter} setCaseFilter={setCaseFilter} locale={locale} surface={surface} muted={muted} rule={rule} selectedBg={selectedBg} />}
        {activeTab === "learning" && data && <LearningPanel data={data} topTopics={topTopics} maxTopic={maxTopic} locale={locale} surface={surface} soft={soft} muted={muted} rule={rule} form={form} setForm={setForm} busy={busy} saveNote={saveNote} reviewNote={reviewNote} />}
        {activeTab === "rules" && data && <RulesPanel prompt={data.prompt} locale={locale} dark={dark} surface={surface} muted={muted} rule={rule} />}
      </main>
    </div>
  );
}

function OverviewPanel({ data, locale, surface, muted, rule, selectedBg, setActiveTab, setCaseFilter }: { data: Overview; locale: string; surface: string; soft: string; muted: string; rule: string; selectedBg: string; setActiveTab: (tab: Tab) => void; setCaseFilter: (filter: string) => void }) {
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.55fr)]">
    <section className={`rounded-[14px] border ${surface}`}>
      <div className={`flex flex-wrap items-start justify-between gap-4 border-b p-6 ${rule}`}><div><h2 className="text-lg font-bold">{t("support.operations", locale)}</h2><p className={`mt-1 text-base ${muted}`}>{t("support.operationsIntro", locale)}</p></div><span className={`rounded-md px-3 py-1.5 text-sm font-semibold ${data.stats.failed > 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-400/10 text-emerald-400"}`}>{data.stats.failed > 0 ? t("support.healthAttention", locale) : t("support.healthGood", locale)}</span></div>
      <div className={`grid border-b sm:grid-cols-2 lg:grid-cols-4 ${rule}`}>{[[data.stats.total, t("support.metric.requests", locale)], [data.stats.autoReplied, t("support.metric.auto", locale)], [data.stats.manualReview, t("support.metric.manual", locale)], [data.stats.failed, t("support.metric.failed", locale)]].map(([value, label], index) => <div key={String(label)} className={`p-6 ${index > 0 ? `sm:border-l ${rule}` : ""}`}><div className="text-3xl font-bold tabular-nums">{value}</div><div className={`mt-2 text-sm ${muted}`}>{label}</div></div>)}</div>
      <div className="p-6"><h3 className="text-base font-bold">{t("support.decisionMap", locale)}</h3><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm"><thead className={muted}><tr><th className="pb-3">{t("support.table.topic", locale)}</th><th className="pb-3">{t("support.table.route", locale)}</th><th className="pb-3 text-right">{t("support.table.knowledge", locale)}</th><th className="pb-3 text-right">{t("support.table.cases", locale)}</th></tr></thead><tbody className={`divide-y ${rule}`}>{categories.map((category) => { const articleCount = data.knowledge.filter((entry) => entry.categories.includes(category)).length; const automatic = automaticCategories.has(category); return <tr key={category}><td className="py-4 font-semibold">{t(`support.category.${category}`, locale)}</td><td className="py-4"><span className={automatic ? "text-emerald-400" : "text-amber-400"}>{automatic ? t("support.autoRoute", locale) : t("support.manualRoute", locale)}</span></td><td className="py-4 text-right tabular-nums">{articleCount || "–"}</td><td className="py-4 text-right tabular-nums">{data.stats.categories[category] ?? 0}</td></tr>; })}</tbody></table></div></div>
    </section>
    <aside className="space-y-6">
      <section className={`rounded-[14px] border p-6 ${surface}`}><div className="flex items-center gap-3"><ShieldCheck size={22} className="text-emerald-400" /><h2 className="text-lg font-bold">{t("support.coverage", locale)}</h2></div><dl className={`mt-5 divide-y ${rule}`}><QualityRow label={t("support.coverageArticles", locale)} value={String(data.knowledge.length)} muted={muted} /><QualityRow label={t("support.coverageAuto", locale)} value={String(data.stats.automatedCoverage)} muted={muted} /><QualityRow label={t("support.coverageProtected", locale)} value={String(data.stats.protectedBoundaries)} muted={muted} /><QualityRow label={t("support.coverageVersion", locale)} value={data.knowledgeVersion} muted={muted} /></dl><button type="button" onClick={() => setActiveTab("knowledge")} className={`mt-5 flex min-h-11 w-full items-center justify-between rounded-lg border border-emerald-400/35 px-4 font-semibold text-emerald-400 ${selectedBg}`}><span>{t("support.openLibrary", locale)}</span><ChevronRight size={18} /></button></section>
      <section className={`rounded-[14px] border p-6 ${surface}`}><div className="flex items-start gap-3"><UserCheck size={22} className="mt-0.5 shrink-0 text-amber-400" /><div><h2 className="text-lg font-bold">{t("support.humanGate", locale)}</h2><p className={`mt-2 text-base leading-7 ${muted}`}>{t("support.manualBoundaryText", locale)}</p></div></div><button type="button" onClick={() => { setCaseFilter("manual"); setActiveTab("cases"); }} className="mt-5 flex min-h-11 w-full items-center justify-between rounded-lg border border-amber-400/35 px-4 font-semibold text-amber-400"><span>{t("support.openQueue", locale)}</span><span className="tabular-nums">{data.stats.manualReview}</span></button></section>
    </aside>
  </div>;
}

function KnowledgePanel({ data, locale, surface, muted, rule, selectedBg, filteredKnowledge, selectedKnowledge, selectedKnowledgeId, setSelectedKnowledgeId, knowledgeQuery, setKnowledgeQuery, knowledgeCategory, setKnowledgeCategory }: { data: Overview; locale: string; surface: string; muted: string; rule: string; selectedBg: string; filteredKnowledge: KnowledgeEntry[]; selectedKnowledge: KnowledgeEntry | null; selectedKnowledgeId: string; setSelectedKnowledgeId: (id: string) => void; knowledgeQuery: string; setKnowledgeQuery: (value: string) => void; knowledgeCategory: string; setKnowledgeCategory: (value: string) => void }) {
  return <section className={`overflow-hidden rounded-[14px] border ${surface}`}>
    <div className={`border-b p-5 ${rule}`}><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-bold">{t("support.libraryTitle", locale)}</h2><p className={`mt-1 text-base ${muted}`}>{t("support.libraryIntro", locale, { count: String(data.knowledge.length) })}</p></div><span className={`text-sm ${muted}`}>{t("support.libraryApproved", locale)}</span></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => setKnowledgeCategory("all")} className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${knowledgeCategory === "all" ? "border-emerald-400/40 text-emerald-400 " + selectedBg : rule}`}>{t("support.allTopics", locale)}</button>{categories.slice(0, 4).map((category) => <button key={category} type="button" onClick={() => setKnowledgeCategory(category)} className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${knowledgeCategory === category ? "border-emerald-400/40 text-emerald-400 " + selectedBg : rule}`}>{t(`support.category.${category}`, locale)}</button>)}</div></div>
    <div className="grid min-h-[620px] lg:grid-cols-[360px_minmax(0,1fr)]"><div className={`border-b lg:border-b-0 lg:border-r ${rule}`}><div className={`border-b p-4 ${rule}`}><label className="relative block"><Search size={17} className={`absolute left-3 top-1/2 -translate-y-1/2 ${muted}`} /><input className="input min-h-11 pl-10" value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder={t("support.searchKnowledge", locale)} /></label></div><div className="max-h-[560px] overflow-y-auto p-2">{filteredKnowledge.map((entry) => <button key={entry.id} type="button" onClick={() => setSelectedKnowledgeId(entry.id)} className={`mb-1 w-full rounded-lg border px-4 py-3 text-left transition-colors ${selectedKnowledgeId === entry.id ? `border-emerald-400/35 ${selectedBg}` : "border-transparent hover:border-current/10"}`}><div className="font-semibold leading-6">{entry.title}</div><div className={`mt-1 text-sm ${muted}`}>{entry.categories.map((category) => t(`support.category.${category}`, locale)).join(" · ")}</div></button>)}{filteredKnowledge.length === 0 && <div className={`p-6 text-center ${muted}`}>{t("support.noKnowledgeMatch", locale)}</div>}</div></div>
      {selectedKnowledge && <article className="p-6 lg:p-8"><div className={`mb-8 border-b pb-6 ${rule}`}><div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-400" /><div><h3 className="font-semibold">{t("support.knowledgeInternalTitle", locale)}</h3><p className={`mt-1 max-w-[72ch] text-base leading-7 ${muted}`}>{t("support.knowledgeInternalText", locale)}</p></div></div></div><div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><div className="flex flex-wrap gap-2">{selectedKnowledge.categories.map((category) => <span key={category} className="rounded-md bg-emerald-400/10 px-2.5 py-1 text-sm font-semibold text-emerald-400">{t(`support.category.${category}`, locale)}</span>)}</div><h2 className="mt-4 text-[22px] font-bold tracking-[-0.02em]">{selectedKnowledge.title}</h2></div><span className={`rounded-md border px-3 py-1.5 text-sm ${rule}`}>{t(`support.kind.${selectedKnowledge.kind ?? "explanation"}`, locale)}</span></div><div className={`mt-8 border-y py-6 ${rule}`}><h3 className={`text-sm font-semibold uppercase tracking-[0.12em] ${muted}`}>{t("support.approvedFact", locale)}</h3><p className="mt-3 max-w-[72ch] text-base leading-8">{selectedKnowledge.content}</p></div><div className="mt-6 grid gap-6 md:grid-cols-2"><div><h3 className="font-semibold">{t("support.answerScope", locale)}</h3><p className={`mt-2 text-base leading-7 ${muted}`}>{selectedKnowledge.answerScope || t("support.noScope", locale)}</p></div><div><h3 className="font-semibold">{t("support.auditUsage", locale)}</h3><p className={`mt-2 text-base leading-7 ${muted}`}>{t("support.usedInReplies", locale, { count: String(data.stats.sourceUsage[selectedKnowledge.id] ?? 0) })}</p></div></div><div className={`mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5 ${rule}`}><code className={`text-sm ${muted}`}>{selectedKnowledge.id}</code><span className="flex items-center gap-2 text-sm font-semibold text-emerald-400"><CheckCircle2 size={17} />{t("support.approvedForAutomation", locale)}</span></div></article>}
    </div>
  </section>;
}

function LabPanel({ data, selectedScenario, locale, surface, soft, muted, rule, selectedBg, setSelectedScenarioId, setSelectedKnowledgeId, setActiveTab }: { data: Overview; selectedScenario: AnswerPreview; locale: string; surface: string; soft: string; muted: string; rule: string; selectedBg: string; setSelectedScenarioId: (id: string) => void; setSelectedKnowledgeId: (id: string) => void; setActiveTab: (tab: Tab) => void }) {
  return <section className={`overflow-hidden rounded-[14px] border ${surface}`}><div className={`border-b p-6 ${rule}`}><h2 className="text-lg font-bold">{t("support.labTitle", locale)}</h2><p className={`mt-1 text-base ${muted}`}>{t("support.labIntro", locale)}</p></div><div className="grid lg:grid-cols-[340px_minmax(0,1fr)]"><div className={`border-b p-3 lg:border-b-0 lg:border-r ${rule}`}>{data.answerPreviews.map((scenario) => <button key={scenario.id} type="button" onClick={() => setSelectedScenarioId(scenario.id)} className={`mb-1 w-full rounded-lg border p-4 text-left ${selectedScenario.id === scenario.id ? `border-emerald-400/35 ${selectedBg}` : "border-transparent hover:border-current/10"}`}><div className="font-semibold">{scenario.subject}</div><div className={`mt-2 flex items-center gap-2 text-sm ${scenario.autoReply ? "text-emerald-400" : "text-amber-400"}`}>{scenario.autoReply ? <Bot size={15} /> : <UserCheck size={15} />}{scenario.autoReply ? t("support.autoRoute", locale) : t("support.manualRoute", locale)}</div></button>)}</div><div className="p-6 lg:p-8"><div className={`rounded-lg border p-5 ${rule} ${soft}`}><div className={`text-sm font-semibold ${muted}`}>{t("support.sampleIncoming", locale)}</div><div className="mt-3 font-semibold">{selectedScenario.subject}</div><p className={`mt-2 text-base ${muted}`}>{selectedScenario.excerpt}</p></div><div className={`my-6 flex items-center gap-3 border-y py-4 ${rule}`}><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${selectedScenario.autoReply ? "bg-emerald-400/10 text-emerald-400" : "bg-amber-400/10 text-amber-400"}`}>{selectedScenario.autoReply ? <Bot size={19} /> : <UserCheck size={19} />}</span><div><div className="font-semibold">{selectedScenario.autoReply ? t("support.decisionAutomatic", locale) : t("support.decisionManual", locale)}</div><div className={`mt-1 text-sm ${muted}`}>{t(`support.reason.${selectedScenario.reason}`, locale)}</div></div></div>{selectedScenario.reply ? <><h3 className="font-semibold">{t("support.actualReply", locale)}</h3><div className={`mt-3 whitespace-pre-wrap rounded-lg border p-5 text-base leading-7 ${rule} ${soft}`}>{selectedScenario.reply}</div><div className="mt-5"><div className={`text-sm font-semibold ${muted}`}>{t("support.sourcesUsed", locale)}</div><div className="mt-2 flex flex-wrap gap-2">{selectedScenario.sources.slice(0, 6).map((source) => <button key={source} type="button" onClick={() => { setSelectedKnowledgeId(source); setActiveTab("knowledge"); }} className="rounded-md border border-emerald-400/30 px-2.5 py-1.5 text-sm text-emerald-400">{source}</button>)}</div></div></> : <div className="rounded-lg border border-amber-400/35 bg-amber-400/[0.06] p-5"><div className="flex items-center gap-2 font-semibold text-amber-400"><AlertTriangle size={18} />{t("support.noAutoReply", locale)}</div><p className={`mt-2 text-base leading-7 ${muted}`}>{t("support.noAutoReplyText", locale)}</p></div>}</div></div></section>;
}

function CasesPanel({ filteredCases, caseFilter, setCaseFilter, locale, surface, muted, rule, selectedBg }: { filteredCases: RecentCase[]; caseFilter: string; setCaseFilter: (value: string) => void; locale: string; surface: string; muted: string; rule: string; selectedBg: string }) {
  return <section className={`rounded-[14px] border ${surface}`}><div className={`flex flex-wrap items-end justify-between gap-4 border-b p-6 ${rule}`}><div><h2 className="text-lg font-bold">{t("support.caseTitle", locale)}</h2><p className={`mt-1 text-base ${muted}`}>{t("support.caseIntro", locale)}</p></div><div className="flex gap-2"><Filter size={18} className={`mt-3 ${muted}`} />{["all", "manual", "auto"].map((filter) => <button key={filter} type="button" onClick={() => setCaseFilter(filter)} className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${caseFilter === filter ? `border-emerald-400/40 text-emerald-400 ${selectedBg}` : rule}`}>{t(`support.caseFilter.${filter}`, locale)}</button>)}</div></div><div className="overflow-x-auto p-6"><table className="w-full min-w-[900px] text-left text-sm"><thead className={muted}><tr><th className="pb-3">{t("support.table.time", locale)}</th><th className="pb-3">{t("support.table.topic", locale)}</th><th className="pb-3">{t("support.table.subject", locale)}</th><th className="pb-3">{t("support.table.contact", locale)}</th><th className="pb-3">{t("support.table.route", locale)}</th><th className="pb-3">{t("support.table.evidence", locale)}</th></tr></thead><tbody className={`divide-y ${rule}`}>{filteredCases.map((item) => <tr key={item.id}><td className="py-4 pr-4 tabular-nums">{new Date(item.startedAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}</td><td className="py-4 pr-4 font-semibold">{t(`support.category.${item.category}`, locale)}</td><td className="max-w-[300px] truncate py-4 pr-4">{item.subject || "–"}</td><td className="py-4 pr-4">{item.sender || "–"}</td><td className={`py-4 pr-4 font-semibold ${item.autoReplied ? "text-emerald-400" : "text-amber-400"}`}>{item.autoReplied ? t("support.auto", locale) : t("support.manual", locale)}</td><td className="py-4 tabular-nums">{item.knowledgeSourceIds.length || "–"}</td></tr>)}</tbody></table>{filteredCases.length === 0 && <div className={`py-16 text-center ${muted}`}>{t("support.noCasesForFilter", locale)}</div>}</div></section>;
}

function LearningPanel({ data, topTopics, maxTopic, locale, surface, soft, muted, rule, form, setForm, busy, saveNote, reviewNote }: { data: Overview; topTopics: [string, number][]; maxTopic: number; locale: string; surface: string; soft: string; muted: string; rule: string; form: { category: string; title: string; content: string }; setForm: (value: { category: string; title: string; content: string }) => void; busy: boolean; saveNote: (event: React.FormEvent) => Promise<void>; reviewNote: (id: string, status: "reviewed" | "rejected") => Promise<void> }) {
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]"><section className={`rounded-[14px] border p-6 ${surface}`}><h2 className="text-lg font-bold">{t("support.patternTitle", locale)}</h2><p className={`mt-1 text-base ${muted}`}>{t("support.patternIntro", locale)}</p><div className="mt-7 space-y-5">{topTopics.map(([category, count]) => <div key={category}><div className="mb-2 flex justify-between gap-4 text-sm"><span className="font-semibold">{t(`support.category.${category}`, locale)}</span><span className="tabular-nums">{count}</span></div><div className={`h-2 overflow-hidden rounded-full ${soft}`}><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(3, count / maxTopic * 100)}%` }} /></div></div>)}</div></section><section className={`rounded-[14px] border p-6 ${surface}`}><div className="flex items-start gap-3"><Sparkles size={22} className="mt-0.5 shrink-0 text-emerald-400" /><div><h2 className="text-lg font-bold">{t("support.learning", locale)}</h2><p className={`mt-2 text-base leading-7 ${muted}`}>{t("support.learningIntro", locale)}</p><p className="mt-2 text-sm text-amber-400">{t("support.learningSafety", locale)}</p></div></div><form onSubmit={saveNote} className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">{t("support.noteTopic", locale)}<select className="input mt-2 min-h-11" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category} value={category}>{t(`support.category.${category}`, locale)}</option>)}</select></label><label className="text-sm font-semibold">{t("support.noteTitle", locale)}<input className="input mt-2 min-h-11" required minLength={3} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="text-sm font-semibold md:col-span-2">{t("support.noteContent", locale)}<textarea className="input mt-2 min-h-32 resize-y py-3" required minLength={10} maxLength={1200} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label><div className="md:col-span-2"><button className="btn btn-primary min-h-11" disabled={busy}>{t("support.noteSave", locale)}</button></div></form></section><section className={`rounded-[14px] border xl:col-span-2 ${surface}`}><div className={`border-b p-6 ${rule}`}><h2 className="text-lg font-bold">{t("support.learningQueue", locale)}</h2></div><div className={`divide-y ${rule}`}>{data.learningNotes.length === 0 && <div className={`p-10 text-center ${muted}`}>{t("support.noLearningNotes", locale)}</div>}{data.learningNotes.map((note) => <article key={note.id} className="flex flex-wrap items-start justify-between gap-4 p-5"><div className="max-w-4xl"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{note.title}</h3><span className={`rounded-md px-2 py-1 text-xs ${note.status === "reviewed" ? "bg-emerald-500/10 text-emerald-400" : note.status === "rejected" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>{t(`support.note${note.status === "reviewed" ? "Reviewed" : note.status === "rejected" ? "Rejected" : "Pending"}`, locale)}</span></div><p className={`mt-2 text-base leading-7 ${muted}`}>{note.content}</p></div>{note.status === "pending" && <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary min-h-11" onClick={() => void reviewNote(note.id, "reviewed")}><CheckCircle2 size={16} />{t("support.noteMarkReviewed", locale)}</button><button type="button" className="btn min-h-11 border border-red-400/40 text-red-400" onClick={() => void reviewNote(note.id, "rejected")}><XCircle size={16} />{t("support.noteReject", locale)}</button></div>}</article>)}</div></section></div>;
}

function RulesPanel({ prompt, locale, dark, surface, muted, rule }: { prompt: string; locale: string; dark: boolean; surface: string; muted: string; rule: string }) {
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)]"><section className={`rounded-[14px] border p-6 ${surface}`}><h2 className="text-lg font-bold">{t("support.guardrails", locale)}</h2><div className={`mt-5 divide-y ${rule}`}><RuleRow icon={CheckCircle2} color="text-emerald-400" title={t("support.rule.grounded", locale)} text={t("support.rule.groundedText", locale)} muted={muted} /><RuleRow icon={ShieldCheck} color="text-emerald-400" title={t("support.rule.noSecrets", locale)} text={t("support.rule.noSecretsText", locale)} muted={muted} /><RuleRow icon={UserCheck} color="text-amber-400" title={t("support.rule.human", locale)} text={t("support.rule.humanText", locale)} muted={muted} /><RuleRow icon={AlertTriangle} color="text-red-400" title={t("support.rule.noMedical", locale)} text={t("support.rule.noMedicalText", locale)} muted={muted} /></div></section><section className={`rounded-[14px] border p-6 ${surface}`}><h2 className="text-lg font-bold">{t("support.rules", locale)}</h2><p className={`mt-2 text-base ${muted}`}>{t("support.rulesIntro", locale)}</p><pre className={`mt-5 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-lg border p-5 font-mono text-sm leading-6 ${dark ? "border-white/10 bg-[#090d14] text-white/80" : "border-[#cbd6df] bg-[#f3f6f8] text-[#1c3044]"}`}>{prompt}</pre></section></div>;
}

function QualityRow({ label, value, muted }: { label: string; value: string; muted: string }) { return <div className="flex items-center justify-between gap-4 py-3"><dt className={muted}>{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>; }
function RuleRow({ icon: Icon, color, title, text, muted }: { icon: typeof ShieldCheck; color: string; title: string; text: string; muted: string }) { return <div className="flex gap-3 py-4"><Icon size={20} className={`mt-0.5 shrink-0 ${color}`} /><div><h3 className="font-semibold">{title}</h3><p className={`mt-1 text-base leading-7 ${muted}`}>{text}</p></div></div>; }
function SupportSkeleton({ dark }: { dark: boolean }) { return <div className="mx-auto max-w-[1540px] animate-pulse space-y-5"><div className={`h-20 rounded-[14px] ${dark ? "bg-white/[0.06]" : "bg-slate-200"}`} /><div className={`h-12 rounded-[14px] ${dark ? "bg-white/[0.06]" : "bg-slate-200"}`} /><div className={`h-[560px] rounded-[14px] ${dark ? "bg-white/[0.06]" : "bg-slate-200"}`} /></div>; }
