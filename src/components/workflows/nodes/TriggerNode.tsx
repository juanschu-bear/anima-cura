"use client";

import { Zap } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { t } from "@/lib/i18n";
import type { TriggerData } from "../types";

const EVENT_KEY: Record<string, string> = {
  rate_overdue: "nodes.trigger.eventOverdue",
  rate_returned: "nodes.trigger.eventReturned",
  daily_at: "nodes.trigger.eventDaily",
  scoring_below: "nodes.trigger.eventScoring",
};

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as TriggerData;
  const locale = (data as any)?.__locale ?? "de";
  let subtitle = EVENT_KEY[d.event] ? t(EVENT_KEY[d.event], locale) : t("nodes.trigger.configure", locale);
  if (d.event === "rate_overdue" && d.days !== undefined)
    subtitle = t("nodes.trigger.rateOverdue", locale, { days: d.days });
  if (d.event === "daily_at" && d.time)
    subtitle = t("nodes.trigger.dailyAt", locale, { time: d.time });
  if (d.event === "scoring_below" && d.threshold !== undefined)
    subtitle = t("nodes.trigger.scoringBelow", locale, { threshold: d.threshold });

  return (
    <BaseNode
      icon={<Zap size={16} strokeWidth={2.4} />}
      accent="#c8942d"
      accentSoft="rgba(200, 148, 45, 0.14)"
      kicker={t("nodes.kicker.trigger", locale)}
      title={t("nodes.trigger.title", locale)}
      subtitle={subtitle}
      selected={selected}
      showInput={false}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
