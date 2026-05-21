"use client";

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  ConnectionMode,
  ConnectionLineType,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import {
  Plus,
  Zap,
  GitBranch,
  Mail,
  MessageCircle,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  Clock,
} from "lucide-react";

import { t } from "@/lib/i18n";
import { useAppStore } from "@/hooks/useAppStore";
import { TriggerNode } from "./nodes/TriggerNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { ActionEmailNode } from "./nodes/ActionEmailNode";
import { ActionWhatsAppNode } from "./nodes/ActionWhatsAppNode";
import { ActionAlertNode } from "./nodes/ActionAlertNode";
import { ActionMahnstufeNode } from "./nodes/ActionMahnstufeNode";
import { ActionScoringNode } from "./nodes/ActionScoringNode";
import { ActionWaitNode } from "./nodes/ActionWaitNode";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { useRealtimeRun } from "./useRealtimeRun";
import { ICuraChat } from "./ICuraChat";
import type { NodeKind, WorkflowEdge, WorkflowNode } from "./types";

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action_email: ActionEmailNode,
  action_whatsapp: ActionWhatsAppNode,
  action_alert: ActionAlertNode,
  action_mahnstufe: ActionMahnstufeNode,
  action_scoring: ActionScoringNode,
  action_wait: ActionWaitNode,
};

type PaletteItem = { kind: NodeKind; label: string; icon: any; accent: string };

function buildPalette(locale: "de" | "en"): PaletteItem[] {
  return [
    { kind: "trigger", label: t("palette.trigger", locale), icon: Zap, accent: "#c8942d" },
    { kind: "condition", label: t("palette.condition", locale), icon: GitBranch, accent: "#3b6fb8" },
    { kind: "action_wait", label: t("palette.wait", locale), icon: Clock, accent: "#6b7d99" },
    { kind: "action_email", label: t("palette.email", locale), icon: Mail, accent: "#5f9339" },
    { kind: "action_whatsapp", label: t("palette.whatsapp", locale), icon: MessageCircle, accent: "#3f9772" },
    { kind: "action_alert", label: t("palette.alert", locale), icon: AlertTriangle, accent: "#cb4f56" },
    { kind: "action_mahnstufe", label: t("palette.mahnstufe", locale), icon: ArrowUpRight, accent: "#d27130" },
    { kind: "action_scoring", label: t("palette.scoring", locale), icon: TrendingDown, accent: "#7a52d6" },
  ];
}

function defaultDataFor(kind: NodeKind): any {
  switch (kind) {
    case "trigger":
      return { event: "rate_overdue", days: 6 };
    case "condition":
      return { field: "tage_ueberfaellig", operator: "gte", value: 7 };
    case "action_email":
      return { recipient: "patient", subject: "", body: "" };
    case "action_whatsapp":
      return { message: "" };
    case "action_alert":
      return { severity: "warn", recipient: "team", message: "" };
    case "action_mahnstufe":
      return { stufe: 1 };
    case "action_scoring":
      return { delta: -5 };
    case "action_wait":
      return { amount: 1, unit: "days" };
  }
}

interface Props {
  initialNodes: WorkflowNode[];
  initialEdges: WorkflowEdge[];
  onChange?: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
  isDark: boolean;
  workflowId?: string;
}

