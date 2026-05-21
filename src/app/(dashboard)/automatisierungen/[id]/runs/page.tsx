"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Activity,
  CheckCircle2,
  XCircle,
  CircleDashed,
  PlayCircle,
  Users,
  Search,
  RefreshCw,
  Beaker,
  Clock3,
} from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { readRuns, readWorkflows, readPatientStates } from "@/components/workflows/storage";
import type {
  Workflow,
  WorkflowRun,
  WorkflowPatientState,
} from "@/components/workflows/types";
import { t } from "@/lib/i18n";

interface Props {
  params: { id: string };
}

export default function WorkflowRunsPage({ params }: Props) {
  const { locale } = useAppStore();

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [states, setStates] = useState<WorkflowPatientState[]>([]);
  const [tab, setTab] = useState<"runs" | "patients">("runs");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [all, r, s] = await Promise.all([
      readWorkflows(),
      readRuns(params.id, 100),
      readPatientStates(params.id),
    ]);
    setWorkflow((all || []).find((w) => w.id === params.id) || null);
    setRuns(r);
    setStates(s);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, [params.id]);

  const stats = useMemo(() => {
    const total = runs.length;
    const ok = runs.filter((r) => r.status === "success").length;
    const failed = runs.filter((r) => r.status === "failed").length;
    const skipped = runs.filter((r) => r.status === "skipped").length;
    const avgMs =
      runs.filter((r) => r.duration_ms).reduce((s, r) => s + (r.duration_ms || 0), 0) /
      Math.max(1, runs.filter((r) => r.duration_ms).length);
    return { total, ok, failed, skipped, avgMs: Math.round(avgMs) };
  }, [runs]);

  const filteredRuns = runs.filter((r) =>
    search.trim() === ""
      ? true
      : (r.trigger_kind || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.error || "").toLowerCase().includes(search.toLowerCase())
  );

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) || null,
    [runs, selectedRunId]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/automatisierungen" className="wf-iconbtn" aria-label={t("common.back", locale)}>
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ac-text-mute)" }}>
              {t("common.history", locale)}
            </p>
            <h1 className="text-[26px] font-extrabold tracking-tight" style={{ color: "var(--ac-text)" }}>
              {workflow?.name || (loading ? "…" : t("workflow.notFound", locale))}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="wf-iconbtn" title={t("common.refresh", locale)}>
            <RefreshCw size={15} />
          </button>
          <Link href={`/automatisierungen?open=${params.id}`} className="wf-primary-btn">
            <PlayCircle size={14} /> {t("workflow.openEditor", locale)}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RunStat icon={Activity} label={t("workflow.totalRuns", locale)} value={String(stats.total)} accent="var(--ac-primary)" />
        <RunStat icon={CheckCircle2} label={t("common.success", locale)} value={String(stats.ok)} accent="#5f9339" />
        <RunStat icon={XCircle} label={t("common.error", locale)} value={String(stats.failed)} accent="#cb4f56" />
        <RunStat icon={Clock3} label={t("workflow.avgTime", locale)} value={stats.avgMs > 0 ? `${stats.avgMs} ms` : "—"} accent="#6b7d99" />
      </div>

      <div className="wf-tab-bar">
        <button
          className={`wf-tab ${tab === "runs" ? "wf-tab-active" : ""}`}
          onClick={() => setTab("runs")}
        >
          <Activity size={14} /> {t("common.runs", locale)}
          <span className="wf-tab-count">{runs.length}</span>
        </button>
        <button
          className={`wf-tab ${tab === "patients" ? "wf-tab-active" : ""}`}
          onClick={() => setTab("patients")}
        >
          <Users size={14} /> {t("workflow.patientsInWorkflow", locale)}
          <span className="wf-tab-count">{states.length}</span>
        </button>
      </div>

      {tab === "runs" && (
        <>
          <div className="wf-list-toolbar">
            <div className="wf-search">
              <Search size={14} />
              <input
                placeholder={t("workflow.searchTriggerError", locale)}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
            <div className="wf-run-list">
              {loading && <p className="wf-empty-inline">{t("common.loading", locale)}</p>}
              {!loading && filteredRuns.length === 0 && (
                <div className="wf-empty">
                  <Activity size={20} style={{ color: "var(--ac-primary)" }} />
                  <h3>{t("workflow.noRuns", locale)}</h3>
                  <p>{t("workflow.noRunsDesc", locale)}</p>
                </div>
              )}
              {filteredRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`wf-run-row ${selectedRunId === run.id ? "wf-run-row-selected" : ""}`}
                  type="button"
                >
                  <StatusBadge status={run.status} locale={locale} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="wf-run-trigger">{run.trigger_kind}</span>
                      {run.is_test && (
                        <span className="wf-meta-chip" style={{ color: "var(--ac-warning)" }}>
                          <Beaker size={11} /> {t("workflow.dryRun", locale)}
                        </span>
                      )}
                    </div>
                    <p className="wf-run-time">
                      {new Date(run.started_at).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}
                      {run.duration_ms ? ` · ${run.duration_ms} ms` : ""}
                    </p>
                  </div>
                  <span className="wf-run-steps">
                    {run.steps?.length || 0} {t("common.steps", locale)}
                  </span>
                </button>
              ))}
            </div>

            <aside className="wf-run-detail">
              {!selectedRun && (
                <div className="wf-empty-inline" style={{ padding: "24px" }}>
                  {t("workflow.selectRun", locale)}
                </div>
              )}
              {selectedRun && (
                <>
                  <header className="wf-run-detail-head">
                    <StatusBadge status={selectedRun.status} large locale={locale} />
                    <div>
                      <p className="wf-run-detail-kicker">
                        {new Date(selectedRun.started_at).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}
                      </p>
                      <h3 className="wf-run-detail-title">{selectedRun.trigger_kind}</h3>
                    </div>
                  </header>
                  <div className="wf-run-steps-list">
                    {(selectedRun.steps || []).map((s, idx) => (
                      <div key={idx} className="wf-run-step">
                        <span className="wf-run-step-idx">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="wf-run-step-kind">{s.kind}</span>
                            <StatusBadge status={s.status} mini locale={locale} />
                          </div>
                          {s.error && <p className="wf-run-step-error">{s.error}</p>}
                          {s.output && (
                            <pre className="wf-run-step-output">{JSON.stringify(s.output, null, 2)}</pre>
                          )}
                        </div>
                      </div>
                    ))}
                    {(!selectedRun.steps || selectedRun.steps.length === 0) && (
                      <p className="wf-empty-inline">{t("workflow.noStepDetails", locale)}</p>
                    )}
                  </div>
                  {selectedRun.error && (
                    <div className="wf-persist-error" style={{ margin: 14 }}>
                      <XCircle size={14} />
                      <div>
                        <strong>{t("common.error", locale)}</strong>
                        <span>{selectedRun.error}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
        </>
      )}

      {tab === "patients" && (
        <div className="wf-run-list">
          {loading && <p className="wf-empty-inline">{t("common.loading", locale)}</p>}
          {!loading && states.length === 0 && (
            <div className="wf-empty">
              <Users size={20} style={{ color: "var(--ac-primary)" }} />
              <h3>{t("workflow.noPatients", locale)}</h3>
              <p>{t("workflow.noPatientsDesc", locale)}</p>
            </div>
          )}
          {states.map((s) => (
            <div key={s.id} className="wf-run-row">
              <PatientStateDot state={s.state} />
              <div className="flex-1 min-w-0 text-left">
                <p className="wf-run-trigger">{t("workflow.patientPrefix", locale)} {s.patient_id.slice(0, 8)}…</p>
                <p className="wf-run-time">
                  {t("workflow.inWorkflowSince", locale)}{" "}
                  {new Date(s.entered_at).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}
                  {s.next_action_at &&
                    ` · ${t("workflow.nextAction", locale)} ${new Date(s.next_action_at).toLocaleString(
                      locale === "en" ? "en-GB" : "de-DE"
                    )}`}
                </p>
              </div>
              <span className="wf-meta-chip">{s.state}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RunStat({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="wf-kpi">
      <div className="wf-kpi-icon" style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}>
        <Icon size={15} strokeWidth={2.4} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="wf-kpi-label">{label}</p>
        <p className="wf-kpi-value" style={{ fontSize: 22 }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status, large, mini, locale = "de" }: { status: string; large?: boolean; mini?: boolean; locale?: string }) {
  const map: Record<string, { color: string; bg: string; label: string; Icon: any }> = {
    success: { color: "#5f9339", bg: "color-mix(in srgb, #5f9339 14%, transparent)", label: t("workflow.runStatus.success", locale), Icon: CheckCircle2 },
    failed: { color: "#cb4f56", bg: "color-mix(in srgb, #cb4f56 14%, transparent)", label: t("workflow.runStatus.failed", locale), Icon: XCircle },
    skipped: { color: "#6b7d99", bg: "color-mix(in srgb, #6b7d99 14%, transparent)", label: t("workflow.runStatus.skipped", locale), Icon: CircleDashed },
    running: { color: "#c8942d", bg: "color-mix(in srgb, #c8942d 14%, transparent)", label: t("workflow.runStatus.running", locale), Icon: PlayCircle },
    dry_run: { color: "#7a52d6", bg: "color-mix(in srgb, #7a52d6 14%, transparent)", label: t("workflow.runStatus.dryRun", locale), Icon: Beaker },
  };
  const cfg = map[status] || map.skipped;
  const Icon = cfg.Icon;
  const size = mini ? 22 : large ? 40 : 30;
  return (
    <span
      className="wf-status-badge"
      style={{ width: size, height: size, background: cfg.bg, color: cfg.color }}
      title={cfg.label}
    >
      <Icon size={mini ? 11 : large ? 18 : 14} strokeWidth={2.4} />
    </span>
  );
}

function PatientStateDot({ state }: { state: string }) {
  const map: Record<string, string> = {
    active: "#5f9339",
    waiting: "#c8942d",
    completed: "#6b7d99",
    exited: "#9caac0",
    failed: "#cb4f56",
  };
  return (
    <span
      className="wf-status-badge"
      style={{ width: 30, height: 30, background: `color-mix(in srgb, ${map[state] || "#9caac0"} 16%, transparent)`, color: map[state] }}
    >
      <Users size={14} strokeWidth={2.4} />
    </span>
  );
}
