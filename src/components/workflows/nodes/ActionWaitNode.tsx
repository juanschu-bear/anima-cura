"use client";

import { Clock } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import type { ActionWaitData } from "../types";

const UNIT_LABEL: Record<string, string> = {
  minutes: "Minuten",
  hours: "Stunden",
  days: "Tage",
};

export function ActionWaitNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionWaitData;
  const subtitle =
    d.amount !== undefined && d.unit
      ? `Warte ${d.amount} ${UNIT_LABEL[d.unit] || d.unit}`
      : "Wartezeit festlegen";

  return (
    <BaseNode
      icon={<Clock size={16} strokeWidth={2.4} />}
      accent="#6b7d99"
      accentSoft="rgba(107, 125, 153, 0.18)"
      kicker="Verzögerung"
      title="Warten"
      subtitle={subtitle}
      selected={selected}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
