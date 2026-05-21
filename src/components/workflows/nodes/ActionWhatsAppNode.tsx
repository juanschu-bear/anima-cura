"use client";

import { MessageCircle } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { t } from "@/lib/i18n";
import type { ActionWhatsAppData } from "../types";

export function ActionWhatsAppNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionWhatsAppData;
  const locale = (data as any)?.__locale ?? "de";
  const subtitle = d.message
    ? `"${d.message.slice(0, 40)}${d.message.length > 40 ? "…" : ""}"`
    : t("nodes.whatsapp.configure", locale);

  return (
    <BaseNode
      icon={<MessageCircle size={16} strokeWidth={2.4} />}
      accent="#3f9772"
      accentSoft="rgba(63, 151, 114, 0.14)"
      kicker={t("nodes.kicker.action", locale)}
      title={t("nodes.whatsapp.title", locale)}
      subtitle={subtitle}
      selected={selected}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
