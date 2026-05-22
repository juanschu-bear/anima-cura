import type { Edge, Node } from "@xyflow/react";

export type NodeKind =
  | "trigger"
  | "condition"
  | "action_email"
  | "action_whatsapp"
  | "action_alert"
  | "action_mahnstufe"
  | "action_scoring"
  | "action_wait";

export type TriggerEvent =
  | "rate_overdue"
  | "rate_returned"
  | "daily_at"
  | "scoring_below";

export type ConditionField =
  | "mahnstufe"
  | "patiententyp"
  | "email_vorhanden"
  | "tage_ueberfaellig"
  | "scoring";

export type ConditionOperator = "lt" | "lte" | "eq" | "gte" | "gt" | "neq" | "is_true";

export type EmailRecipient =
  | "patient"
  | "versicherungsnehmer"
  | "praxisleitung"
  | "team";

export interface TriggerData {
  event: TriggerEvent;
  days?: number;
  time?: string;
  threshold?: number;
}

export interface ConditionData {
  field: ConditionField;
  operator: ConditionOperator;
  value?: string | number | boolean;
}

export interface ActionEmailData {
  recipient: EmailRecipient;
  subject: string;
  body: string;
}

export interface ActionWhatsAppData {
  message: string;
}

export interface ActionAlertData {
  severity: "info" | "warn" | "critical";
  recipient: "praxisleitung" | "team" | "doktor";
  message: string;
}

export interface ActionMahnstufeData {
  stufe: 1 | 2 | 3 | "eskalation";
}

export interface ActionScoringData {
  delta: number;
  reason?: string;
}

export interface ActionWaitData {
  amount: number;
  unit: "minutes" | "hours" | "days";
}

export type RunStatus = "running" | "success" | "failed" | "skipped" | "dry_run";

export interface WorkflowRunStep {
  node_id: string;
  kind: NodeKind;
  status: RunStatus;
  started_at: string;
  finished_at?: string;
  output?: any;
  error?: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  patient_id: string | null;
  trigger_kind: string;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  trigger_payload: any;
  steps: WorkflowRunStep[];
  error: string | null;
  is_test: boolean;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  snapshot: any;
  author?: string | null;
  note?: string | null;
  created_at: string;
}

export interface WorkflowPatientState {
  id: string;
  workflow_id: string;
  patient_id: string;
  current_node_id: string | null;
  state: "active" | "waiting" | "completed" | "exited" | "failed";
  context: Record<string, any>;
  entered_at: string;
  next_action_at: string | null;
  updated_at: string;
}

export type AnyNodeData =
  | (TriggerData & { label?: string })
  | (ConditionData & { label?: string })
  | (ActionEmailData & { label?: string })
  | (ActionWhatsAppData & { label?: string })
  | (ActionAlertData & { label?: string })
  | (ActionMahnstufeData & { label?: string })
  | (ActionScoringData & { label?: string })
  | (ActionWaitData & { label?: string });

export type WorkflowNode = Node & {
  type: NodeKind;
};

export type WorkflowEdge = Edge;

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  updatedAt: string;
  runsToday?: number;
  errors?: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export const NODE_KINDS: Record<NodeKind, { label: string; description: string }> = {
  trigger: { label: "Trigger", description: "Auslöser für den Workflow" },
  condition: { label: "Bedingung", description: "Filter / Verzweigung" },
  action_email: { label: "E-Mail senden", description: "E-Mail an Empfänger" },
  action_whatsapp: { label: "WhatsApp senden", description: "WhatsApp-Nachricht" },
  action_alert: { label: "Alert", description: "Interne Benachrichtigung" },
  action_mahnstufe: { label: "Mahnstufe ändern", description: "Patient eskalieren" },
  action_scoring: { label: "Scoring anpassen", description: "Punkte hinzu / abziehen" },
  action_wait: { label: "Warten", description: "Verzögerung bevor es weitergeht" },
};

export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: "{{patient_name}}", label: "Name des Patienten" },
  { key: "{{rate_nummer}}", label: "Ratennummer" },
  { key: "{{betrag}}", label: "Offener Betrag" },
  { key: "{{faellig_am}}", label: "Fälligkeitsdatum" },
  { key: "{{mahnstufe}}", label: "Aktuelle Mahnstufe" },
  { key: "{{scoring}}", label: "Aktueller Scoring-Wert" },
  { key: "{{praxis_name}}", label: "Praxis Dr. Maria Schubert" },
  { key: "{{praxis_iban}}", label: "IBAN der Praxis" },
];
