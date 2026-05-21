"use client";

import { FileText, Mail, AlertTriangle, GitBranch, Sparkles } from "lucide-react";
import type { Workflow } from "./types";

function nid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyWorkflow(): Workflow {
  return {
    id: nid(),
    name: "Neuer Workflow",
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

function zahlungserinnerung(): Workflow {
  return {
    id: nid(),
    name: "Zahlungserinnerung",
    description: "Freundliche Erinnerung bei 6 Tagen Verzug",
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

function eskalation(): Workflow {
  return {
    id: nid(),
    name: "Eskalationspipeline",
    description: "Stufenweise Eskalation nach Anzahl überfälliger Tage",
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

function ruecklast(): Workflow {
  return {
    id: nid(),
    name: "Rücklastschrift-Alert",
    description: "Alert + Eskalation + Patient informieren",
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

export const TEMPLATES = [
  {
    id: "empty",
    icon: FileText,
    name: "Leerer Workflow",
    description: "Starte mit einem leeren Canvas und einem Trigger-Node.",
    build: emptyWorkflow,
  },
  {
    id: "zahlungserinnerung",
    icon: Mail,
    name: "Zahlungserinnerung",
    description: "6 Tage überfällig → wenn E-Mail vorhanden → Erinnerungs-Mail.",
    build: zahlungserinnerung,
  },
  {
    id: "eskalation",
    icon: GitBranch,
    name: "Eskalationspipeline",
    description: "Tägliche Prüfung verteilt Patienten auf Mahnstufen 1, 2, 3.",
    build: eskalation,
  },
  {
    id: "ruecklast",
    icon: AlertTriangle,
    name: "Rücklastschrift-Alert",
    description: "Rücklastschrift → Alert + Eskalation + E-Mail an Patient.",
    build: ruecklast,
  },
];

export function WorkflowTemplatePicker({
  onPick,
  onClose,
}: {
  onPick: (w: Workflow) => void;
  onClose: () => void;
}) {
  return (
    <div className="wf-modal-backdrop" onClick={onClose}>
      <div className="wf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wf-modal-head">
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: "var(--ac-primary)" }} />
            <h2 className="text-[18px] font-bold" style={{ color: "var(--ac-text)" }}>
              Neuer Workflow
            </h2>
          </div>
          <p className="text-sm" style={{ color: "var(--ac-text-soft)" }}>
            Wähle einen Startpunkt — alles kann frei angepasst werden.
          </p>
        </div>
        <div className="wf-modal-grid">
          {TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.id}
                onClick={() => onPick(tpl.build())}
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
