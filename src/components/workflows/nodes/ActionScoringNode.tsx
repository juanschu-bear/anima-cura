"use client";

import { TrendingDown } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import type { ActionScoringData } from "../types";

export function ActionScoringNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionScoringData;
  const subtitle =
    d.delta !== undefined
      ? `${d.delta > 0 ? "+" : ""}${d.delta} Punkte`
      : "Scoring-Änderung wählen";

  return (
    <BaseNode
      icon={<TrendingDown size={16} strokeWidth={2.4} />}
      accent="#7a52d6"
      accentSoft="rgba(122, 82, 214, 0.16)"
      kicker="Aktion"
      title="Scoring anpassen"
      subtitle={subtitle}
      selected={selected}
    />
  );
}
