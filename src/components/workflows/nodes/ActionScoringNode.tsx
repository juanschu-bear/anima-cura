"use client";

import { TrendingDown } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { t } from "@/lib/i18n";
import type { ActionScoringData } from "../types";

export function ActionScoringNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionScoringData;
  const locale = (data as any)?.__locale ?? "de";
  const subtitle =
    d.delta !== undefined
      ? `${d.delta > 0 ? "+" : ""}${d.delta} ${t("nodes.scoring.points", locale)}`
      : t("nodes.scoring.choose", locale);

  return (
    <BaseNode
      icon={<TrendingDown size={16} strokeWidth={2.4} />}
      accent="#7a52d6"
      accentSoft="rgba(122, 82, 214, 0.16)"
      kicker={t("nodes.kicker.action", locale)}
      title={t("nodes.scoring.title", locale)}
      subtitle={subtitle}
      selected={selected}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
