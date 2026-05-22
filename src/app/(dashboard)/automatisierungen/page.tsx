"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
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
import { AutomationPortalBackground } from "@/components/workflows/AutomationPortalBackground";
import { useCountUp } from "@/components/workflows/useCountUp";
import { useTilt } from "@/components/workflows/useTilt";

const SETTING_KEY = "workflows";

function nid() {
  return Math.random().toString(36).slice(2, 10);
}

function getSeed(locale: string): Workflow[] {
  return [
  {
    id: nid(),
    name: t("workflow.seedPaymentReminder", locale),
    description: t("workflow.seedPaymentReminderDesc", locale),
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
    name: t("workflow.seedChargebackAlert", locale),
    description: t("workflow.seedChargebackAlertDesc", locale),
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
}

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
          setWorkflows(getSeed(locale));
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[workflows] read threw", err);
          setWorkflows(getSeed(locale));
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
    <div className="portal-shell">
      <AutomationPortalBackground />

      <section className="portal-hero">
        <div className="portal-hero-eyebrow">
          <span className="portal-hero-dot" />
          {t("workflow.title", locale).toUpperCase()} · {t("search.systemActive", locale).toUpperCase()}
        </div>
        <h1 className="portal-hero-title">
          <span className="portal-hero-word">{t("workflow.title", locale)}</span>
        </h1>
        <p className="portal-hero-sub">{t("workflow.subtitle", locale)}</p>
        <div className="portal-hero-actions">
          <button onClick={() => setShowTemplates(true)} className="portal-cta">
            <span className="portal-cta-glow" />
            <Plus size={18} strokeWidth={2.6} />
            <span>{t("workflow.new", locale)}</span>
            <span className="portal-cta-shimmer" />
          </button>
          <div className="portal-hero-stats">
            <span><b>{workflows.length}</b> {t("workflow.workflows", locale)}</span>
            <span className="portal-divider" />
            <span><b>{runsToday}</b> {t("common.today", locale)}</span>
            <span className="portal-divider" />
            <span className="portal-stat-pulse" />
            <span>{t("search.systemActive", locale)}</span>
          </div>
        </div>
      </section>

      <section className="portal-kpis">
        <PortalKpi icon={Zap}        label={t("workflow.activeCount", locale)} value={activeCount}  hint={`${workflows.length} ${t("workflow.totalCount", locale)}`} accent="#8d86ff" gradient="linear-gradient(135deg, #8d86ff 0%, #b78bff 50%, #4cc9f0 100%)" />
        <PortalKpi icon={Activity}   label={t("workflow.runsToday", locale)}   value={runsToday}     hint={t("workflow.last24h", locale)} accent="#5f9339" gradient="linear-gradient(135deg, #5f9339 0%, #7afff5 100%)" />
        <PortalKpi icon={AlertOctagon} label={t("workflow.errorsToday", locale)} value={errorsToday}  hint={errorsToday === 0 ? t("workflow.stable", locale) : t("workflow.needsReview", locale)} accent={errorsToday === 0 ? "#5f9339" : "#cb4f56"} gradient={errorsToday === 0 ? "linear-gradient(135deg, #5f9339 0%, #4cc9f0 100%)" : "linear-gradient(135deg, #cb4f56 0%, #ff8da1 100%)"} />
      </section>

      {persistError && (
        <div className="wf-persist-error">
          <AlertOctagon size={14} />
          <div>
            <strong>{t("workflow.persistError", locale)}</strong>
            <span>{persistError}</span>
          </div>
        </div>
      )}

      <div className="portal-toolbar">
        <div className="wf-search portal-search">
          <Search size={14} />
          <input
            placeholder={t("workflow.searchPlaceholder", locale)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="portal-count">
          {filtered.length} <span>{t("workflow.workflows", locale)}</span>
        </div>
      </div>

      <div className="portal-list">
        {filtered.length === 0 && (
          <div className="portal-empty">
            <div className="portal-empty-orb"><Sparkles size={22} /></div>
            <h3>{t("workflow.emptyTitle", locale)}</h3>
            <p>{t("workflow.emptyDesc", locale)}</p>
            <button onClick={() => setShowTemplates(true)} className="portal-cta portal-cta-sm">
              <Plus size={14} /> {t("workflow.create", locale)}
            </button>
          </div>
        )}

        {filtered.map((w, idx) => {
          const nodeCount = w.nodes.length;
          const triggerNode = w.nodes.find((n) => n.type === "trigger");
          const triggerLabel = triggerSummary(triggerNode, locale);
          return (
            <PortalWorkflowCard
              key={w.id}
              index={idx}
              workflow={w}
              triggerLabel={triggerLabel}
              nodeCount={nodeCount}
              locale={locale}
              menuOpen={menuOpenId === w.id}
              onClick={() => setEditingId(w.id)}
              onToggleMenu={() => setMenuOpenId(menuOpenId === w.id ? null : w.id)}
              onCloseMenu={() => setMenuOpenId(null)}
              onToggleActive={() => updateWorkflow(w.id, { active: !w.active })}
              onDuplicate={() => duplicateWorkflow(w.id)}
              onDelete={() => deleteWorkflow(w.id)}
              onOpen={() => { setEditingId(w.id); setMenuOpenId(null); }}
            />
          );
        })}
      </div>

      {showTemplates && (
        <WorkflowTemplatePicker onPick={addWorkflow} onClose={() => setShowTemplates(false)} />
      )}
    </div>
  );
}

function PortalKpi({ icon: Icon, label, value, hint, accent, gradient }: { icon: any; label: string; value: number; hint: string; accent: string; gradient: string }) {
  const ref = useTilt<HTMLDivElement>(6);
  const animated = useCountUp(value);
  return (
    <div ref={ref} className="portal-kpi" style={{ ["--kpi-accent" as any]: accent, ["--kpi-gradient" as any]: gradient } as any}>
      <div className="portal-kpi-inner">
        <div className="portal-kpi-shine" />
        <div className="portal-kpi-head">
          <div className="portal-kpi-icon"><Icon size={16} strokeWidth={2.4} /></div>
          <span className="portal-kpi-label">{label}</span>
        </div>
        <div className="portal-kpi-value">{animated}</div>
        <div className="portal-kpi-hint">{hint}</div>
      </div>
    </div>
  );
}

const NODE_KIND_ACCENT: Record<string, string> = {
  trigger: "#c8942d",
  condition: "#3b6fb8",
  action_email: "#5f9339",
  action_whatsapp: "#3f9772",
  action_alert: "#cb4f56",
  action_mahnstufe: "#d27130",
  action_scoring: "#7a52d6",
  action_wait: "#6b7d99",
};

function PortalWorkflowCard({ workflow: w, index, triggerLabel, nodeCount, locale, menuOpen, onClick, onToggleMenu, onCloseMenu, onToggleActive, onDuplicate, onDelete, onOpen }: any) {
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const ref = useTilt<HTMLDivElement>(4);
  return (
    <div
      ref={ref}
      className={`portal-card ${w.active ? "portal-card-active" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={{ animationDelay: `${index * 0.07}s` } as any}
    >
      <div className="portal-card-inner">
        <div className="portal-card-shine" />
        <div className="portal-card-left">
          <div className={`portal-card-orb ${w.active ? "portal-card-orb-on" : ""}`}>
            <span className="portal-card-orb-ring" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="portal-card-title">{w.name}</h3>
              {w.active && (
                <span className="portal-card-badge">
                  <span className="wf-pulse" /> {t("common.active", locale)}
                </span>
              )}
            </div>
            {w.description && <p className="portal-card-desc">{w.description}</p>}
            <div className="portal-card-meta">
              <span className="portal-chip"><Zap size={11} /> {triggerLabel}</span>
              <span className="portal-chip"><CircleDot size={11} /> {nodeCount} {nodeCount === 1 ? t("common.node", locale) : t("common.nodes", locale)}</span>
              <span className="portal-chip"><Activity size={11} /> {w.runsToday ?? 0} {t("common.today", locale)}</span>
            </div>
            <div className="portal-card-strip" aria-hidden>
              {w.nodes.slice(0, 8).map((n: any, i: number) => (
                <span
                  key={i}
                  className="portal-strip-node"
                  style={{ background: NODE_KIND_ACCENT[n.type as string] || "#9caac0" }}
                  title={n.type}
                />
              ))}
              {w.nodes.length > 8 && <span className="portal-strip-more">+{w.nodes.length - 8}</span>}
            </div>
          </div>
        </div>

        <div className="portal-card-right" onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/automatisierungen/${w.id}/runs`}
            className="wf-iconbtn"
            title={t("workflow.viewHistory", locale)}
          >
            <History size={15} />
          </Link>
          <button
            type="button"
            onClick={onToggleActive}
            className={`wf-toggle wf-toggle-sm ${w.active ? "wf-toggle-on" : ""}`}
            aria-pressed={w.active}
            title={w.active ? t("common.deactivate", locale) : t("common.activate", locale)}
          >
            <span className="wf-toggle-dot" />
          </button>

          <div className="relative">
            <button
              type="button"
              ref={menuBtnRef}
              onClick={onToggleMenu}
              className="wf-iconbtn"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && typeof document !== "undefined" && createPortal(
              <PortalMenu btnRef={menuBtnRef} onClose={onCloseMenu}>
                <button onClick={onOpen}>
                  <Power size={13} /> {t("common.open", locale)}
                </button>
                <Link href={`/automatisierungen/${w.id}/runs`} className="block">
                  <History size={13} /> {t("common.history", locale)}
                </Link>
                <button onClick={onDuplicate}>
                  <Copy size={13} /> {t("common.duplicate", locale)}
                </button>
                <button onClick={onDelete} className="wf-menu-danger">
                  <Trash2 size={13} /> {t("common.delete", locale)}
                </button>
              </PortalMenu>,
              document.body
            )}
          </div>
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

function PortalMenu({ btnRef, onClose, children }: { btnRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void; children: React.ReactNode }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right - 170 });
    }
  }, [btnRef]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (btnRef.current && btnRef.current.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, btnRef]);

  return (
    <div
      ref={menuRef}
      className="wf-menu"
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
    >
      {children}
    </div>
  );
}
