"use client";

import { X, Trash2, Info, Copy } from "lucide-react";
import type { WorkflowNode, NodeKind } from "./types";
import { TEMPLATE_VARIABLES } from "./types";

interface Props {
  node: WorkflowNode | null;
  onClose: () => void;
  onChange: (data: any) => void;
  onDelete: () => void;
}

export function NodeConfigPanel({ node, onClose, onChange, onDelete }: Props) {
  if (!node) return null;
  const data = (node.data || {}) as any;

  const title = TITLES[node.type as NodeKind] || "Node";

  function patch(part: Record<string, any>) {
    onChange({ ...data, ...part });
  }

  return (
    <aside className="wf-config-panel">
      <div className="wf-config-head">
        <div>
          <span className="wf-config-kicker">Konfiguration</span>
          <h3 className="wf-config-title">{title}</h3>
        </div>
        <button onClick={onClose} className="wf-iconbtn" aria-label="Schließen">
          <X size={16} />
        </button>
      </div>

      <div className="wf-config-body">
        {node.type === "trigger" && <TriggerForm data={data} patch={patch} />}
        {node.type === "condition" && <ConditionForm data={data} patch={patch} />}
        {node.type === "action_email" && <EmailForm data={data} patch={patch} />}
        {node.type === "action_whatsapp" && <WhatsAppForm data={data} patch={patch} />}
        {node.type === "action_alert" && <AlertForm data={data} patch={patch} />}
        {node.type === "action_mahnstufe" && <MahnstufeForm data={data} patch={patch} />}
        {node.type === "action_scoring" && <ScoringForm data={data} patch={patch} />}

        {(node.type === "action_email" || node.type === "action_whatsapp" || node.type === "action_alert") && (
          <div className="wf-vars">
            <div className="wf-vars-head">
              <Info size={13} />
              <span>Verfügbare Variablen</span>
            </div>
            <div className="wf-vars-grid">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(v.key)}
                  className="wf-var-chip"
                  title={v.label + " — Klicken zum Kopieren"}
                >
                  <Copy size={11} />
                  <code>{v.key}</code>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {node.type !== "trigger" && (
        <div className="wf-config-foot">
          <button onClick={onDelete} className="wf-danger-btn" type="button">
            <Trash2 size={14} /> Node löschen
          </button>
        </div>
      )}
    </aside>
  );
}

const TITLES: Record<NodeKind, string> = {
  trigger: "Trigger",
  condition: "Bedingung",
  action_email: "E-Mail senden",
  action_whatsapp: "WhatsApp senden",
  action_alert: "Alert auslösen",
  action_mahnstufe: "Mahnstufe ändern",
  action_scoring: "Scoring anpassen",
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="wf-field">
      <span className="wf-field-label">{label}</span>
      {children}
      {hint && <span className="wf-field-hint">{hint}</span>}
    </label>
  );
}

function TriggerForm({ data, patch }: any) {
  return (
    <div className="wf-form">
      <Field label="Auslöser-Typ">
        <select className="input" value={data.event || "rate_overdue"} onChange={(e) => patch({ event: e.target.value })}>
          <option value="rate_overdue">Rate ist überfällig</option>
          <option value="rate_returned">Rücklastschrift erkannt</option>
          <option value="daily_at">Täglich um Uhrzeit</option>
          <option value="scoring_below">Scoring unter Schwellwert</option>
        </select>
      </Field>

      {data.event === "rate_overdue" && (
        <Field label="Tage überfällig">
          <input type="number" min={0} className="input" value={data.days ?? 6} onChange={(e) => patch({ days: Number(e.target.value) })} />
        </Field>
      )}
      {data.event === "daily_at" && (
        <Field label="Uhrzeit">
          <input type="time" className="input" value={data.time || "06:00"} onChange={(e) => patch({ time: e.target.value })} />
        </Field>
      )}
      {data.event === "scoring_below" && (
        <Field label="Schwellwert (%)">
          <input type="number" min={0} max={100} className="input" value={data.threshold ?? 80} onChange={(e) => patch({ threshold: Number(e.target.value) })} />
        </Field>
      )}
    </div>
  );
}

