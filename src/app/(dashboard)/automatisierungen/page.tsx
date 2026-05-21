"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Zap,
  Activity,
  AlertOctagon,
  Save,
  ChevronLeft,
  Sparkles,
  Search,
  MoreHorizontal,
  CircleDot,
  Trash2,
  Copy,
  Power,
  History,
  Beaker,
} from "lucide-react";
import Link from "next/link";
import { useAppStore } from "@/hooks/useAppStore";
import { createBrowserClient } from "@/lib/db/supabase";
import { WorkflowCanvas } from "@/components/workflows/WorkflowCanvas";
import { WorkflowTemplatePicker } from "@/components/workflows/WorkflowTemplates";
import { pushVersion } from "@/components/workflows/storage";
import { TestRunDialog } from "@/components/workflows/TestRunDialog";
import { VersionHistoryDrawer } from "@/components/workflows/VersionHistoryDrawer";
import type { Workflow, WorkflowEdge, WorkflowNode } from "@/components/workflows/types";
import { t } from "@/lib/i18n";

const SETTING_KEY = "workflows";

function nid() {
  return Math.random().toString(36).slice(2, 10);
}

const SEED: Workflow[] = [
  {
    id: nid(),
    name: "Zahlungserinnerung — 6 Tage",
    description: "Freundliche E-Mail wenn Rate 6 Tage überfällig ist",
    active: true,
    updatedAt: new Date().toISOString(),
    runsToday: 4,
    errors: 0,
    nodes: [
      { id: "t", type: "trigger", position: { x: 40, y: 220 }, data: { event: "rate_overdue", days: 6 } },
      { id: "c", type: "condition", position: { x: 380, y: 220 }, data: { field: "email_vorhanden", operator: "is_true" } },
      { id: "e", type: "action_email", position: { x: 740, y: 160 }, data: {
        recipient: "patient",
        subject: "Erinnerung: Offene Rate {{rate_nummer}}",
        body: "Sehr geehrte/r {{patient_name}},\n\nwir möchten Sie freundlich daran erinnern, dass die Rate Nr. {{rate_nummer}} über {{betrag}}€ seit dem {{faellig_am}} offen ist.\n\nMit freundlichen Grüßen\n{{praxis_name}}",
      } },
    ],
    edges: [
      { id: "e1", source: "t", target: "c", type: "smoothstep", animated: true },
      { id: "e2", source: "c", sourceHandle: "true", target: "e", type: "smoothstep", animated: true },
    ],
  },
  {
    id: nid(),
    name: "Rücklastschrift-Alert",
    description: "Eskalation bei zurückgegebener Lastschrift",
    active: false,
    updatedAt: new Date().toISOString(),
    runsToday: 0,
    errors: 0,
    nodes: [
      { id: "t", type: "trigger", position: { x: 40, y: 220 }, data: { event: "rate_returned" } },
      { id: "a", type: "action_alert", position: { x: 380, y: 220 }, data: { severity: "critical", recipient: "praxisleitung", message: "Rücklastschrift bei {{patient_name}}" } },
    ],
    edges: [{ id: "e1", source: "t", target: "a", type: "smoothstep", animated: true }],
  },
];

