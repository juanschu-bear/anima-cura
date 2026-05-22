import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { sendEmail } from "@/lib/services/email-send";

export const runtime = "nodejs";

const PRACTICE_NAME = "Kieferorthopädische Praxis Dr. Maria Schubert";
const DEFAULT_IBAN = "DE XX XXXX XXXX XXXX XXXX XX";

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.record(z.string(), z.any()).optional().default({}),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  type: z.string().optional(),
  animated: z.boolean().optional(),
});

const workflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

const workflowListSchema = z.array(workflowSchema);

const postSchema = z.object({
  workflowId: z.string().min(1),
  patientId: z.string().uuid().optional(),
  rateId: z.string().uuid().optional(),
  triggerEvent: z.string().optional(),
});

type StoredWorkflow = z.infer<typeof workflowSchema>;
type WorkflowNode = z.infer<typeof nodeSchema>;
type WorkflowEdge = z.infer<typeof edgeSchema>;

type ExecutionContext = {
  patient: Record<string, unknown> | null;
  rate: Record<string, unknown> | null;
  triggerEvent: string;
  triggerPayload?: Record<string, unknown>;
};

type ExecutionStep = {
  nodeId: string;
  nodeType: string;
  status: "success" | "skipped" | "failed" | "pending";
  output?: Record<string, unknown>;
  error?: string;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

function normalizeTriggerEvent(event: string | undefined) {
  switch (event) {
    case "rate_overdue":
    case "rate_ueberfaellig":
      return "rate_ueberfaellig";
    case "rate_returned":
    case "ruecklastschrift":
      return "ruecklastschrift";
    case "daily_at":
    case "taeglicher_cron":
      return "taeglicher_cron";
    case "scoring_below":
    case "scoring_kritisch":
      return "scoring_kritisch";
    case "before_due":
    case "rate_faellig_bald":
      return "rate_faellig_bald";
    case "holiday":
    case "feiertag":
      return "feiertag";
    case "patient_birthday":
    case "patientengeburtstag":
      return "patientengeburtstag";
    case "new_patient":
    case "neuer_patient":
      return "neuer_patient";
    case "treatment_complete":
    case "behandlung_abgeschlossen":
      return "behandlung_abgeschlossen";
    default:
      return event || "unbekannt";
  }
}

function getNodeData(node: WorkflowNode) {
  return (node.data || {}) as Record<string, unknown>;
}

function getTriggerNode(workflow: StoredWorkflow) {
  return workflow.nodes.find((node) => node.type === "trigger") || null;
}

function getOutgoingEdges(workflow: StoredWorkflow, nodeId: string) {
  return workflow.edges.filter((edge) => edge.source === nodeId);
}

function firstString(...values: unknown[]) {
  const found = values.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof found === "string" ? found : "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function templateContext(
  patient: Record<string, unknown> | null,
  rate: Record<string, unknown> | null,
  praxisIban: string,
  triggerPayload: Record<string, unknown> = {}
) {
  return {
    patient_name: patient ? `${firstString(patient.vorname)} ${firstString(patient.nachname)}`.trim() : "{{patient_name}}",
    rate_nummer: rate ? String(firstNumber(rate.rate_nummer) ?? "") : "{{rate_nummer}}",
    betrag: rate
      ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(firstNumber(rate.betrag) ?? 0)
      : "{{betrag}}",
    faellig_am: rate?.faellig_am
      ? new Date(String(rate.faellig_am)).toLocaleDateString("de-DE")
      : "{{faellig_am}}",
    mahnstufe: String(firstNumber(rate?.mahnstufe) ?? 0),
    scoring: String(firstNumber(patient?.scoring) ?? ""),
    holiday_name: firstString(triggerPayload.holiday_name, triggerPayload.name) || "{{holiday_name}}",
    holiday_date: triggerPayload.holiday_date
      ? new Date(String(triggerPayload.holiday_date)).toLocaleDateString("de-DE")
      : "{{holiday_date}}",
    praxis_name: PRACTICE_NAME,
    praxis_iban: praxisIban,
  };
}

function replaceTemplateVars(text: string, context: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => context[key] || `{{${key}}}`);
}

