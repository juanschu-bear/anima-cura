"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/hooks/useAppStore";

type LaneId = "eingang" | "review" | "ausrollen";
type SignalType = "fehlantwort" | "feature-wunsch" | "navigationsproblem" | "wissensluecke";
type Priority = "hoch" | "mittel" | "niedrig";

type OpsItem = {
  id: string;
  lane: LaneId;
  title: string;
  type: SignalType;
  priority: Priority;
  source: string;
  area: string;
  summary: string;
  ask: string;
  fix: string;
  href?: string;
  hrefLabel?: string;
  patient?: string;
};

const OPS_ITEMS: OpsItem[] = [
  {
    id: "qr-payment-explanation",
    lane: "review",
    title: "QR-Zahlung wurde falsch erklärt",
    type: "fehlantwort",
    priority: "hoch",
    source: "Praxisfeedback",
    area: "Kasse / Zahlungen",
    summary: "iCura hat gesagt, QR-Zahlungen stünden nicht zur Verfügung, obwohl der echte Flow über Kasse existiert.",
    ask: "Wie kann ich QR-Zahlungen für Patienten erstellen?",
    fix: "Produktwissen, Voice-Hilfe und Navigation müssen auf den echten Kassen-Flow zeigen.",
    href: "/kasse",
    hrefLabel: "Kasse öffnen",
  },
  {
    id: "open-patient-via-voice",
    lane: "review",
    title: "Patient direkt öffnen per Sprache",
    type: "navigationsproblem",
    priority: "hoch",
    source: "Dr. Schubert im Alltag",
    area: "Patientensuche",
    summary: "Wenn die Praxis sagt ‚Zeig mir folgenden Patienten‘, muss iCura nicht nur antworten, sondern direkt in den richtigen Patientenkontext führen.",
    ask: "Zeig mir folgenden Patienten.",
    fix: "Trefferliste, Auswahl und direkte Navigation zum Patientenprofil ergänzen.",
    href: "/patienten",
    hrefLabel: "Patienten öffnen",
  },
  {
    id: "payments-vs-open-items",
    lane: "eingang",
    title: "Zahlungen, Umsatz und offene Posten werden verwechselt",
    type: "wissensluecke",
    priority: "hoch",
    source: "Mehrfaches Praxisfeedback",
    area: "Quartal / Offene Posten / Zahlungen",
    summary: "Für die Praxis muss klar sein, ob iCura gerade über Geldbewegungen, Umsatz oder Forderungen spricht.",
    ask: "Wie viel Umsatz haben wir dieses Quartal gemacht und wie viel ist noch offen?",
    fix: "Intent-Trennung im Finanzbereich und präzise Weiterleitung in Quartal, Zahlungen oder Offene Posten.",
    href: "/quartal",
    hrefLabel: "Quartalsbericht öffnen",
  },
  {
    id: "unknowns-to-inbox",
    lane: "eingang",
    title: "Unbekannte Fragen landen noch nirgends",
    type: "feature-wunsch",
    priority: "mittel",
    source: "Produktidee",
    area: "iCura Core",
    summary: "Wenn iCura etwas nicht weiß, brauchen wir eine echte Sammelstelle statt einer improvisierten Antwort.",
    ask: "Das wäre cool, wenn du mir bei X weiterhelfen könntest.",
    fix: "Automatische Feedback-Inbox für unbekannte Fragen, Fehlantworten und neue Fähigkeitswünsche bauen.",
  },
  {
    id: "animasign-state-language",
    lane: "ausrollen",
    title: "AnimaSign-Status sprachlich trennen",
    type: "wissensluecke",
    priority: "mittel",
    source: "Bereits identifiziert",
    area: "AnimaSign",
    summary: "Signatur offen, PDF offen, Ivoris-Sync offen und manuelle Prüfung dürfen nicht vermischt werden.",
    ask: "Warum steht hier PDF noch nicht da oder Ivoris manuell?",
    fix: "Statussprache und Hilfetexte im Assistenten sauber getrennt halten.",
    href: "/animasign",
    hrefLabel: "AnimaSign öffnen",
  },
  {
    id: "payment-context-per-patient",
    lane: "ausrollen",
    title: "Patientenzahlungen operativ beantworten",
    type: "feature-wunsch",
    priority: "mittel",
    source: "Bereits umgesetzt in Teilen",
    area: "Patienten / Zahlungen",
    summary: "iCura soll letzte Geldbewegungen, offene Posten und wartende Zahlungen pro Patient sauber benennen können.",
    ask: "Was ist bei diesem Patienten finanziell offen oder schon bezahlt?",
    fix: "Tooling mit Patientensnapshot und Bewegungslogik weiter nutzen und sichtbar machen.",
    href: "/zahlungen",
    hrefLabel: "Zahlungen öffnen",
    patient: "patientenspezifisch",
  },
];

