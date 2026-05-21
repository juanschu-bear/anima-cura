"use client";

import { Zap } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import type { TriggerData } from "../types";

const EVENT_LABEL: Record<string, string> = {
  rate_overdue: "Rate überfällig",
  rate_returned: "Rücklastschrift erkannt",
  daily_at: "Täglich um Uhrzeit",
  scoring_below: "Scoring unter Schwellwert",
};

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as TriggerData;
  let subtitle = EVENT_LABEL[d.event] || "Auslöser konfigurieren";
  if (d.event === "rate_overdue" && d.days !== undefined) subtitle = `Wenn Rate ${d.days} Tage überfällig`;
  if (d.event === "daily_at" && d.time) subtitle = `Täglich um ${d.time} Uhr`;
  if (d.event === "scoring_below" && d.threshold !== undefined) subtitle = `Wenn Scoring < ${d.threshold}%`;

  return (
    <BaseNode
      icon={<Zap size={16} strokeWidth={2.4} />}
      accent="#c8942d"
      accentSoft="rgba(200, 148, 45, 0.14)"
      kicker="Trigger"
      title="Auslöser"
      subtitle={subtitle}
      selected={selected}
      showInput={false}
    />
  );
}