function computeDaysOverdue(rate: Record<string, unknown> | null) {
  if (!rate?.faellig_am) {
    return null;
  }

  const dueDate = new Date(String(rate.faellig_am));
  const diff = Date.now() - dueDate.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function sameMonthDay(left: Date, right: Date) {
  return left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function saxonDayOfRepentance(year: number) {
  const date = new Date(year, 10, 23);
  do {
    date.setDate(date.getDate() - 1);
  } while (date.getDay() !== 3);
  return date;
}

function getEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function saxonHolidays(year: number) {
  const easter = getEasterSunday(year);
  return [
    { name: "Neujahr", date: new Date(year, 0, 1) },
    { name: "Karfreitag", date: addDays(easter, -2) },
    { name: "Ostermontag", date: addDays(easter, 1) },
    { name: "Tag der Arbeit", date: new Date(year, 4, 1) },
    { name: "Christi Himmelfahrt", date: addDays(easter, 39) },
    { name: "Pfingstmontag", date: addDays(easter, 50) },
    { name: "Tag der Deutschen Einheit", date: new Date(year, 9, 3) },
    { name: "Reformationstag", date: new Date(year, 9, 31) },
    { name: "Buß- und Bettag", date: saxonDayOfRepentance(year) },
    { name: "1. Weihnachtsfeiertag", date: new Date(year, 11, 25) },
    { name: "2. Weihnachtsfeiertag", date: new Date(year, 11, 26) },
  ];
}

function findSaxonHoliday(targetDate: Date) {
  return saxonHolidays(targetDate.getFullYear()).find((holiday) => dateOnly(holiday.date) === dateOnly(targetDate)) || null;
}

function evaluateCondition(node: WorkflowNode, context: ExecutionContext) {
  const data = getNodeData(node);
  const patient = context.patient;
  const rate = context.rate;

  const actualLookup: Record<string, unknown> = {
    mahnstufe: firstNumber(rate?.mahnstufe) ?? 0,
    versicherung_status: firstString(patient?.versicherung_status),
    email: firstString(patient?.email),
    mobiltelefon: firstString(patient?.mobiltelefon, patient?.telefon),
    kasse: firstString(patient?.kasse),
    scoring: firstNumber(patient?.scoring),
    patiententyp: firstString(patient?.kasse),
    email_vorhanden: Boolean(firstString(patient?.email)),
    tage_ueberfaellig: computeDaysOverdue(rate) ?? 0,
  };

  const field = firstString(data.field);
  const operator = firstString(data.operator);
  const compareValue = data.value;
  const actual = actualLookup[field];

  switch (operator) {
    case "equals":
    case "eq":
      return actual == compareValue;
    case "gt":
      return Number(actual) > Number(compareValue);
    case "gte":
      return Number(actual) >= Number(compareValue);
    case "lt":
      return Number(actual) < Number(compareValue);
    case "lte":
      return Number(actual) <= Number(compareValue);
    case "contains":
      return String(actual ?? "").toLowerCase().includes(String(compareValue ?? "").toLowerCase());
    case "exists":
    case "is_true":
      return Boolean(actual);
    case "neq":
      return actual != compareValue;
    default:
      return false;
  }
}

async function readSettingValue(key: string): Promise<unknown> {
  const db = createServerClient();
  const { data } = await db.from("einstellungen").select("value").eq("key", key).maybeSingle();
  return data?.value;
}

async function loadPraxisIban() {
  const value = await readSettingValue("praxis_iban");

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (value && typeof value === "object" && "iban" in value) {
    const iban = (value as { iban?: unknown }).iban;
    if (typeof iban === "string" && iban.trim()) {
      return iban;
    }
  }

  return DEFAULT_IBAN;
}

async function loadNewPatientCutoff() {
  const candidates = [
    await readSettingValue("ivoris_last_sync"),
    await readSettingValue("last_ivoris_sync"),
    await readSettingValue("workflow_last_sync"),
  ];

  for (const value of candidates) {
    if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) {
      return new Date(value);
    }
    if (value && typeof value === "object") {
      const raw = (value as { last_sync?: unknown; synced_at?: unknown; timestamp?: unknown }).last_sync
        ?? (value as { synced_at?: unknown }).synced_at
        ?? (value as { timestamp?: unknown }).timestamp;
      if (typeof raw === "string" && !Number.isNaN(new Date(raw).getTime())) {
        return new Date(raw);
      }
    }
  }

  return startOfToday();
}

function mapAlertSeverity(value: string) {
  switch (value) {
    case "critical":
      return "kritisch";
    case "warn":
      return "warnung";
    default:
      return value === "kritisch" || value === "warnung" || value === "info" ? value : "info";
  }
}

function mapAlertRecipient(value: string) {
  switch (value) {
    case "praxisleitung":
    case "doktor":
      return "maria";
    case "team":
      return "alle";
    default:
      return value === "sabine" ? "sabine" : value === "maria" ? "maria" : "alle";
  }
}

async function createWorkflowRun(
  workflowId: string,
  triggerEvent: string,
  context: ExecutionContext
) {
  const db = createServerClient();
  const payload = {
    workflow_id: workflowId,
    patient_id: context.patient?.id ?? null,
    status: "running",
    trigger_kind: triggerEvent,
    started_at: new Date().toISOString(),
    trigger_payload: context.triggerPayload ?? {},
  };

  const { data, error } = await db.from("workflow_runs").insert(payload).select("id").single();
  if (error) {
    throw new Error(`Workflow-Run konnte nicht angelegt werden: ${error.message}`);
  }

  return data.id as string;
}

async function finishWorkflowRun(runId: string, payload: Record<string, unknown>) {
  const db = createServerClient();
  const result = payload.result && typeof payload.result === "object"
    ? (payload.result as Record<string, unknown>)
    : {};

  const { error } = await db
    .from("workflow_runs")
    .update({
      status: payload.status,
      steps: result.steps ?? payload.steps ?? [],
      error: payload.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) {
    throw new Error(`Workflow-Run konnte nicht abgeschlossen werden: ${error.message}`);
  }
}

async function fetchPatientById(patientId: string) {
  const db = createServerClient();
  const { data, error } = await db.from("patients").select("*").eq("id", patientId).single();
  if (error) {
    throw new Error(`Patient konnte nicht geladen werden: ${error.message}`);
  }
  return data as Record<string, unknown>;
}

async function fetchRateById(rateId: string) {
  const db = createServerClient();
  const { data, error } = await db.from("raten").select("*").eq("id", rateId).single();
  if (error) {
    throw new Error(`Rate konnte nicht geladen werden: ${error.message}`);
  }
  return data as Record<string, unknown>;
}

async function resolveCandidateContext(workflow: StoredWorkflow, triggerEventOverride?: string) {
  const triggerNode = getTriggerNode(workflow);
  if (!triggerNode) {
    throw new Error("Im Workflow wurde kein Trigger gefunden.");
  }

  const data = getNodeData(triggerNode);
  const event = normalizeTriggerEvent(triggerEventOverride || firstString(data.event));

  if (event === "taeglicher_cron") {
    return {
      patient: null,
      rate: null,
      triggerEvent: event,
    } satisfies ExecutionContext;
  }

  if (event === "rate_ueberfaellig") {
    const db = createServerClient();
    const delayDays = firstNumber(data.delayDays, data.days) ?? 0;
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - delayDays);

    const { data: rate } = await db
      .from("raten")
      .select("*, patients!inner(*)")
      .in("status", ["offen", "ueberfaellig", "überfällig"])
      .lte("faellig_am", limitDate.toISOString().slice(0, 10))
      .order("faellig_am", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!rate) {
      return null;
    }

    return {
      patient: (rate as Record<string, unknown>).patients as Record<string, unknown>,
      rate: rate as Record<string, unknown>,
      triggerEvent: event,
    } satisfies ExecutionContext;
  }

  if (event === "ruecklastschrift" || event === "scoring_kritisch") {
    return {
      patient: null,
      rate: null,
      triggerEvent: event,
    } satisfies ExecutionContext;
  }

  if (
    event === "rate_faellig_bald" ||
    event === "feiertag" ||
    event === "patientengeburtstag" ||
    event === "neuer_patient" ||
    event === "behandlung_abgeschlossen"
  ) {
    const contexts = await resolveBatchContexts(workflow);
    return contexts[0] || null;
  }

  return null;
}

export async function loadStoredWorkflows() {
  const rawValue = await readSettingValue("workflows");
  const parsed = workflowListSchema.safeParse(rawValue);

  if (!parsed.success) {
    throw new Error("Die gespeicherten Workflows in den Einstellungen sind ungültig.");
  }

  return parsed.data;
}

export async function resolveBatchContexts(workflow: StoredWorkflow): Promise<ExecutionContext[]> {
  const triggerNode = getTriggerNode(workflow);
  if (!triggerNode) {
    return [];
  }

  const data = getNodeData(triggerNode);
  const event = normalizeTriggerEvent(firstString(data.event));

  if (event === "taeglicher_cron") {
    return [{ patient: null, rate: null, triggerEvent: event }];
  }

  const db = createServerClient();

  if (event === "rate_ueberfaellig") {
    const delayDays = firstNumber(data.delayDays, data.days) ?? 0;
    const limitDate = addDays(startOfToday(), -delayDays);

    const { data: rates, error } = await db
      .from("raten")
      .select("*, patients!inner(*)")
      .in("status", ["offen", "ueberfaellig", "überfällig"])
      .lte("faellig_am", dateOnly(limitDate))
      .order("faellig_am", { ascending: true });

    if (error) {
      throw new Error(`Überfällige Raten konnten nicht geladen werden: ${error.message}`);
    }

    return (rates || []).map((rate) => ({
      patient: (rate as Record<string, unknown>).patients as Record<string, unknown>,
      rate: rate as Record<string, unknown>,
      triggerEvent: event,
    }));
  }

  if (event === "rate_faellig_bald") {
    const days = firstNumber(data.days, data.delayDays) ?? 2;
    const targetDate = addDays(startOfToday(), days);
    const { data: rates, error } = await db
      .from("raten")
      .select("*, patients!inner(*)")
      .in("status", ["offen", "teilbezahlt"])
      .eq("faellig_am", dateOnly(targetDate))
      .order("faellig_am", { ascending: true });

    if (error) {
      throw new Error(`Fällige Raten konnten nicht geladen werden: ${error.message}`);
    }

    return (rates || []).map((rate) => ({
      patient: (rate as Record<string, unknown>).patients as Record<string, unknown>,
      rate: rate as Record<string, unknown>,
      triggerEvent: event,
    }));
  }

  if (event === "feiertag") {
    const daysBefore = firstNumber(data.days_before, data.days) ?? 2;
    const targetDate = addDays(startOfToday(), daysBefore);
    const holiday = findSaxonHoliday(targetDate);
    if (!holiday) return [];

    const { data: patients, error } = await db
      .from("patients")
      .select("*")
      .order("nachname", { ascending: true });

    if (error) {
      throw new Error(`Patienten konnten für Feiertags-Trigger nicht geladen werden: ${error.message}`);
    }

    return (patients || []).map((patient) => ({
      patient: patient as Record<string, unknown>,
      rate: null,
      triggerEvent: event,
      triggerPayload: {
        holiday_name: holiday.name,
        holiday_date: dateOnly(holiday.date),
        region: firstString(data.region) || "sachsen",
      },
    }));
  }

  if (event === "patientengeburtstag") {
    const daysBefore = firstNumber(data.days_before, data.days) ?? 0;
    const targetDate = addDays(startOfToday(), daysBefore);
    const { data: patients, error } = await db
      .from("patients")
      .select("*")
      .not("geburtsdatum", "is", null);

    if (error) {
      throw new Error(`Geburtstage konnten nicht geladen werden: ${error.message}`);
    }

    return (patients || [])
      .filter((patient) => {
        const birthDate = parseDateOnly((patient as Record<string, unknown>).geburtsdatum);
        return birthDate ? sameMonthDay(birthDate, targetDate) : false;
      })
      .map((patient) => ({
        patient: patient as Record<string, unknown>,
        rate: null,
        triggerEvent: event,
      }));
  }

  if (event === "neuer_patient") {
    const cutoff = await loadNewPatientCutoff();
    const { data: patients, error } = await db
      .from("patients")
      .select("*")
      .gte("created_at", cutoff.toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Neue Patienten konnten nicht geladen werden: ${error.message}`);
    }

    return (patients || []).map((patient) => ({
      patient: patient as Record<string, unknown>,
      rate: null,
      triggerEvent: event,
    }));
  }

  if (event === "behandlung_abgeschlossen") {
    const today = dateOnly(startOfToday());
    const { data: paidToday, error } = await db
      .from("raten")
      .select("*, patients!inner(*)")
      .eq("status", "bezahlt")
      .eq("bezahlt_am", today)
      .order("bezahlt_am", { ascending: true });

    if (error) {
      throw new Error(`Abgeschlossene Raten konnten nicht geladen werden: ${error.message}`);
    }

    const contexts: ExecutionContext[] = [];
    for (const rate of paidToday || []) {
      const planId = String((rate as Record<string, unknown>).ratenplan_id || "");
      if (!planId) continue;

      const { count, error: openError } = await db
        .from("raten")
        .select("id", { count: "exact", head: true })
        .eq("ratenplan_id", planId)
        .in("status", ["offen", "ueberfaellig", "überfällig", "teilbezahlt"]);

      if (openError) {
        throw new Error(`Ratenplan-Abschluss konnte nicht geprüft werden: ${openError.message}`);
      }

      if ((count ?? 0) === 0) {
        contexts.push({
          patient: (rate as Record<string, unknown>).patients as Record<string, unknown>,
          rate: rate as Record<string, unknown>,
          triggerEvent: event,
        });
      }
    }
    return contexts;
  }

  return [];
}

export async function executeStoredWorkflow(
  workflow: StoredWorkflow,
  providedContext?: ExecutionContext | null
) {
  const triggerNode = getTriggerNode(workflow);
  if (!triggerNode) {
    throw new Error("Der Workflow hat keinen Trigger.");
  }

  const runtimeContext =
    providedContext ||
    (await resolveCandidateContext(workflow, normalizeTriggerEvent(firstString(getNodeData(triggerNode).event))));

  if (!runtimeContext) {
    return {
      workflowId: workflow.id,
      status: "skipped",
      reason: "Keine passenden Datensätze für den Trigger gefunden.",
    };
  }

  const triggerEvent = runtimeContext.triggerEvent;
  const runId = await createWorkflowRun(workflow.id, triggerEvent, runtimeContext);
  const steps: ExecutionStep[] = [];
  const praxisIban = await loadPraxisIban();
  const replacements = templateContext(runtimeContext.patient, runtimeContext.rate, praxisIban, runtimeContext.triggerPayload);

  try {
    let currentNode: WorkflowNode | undefined = triggerNode;
    let safetyCounter = 0;

    while (currentNode && safetyCounter < 100) {
      safetyCounter += 1;
      const data = getNodeData(currentNode);
      let nextNodeId: string | undefined;

      if (currentNode.type === "trigger") {
        steps.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          status: "success",
          output: { triggerEvent },
        });
      } else if (currentNode.type === "condition") {
        const result = evaluateCondition(currentNode, runtimeContext);
        steps.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          status: result ? "success" : "skipped",
          output: { result },
        });

        const outgoing = getOutgoingEdges(workflow, currentNode.id);
        const branchHandle = result ? "true" : "false";
        const branchEdge =
          outgoing.find((edge) => edge.sourceHandle === branchHandle) ||
          (result ? outgoing[0] : undefined);

        if (!result && !branchEdge) {
          await finishWorkflowRun(runId, {
            status: "success",
            result: {
              steps,
              stopped_at_condition: currentNode.id,
            },
            error: null,
          });

          return {
            workflowId: workflow.id,
            runId,
            status: "success",
            stoppedAt: currentNode.id,
            steps,
          };
        }

        nextNodeId = branchEdge?.target;
      } else if (currentNode.type === "action_email") {
        const recipientKey = firstString(data.to, data.recipient);
        const recipient =
          recipientKey === "praxisleitung"
            ? process.env.PRACTICE_LEAD_EMAIL || ""
            : firstString(runtimeContext.patient?.email);

        if (!recipient) {
          steps.push({
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            status: "skipped",
            error: "Kein E-Mail-Empfänger vorhanden.",
          });
        } else {
          const response = await sendEmail({
            to: recipient,
            subject: replaceTemplateVars(firstString(data.subject), replacements),
            body: replaceTemplateVars(firstString(data.body), replacements),
            context: replacements,
          });

          steps.push({
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            status: response.ok ? "success" : "failed",
            output: { to: recipient },
            error: response.error,
          });

          if (!response.ok) {
            throw new Error(response.error || "E-Mail konnte nicht versendet werden.");
          }
        }
      } else if (currentNode.type === "action_whatsapp") {
        steps.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          status: "pending",
          output: {
            status: "whatsapp_pending",
            to: firstString(data.to, runtimeContext.patient?.mobiltelefon, runtimeContext.patient?.telefon),
            message: replaceTemplateVars(firstString(data.message), replacements),
          },
        });
      } else if (currentNode.type === "action_alert") {
        const db = createServerClient();
        const message = replaceTemplateVars(firstString(data.message), replacements);
        const title = replaceTemplateVars(firstString(data.title) || "Workflow-Alert", replacements);

        const { error } = await db.from("alerts").insert({
          typ: "system",
          titel: title,
          beschreibung: message,
          schweregrad: mapAlertSeverity(firstString(data.severity)),
          empfaenger: mapAlertRecipient(firstString(data.recipient)),
        });

        if (error) {
          throw new Error(`Alert konnte nicht erstellt werden: ${error.message}`);
        }

        steps.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          status: "success",
          output: { title, message },
        });
      } else if (currentNode.type === "action_mahnstufe") {
        if (!runtimeContext.rate?.id) {
          steps.push({
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            status: "skipped",
            error: "Keine Rate im Ausführungskontext vorhanden.",
          });
        } else {
          const currentLevel = firstNumber(runtimeContext.rate.mahnstufe) ?? 0;
          let targetLevel = currentLevel;

          if (firstString(data.action) === "increase") {
            targetLevel = Math.min(currentLevel + 1, 3);
          } else if (firstString(data.action) === "set") {
            targetLevel = Math.min(3, Math.max(0, firstNumber(data.targetStufe) ?? currentLevel));
          } else if (data.stufe === "eskalation") {
            targetLevel = 3;
          } else {
            targetLevel = Math.min(3, Math.max(0, firstNumber(data.stufe) ?? currentLevel));
          }

          const db = createServerClient();
          const { error } = await db
            .from("raten")
            .update({ mahnstufe: targetLevel })
            .eq("id", String(runtimeContext.rate.id));

          if (error) {
            throw new Error(`Mahnstufe konnte nicht aktualisiert werden: ${error.message}`);
          }

          runtimeContext.rate = { ...runtimeContext.rate, mahnstufe: targetLevel };
          steps.push({
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            status: "success",
            output: { mahnstufe: targetLevel },
          });
        }
      } else if (currentNode.type === "action_scoring") {
        steps.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          status: "pending",
          output: {
            status: "scoring_pending",
            message: "Scoring-Spalte ist noch nicht live.",
          },
        });
      } else if (currentNode.type === "action_wait") {
        steps.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          status: "pending",
          output: {
            status: "wait_pending",
            amount: data.amount ?? null,
            unit: data.unit ?? null,
          },
        });
      } else {
        steps.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          status: "skipped",
          error: `Node-Typ "${currentNode.type}" wird derzeit nicht unterstützt.`,
        });
      }

      if (!nextNodeId) {
        const nextEdge: WorkflowEdge | undefined = getOutgoingEdges(workflow, currentNode.id)[0];
        nextNodeId = nextEdge?.target;
      }

      currentNode = nextNodeId
        ? workflow.nodes.find((node) => node.id === nextNodeId)
        : undefined;
    }

    await finishWorkflowRun(runId, {
      status: "success",
      result: {
        steps,
        patient_id: runtimeContext.patient?.id || null,
        rate_id: runtimeContext.rate?.id || null,
      },
      error: null,
    });

    return {
      workflowId: workflow.id,
      runId,
      status: "success",
      steps,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Workflow-Fehler.";

    await finishWorkflowRun(runId, {
      status: "failed",
      result: { steps },
      error: message,
    });

    return {
      workflowId: workflow.id,
      runId,
      status: "failed",
      error: message,
      steps,
    };
  }
}

export async function POST(request: Request) {
  try {
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "Ungültige Anfrage.",
          details: parsed.error.flatten(),
        }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const workflows = await loadStoredWorkflows();
    const workflow = workflows.find((item) => item.id === parsed.data.workflowId);

    if (!workflow) {
      return new Response(JSON.stringify({ error: "Workflow nicht gefunden." }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    let context: ExecutionContext | null | undefined;

    if (parsed.data.patientId || parsed.data.rateId) {
      const rate = parsed.data.rateId ? await fetchRateById(parsed.data.rateId) : null;
      const patient = parsed.data.patientId
        ? await fetchPatientById(parsed.data.patientId)
        : rate?.patient_id
          ? await fetchPatientById(String(rate.patient_id))
          : null;

      context = {
        patient,
        rate,
        triggerEvent: parsed.data.triggerEvent
          ? normalizeTriggerEvent(parsed.data.triggerEvent)
          : normalizeTriggerEvent(firstString(getNodeData(getTriggerNode(workflow) as WorkflowNode).event)),
      };
    }

    const result = await executeStoredWorkflow(workflow, context);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler beim Ausführen des Workflows.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