function ConditionForm({ data, patch }: any) {
  return (
    <div className="wf-form">
      <Field label="Feld">
        <select className="input" value={data.field || "tage_ueberfaellig"} onChange={(e) => patch({ field: e.target.value })}>
          <option value="mahnstufe">Mahnstufe</option>
          <option value="patiententyp">Patiententyp</option>
          <option value="email_vorhanden">E-Mail vorhanden</option>
          <option value="tage_ueberfaellig">Tage überfällig</option>
          <option value="scoring">Scoring</option>
        </select>
      </Field>
      <Field label="Operator">
        <select className="input" value={data.operator || "lt"} onChange={(e) => patch({ operator: e.target.value })}>
          <option value="lt">kleiner als</option>
          <option value="lte">kleiner gleich</option>
          <option value="eq">gleich</option>
          <option value="gte">größer gleich</option>
          <option value="gt">größer als</option>
          <option value="neq">ungleich</option>
          <option value="is_true">ist gesetzt</option>
        </select>
      </Field>
      {data.operator !== "is_true" && (
        <Field label="Wert">
          <input className="input" value={data.value ?? ""} onChange={(e) => patch({ value: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

function EmailForm({ data, patch }: any) {
  return (
    <div className="wf-form">
      <Field label="Empfänger">
        <select className="input" value={data.recipient || "patient"} onChange={(e) => patch({ recipient: e.target.value })}>
          <option value="patient">Patient</option>
          <option value="versicherungsnehmer">Versicherungsnehmer (Eltern)</option>
          <option value="praxisleitung">Praxisleitung</option>
          <option value="team">Team</option>
        </select>
      </Field>
      <Field label="Betreff">
        <input className="input" value={data.subject || ""} onChange={(e) => patch({ subject: e.target.value })} placeholder="z.B. Erinnerung: Rate {{rate_nummer}}" />
      </Field>
      <Field label="Nachricht" hint="Variablen wie {{patient_name}} werden zur Laufzeit ersetzt.">
        <textarea
          className="input wf-textarea"
          value={data.body || ""}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder="Sehr geehrte/r {{patient_name}}, …"
        />
      </Field>
    </div>
  );
}

function WhatsAppForm({ data, patch }: any) {
  return (
    <div className="wf-form">
      <Field label="Nachricht" hint="Kurz und freundlich halten — Variablen wie {{patient_name}} sind erlaubt.">
        <textarea
          className="input wf-textarea"
          value={data.message || ""}
          onChange={(e) => patch({ message: e.target.value })}
          placeholder="Guten Tag {{patient_name}}, …"
        />
      </Field>
    </div>
  );
}

function AlertForm({ data, patch }: any) {
  return (
    <div className="wf-form">
      <Field label="Schweregrad">
        <select className="input" value={data.severity || "warn"} onChange={(e) => patch({ severity: e.target.value })}>
          <option value="info">Info</option>
          <option value="warn">Warnung</option>
          <option value="critical">Kritisch</option>
        </select>
      </Field>
      <Field label="Empfänger">
        <select className="input" value={data.recipient || "team"} onChange={(e) => patch({ recipient: e.target.value })}>
          <option value="praxisleitung">Praxisleitung</option>
          <option value="team">Team</option>
          <option value="doktor">Dr. Schubert direkt</option>
        </select>
      </Field>
      <Field label="Nachricht">
        <textarea className="input wf-textarea" value={data.message || ""} onChange={(e) => patch({ message: e.target.value })} />
      </Field>
    </div>
  );
}

function MahnstufeForm({ data, patch }: any) {
  return (
    <div className="wf-form">
      <Field label="Auf Stufe setzen">
        <select className="input" value={String(data.stufe ?? "1")} onChange={(e) => {
          const v = e.target.value;
          patch({ stufe: v === "eskalation" ? "eskalation" : Number(v) });
        }}>
          <option value="1">Stufe 1 — Erinnerung</option>
          <option value="2">Stufe 2 — Mahnung</option>
          <option value="3">Stufe 3 — Letzte Mahnung</option>
          <option value="eskalation">Eskalation (Inkasso)</option>
        </select>
      </Field>
    </div>
  );
}

function ScoringForm({ data, patch }: any) {
  return (
    <div className="wf-form">
      <Field label="Punkte (negativ = abziehen)">
        <input type="number" className="input" value={data.delta ?? -5} onChange={(e) => patch({ delta: Number(e.target.value) })} />
      </Field>
      <Field label="Grund (optional)">
        <input className="input" value={data.reason || ""} onChange={(e) => patch({ reason: e.target.value })} />
      </Field>
    </div>
  );
}
