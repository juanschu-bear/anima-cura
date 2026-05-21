"use client";

import { Mail } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { t } from "@/lib/i18n";
import type { ActionEmailData } from "../types";

const RECIPIENT_KEY: Record<string, string> = {
  patient: "nodes.recipient.patient",
  versicherungsnehmer: "nodes.recipient.policyHolder",
  praxisleitung: "nodes.recipient.management",
  team: "nodes.recipient.team",
};

export function ActionEmailNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionEmailData;
  const locale = (data as any)?.__locale ?? "de";
  const recipient = RECIPIENT_KEY[d.recipient]
    ? t(RECIPIENT_KEY[d.recipient], locale)
    : t("nodes.email.recipientLabel", locale);
  const subtitle = d.subject
    ? `${recipient} · "${d.subject.slice(0, 32)}${d.subject.length > 32 ? "…" : ""}"`
    : t("nodes.email.configure", locale);

  return (
    <BaseNode
      icon={<Mail size={16} strokeWidth={2.4} />}
      accent="#5f9339"
      accentSoft="rgba(95, 147, 57, 0.14)"
      kicker={t("nodes.kicker.action", locale)}
      title={t("nodes.email.title", locale)}
      subtitle={subtitle}
      selected={selected}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
