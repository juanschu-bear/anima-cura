"use client";

import { FileText, Mail, AlertTriangle, GitBranch, Sparkles } from "lucide-react";
import type { Workflow } from "./types";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/hooks/useAppStore";

type Locale = "de" | "en";

function nid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyWorkflow(locale: Locale): Workflow {
  return {
    id: nid(),
    name: t("workflow.new", locale),
    description: "",
    active: false,
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 80, y: 220 },
        data: { event: "rate_overdue", days: 6 },
      },
    ],
    edges: [],
  };
}

function zahlungserinnerung(locale: Locale): Workflow {
  return {
    id: nid(),
    name: t("templates.reminder.name", locale),
    description: t("templates.reminder.desc", locale),
    active: false,
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: "t",
        type: "trigger",
        position: { x: 40, y: 220 },
        data: { event: "rate_overdue", days: 6 },
      },
      {
        id: "c",
        type: "condition",
        position: { x: 380, y: 220 },
        data: { field: "email_vorhanden", operator: "is_true" },
      },
      {
        id: "e",
        type: "action_email",
        position: { x: 740, y: 140 },
        data: {
          recipient: "patient",
          subject: "Erinnerung: Offene Rate {{rate_nummer}}",
          body:
            "Sehr geehrte/r {{patient_name}},\n\nwir möchten Sie freundlich daran erinnern, dass die Rate Nr. {{rate_nummer}} über {{betrag}}€ seit dem {{faellig_am}} offen ist.\n\nMit freundlichen Grüßen\n{{praxis_name}}",
        },
      },
      {
        id: "a",
        type: "action_alert",
        position: { x: 740, y: 360 },
        data: { severity: "info", recipient: "team", message: "Patient hat keine E-Mail — telefonisch kontaktieren" },
      },
    ],
    edges: [
      { id: "e1", source: "t", target: "c" },
      { id: "e2", source: "c", sourceHandle: "true", target: "e" },
      { id: "e3", source: "c", sourceHandle: "false", target: "a" },
    ],
  };
}

function eskalation(locale: Locale): Workflow {
  return {
    id: nid(),
    name: t("templates.escalation.name", locale),
    description: t("templates.escalation.desc", locale),
    active: false,
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: "t", type: "trigger", position: { x: 40, y: 240 }, data: { event: "daily_at", time: "06:00" } },
      { id: "c1", type: "condition", position: { x: 360, y: 60 }, data: { field: "tage_ueberfaellig", operator: "gte", value: 21 } },
      { id: "c2", type: "condition", position: { x: 360, y: 260 }, data: { field: "tage_ueberfaellig", operator: "gte", value: 14 } },
      { id: "c3", type: "condition", position: { x: 360, y: 460 }, data: { field: "tage_ueberfaellig", operator: "gte", value: 7 } },
      { id: "m1", type: "action_mahnstufe", position: { x: 740, y: 60 }, data: { stufe: 3 } },
      { id: "m2", type: "action_mahnstufe", position: { x: 740, y: 260 }, data: { stufe: 2 } },
      { id: "m3", type: "action_mahnstufe", position: { x: 740, y: 460 }, data: { stufe: 1 } },
    ],
    edges: [
      { id: "e1", source: "t", target: "c1" },
      { id: "e2", source: "t", target: "c2" },
      { id: "e3", source: "t", target: "c3" },
      { id: "e4", source: "c1", sourceHandle: "true", target: "m1" },
      { id: "e5", source: "c2", sourceHandle: "true", target: "m2" },
      { id: "e6", source: "c3", sourceHandle: "true", target: "m3" },
    ],
  };
}

function ruecklast(locale: Locale): Workflow {
  return {
    id: nid(),
    name: t("templates.chargeback.name", locale),
    description: t("templates.chargeback.desc", locale),
    active: false,
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: "t", type: "trigger", position: { x: 40, y: 220 }, data: { event: "rate_returned" } },
      { id: "a", type: "action_alert", position: { x: 360, y: 80 }, data: { severity: "critical", recipient: "praxisleitung", message: "Rücklastschrift bei {{patient_name}}" } },
      { id: "m", type: "action_mahnstufe", position: { x: 360, y: 260 }, data: { stufe: "eskalation" } },
      { id: "e", type: "action_email", position: { x: 360, y: 440 }, data: {
        recipient: "patient",
        subject: "Wichtig: Rücklastschrift — Rate {{rate_nummer}}",
        body: "Sehr geehrte/r {{patient_name}},\n\nIhre Lastschrift über {{betrag}}€ wurde zurückgezogen. Bitte überweisen Sie den Betrag manuell.\n\n{{praxis_name}}",
      } },
    ],
    edges: [
      { id: "e1", source: "t", target: "a" },
      { id: "e2", source: "t", target: "m" },
      { id: "e3", source: "t", target: "e" },
    ],
  };
}

export function getTemplates(locale: Locale) {
  return [
    {
      id: "empty",
      icon: FileText,
      name: t("templates.empty.name", locale),
      description: t("templates.empty.desc", locale),
      build: emptyWorkflow,
    },
    {
      id: "zahlungserinnerung",
      icon: Mail,
      name: t("templates.reminder.name", locale),
      description: t("templates.reminder.desc", locale),
      build: zahlungserinnerung,
    },
    {
      id: "eskalation",
      icon: GitBranch,
      name: t("templates.escalation.name", locale),
      description: t("templates.escalation.desc", locale),
      build: eskalation,
    },
    {
      id: "ruecklast",
      icon: AlertTriangle,
      name: t("templates.chargeback.name", locale),
      description: t("templates.chargeback.desc", locale),
      build: ruecklast,
    },
  ];
}

export function WorkflowTemplatePicker({
  onPick,
  onClose,
}: {
  onPick: (w: Workflow) => void;
  onClose: () => void;
}) {
  const { locale } = useAppStore();
  const templates = getTemplates(locale);
  return (
    <div className="wf-modal-backdrop" onClick={onClose}>
      <div className="wf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wf-modal-head">
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: "var(--ac-primary)" }} />
            <h2 className="text-[18px] font-bold" style={{ color: "var(--ac-text)" }}>
              {t("templates.modalTitle", locale)}
            </h2>
          </div>
          <p className="text-sm" style={{ color: "var(--ac-text-soft)" }}>
            {t("templates.modalSubtitle", locale)}
          </p>
        </div>
        <div className="wf-modal-grid">
          {templates.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.id}
                onClick={() => onPick(tpl.build(locale))}
                className="wf-template-card"
                type="button"
              >
                <div className="wf-template-icon">
                  <Icon size={18} strokeWidth={2.2} />
                </div>
                <div className="wf-template-meta">
                  <h3>{tpl.name}</h3>
                  <p>{tpl.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
