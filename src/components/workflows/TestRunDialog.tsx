"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  PlayCircle,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Beaker,
  User,
  Clock,
} from "lucide-react";
import type {
  Workflow,
  WorkflowRun,
  WorkflowRunStep,
  RunStatus,
} from "./types";
import { insertRun } from "./storage";

interface PatientLite {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  kasse?: string;
}

interface Props {
  workflow: Workflow;
  patients: PatientLite[];
  onClose: () => void;
}

const VARIABLES: Record<string, (ctx: any) => string> = {
  "{{patient_name}}": (c) => `${c.patient.vorname} ${c.patient.nachname}`,
  "{{rate_nummer}}": () => "12",
  "{{betrag}}": () => "149,00 €",
  "{{faellig_am}}": () => "15.05.2026",
  "{{mahnstufe}}": (c) => String(c.mahnstufe ?? 1),
  "{{scoring}}": (c) => String(c.scoring ?? 82),
  "{{praxis_name}}": () => "Praxis Dr. Elena Schubert",
  "{{praxis_iban}}": () => "DE12 3456 7890 1234 5678 90",
};

function substitute(text: string, ctx: any): string {
  return Object.entries(VARIABLES).reduce(
    (acc, [key, fn]) => acc.split(key).join(fn(ctx)),
    text
  );
}

function evalCondition(field: string, op: string, value: any, ctx: any): boolean {
  const lookup: Record<string, any> = {
    mahnstufe: ctx.mahnstufe ?? 1,
    patiententyp: ctx.patient.kasse || "gesetzlich",
    email_vorhanden: !!ctx.patient.email,
    tage_ueberfaellig: ctx.tage_ueberfaellig ?? 12,
    scoring: ctx.scoring ?? 82,
  };
  const actual = lookup[field];
  const v = typeof actual === "number" ? Number(value) : value;
  switch (op) {
    case "lt": return actual < v;
    case "lte": return actual <= v;
    case "eq": return actual == v;
    case "gte": return actual >= v;
    case "gt": return actual > v;
    case "neq": return actual != v;
    case "is_true": return Boolean(actual);
    default: return false;
  }
}

function describe(node: any, ctx: any): { output: any; status: RunStatus; error?: string } {
  const d = node.data || {};
  switch (node.type) {
    case "trigger":
      return { output: { fired: true, ...d }, status: "success" };
    case "condition": {
      const ok = evalCondition(d.field, d.operator, d.value, ctx);
      return { output: { evaluated: ok, field: d.field, op: d.operator, value: d.value }, status: ok ? "success" : "skipped" };
    }
    case "action_email":
      if (!ctx.patient.email)
        return { output: null, status: "failed", error: "Patient hat keine E-Mail-Adresse" };
      return {
        output: {
          to: ctx.patient.email,
          subject: substitute(d.subject || "", ctx),
          body: substitute(d.body || "", ctx),
        },
        status: "success",
      };
    case "action_whatsapp":
      return {
        output: { message: substitute(d.message || "", ctx) },
        status: "success",
      };
    case "action_alert":
      return {
        output: { severity: d.severity, recipient: d.recipient, message: substitute(d.message || "", ctx) },
        status: "success",
      };
    case "action_mahnstufe":
      return { output: { neue_stufe: d.stufe }, status: "success" };
    case "action_scoring":
      return { output: { delta: d.delta, neuer_score: (ctx.scoring ?? 82) + (d.delta || 0) }, status: "success" };
    case "action_wait":
      return { output: { warten: `${d.amount} ${d.unit}` }, status: "success" };
    default:
      return { output: null, status: "skipped" };
  }
}

