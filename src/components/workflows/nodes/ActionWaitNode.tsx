"use client";

import { Clock } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { t } from "@/lib/i18n";
import type { ActionWaitData } from "../types";

const UNIT_KEY: Record<string, string> = {
  minutes: "nodes.wait.unit.minutes",
  hours: "nodes.wait.unit.hours",
  days: "nodes.wait.unit.days",
};

export function ActionWaitNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionWaitData;
  const locale = (data as any)?.__locale ?? "de";
  const unitLabel = d.unit && UNIT_KEY[d.unit] ? t(UNIT_KEY[d.unit], locale) : d.unit || "";
  const subtitle =
    d.amount !== undefined && d.unit
      ? t("nodes.wait.subtitle", locale, { amount: d.amount, unit: unitLabel })
      : t("nodes.wait.configure", locale);

  return (
    <BaseNode
      icon={<Clock size={16} strokeWidth={2.4} />}
      accent="#6b7d99"
      accentSoft="rgba(107, 125, 153, 0.18)"
      kicker={t("nodes.kicker.wait", locale)}
      title={t("nodes.wait.title", locale)}
      subtitle={subtitle}
      selected={selected}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
