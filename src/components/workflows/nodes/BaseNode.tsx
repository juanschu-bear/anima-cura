"use client";

import { Handle, Position } from "@xyflow/react";
import { ReactNode } from "react";

interface BaseNodeProps {
  icon: ReactNode;
  accent: string;
  accentSoft: string;
  kicker: string;
  title: string;
  subtitle?: string;
  selected?: boolean;
  showInput?: boolean;
  showOutput?: boolean;
  branching?: boolean;
  runtimeStatus?: "running" | "success" | "failed" | "skipped" | "dry_run";
}

export function BaseNode({
  icon,
  accent,
  accentSoft,
  kicker,
  title,
  subtitle,
  selected,
  showInput = true,
  showOutput = true,
  branching = false,
  runtimeStatus,
}: BaseNodeProps) {
  return (
    <div
      className="wf-node"
      style={
        {
          ["--node-accent" as any]: accent,
          ["--node-accent-soft" as any]: accentSoft,
        } as any
      }
      data-selected={selected ? "true" : "false"}
      data-runtime={runtimeStatus || "idle"}
    >
      {runtimeStatus && (
        <span className={`wf-node-runtime wf-node-runtime-${runtimeStatus}`}>
          {runtimeStatus === "running" ? "●" : runtimeStatus === "success" ? "✓" : runtimeStatus === "failed" ? "✕" : "·"}
        </span>
      )}
      {showInput && (
        <Handle type="target" position={Position.Left} className="wf-handle wf-handle-in" />
      )}

      <div className="wf-node-head">
        <div className="wf-node-icon">{icon}</div>
        <div className="wf-node-meta">
          <span className="wf-node-kicker">{kicker}</span>
          <span className="wf-node-title">{title}</span>
        </div>
      </div>

      {subtitle && <div className="wf-node-subtitle">{subtitle}</div>}

      {showOutput && !branching && (
        <Handle type="source" position={Position.Right} className="wf-handle wf-handle-out" />
      )}

      {branching && (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            className="wf-handle wf-handle-true"
            style={{ top: "38%" }}
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            className="wf-handle wf-handle-false"
            style={{ top: "76%" }}
          />
          <span className="wf-branch-label wf-branch-true">erfüllt</span>
          <span className="wf-branch-label wf-branch-false">sonst</span>
        </>
      )}
    </div>
  );
}
