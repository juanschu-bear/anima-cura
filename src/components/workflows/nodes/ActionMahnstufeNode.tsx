"use client";

import { ArrowUpRight } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { t } from "@/lib/i18n";
import type { ActionMahnstufeData } from "../types";

export function ActionMahnstufeNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionMahnstufeData;
  const locale = (data as any)?.__locale ?? "de";
  const subtitle =
    d.stufe !== undefined
      ? t("nodes.mahnstufe.toLevel", locale, { stufe: d.stufe })
      : t("nodes.mahnstufe.choose", locale);

  return (
    <BaseNode
      icon={<ArrowUpRight size={16} strokeWidth={2.4} />}
      accent="#d27130"
      accentSoft="rgba(210, 113, 48, 0.14)"
      kicker={t("nodes.kicker.action", locale)}
      title={t("nodes.mahnstufe.title", locale)}
      subtitle={subtitle}
      selected={selected}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
