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
} from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { createBrowserClient } from "@/lib/db/supabase";
import { WorkflowCanvas } from "@/components/workflows/WorkflowCanvas";
import { WorkflowTemplatePicker } from "@/components/workflows/WorkflowTemplates";
import type { Workflow, WorkflowEdge, WorkflowNode } from "@/components/workflows/types";

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
  const isGerman = locale === "de";

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loaded, setLoaded] = useState(false);
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

  async function persist(next: Workflow[]) {
    if (!loaded) return;
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase
        .from("einstellungen")
        .upsert({ key: SETTING_KEY, value: next }, { onConflict: "key" });
      if (error) {
        console.error("[workflows] persist failed", error);
        setPersistError(error.message || "Speichern fehlgeschlagen");
      } else {
        setPersistError(null);
      }
    } catch (err: any) {
      console.error("[workflows] persist threw", err);
      setPersistError(err?.message || "Speichern fehlgeschlagen");
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

  function saveAndClose() {
    setSaveHint("Workflow gespeichert");
    setTimeout(() => setSaveHint(""), 1800);
    setEditingId(null);
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
            <button onClick={saveAndClose} className="wf-iconbtn" aria-label="Zurück">
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <input
                value={editing.name}
                onChange={(e) => updateWorkflow(editing.id, { name: e.target.value })}
                className="wf-title-input"
                placeholder="Workflow-Name"
              />
              <input
                value={editing.description || ""}
                onChange={(e) => updateWorkflow(editing.id, { description: e.target.value })}
                className="wf-subtitle-input"
                placeholder="Kurze Beschreibung …"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
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
                    <span className="wf-pulse" /> Aktiv
                  </>
                ) : (
                  "Inaktiv"
                )}
              </span>
            </button>

            <button onClick={saveAndClose} className="wf-primary-btn">
              <Save size={14} /> Speichern
            </button>
          </div>
        </div>

        {saveHint && <div className="wf-toast">{saveHint}</div>}

        <WorkflowCanvas
          key={editing.id}
          initialNodes={editing.nodes}
          initialEdges={editing.edges}
          onChange={(n, e) => handleCanvasChange(editing.id, n, e)}
          isDark={isDark}
        />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-extrabold tracking-tight" style={{ color: "var(--ac-text)" }}>
            {isGerman ? "Automatisierungen" : "Automations"}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--ac-text-soft)" }}>
            {isGerman
              ? "Visueller Workflow-Builder — verbinde Trigger, Bedingungen und Aktionen zu intelligenten Abläufen."
              : "Visual workflow builder — connect triggers, conditions and actions."}
          </p>
        </div>
        <button onClick={() => setShowTemplates(true)} className="wf-primary-btn wf-primary-btn-lg">
          <Plus size={16} /> {isGerman ? "Neuer Workflow" : "New Workflow"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard icon={Zap} label={isGerman ? "Aktive Workflows" : "Active workflows"} value={String(activeCount)} hint={`${workflows.length} ${isGerman ? "insgesamt" : "total"}`} accent="var(--ac-primary)" />
        <KpiCard icon={Activity} label={isGerman ? "Ausführungen heute" : "Runs today"} value={String(runsToday)} hint={isGerman ? "letzte 24 h" : "last 24 h"} accent="#5f9339" />
        <KpiCard icon={AlertOctagon} label={isGerman ? "Fehler heute" : "Errors today"} value={String(errorsToday)} hint={errorsToday === 0 ? (isGerman ? "alles stabil" : "all stable") : (isGerman ? "Eingriff prüfen" : "needs review")} accent={errorsToday === 0 ? "#5f9339" : "#cb4f56"} />
      </div>

      {persistError && (
        <div className="wf-persist-error">
          <AlertOctagon size={14} />
          <div>
            <strong>{isGerman ? "Speichern fehlgeschlagen" : "Save failed"}</strong>
            <span>{persistError}</span>
          </div>
        </div>
      )}

      <div className="wf-list-toolbar">
        <div className="wf-search">
          <Search size={14} />
          <input
            placeholder={isGerman ? "Workflows durchsuchen …" : "Search workflows …"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-xs" style={{ color: "var(--ac-text-mute)" }}>
          {filtered.length} {isGerman ? "Workflows" : "workflows"}
        </div>
      </div>

      <div className="wf-list">
        {filtered.length === 0 && (
          <div className="wf-empty">
            <Sparkles size={20} style={{ color: "var(--ac-primary)" }} />
            <h3>{isGerman ? "Noch keine Workflows" : "No workflows yet"}</h3>
            <p>{isGerman ? "Lege deinen ersten Workflow an — wähle eine Vorlage oder starte mit einem leeren Canvas." : "Create your first workflow — pick a template or start blank."}</p>
            <button onClick={() => setShowTemplates(true)} className="wf-primary-btn">
              <Plus size={14} /> {isGerman ? "Workflow erstellen" : "Create workflow"}
            </button>
          </div>
        )}

        {filtered.map((w) => {
          const nodeCount = w.nodes.length;
          const triggerNode = w.nodes.find((n) => n.type === "trigger");
          const triggerLabel = triggerSummary(triggerNode);
          return (
            <div key={w.id} className="wf-card" onClick={() => setEditingId(w.id)} role="button" tabIndex={0}>
              <div className="wf-card-left">
                <div className={`wf-status-dot ${w.active ? "wf-status-on" : "wf-status-off"}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="wf-card-title">{w.name}</h3>
                    {w.active && (
                      <span className="wf-badge wf-badge-on">
                        <span className="wf-pulse" /> Aktiv
                      </span>
                    )}
                  </div>
                  {w.description && <p className="wf-card-desc">{w.description}</p>}
                  <div className="wf-card-meta">
                    <span className="wf-meta-chip"><Zap size={11} /> {triggerLabel}</span>
                    <span className="wf-meta-chip"><CircleDot size={11} /> {nodeCount} {nodeCount === 1 ? "Node" : "Nodes"}</span>
                    <span className="wf-meta-chip"><Activity size={11} /> {w.runsToday ?? 0} heute</span>
                  </div>
                </div>
              </div>

              <div className="wf-card-right" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => updateWorkflow(w.id, { active: !w.active })}
                  className={`wf-toggle wf-toggle-sm ${w.active ? "wf-toggle-on" : ""}`}
                  aria-pressed={w.active}
                  title={w.active ? "Deaktivieren" : "Aktivieren"}
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
                        <Power size={13} /> Öffnen
                      </button>
                      <button onClick={() => duplicateWorkflow(w.id)}>
                        <Copy size={13} /> Duplizieren
                      </button>
                      <button onClick={() => deleteWorkflow(w.id)} className="wf-menu-danger">
                        <Trash2 size={13} /> Löschen
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

function triggerSummary(node: WorkflowNode | undefined): string {
  if (!node) return "Kein Trigger";
  const d: any = node.data || {};
  switch (d.event) {
    case "rate_overdue":
      return `Rate ${d.days ?? "?"} Tage überfällig`;
    case "rate_returned":
      return "Rücklastschrift erkannt";
    case "daily_at":
      return `Täglich ${d.time || "06:00"}`;
    case "scoring_below":
      return `Scoring < ${d.threshold ?? 80}%`;
    default:
      return "Trigger";
  }
}
