"use client";

import { AlertTriangle } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { t } from "@/lib/i18n";
import type { ActionAlertData } from "../types";

const SEVERITY_KEY: Record<string, string> = {
  info: "nodes.alert.severity.info",
  warn: "nodes.alert.severity.warn",
  critical: "nodes.alert.severity.critical",
};

export function ActionAlertNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionAlertData;
  const locale = (data as any)?.__locale ?? "de";
  const subtitle = d.severity
    ? `${SEVERITY_KEY[d.severity] ? t(SEVERITY_KEY[d.severity], locale) : d.severity} · ${d.recipient}`
    : t("nodes.alert.configure", locale);

  return (
    <BaseNode
      icon={<AlertTriangle size={16} strokeWidth={2.4} />}
      accent="#cb4f56"
      accentSoft="rgba(203, 79, 86, 0.14)"
      kicker={t("nodes.kicker.action", locale)}
      title={t("nodes.alert.title", locale)}
      subtitle={subtitle}
      selected={selected}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