function CanvasInner({ initialNodes, initialEdges, onChange, isDark, workflowId }: Props) {
  const { locale } = useAppStore();
  const [nodes, setNodes] = useState<Node[]>(initialNodes as Node[]);
  const [edges, setEdges] = useState<Edge[]>(initialEdges as Edge[]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { statuses: runtimeStatuses, activeRun } = useRealtimeRun(workflowId || null);

  const PALETTE = useMemo(() => buildPalette(locale), [locale]);

  // Merge runtime status into node data so node components can light up.
  const nodesWithStatus = useMemo(() => {
    return nodes.map((n) => {
      const rs = runtimeStatuses?.[n.id];
      const baseData = { ...(n.data as any), __locale: locale };
      if (rs) baseData.__runtimeStatus = rs;
      return { ...n, data: baseData } as Node;
    });
  }, [nodes, runtimeStatuses, locale]);

  const pushChange = useCallback(
    (n: Node[], e: Edge[]) => {
      onChange?.(n as WorkflowNode[], e as WorkflowEdge[]);
    },
    [onChange]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        pushChange(next, edges);
        return next;
      });
    },
    [edges, pushChange]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        pushChange(nodes, next);
        return next;
      });
    },
    [nodes, pushChange]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge(
          {
            ...params,
            type: "smoothstep",
            animated: true,
            style: { strokeWidth: 1.6 },
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds
        );
        pushChange(nodes, next);
        return next;
      });
    },
    [nodes, pushChange]
  );

  const addNode = useCallback(
    (kind: NodeKind) => {
      const id = `${kind}-${Math.random().toString(36).slice(2, 8)}`;
      const center = { x: 320 + Math.random() * 200, y: 180 + Math.random() * 120 };
      const newNode: Node = {
        id,
        type: kind,
        position: center,
        data: defaultDataFor(kind),
      };
      setNodes((nds) => {
        const next = [...nds, newNode];
        pushChange(next, edges);
        return next;
      });
      setSelectedNodeId(id);
    },
    [edges, pushChange]
  );

  const selectedNode = useMemo(
    () => (nodes.find((n) => n.id === selectedNodeId) as WorkflowNode | undefined) || null,
    [nodes, selectedNodeId]
  );

  function updateSelectedData(data: any) {
    if (!selectedNodeId) return;
    setNodes((nds) => {
      const next = nds.map((n) => (n.id === selectedNodeId ? { ...n, data } : n));
      pushChange(next, edges);
      return next;
    });
  }

  function deleteSelected() {
    if (!selectedNodeId) return;
    setNodes((nds) => {
      const next = nds.filter((n) => n.id !== selectedNodeId);
      pushChange(next, edges);
      return next;
    });
    setEdges((eds) => {
      const next = eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId);
      pushChange(nodes, next);
      return next;
    });
    setSelectedNodeId(null);
  }

  return (
    <div className={`wf-canvas-wrap ${selectedNode ? "wf-canvas-with-panel" : ""}`} data-theme={isDark ? "dark" : "light"}>
      <aside className="wf-palette">
        <div className="wf-palette-head">
          <span>{t("palette.title", locale)}</span>
          <span className="wf-palette-hint">{t("palette.hint", locale)}</span>
        </div>
        <div className="wf-palette-list">
          {PALETTE.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.kind}
                onClick={() => addNode(p.kind)}
                className="wf-palette-item"
                style={{ ["--p-accent" as any]: p.accent } as any}
                type="button"
              >
                <span className="wf-palette-icon">
                  <Icon size={14} strokeWidth={2.4} />
                </span>
                <span className="wf-palette-label">{p.label}</span>
                <Plus size={12} className="wf-palette-plus" />
              </button>
            );
          })}
        </div>
      </aside>

      <div className="wf-canvas">
        <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden>
          <defs>
            <linearGradient id="wf-edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--ac-iris-1)" stopOpacity="0.9" />
              <stop offset="50%" stopColor="var(--ac-iris-2)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--ac-iris-3)" stopOpacity="0.9" />
            </linearGradient>
          </defs>
        </svg>
        <ReactFlow
          nodes={nodesWithStatus}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedNodeId(n.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={1.6}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.SmoothStep}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
            style: { strokeWidth: 1.6 },
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.4}
            color={isDark ? "#2a3344" : "#cdd5e3"}
          />
          <Controls
            position="bottom-right"
            showInteractive={false}
            className="wf-controls"
          />
          <MiniMap
            pannable
            zoomable
            className="wf-minimap"
            nodeColor={(n) => {
              const map: Record<string, string> = {
                trigger: "#c8942d",
                condition: "#3b6fb8",
                action_email: "#5f9339",
                action_whatsapp: "#3f9772",
                action_alert: "#cb4f56",
                action_mahnstufe: "#d27130",
                action_scoring: "#7a52d6",
                action_wait: "#6b7d99",
              };
              return map[n.type as string] || "#9caac0";
            }}
            maskColor={isDark ? "rgba(9,11,16,0.7)" : "rgba(242,244,249,0.7)"}
          />
        </ReactFlow>
      </div>

      <NodeConfigPanel
        node={selectedNode}
        onClose={() => setSelectedNodeId(null)}
        onChange={updateSelectedData}
        onDelete={deleteSelected}
      />

      <ICuraChat
        workflow={{
          id: workflowId || "",
          name: "",
          active: false,
          updatedAt: new Date().toISOString(),
          nodes: nodes as any,
          edges: edges as any,
        }}
        onApplyProposal={(newNodes, newEdges) => {
          setNodes(newNodes as any);
          setEdges(newEdges as any);
          pushChange(newNodes as any, newEdges as any);
        }}
      />
    </div>
  );
}

export function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
