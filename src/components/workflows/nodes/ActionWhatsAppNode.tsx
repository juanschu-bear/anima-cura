"use client";

import { MessageCircle } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import type { ActionWhatsAppData } from "../types";

export function ActionWhatsAppNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionWhatsAppData;
  const subtitle = d.message
    ? `"${d.message.slice(0, 40)}${d.message.length > 40 ? "…" : ""}"`
    : "Nachricht konfigurieren";

  return (
    <BaseNode
      icon={<MessageCircle size={16} strokeWidth={2.4} />}
      accent="#3f9772"
      accentSoft="rgba(63, 151, 114, 0.14)"
      kicker="Aktion"
      title="WhatsApp senden"
      subtitle={subtitle}
      selected={selected}
    />
  );
}