export function TestRunDialog({ workflow, patients, onClose }: Props) {
  const [patientId, setPatientId] = useState<string>("__dummy__");
  const [steps, setSteps] = useState<WorkflowRunStep[]>([]);
  const [running, setRunning] = useState(false);
  const [finalStatus, setFinalStatus] = useState<RunStatus | null>(null);

  const patient = useMemo<PatientLite>(() => {
    if (patientId === "__dummy__") {
      return {
        id: "dummy",
        vorname: "Maria",
        nachname: "Musterpatient",
        email: "maria@example.com",
        kasse: "privat",
      };
    }
    return patients.find((p) => p.id === patientId) || patients[0];
  }, [patientId, patients]);

  async function run() {
    setRunning(true);
    setSteps([]);
    setFinalStatus(null);

    const ctx: any = {
      patient,
      mahnstufe: 1,
      scoring: 82,
      tage_ueberfaellig: 12,
    };

    const trigger = workflow.nodes.find((n) => n.type === "trigger");
    if (!trigger) {
      setFinalStatus("failed");
      setRunning(false);
      return;
    }

    const recordedSteps: WorkflowRunStep[] = [];
    const queue: { id: string; via?: "true" | "false" }[] = [{ id: trigger.id }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur.id)) continue;
      visited.add(cur.id);
      const node = workflow.nodes.find((n) => n.id === cur.id);
      if (!node) continue;

      await new Promise((r) => setTimeout(r, 280));

      const startedAt = new Date().toISOString();
      const result = describe(node, ctx);
      const step: WorkflowRunStep = {
        node_id: node.id,
        kind: node.type as any,
        status: result.status,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        output: result.output,
        error: result.error,
      };
      recordedSteps.push(step);
      setSteps([...recordedSteps]);

      if (result.status === "failed") {
        setFinalStatus("failed");
        setRunning(false);
        await persistDryRun(workflow, recordedSteps, "failed", patient);
        return;
      }

      // Follow edges
      const outgoing = workflow.edges.filter((e) => e.source === node.id);
      if (node.type === "condition") {
        const branch = result.status === "success" ? "true" : "false";
        outgoing
          .filter((e) => e.sourceHandle === branch || !e.sourceHandle)
          .forEach((e) => queue.push({ id: e.target as string, via: branch as any }));
      } else {
        outgoing.forEach((e) => queue.push({ id: e.target as string }));
      }
    }

    const anyFail = recordedSteps.some((s) => s.status === "failed");
    setFinalStatus(anyFail ? "failed" : "success");
    setRunning(false);
    await persistDryRun(workflow, recordedSteps, anyFail ? "failed" : "success", patient);
  }

  async function persistDryRun(
    wf: Workflow,
    s: WorkflowRunStep[],
    status: RunStatus,
    p: PatientLite
  ) {
    const startedAt = s[0]?.started_at || new Date().toISOString();
    const finishedAt = s[s.length - 1]?.finished_at || new Date().toISOString();
    const duration = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    await insertRun({
      workflow_id: wf.id,
      patient_id: p.id === "dummy" ? null : p.id,
      trigger_kind: (wf.nodes.find((n) => n.type === "trigger")?.data as any)?.event || "manual",
      status: "dry_run",
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: duration,
      trigger_payload: { manual: true, finalStatus: status },
      steps: s,
      error: null,
      is_test: true,
    } as any);
  }

  return (
    <div className="wf-modal-backdrop" onClick={onClose}>
      <div className="wf-modal wf-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="wf-modal-head flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Beaker size={18} style={{ color: "var(--ac-primary)" }} />
              <h2 className="text-[18px] font-bold" style={{ color: "var(--ac-text)" }}>
                Test-Run
              </h2>
            </div>
            <p className="text-sm mt-1" style={{ color: "var(--ac-text-soft)" }}>
              Simuliert den Workflow mit Beispieldaten — verschickt nichts an Patienten.
            </p>
          </div>
          <button onClick={onClose} className="wf-iconbtn" aria-label="Schließen">
            <X size={16} />
          </button>
        </div>

        <div className="wf-testrun-body">
          <div className="wf-testrun-controls">
            <label className="wf-field" style={{ flex: 1 }}>
              <span className="wf-field-label">Test-Patient</span>
              <select
                className="input"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                disabled={running}
              >
                <option value="__dummy__">Dummy-Patient (Maria Musterpatient)</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.vorname} {p.nachname} {p.email ? "" : "(keine E-Mail)"}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={run}
              disabled={running}
              className="wf-primary-btn"
              style={{ alignSelf: "flex-end" }}
            >
              <PlayCircle size={14} /> {running ? "Läuft …" : "Test starten"}
            </button>
          </div>

          <div className="wf-testrun-patient">
            <span className="wf-meta-chip">
              <User size={11} /> {patient.vorname} {patient.nachname}
            </span>
            {patient.email && (
              <span className="wf-meta-chip">
                <span className="opacity-70">mail</span> {patient.email}
              </span>
            )}
            <span className="wf-meta-chip">Mahnstufe 1 · Scoring 82 · 12 Tage überfällig</span>
          </div>

          <div className="wf-testrun-steps">
            {steps.length === 0 && !running && (
              <p className="wf-empty-inline">Noch nicht gelaufen. Klicke „Test starten".</p>
            )}
            {steps.map((s, idx) => {
              const icon =
                s.status === "success" ? <CheckCircle2 size={14} /> :
                s.status === "failed" ? <XCircle size={14} /> :
                s.status === "skipped" ? <CircleDashed size={14} /> :
                <Clock size={14} />;
              const color =
                s.status === "success" ? "#5f9339" :
                s.status === "failed" ? "#cb4f56" :
                s.status === "skipped" ? "#6b7d99" :
                "#c8942d";
              return (
                <div key={idx} className="wf-testrun-step" style={{ borderColor: `color-mix(in srgb, ${color} 35%, var(--ac-border))` }}>
                  <span style={{ color }}>{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="wf-testrun-kind">{s.kind} <span style={{ color, fontWeight: 700 }}>· {s.status}</span></p>
                    {s.error && <p className="wf-testrun-error">{s.error}</p>}
                    {s.output && (
                      <pre className="wf-testrun-output">{JSON.stringify(s.output, null, 2)}</pre>
                    )}
                  </div>
                </div>
              );
            })}
            {running && (
              <div className="wf-testrun-step wf-testrun-running">
                <Clock size={14} className="animate-spin-slow" style={{ color: "var(--ac-warning)" }} />
                <span>Schritt läuft …</span>
              </div>
            )}
          </div>

          {finalStatus && (
            <div
              className="wf-testrun-summary"
              style={{
                borderColor: finalStatus === "success"
                  ? "color-mix(in srgb, #5f9339 45%, var(--ac-border))"
                  : "color-mix(in srgb, #cb4f56 45%, var(--ac-border))",
                background: finalStatus === "success"
                  ? "color-mix(in srgb, #5f9339 10%, var(--ac-surface-muted))"
                  : "color-mix(in srgb, #cb4f56 10%, var(--ac-surface-muted))",
                color: finalStatus === "success" ? "#5f9339" : "#cb4f56",
              }}
            >
              {finalStatus === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <strong>{finalStatus === "success" ? "Test erfolgreich" : "Test mit Fehler beendet"}</strong>
              <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
                Gespeichert als Dry-Run im Verlauf
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
