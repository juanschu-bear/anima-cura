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
} from "lucide-react";

import { TriggerNode } from "./nodes/TriggerNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { ActionEmailNode } from "./nodes/ActionEmailNode";
import { ActionWhatsAppNode } from "./nodes/ActionWhatsAppNode";
import { ActionAlertNode } from "./nodes/ActionAlertNode";
import { ActionMahnstufeNode } from "./nodes/ActionMahnstufeNode";
import { ActionScoringNode } from "./nodes/ActionScoringNode";
import { NodeConfigPanel } from "./NodeConfigPanel";
import type { NodeKind, WorkflowEdge, WorkflowNode } from "./types";

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action_email: ActionEmailNode,
  action_whatsapp: ActionWhatsAppNode,
  action_alert: ActionAlertNode,
  action_mahnstufe: ActionMahnstufeNode,
  action_scoring: ActionScoringNode,
};

const PALETTE: { kind: NodeKind; label: string; icon: any; accent: string }[] = [
  { kind: "trigger", label: "Trigger", icon: Zap, accent: "#c8942d" },
  { kind: "condition", label: "Bedingung", icon: GitBranch, accent: "#3b6fb8" },
  { kind: "action_email", label: "E-Mail", icon: Mail, accent: "#5f9339" },
  { kind: "action_whatsapp", label: "WhatsApp", icon: MessageCircle, accent: "#3f9772" },
  { kind: "action_alert", label: "Alert", icon: AlertTriangle, accent: "#cb4f56" },
  { kind: "action_mahnstufe", label: "Mahnstufe", icon: ArrowUpRight, accent: "#d27130" },
  { kind: "action_scoring", label: "Scoring", icon: TrendingDown, accent: "#7a52d6" },
];

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
  }
}

interface Props {
  initialNodes: WorkflowNode[];
  initialEdges: WorkflowEdge[];
  onChange?: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
  isDark: boolean;
}

function CanvasInner({ initialNodes, initialEdges, onChange, isDark }: Props) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes as Node[]);
  const [edges, setEdges] = useState<Edge[]>(initialEdges as Edge[]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
          <span>Nodes</span>
          <span className="wf-palette-hint">klicken zum Hinzufügen</span>
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
        <ReactFlow
          nodes={nodes}
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
