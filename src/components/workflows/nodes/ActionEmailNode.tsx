"use client";

import { Mail } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import type { ActionEmailData } from "../types";

const RECIPIENT_LABEL: Record<string, string> = {
  patient: "Patient",
  versicherungsnehmer: "Versicherungsnehmer",
  praxisleitung: "Praxisleitung",
  team: "Team",
};

export function ActionEmailNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionEmailData;
  const subtitle = d.subject
    ? `${RECIPIENT_LABEL[d.recipient] || "Empfänger"} · "${d.subject.slice(0, 32)}${d.subject.length > 32 ? "…" : ""}"`
    : "E-Mail konfigurieren";

  return (
    <BaseNode
      icon={<Mail size={16} strokeWidth={2.4} />}
      accent="#5f9339"
      accentSoft="rgba(95, 147, 57, 0.14)"
      kicker="Aktion"
      title="E-Mail senden"
      subtitle={subtitle}
      selected={selected}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
