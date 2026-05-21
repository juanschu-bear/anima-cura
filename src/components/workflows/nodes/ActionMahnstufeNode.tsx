"use client";

import { ArrowUpRight } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import type { ActionMahnstufeData } from "../types";

export function ActionMahnstufeNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionMahnstufeData;
  const subtitle = d.stufe !== undefined ? `Auf Stufe ${d.stufe}` : "Mahnstufe wählen";

  return (
    <BaseNode
      icon={<ArrowUpRight size={16} strokeWidth={2.4} />}
      accent="#d27130"
      accentSoft="rgba(210, 113, 48, 0.14)"
      kicker="Aktion"
      title="Mahnstufe erhöhen"
      subtitle={subtitle}
      selected={selected}
    />
  );
}
