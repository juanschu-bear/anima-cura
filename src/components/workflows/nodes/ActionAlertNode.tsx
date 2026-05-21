"use client";

import { AlertTriangle } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import type { ActionAlertData } from "../types";

const SEVERITY_LABEL: Record<string, string> = {
  info: "Info",
  warn: "Warnung",
  critical: "Kritisch",
};

export function ActionAlertNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionAlertData;
  const subtitle = d.severity
    ? `${SEVERITY_LABEL[d.severity]} · ${d.recipient}`
    : "Alert konfigurieren";

  return (
    <BaseNode
      icon={<AlertTriangle size={16} strokeWidth={2.4} />}
      accent="#cb4f56"
      accentSoft="rgba(203, 79, 86, 0.14)"
      kicker="Aktion"
      title="Alert auslösen"
      subtitle={subtitle}
      selected={selected}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
