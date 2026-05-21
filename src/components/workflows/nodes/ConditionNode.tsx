"use client";

import { GitBranch } from "lucide-react";
import { NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { t } from "@/lib/i18n";
import type { ConditionData } from "../types";

const FIELD_KEY: Record<string, string> = {
  mahnstufe: "nodes.condition.field.mahnstufe",
  patiententyp: "nodes.condition.field.patiententyp",
  email_vorhanden: "nodes.condition.field.email",
  tage_ueberfaellig: "nodes.condition.field.tage",
  scoring: "nodes.condition.field.scoring",
};

const OP_KEY: Record<string, string> = {
  lt: "nodes.condition.op.lt",
  lte: "nodes.condition.op.lte",
  eq: "nodes.condition.op.eq",
  gte: "nodes.condition.op.gte",
  gt: "nodes.condition.op.gt",
  neq: "nodes.condition.op.neq",
  is_true: "nodes.condition.op.isTrue",
};

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConditionData;
  const locale = (data as any)?.__locale ?? "de";
  const fieldLabel = d.field ? (FIELD_KEY[d.field] ? t(FIELD_KEY[d.field], locale) : d.field) : "";
  const opLabel = d.operator && OP_KEY[d.operator] ? t(OP_KEY[d.operator], locale) : "";
  const subtitle = d.field
    ? `${fieldLabel} ${opLabel} ${d.value ?? ""}`.trim()
    : t("nodes.condition.configure", locale);

  return (
    <BaseNode
      icon={<GitBranch size={16} strokeWidth={2.4} />}
      accent="#3b6fb8"
      accentSoft="rgba(59, 111, 184, 0.14)"
      kicker={t("nodes.kicker.condition", locale)}
      title={t("nodes.condition.title", locale)}
      subtitle={subtitle}
      selected={selected}
      branching
      branchTrueLabel={t("nodes.condition.true", locale)}
      branchFalseLabel={t("nodes.condition.false", locale)}
      runtimeStatus={(data as any)?.__runtimeStatus}
    />
  );
}