export default function AutomatisierungenPage() {
  const { theme, locale } = useAppStore();
  const isDark = theme === "dark";

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [search, setSearch] = useState("");
  const [saveHint, setSaveHint] = useState<string>("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data, error } = await supabase
          .from("einstellungen")
          .select("value")
          .eq("key", SETTING_KEY)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error("[workflows] read failed", error);
        }
        if (data?.value && Array.isArray(data.value) && data.value.length > 0) {
          setWorkflows(data.value as Workflow[]);
        } else {
          setWorkflows(SEED);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[workflows] read threw", err);
          setWorkflows(SEED);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data } = await supabase
          .from("patienten")
          .select("id, vorname, nachname, email, kasse")
          .limit(50);
        if (data) setPatients(data);
      } catch {
        // ignore
      }
    })();
  }, []);

  async function persist(next: Workflow[]) {
    if (!loaded) return;
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase
        .from("einstellungen")
        .upsert({ key: SETTING_KEY, value: next }, { onConflict: "key" });
      if (error) {
        console.error("[workflows] persist failed", error);
        setPersistError(error.message || t("workflow.persistError", locale));
      } else {
        setPersistError(null);
      }
    } catch (err: any) {
      console.error("[workflows] persist threw", err);
      setPersistError(err?.message || t("workflow.persistError", locale));
    }
  }

  function updateWorkflow(id: string, patch: Partial<Workflow>) {
    setWorkflows((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w));
      persist(next);
      return next;
    });
  }

  function addWorkflow(w: Workflow) {
    setWorkflows((prev) => {
      const next = [w, ...prev];
      persist(next);
      return next;
    });
    setShowTemplates(false);
    setEditingId(w.id);
  }

  function deleteWorkflow(id: string) {
    setWorkflows((prev) => {
      const next = prev.filter((w) => w.id !== id);
      persist(next);
      return next;
    });
    setMenuOpenId(null);
  }

  function duplicateWorkflow(id: string) {
    const src = workflows.find((w) => w.id === id);
    if (!src) return;
    const copy: Workflow = {
      ...src,
      id: nid(),
      name: `${src.name} (Kopie)`,
      active: false,
      updatedAt: new Date().toISOString(),
    };
    setWorkflows((prev) => {
      const next = [copy, ...prev];
      persist(next);
      return next;
    });
    setMenuOpenId(null);
  }

  function handleCanvasChange(id: string, nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    updateWorkflow(id, { nodes, edges });
  }

  async function saveAndClose() {
    if (editing) {
      await pushVersion(editing.id, editing, t("workflow.manualSave", locale));
    }
    setSaveHint(t("workflow.saved", locale));
    setTimeout(() => setSaveHint(""), 1800);
    setEditingId(null);
  }

  function restoreVersion(snapshot: Workflow) {
    if (!editing) return;
    updateWorkflow(editing.id, {
      nodes: snapshot.nodes || [],
      edges: snapshot.edges || [],
      name: snapshot.name || editing.name,
      description: snapshot.description,
    });
    setSaveHint(t("workflow.versionRestored", locale));
    setTimeout(() => setSaveHint(""), 1800);
  }

  const editing = useMemo(() => workflows.find((w) => w.id === editingId) || null, [workflows, editingId]);

  const activeCount = workflows.filter((w) => w.active).length;
  const runsToday = workflows.reduce((s, w) => s + (w.runsToday || 0), 0);
  const errorsToday = workflows.reduce((s, w) => s + (w.errors || 0), 0);

  const filtered = workflows.filter((w) =>
    search.trim() === ""
      ? true
      : w.name.toLowerCase().includes(search.toLowerCase()) ||
        (w.description || "").toLowerCase().includes(search.toLowerCase())
  );

  if (editing) {
    return (
      <div className="wf-editor-shell">
        <div className="wf-editor-topbar">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={saveAndClose} className="wf-iconbtn" aria-label={t("common.back", locale)}>
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <input
                value={editing.name}
                onChange={(e) => updateWorkflow(editing.id, { name: e.target.value })}
                className="wf-title-input"
                placeholder={t("workflow.namePlaceholder", locale)}
              />
              <input
                value={editing.description || ""}
                onChange={(e) => updateWorkflow(editing.id, { description: e.target.value })}
                className="wf-subtitle-input"
                placeholder={t("workflow.descPlaceholder", locale)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowTest(true)}
              className="wf-secondary-btn"
              title={t("workflow.startTestRun", locale)}
            >
              <Beaker size={14} /> {t("workflow.test", locale)}
            </button>
            <Link
              href={`/automatisierungen/${editing.id}/runs`}
              className="wf-secondary-btn"
              title={t("workflow.viewHistory", locale)}
            >
              <Activity size={14} /> {t("common.history", locale)}
            </Link>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="wf-secondary-btn"
              title={t("workflow.versionHistory", locale)}
            >
              <History size={14} /> {t("common.versions", locale)}
            </button>

            <span className="wf-topbar-divider" />

            <button
              type="button"
              onClick={() => updateWorkflow(editing.id, { active: !editing.active })}
              className={`wf-toggle ${editing.active ? "wf-toggle-on" : ""}`}
              aria-pressed={editing.active}
            >
              <span className="wf-toggle-dot" />
              <span className="wf-toggle-label">
                {editing.active ? (
                  <>
                    <span className="wf-pulse" /> {t("common.active", locale)}
                  </>
                ) : (
                  t("common.inactive", locale)
                )}
              </span>
            </button>

            <button onClick={saveAndClose} className="wf-primary-btn">
              <Save size={14} /> {t("common.save", locale)}
            </button>
          </div>
        </div>

        {saveHint && <div className="wf-toast">{saveHint}</div>}

        <WorkflowCanvas
          key={editing.id}
          workflowId={editing.id}
          initialNodes={editing.nodes}
          initialEdges={editing.edges}
          onChange={(n, e) => handleCanvasChange(editing.id, n, e)}
          isDark={isDark}
        />

        {showTest && (
          <TestRunDialog
            workflow={editing}
            patients={patients}
            onClose={() => setShowTest(false)}
          />
        )}
        {showHistory && (
          <VersionHistoryDrawer
            workflow={editing}
            onClose={() => setShowHistory(false)}
            onRestore={restoreVersion}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-extrabold tracking-tight" style={{ color: "var(--ac-text)" }}>
            {t("workflow.title", locale)}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--ac-text-soft)" }}>
            {t("workflow.subtitle", locale)}
          </p>
        </div>
        <button onClick={() => setShowTemplates(true)} className="wf-primary-btn wf-primary-btn-lg">
          <Plus size={16} /> {t("workflow.new", locale)}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard icon={Zap} label={t("workflow.activeCount", locale)} value={String(activeCount)} hint={`${workflows.length} ${t("workflow.totalCount", locale)}`} accent="var(--ac-primary)" />
        <KpiCard icon={Activity} label={t("workflow.runsToday", locale)} value={String(runsToday)} hint={t("workflow.last24h", locale)} accent="#5f9339" />
        <KpiCard icon={AlertOctagon} label={t("workflow.errorsToday", locale)} value={String(errorsToday)} hint={errorsToday === 0 ? t("workflow.stable", locale) : t("workflow.needsReview", locale)} accent={errorsToday === 0 ? "#5f9339" : "#cb4f56"} />
      </div>

      {persistError && (
        <div className="wf-persist-error">
          <AlertOctagon size={14} />
          <div>
            <strong>{t("workflow.persistError", locale)}</strong>
            <span>{persistError}</span>
          </div>
        </div>
      )}

      <div className="wf-list-toolbar">
        <div className="wf-search">
          <Search size={14} />
          <input
            placeholder={t("workflow.searchPlaceholder", locale)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-xs" style={{ color: "var(--ac-text-mute)" }}>
          {filtered.length} {t("workflow.workflows", locale)}
        </div>
      </div>

      <div className="wf-list">
        {filtered.length === 0 && (
          <div className="wf-empty">
            <Sparkles size={20} style={{ color: "var(--ac-primary)" }} />
            <h3>{t("workflow.emptyTitle", locale)}</h3>
            <p>{t("workflow.emptyDesc", locale)}</p>
            <button onClick={() => setShowTemplates(true)} className="wf-primary-btn">
              <Plus size={14} /> {t("workflow.create", locale)}
            </button>
          </div>
        )}

        {filtered.map((w) => {
          const nodeCount = w.nodes.length;
          const triggerNode = w.nodes.find((n) => n.type === "trigger");
          const triggerLabel = triggerSummary(triggerNode, locale);
          return (
            <div key={w.id} className="wf-card" onClick={() => setEditingId(w.id)} role="button" tabIndex={0}>
              <div className="wf-card-left">
                <div className={`wf-status-dot ${w.active ? "wf-status-on" : "wf-status-off"}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="wf-card-title">{w.name}</h3>
                    {w.active && (
                      <span className="wf-badge wf-badge-on">
                        <span className="wf-pulse" /> {t("common.active", locale)}
                      </span>
                    )}
                  </div>
                  {w.description && <p className="wf-card-desc">{w.description}</p>}
                  <div className="wf-card-meta">
                    <span className="wf-meta-chip"><Zap size={11} /> {triggerLabel}</span>
                    <span className="wf-meta-chip"><CircleDot size={11} /> {nodeCount} {nodeCount === 1 ? t("common.node", locale) : t("common.nodes", locale)}</span>
                    <span className="wf-meta-chip"><Activity size={11} /> {w.runsToday ?? 0} {t("common.today", locale)}</span>
                  </div>
                </div>
              </div>

              <div className="wf-card-right" onClick={(e) => e.stopPropagation()}>
                <Link
                  href={`/automatisierungen/${w.id}/runs`}
                  className="wf-iconbtn"
                  title={t("workflow.viewHistory", locale)}
                >
                  <History size={15} />
                </Link>
                <button
                  type="button"
                  onClick={() => updateWorkflow(w.id, { active: !w.active })}
                  className={`wf-toggle wf-toggle-sm ${w.active ? "wf-toggle-on" : ""}`}
                  aria-pressed={w.active}
                  title={w.active ? t("common.deactivate", locale) : t("common.activate", locale)}
                >
                  <span className="wf-toggle-dot" />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpenId(menuOpenId === w.id ? null : w.id)}
                    className="wf-iconbtn"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {menuOpenId === w.id && (
                    <div className="wf-menu" onMouseLeave={() => setMenuOpenId(null)}>
                      <button onClick={() => { setEditingId(w.id); setMenuOpenId(null); }}>
                        <Power size={13} /> {t("common.open", locale)}
                      </button>
                      <Link href={`/automatisierungen/${w.id}/runs`} className="block">
                        <History size={13} /> {t("common.history", locale)}
                      </Link>
                      <button onClick={() => duplicateWorkflow(w.id)}>
                        <Copy size={13} /> {t("common.duplicate", locale)}
                      </button>
                      <button onClick={() => deleteWorkflow(w.id)} className="wf-menu-danger">
                        <Trash2 size={13} /> {t("common.delete", locale)}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showTemplates && (
        <WorkflowTemplatePicker onPick={addWorkflow} onClose={() => setShowTemplates(false)} />
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  hint: string;
  accent: string;
}) {
  return (
    <div className="wf-kpi">
      <div className="wf-kpi-icon" style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}>
        <Icon size={16} strokeWidth={2.4} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="wf-kpi-label">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="wf-kpi-value">{value}</span>
          <span className="wf-kpi-hint">{hint}</span>
        </div>
      </div>
    </div>
  );
}

function triggerSummary(node: WorkflowNode | undefined, locale: string): string {
  if (!node) return t("workflow.noTrigger", locale);
  const d: any = node.data || {};
  switch (d.event) {
    case "rate_overdue":
      return t("workflow.rateOverdueShort", locale, { days: d.days ?? "?" });
    case "rate_returned":
      return t("workflow.rateReturned", locale);
    case "daily_at":
      return t("workflow.dailyShort", locale, { time: d.time || "06:00" });
    case "scoring_below":
      return t("workflow.scoringBelow", locale, { threshold: d.threshold ?? 80 });
    default:
      return t("workflow.triggerLabel", locale);
  }
}