const LANE_META: Record<
  LaneId,
  { title: string; subtitle: string; tone: string }
> = {
  eingang: {
    title: "1. Eingang",
    subtitle: "Neue Fragen, Friktionen, Wünsche",
    tone: "#60a5fa",
  },
  review: {
    title: "2. Review",
    subtitle: "Was wir als Nächstes lösen müssen",
    tone: "#fbbf24",
  },
  ausrollen: {
    title: "3. Ausrollen",
    subtitle: "Bereits definierte Verbesserungen",
    tone: "#4ade80",
  },
};

const TYPE_LABEL: Record<SignalType, string> = {
  fehlantwort: "Fehlantwort",
  "feature-wunsch": "Feature-Wunsch",
  navigationsproblem: "Navigation",
  wissensluecke: "Wissenslücke",
};

const PRIORITY_TONE: Record<Priority, string> = {
  hoch: "#f87171",
  mittel: "#fbbf24",
  niedrig: "#94a3b8",
};

export default function ICuraOpsPage() {
  const { theme } = useAppStore();
  const dk = theme === "dark";
  const [activeId, setActiveId] = useState<string>(OPS_ITEMS[0]?.id ?? "");

  const fg = dk ? "#edf2f7" : "#162033";
  const muted = dk ? "#94a3b8" : "#66758d";
  const border = dk ? "rgba(255,255,255,0.08)" : "#e6ebf3";
  const card = dk ? "rgba(11,16,28,0.94)" : "#ffffff";
  const panel = dk ? "linear-gradient(135deg, rgba(7,11,20,0.98), rgba(16,18,34,0.98))" : "linear-gradient(135deg, #ffffff, #f7fafc)";
  const purple = "#a78bfa";

  const activeItem = useMemo(
    () => OPS_ITEMS.find((item) => item.id === activeId) ?? OPS_ITEMS[0],
    [activeId],
  );

  return (
    <div style={{ maxWidth: 1380, margin: "0 auto" }}>
      <section
        style={{
          background: panel,
          border: `1px solid ${border}`,
          borderRadius: 24,
          padding: 28,
          marginBottom: 18,
          boxShadow: dk ? "0 24px 70px rgba(0,0,0,0.28)" : "0 18px 50px rgba(15,23,42,0.08)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.8, textTransform: "uppercase", color: purple, marginBottom: 12 }}>
          iCura Product Ops
        </div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 36, lineHeight: 1.02, letterSpacing: -0.8, color: fg, margin: 0 }}>
          Inbox, Review, Ausrollen
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: muted, maxWidth: 980, margin: "14px 0 0" }}>
          Das hier ist kein Revenue-Board und auch keine bloße Instruction-Seite. Es ist das Arbeitsinterface dafür, wie iCura besser wird:
          neue Friktionen kommen rein, werden priorisiert und anschließend als konkrete Produktverbesserung ausgerollt.
        </p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1.5fr 0.9fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {(["eingang", "review", "ausrollen"] as LaneId[]).map((lane) => {
            const meta = LANE_META[lane];
            const items = OPS_ITEMS.filter((item) => item.lane === lane);
            return (
              <div
                key={lane}
                style={{
                  background: card,
                  border: `1px solid ${border}`,
                  borderRadius: 20,
                  padding: 16,
                  minHeight: 720,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: fg }}>{meta.title}</div>
                    <div style={{ fontSize: 11.5, color: muted, marginTop: 4 }}>{meta.subtitle}</div>
                  </div>
                  <div
                    style={{
                      minWidth: 30,
                      height: 30,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      background: `${meta.tone}18`,
                      border: `1px solid ${meta.tone}33`,
                      color: meta.tone,
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {items.length}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {items.map((item) => {
                    const isActive = activeItem?.id === item.id;
                    const tone = PRIORITY_TONE[item.priority];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveId(item.id)}
                        style={{
                          textAlign: "left",
                          width: "100%",
                          border: `1px solid ${isActive ? `${tone}55` : border}`,
                          background: isActive ? `${tone}10` : dk ? "rgba(255,255,255,0.02)" : "#fbfcfe",
                          borderRadius: 16,
                          padding: 14,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: 1.1,
                              textTransform: "uppercase",
                              color: tone,
                            }}
                          >
                            {TYPE_LABEL[item.type]}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: 1.1,
                              textTransform: "uppercase",
                              color: tone,
                            }}
                          >
                            {item.priority}
                          </span>
                        </div>
                        <div style={{ fontSize: 15, lineHeight: 1.25, fontWeight: 700, color: fg }}>{item.title}</div>
                        <div style={{ fontSize: 11.5, color: muted, marginTop: 8 }}>{item.area}</div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: muted, marginTop: 10 }}>{item.summary}</div>
                        <div style={{ fontSize: 11.5, color: fg, marginTop: 12 }}>
                          <strong>Quelle:</strong> {item.source}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <aside
          style={{
            background: card,
            border: `1px solid ${border}`,
            borderRadius: 20,
            padding: 20,
            position: "sticky",
            top: 24,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase", color: purple, marginBottom: 12 }}>
            Detailansicht
          </div>
          <h2 style={{ fontSize: 24, lineHeight: 1.08, color: fg, margin: 0 }}>{activeItem.title}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, marginBottom: 18 }}>
            <span style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${border}`, color: fg, fontSize: 11, fontWeight: 700 }}>
              {TYPE_LABEL[activeItem.type]}
            </span>
            <span style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${PRIORITY_TONE[activeItem.priority]}55`, color: PRIORITY_TONE[activeItem.priority], fontSize: 11, fontWeight: 700 }}>
              Priorität {activeItem.priority}
            </span>
            <span style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${border}`, color: muted, fontSize: 11, fontWeight: 700 }}>
              {activeItem.area}
            </span>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ border: `1px solid ${border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: muted, marginBottom: 8 }}>
                Problem
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: fg }}>{activeItem.summary}</div>
            </div>

            <div style={{ border: `1px solid ${border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: muted, marginBottom: 8 }}>
                Beispiel aus der Praxis
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: fg }}>{activeItem.ask}</div>
            </div>

            <div style={{ border: `1px solid ${border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: muted, marginBottom: 8 }}>
                Was wir daraus bauen
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: fg }}>{activeItem.fix}</div>
            </div>

            <div style={{ border: `1px solid ${border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: muted, marginBottom: 8 }}>
                Kontext
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.65, color: muted }}>
                <div><strong style={{ color: fg }}>Quelle:</strong> {activeItem.source}</div>
                <div><strong style={{ color: fg }}>Lane:</strong> {LANE_META[activeItem.lane].title}</div>
                {activeItem.patient ? <div><strong style={{ color: fg }}>Patient:</strong> {activeItem.patient}</div> : null}
              </div>
            </div>
          </div>

          {activeItem.href ? (
            <Link
              href={activeItem.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 18,
                padding: "12px 16px",
                borderRadius: 999,
                border: `1px solid ${purple}55`,
                background: `${purple}14`,
                color: purple,
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              {activeItem.hrefLabel || "Öffnen"}
            </Link>
          ) : null}

          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              background: dk ? "rgba(96,165,250,0.08)" : "#f3f8ff",
              border: `1px solid ${dk ? "rgba(96,165,250,0.18)" : "#d9eaff"}`,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "#60a5fa", marginBottom: 8 }}>
              Wichtig
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.65, color: muted }}>
              Das ist jetzt absichtlich als echtes Arbeitsboard gebaut. Also eher: Welcher Fall kam rein, warum ist er wichtig, in welcher Stufe steht er und was bauen wir daraus.
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
