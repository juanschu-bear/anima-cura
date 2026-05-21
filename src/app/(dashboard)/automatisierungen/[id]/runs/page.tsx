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

interface Props {
  params: { id: string };
}

export default function WorkflowRunsPage({ params }: Props) {
  const { locale } = useAppStore();
  const isGerman = locale === "de";

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
          <Link href="/automatisierungen" className="wf-iconbtn" aria-label="Zurück">
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ac-text-mute)" }}>
              {isGerman ? "Verlauf" : "History"}
            </p>
            <h1 className="text-[26px] font-extrabold tracking-tight" style={{ color: "var(--ac-text)" }}>
              {workflow?.name || (loading ? "…" : isGerman ? "Workflow nicht gefunden" : "Workflow not found")}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="wf-iconbtn" title="Neu laden">
            <RefreshCw size={15} />
          </button>
          <Link href={`/automatisierungen?open=${params.id}`} className="wf-primary-btn">
            <PlayCircle size={14} /> {isGerman ? "Editor öffnen" : "Open editor"}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RunStat icon={Activity} label={isGerman ? "Läufe gesamt" : "Total runs"} value={String(stats.total)} accent="var(--ac-primary)" />
        <RunStat icon={CheckCircle2} label={isGerman ? "Erfolg" : "Success"} value={String(stats.ok)} accent="#5f9339" />
        <RunStat icon={XCircle} label={isGerman ? "Fehler" : "Errors"} value={String(stats.failed)} accent="#cb4f56" />
        <RunStat icon={Clock3} label={isGerman ? "Ø Laufzeit" : "Avg time"} value={stats.avgMs > 0 ? `${stats.avgMs} ms` : "—"} accent="#6b7d99" />
      </div>

      <div className="wf-tab-bar">
        <button
          className={`wf-tab ${tab === "runs" ? "wf-tab-active" : ""}`}
          onClick={() => setTab("runs")}
        >
          <Activity size={14} /> {isGerman ? "Läufe" : "Runs"}
          <span className="wf-tab-count">{runs.length}</span>
        </button>
        <button
          className={`wf-tab ${tab === "patients" ? "wf-tab-active" : ""}`}
          onClick={() => setTab("patients")}
        >
          <Users size={14} /> {isGerman ? "Patienten im Workflow" : "Patients"}
          <span className="wf-tab-count">{states.length}</span>
        </button>
      </div>

      {tab === "runs" && (
        <>
          <div className="wf-list-toolbar">
            <div className="wf-search">
              <Search size={14} />
              <input
                placeholder={isGerman ? "Trigger oder Fehler suchen …" : "Search trigger or error …"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
            <div className="wf-run-list">
              {loading && <p className="wf-empty-inline">{isGerman ? "Lade …" : "Loading …"}</p>}
              {!loading && filteredRuns.length === 0 && (
                <div className="wf-empty">
                  <Activity size={20} style={{ color: "var(--ac-primary)" }} />
                  <h3>{isGerman ? "Noch keine Läufe" : "No runs yet"}</h3>
                  <p>
                    {isGerman
                      ? "Sobald der Workflow aktiviert ist und ein Trigger feuert, erscheinen die Läufe hier in Echtzeit."
                      : "When the workflow is active and a trigger fires, runs appear here in real time."}
                  </p>
                </div>
              )}
              {filteredRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`wf-run-row ${selectedRunId === run.id ? "wf-run-row-selected" : ""}`}
                  type="button"
                >
                  <StatusBadge status={run.status} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="wf-run-trigger">{run.trigger_kind}</span>
                      {run.is_test && (
                        <span className="wf-meta-chip" style={{ color: "var(--ac-warning)" }}>
                          <Beaker size={11} /> Dry-Run
                        </span>
                      )}
                    </div>
                    <p className="wf-run-time">
                      {new Date(run.started_at).toLocaleString(isGerman ? "de-DE" : "en-GB")}
                      {run.duration_ms ? ` · ${run.duration_ms} ms` : ""}
                    </p>
                  </div>
                  <span className="wf-run-steps">
                    {run.steps?.length || 0} {isGerman ? "Schritte" : "steps"}
                  </span>
                </button>
              ))}
            </div>

            <aside className="wf-run-detail">
              {!selectedRun && (
                <div className="wf-empty-inline" style={{ padding: "24px" }}>
                  {isGerman ? "Lauf auswählen für Details" : "Select a run for details"}
                </div>
              )}
              {selectedRun && (
                <>
                  <header className="wf-run-detail-head">
                    <StatusBadge status={selectedRun.status} large />
                    <div>
                      <p className="wf-run-detail-kicker">
                        {new Date(selectedRun.started_at).toLocaleString(isGerman ? "de-DE" : "en-GB")}
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
                            <StatusBadge status={s.status} mini />
                          </div>
                          {s.error && <p className="wf-run-step-error">{s.error}</p>}
                          {s.output && (
                            <pre className="wf-run-step-output">{JSON.stringify(s.output, null, 2)}</pre>
                          )}
                        </div>
                      </div>
                    ))}
                    {(!selectedRun.steps || selectedRun.steps.length === 0) && (
                      <p className="wf-empty-inline">{isGerman ? "Keine Schrittdetails" : "No step details"}</p>
                    )}
                  </div>
                  {selectedRun.error && (
                    <div className="wf-persist-error" style={{ margin: 14 }}>
                      <XCircle size={14} />
                      <div>
                        <strong>{isGerman ? "Fehler" : "Error"}</strong>
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
          {loading && <p className="wf-empty-inline">{isGerman ? "Lade …" : "Loading …"}</p>}
          {!loading && states.length === 0 && (
            <div className="wf-empty">
              <Users size={20} style={{ color: "var(--ac-primary)" }} />
              <h3>{isGerman ? "Niemand im Workflow" : "No patients in workflow"}</h3>
              <p>
                {isGerman
                  ? "Sobald ein Trigger einen Patienten aufnimmt, siehst du hier seinen aktuellen Schritt."
                  : "When a trigger picks up a patient, you'll see their current step here."}
              </p>
            </div>
          )}
          {states.map((s) => (
            <div key={s.id} className="wf-run-row">
              <PatientStateDot state={s.state} />
              <div className="flex-1 min-w-0 text-left">
                <p className="wf-run-trigger">Patient {s.patient_id.slice(0, 8)}…</p>
                <p className="wf-run-time">
                  {isGerman ? "Im Workflow seit" : "In workflow since"}{" "}
                  {new Date(s.entered_at).toLocaleString(isGerman ? "de-DE" : "en-GB")}
                  {s.next_action_at &&
                    ` · ${isGerman ? "nächste Aktion" : "next"} ${new Date(s.next_action_at).toLocaleString(
                      isGerman ? "de-DE" : "en-GB"
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

function StatusBadge({ status, large, mini }: { status: string; large?: boolean; mini?: boolean }) {
  const map: Record<string, { color: string; bg: string; label: string; Icon: any }> = {
    success: { color: "#5f9339", bg: "color-mix(in srgb, #5f9339 14%, transparent)", label: "Erfolg", Icon: CheckCircle2 },
    failed: { color: "#cb4f56", bg: "color-mix(in srgb, #cb4f56 14%, transparent)", label: "Fehler", Icon: XCircle },
    skipped: { color: "#6b7d99", bg: "color-mix(in srgb, #6b7d99 14%, transparent)", label: "Übersprungen", Icon: CircleDashed },
    running: { color: "#c8942d", bg: "color-mix(in srgb, #c8942d 14%, transparent)", label: "Läuft", Icon: PlayCircle },
    dry_run: { color: "#7a52d6", bg: "color-mix(in srgb, #7a52d6 14%, transparent)", label: "Dry-Run", Icon: Beaker },
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
