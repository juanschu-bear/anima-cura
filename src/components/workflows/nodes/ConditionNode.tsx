"use client";

import { GitBranch } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import type { ConditionData } from "../types";

const FIELD_LABEL: Record<string, string> = {
  mahnstufe: "Mahnstufe",
  patiententyp: "Patiententyp",
  email_vorhanden: "E-Mail vorhanden",
  tage_ueberfaellig: "Tage überfällig",
  scoring: "Scoring",
};

const OP_LABEL: Record<string, string> = {
  lt: "<",
  lte: "≤",
  eq: "=",
  gte: "≥",
  gt: ">",
  neq: "≠",
  is_true: "ist gesetzt",
};

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConditionData;
  const subtitle = d.field
    ? `${FIELD_LABEL[d.field] || d.field} ${OP_LABEL[d.operator] || ""} ${d.value ?? ""}`.trim()
    : "Bedingung konfigurieren";

  return (
    <BaseNode
      icon={<GitBranch size={16} strokeWidth={2.4} />}
      accent="#3b6fb8"
      accentSoft="rgba(59, 111, 184, 0.14)"
      kicker="Bedingung"
      title="Filter / Verzweigung"
      subtitle={subtitle}
      selected={selected}
      branching
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
