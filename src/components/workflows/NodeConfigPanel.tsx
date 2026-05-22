"use client";

import { X, Trash2, Info, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { WorkflowNode, NodeKind } from "./types";
import { TEMPLATE_VARIABLES } from "./types";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/hooks/useAppStore";

interface Props {
  node: WorkflowNode | null;
  onClose: () => void;
  onChange: (data: any) => void;
  onDelete: () => void;
}

function titleFor(kind: NodeKind | undefined, locale: "de" | "en"): string {
  switch (kind) {
    case "trigger": return t("config.nodes.trigger", locale);
    case "condition": return t("config.nodes.condition", locale);
    case "action_email": return t("config.nodes.email", locale);
    case "action_whatsapp": return t("config.nodes.whatsapp", locale);
    case "action_alert": return t("config.nodes.alert", locale);
    case "action_mahnstufe": return t("config.nodes.mahnstufe", locale);
    case "action_scoring": return t("config.nodes.scoring", locale);
    case "action_wait": return t("config.nodes.wait", locale);
    default: return "Node";
  }
}

export function NodeConfigPanel({ node, onClose, onChange, onDelete }: Props) {
  const { locale } = useAppStore();
  const [justApplied, setJustApplied] = useState(false);

  if (!node) return null;
  const data = (node.data || {}) as any;

  const title = titleFor(node.type as NodeKind, locale);

  function patch(part: Record<string, any>) {
    onChange({ ...data, ...part });
  }

  function apply() {
    setJustApplied(true);
    window.setTimeout(() => {
      setJustApplied(false);
      onClose();
    }, 520);
  }

  return (
    <aside className="wf-config-panel">
      <div className="wf-config-head">
        <div>
          <span className="wf-config-kicker">{t("config.title", locale)}</span>
          <h3 className="wf-config-title">{title}</h3>
        </div>
        <button onClick={onClose} className="wf-iconbtn" aria-label={t("common.close", locale)}>
          <X size={16} />
        </button>
      </div>

      <div className="wf-config-body">
        {node.type === "trigger" && <TriggerForm data={data} patch={patch} locale={locale} />}
        {node.type === "condition" && <ConditionForm data={data} patch={patch} locale={locale} />}
        {node.type === "action_email" && <EmailForm data={data} patch={patch} locale={locale} />}
        {node.type === "action_whatsapp" && <WhatsAppForm data={data} patch={patch} locale={locale} />}
        {node.type === "action_alert" && <AlertForm data={data} patch={patch} locale={locale} />}
        {node.type === "action_mahnstufe" && <MahnstufeForm data={data} patch={patch} locale={locale} />}
        {node.type === "action_scoring" && <ScoringForm data={data} patch={patch} locale={locale} />}
        {node.type === "action_wait" && <WaitForm data={data} patch={patch} locale={locale} />}

        {(node.type === "action_email" || node.type === "action_whatsapp" || node.type === "action_alert") && (
          <div className="wf-vars">
            <div className="wf-vars-head">
              <Info size={13} />
              <span>{t("config.variables", locale)}</span>
            </div>
            <div className="wf-vars-grid">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(v.key)}
                  className="wf-var-chip"
                  title={t("config.clickToCopy", locale, { label: v.label })}
                >
                  <Copy size={11} />
                  <code>{v.key}</code>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="wf-config-foot">
        {node.type !== "trigger" ? (
          <button onClick={onDelete} className="wf-danger-btn" type="button">
            <Trash2 size={14} /> {t("common.delete", locale)}
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={apply}
          type="button"
          className={`wf-primary-btn wf-apply-btn ${justApplied ? "wf-apply-btn-done" : ""}`}
        >
          {justApplied ? (
            <>
              <Check size={14} /> {t("common.applied", locale)}
            </>
          ) : (
            <>
              <Check size={14} /> {t("common.apply", locale)}
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="wf-field">
      <span className="wf-field-label">{label}</span>
      {children}
      {hint && <span className="wf-field-hint">{hint}</span>}
    </label>
  );
}

function TriggerForm({ data, patch, locale }: any) {
  return (
    <div className="wf-form">
      <Field label={t("config.triggerType", locale)}>
        <select className="input" value={data.event || "rate_overdue"} onChange={(e) => patch({ event: e.target.value })}>
          <option value="rate_overdue">{t("config.triggerOption.rateOverdue", locale)}</option>
          <option value="rate_returned">{t("config.triggerOption.rateReturned", locale)}</option>
          <option value="daily_at">{t("config.triggerOption.dailyAt", locale)}</option>
          <option value="scoring_below">{t("config.triggerOption.scoringBelow", locale)}</option>
          <option value="before_due">{t("config.triggerOption.beforeDue", locale)}</option>
          <option value="holiday">{t("config.triggerOption.holiday", locale)}</option>
          <option value="patient_birthday">{t("config.triggerOption.patientBirthday", locale)}</option>
          <option value="new_patient">{t("config.triggerOption.newPatient", locale)}</option>
          <option value="treatment_complete">{t("config.triggerOption.treatmentComplete", locale)}</option>
        </select>
      </Field>

      {data.event === "rate_overdue" && (
        <Field label={t("config.daysOverdue", locale)}>
          <input type="number" min={0} className="input" value={data.days ?? 6} onChange={(e) => patch({ days: Number(e.target.value) })} />
        </Field>
      )}
      {data.event === "before_due" && (
        <Field label={t("config.daysBeforeDue", locale)}>
          <input type="number" min={0} className="input" value={data.days ?? 2} onChange={(e) => patch({ days: Number(e.target.value) })} />
        </Field>
      )}
      {data.event === "daily_at" && (
        <Field label={t("config.time", locale)}>
          <input type="time" className="input" value={data.time || "06:00"} onChange={(e) => patch({ time: e.target.value })} />
        </Field>
      )}
      {data.event === "scoring_below" && (
        <Field label={t("config.thresholdPct", locale)}>
          <input type="number" min={0} max={100} className="input" value={data.threshold ?? 80} onChange={(e) => patch({ threshold: Number(e.target.value) })} />
        </Field>
      )}
      {data.event === "holiday" && (
        <>
          <Field label={t("config.daysBeforeHoliday", locale)}>
            <input type="number" min={0} className="input" value={data.days_before ?? 2} onChange={(e) => patch({ days_before: Number(e.target.value) })} />
          </Field>
          <Field label={t("config.region", locale)}>
            <select className="input" value={data.region || "sachsen"} onChange={(e) => patch({ region: e.target.value })}>
              <option value="sachsen">{t("config.region.saxony", locale)}</option>
            </select>
          </Field>
        </>
      )}
      {data.event === "patient_birthday" && (
        <Field label={t("config.daysBeforeBirthday", locale)}>
          <input type="number" min={0} className="input" value={data.days_before ?? 0} onChange={(e) => patch({ days_before: Number(e.target.value) })} />
        </Field>
      )}
    </div>
  );
}

function ConditionForm({ data, patch, locale }: any) {
  return (
    <div className="wf-form">
      <Field label={t("config.fieldLabel", locale)}>
        <select className="input" value={data.field || "tage_ueberfaellig"} onChange={(e) => patch({ field: e.target.value })}>
          <option value="mahnstufe">{t("config.field.mahnstufe", locale)}</option>
          <option value="patiententyp">{t("config.field.patiententyp", locale)}</option>
          <option value="email_vorhanden">{t("config.field.emailAvailable", locale)}</option>
          <option value="tage_ueberfaellig">{t("config.field.daysOverdue", locale)}</option>
          <option value="scoring">{t("config.field.scoring", locale)}</option>
        </select>
      </Field>
      <Field label={t("config.operatorLabel", locale)}>
        <select className="input" value={data.operator || "lt"} onChange={(e) => patch({ operator: e.target.value })}>
          <option value="lt">{t("config.op.lt", locale)}</option>
          <option value="lte">{t("config.op.lte", locale)}</option>
          <option value="eq">{t("config.op.eq", locale)}</option>
          <option value="gte">{t("config.op.gte", locale)}</option>
          <option value="gt">{t("config.op.gt", locale)}</option>
          <option value="neq">{t("config.op.neq", locale)}</option>
          <option value="is_true">{t("config.op.isTrue", locale)}</option>
        </select>
      </Field>
      {data.operator !== "is_true" && (
        <Field label={t("config.valueLabel", locale)}>
          <input className="input" value={data.value ?? ""} onChange={(e) => patch({ value: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

function EmailForm({ data, patch, locale }: any) {
  return (
    <div className="wf-form">
      <Field label={t("config.recipient", locale)}>
        <select className="input" value={data.recipient || "patient"} onChange={(e) => patch({ recipient: e.target.value })}>
          <option value="patient">{t("config.recipient.patient", locale)}</option>
          <option value="versicherungsnehmer">{t("config.recipient.policyHolder", locale)}</option>
          <option value="praxisleitung">{t("config.recipient.management", locale)}</option>
          <option value="team">{t("config.recipient.team", locale)}</option>
        </select>
      </Field>
      <Field label={t("config.subject", locale)}>
        <input className="input" value={data.subject || ""} onChange={(e) => patch({ subject: e.target.value })} placeholder={t("config.subjectPlaceholder", locale)} />
      </Field>
      <Field label={t("config.message", locale)} hint={t("config.messageHint", locale)}>
        <textarea
          className="input wf-textarea"
          value={data.body || ""}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder={t("config.bodyPlaceholder", locale)}
        />
      </Field>
    </div>
  );
}

function WhatsAppForm({ data, patch, locale }: any) {
  return (
    <div className="wf-form">
      <Field label={t("config.message", locale)} hint={t("config.whatsappHint", locale)}>
        <textarea
          className="input wf-textarea"
          value={data.message || ""}
          onChange={(e) => patch({ message: e.target.value })}
          placeholder={t("config.whatsappPlaceholder", locale)}
        />
      </Field>
    </div>
  );
}

function AlertForm({ data, patch, locale }: any) {
  return (
    <div className="wf-form">
      <Field label={t("config.severity", locale)}>
        <select className="input" value={data.severity || "warn"} onChange={(e) => patch({ severity: e.target.value })}>
          <option value="info">{t("config.severity.info", locale)}</option>
          <option value="warn">{t("config.severity.warn", locale)}</option>
          <option value="critical">{t("config.severity.critical", locale)}</option>
        </select>
      </Field>
      <Field label={t("config.recipient", locale)}>
        <select className="input" value={data.recipient || "team"} onChange={(e) => patch({ recipient: e.target.value })}>
          <option value="praxisleitung">{t("config.recipient.management", locale)}</option>
          <option value="team">{t("config.recipient.team", locale)}</option>
          <option value="doktor">{t("config.recipient.doctor", locale)}</option>
        </select>
      </Field>
      <Field label={t("config.message", locale)}>
        <textarea className="input wf-textarea" value={data.message || ""} onChange={(e) => patch({ message: e.target.value })} />
      </Field>
    </div>
  );
}

function MahnstufeForm({ data, patch, locale }: any) {
  return (
    <div className="wf-form">
      <Field label={t("config.toStage", locale)}>
        <select className="input" value={String(data.stufe ?? "1")} onChange={(e) => {
          const v = e.target.value;
          patch({ stufe: v === "eskalation" ? "eskalation" : Number(v) });
        }}>
          <option value="1">{t("config.stage1", locale)}</option>
          <option value="2">{t("config.stage2", locale)}</option>
          <option value="3">{t("config.stage3", locale)}</option>
          <option value="eskalation">{t("config.stageEsc", locale)}</option>
        </select>
      </Field>
    </div>
  );
}

function WaitForm({ data, patch, locale }: any) {
  return (
    <div className="wf-form">
      <Field label={t("config.waitTime", locale)}>
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <input
            type="number"
            min={1}
            className="input"
            value={data.amount ?? 1}
            onChange={(e) => patch({ amount: Number(e.target.value) })}
          />
          <select
            className="input"
            value={data.unit || "days"}
            onChange={(e) => patch({ unit: e.target.value })}
          >
            <option value="minutes">{t("config.unit.minutes", locale)}</option>
            <option value="hours">{t("config.unit.hours", locale)}</option>
            <option value="days">{t("config.unit.days", locale)}</option>
          </select>
        </div>
      </Field>
    </div>
  );
}

function ScoringForm({ data, patch, locale }: any) {
  return (
    <div className="wf-form">
      <Field label={t("config.points", locale)}>
        <input type="number" className="input" value={data.delta ?? -5} onChange={(e) => patch({ delta: Number(e.target.value) })} />
      </Field>
      <Field label={t("config.reason", locale)}>
        <input className="input" value={data.reason || ""} onChange={(e) => patch({ reason: e.target.value })} />
      </Field>
    </div>
  );
}
