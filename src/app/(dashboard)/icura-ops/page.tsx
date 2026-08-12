"use client";

import Link from "next/link";
import { useAppStore } from "@/hooks/useAppStore";

type CapabilityCard = {
  title: string;
  summary: string;
  href: string;
  cta: string;
  tone: string;
};

type FrictionItem = {
  title: string;
  why: string;
  nextStep: string;
  href: string;
  cta: string;
  status: "offen" | "in arbeit" | "konzept";
};

const CAPABILITIES: CapabilityCard[] = [
  {
    title: "QR-Zahlungen sauber erklären",
    summary: "iCura soll den realen Ablauf über Kasse, Einnahme, Patient, Betrag und QR-Überweisung erklären.",
    href: "/kasse",
    cta: "Zu Kasse",
    tone: "#4ade80",
  },
  {
    title: "Patienten und Zahlungen einordnen",
    summary: "iCura soll Patientensuche, Geldbewegungen und Zuordnungen unterscheiden können, ohne Zahlungen und Forderungen zu vermischen.",
    href: "/zahlungen",
    cta: "Zu Zahlungen",
    tone: "#fbbf24",
  },
  {
    title: "Offene Posten von Umsatz trennen",
    summary: "Fragen zu Quartalsumsatz, offenen Forderungen und historischen Beständen müssen in getrennte Bereiche geführt werden.",
    href: "/offene-posten",
    cta: "Zu Offene Posten",
    tone: "#60a5fa",
  },
  {
    title: "AnimaSign-Status präzise benennen",
    summary: "Signatur offen, PDF offen, Ivoris-Sync offen und manuelle Prüfung müssen klar unterscheidbar bleiben.",
    href: "/animasign",
    cta: "Zu AnimaSign",
    tone: "#a78bfa",
  },
];

const FRICTIONS: FrictionItem[] = [
  {
    title: "Patient direkt per Sprache öffnen",
    why: "Frau Dr. Schubert hat nach einzelnen Patienten gefragt und iCura konnte den Patienten nicht zuverlässig direkt öffnen oder führen.",
    nextStep: "Voice-Antwort mit echter Navigation koppeln und Treffer mit Name, Status und Zielbereich zurückgeben.",
    href: "/patienten",
    cta: "Patienten prüfen",
    status: "in arbeit",
  },
  {
    title: "QR-Zahlungen wurden falsch erklärt",
    why: "iCura hat behauptet, QR-Zahlungen stünden nicht zur Verfügung, obwohl der echte Ablauf über Kasse existiert.",
    nextStep: "Produktwissen, Tooling und Hilfetexte nur noch an den real vorhandenen Schritten ausrichten.",
    href: "/kasse",
    cta: "Kassenfluss prüfen",
    status: "in arbeit",
  },
  {
    title: "Umsatz, Zahlungen und offene Posten nicht vermischen",
    why: "Die Praxis braucht selbsterklärende Trennung zwischen Quartalsumsatz, Transaktionen und offenen Forderungen.",
    nextStep: "iCura muss bei jeder Finanzfrage zuerst den Fragetyp erkennen und den Nutzer in den richtigen Bereich führen.",
    href: "/quartal",
    cta: "Quartal ansehen",
    status: "offen",
  },
  {
    title: "Unknowns als Lernsignal statt als falsche Antwort",
    why: "Wenn iCura etwas nicht weiß, darf keine erfundene Sicherheit entstehen.",
    nextStep: "Eine echte Review-Inbox für ungeklärte Fragen, Fehlantworten und Wunschfunktionen aufbauen.",
    href: "/automatisierungen",
    cta: "Ausbau planen",
    status: "konzept",
  },
];

const PIPELINE = [
  {
    title: "1. Einsammeln",
    text: "Noch nicht live verdrahtet: iCura soll echte Fehlfragen, unbekannte Themen und Nutzerwünsche sauber protokollieren.",
  },
  {
    title: "2. Reviewen",
    text: "Diese Fälle sollen in einer Inbox priorisiert werden: Was war die Frage, warum war die Antwort unklar und welcher Bereich ist betroffen?",
  },
  {
    title: "3. Ausrollen",
    text: "Nach dem Review werden Wissen, Tools oder Navigation erweitert, damit dieselbe Frage später korrekt und operativ beantwortet wird.",
  },
];

export default function ICuraOpsPage() {
  const { theme } = useAppStore();
  const dk = theme === "dark";

  const fg = dk ? "#edf2f7" : "#162033";
  const muted = dk ? "#94a3b8" : "#66758d";
  const border = dk ? "rgba(255,255,255,0.08)" : "#e6ebf3";
  const card = dk ? "rgba(11,16,28,0.94)" : "#ffffff";
  const panel = dk ? "linear-gradient(135deg, rgba(7,11,20,0.98), rgba(16,18,34,0.98))" : "linear-gradient(135deg, #ffffff, #f7fafc)";
  const green = "#4ade80";
  const yellow = "#fbbf24";
  const purple = "#a78bfa";
  const red = "#f87171";

  const statusTone = (status: FrictionItem["status"]) =>
    status === "in arbeit" ? green : status === "offen" ? yellow : purple;

  const statusLabel = (status: FrictionItem["status"]) =>
    status === "in arbeit" ? "in Arbeit" : status === "offen" ? "offen" : "Konzept";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <section
        style={{
          background: panel,
          border: `1px solid ${border}`,
          borderRadius: 24,
          padding: 28,
          marginBottom: 20,
          boxShadow: dk ? "0 24px 70px rgba(0,0,0,0.28)" : "0 18px 50px rgba(15,23,42,0.08)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.8, textTransform: "uppercase", color: purple, marginBottom: 12 }}>
          Eigener Bereich für iCura
        </div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 34, lineHeight: 1.02, letterSpacing: -0.8, color: fg, margin: 0 }}>
          iCura Ops
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: muted, maxWidth: 880, margin: "14px 0 0" }}>
          Hier geht es nur um iCura selbst: Fähigkeiten, Friktionspunkte, Fehlantworten und den Ausbau des operativen Assistenten.
          Das ist bewusst getrennt von Revenue Intelligence, damit Produktverbesserung und Finanzanalyse nicht miteinander vermischt werden.
        </p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 20 }}>
        {CAPABILITIES.map((item) => (
          <article
            key={item.title}
            style={{
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 18,
              padding: 20,
            }}
          >
            <div style={{ width: 42, height: 5, borderRadius: 999, background: item.tone, marginBottom: 14 }} />
            <h2 style={{ fontSize: 17, lineHeight: 1.2, color: fg, margin: 0 }}>{item.title}</h2>
            <p style={{ fontSize: 13, lineHeight: 1.65, color: muted, margin: "10px 0 16px" }}>{item.summary}</p>
            <Link
              href={item.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 14px",
                borderRadius: 999,
                border: `1px solid ${item.tone}55`,
                background: `${item.tone}14`,
                color: item.tone,
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              {item.cta}
            </Link>
          </article>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16 }}>
        <div
          style={{
            background: card,
            border: `1px solid ${border}`,
            borderRadius: 20,
            padding: 22,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase", color: green, marginBottom: 12 }}>
            Konkrete Friktionspunkte
          </div>
          <h2 style={{ fontSize: 24, lineHeight: 1.1, color: fg, margin: 0 }}>Was iCura aktuell noch besser können muss</h2>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: muted, margin: "10px 0 18px" }}>
            Keine erfundenen Live-Signale. Nur konkrete bekannte Baustellen aus dem echten Produktkontext.
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            {FRICTIONS.map((item) => {
              const tone = statusTone(item.status);
              return (
                <article
                  key={item.title}
                  style={{
                    border: `1px solid ${tone}30`,
                    background: `${tone}10`,
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <h3 style={{ fontSize: 15, lineHeight: 1.25, color: fg, margin: 0 }}>{item.title}</h3>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 1.2,
                        textTransform: "uppercase",
                        color: tone,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.6, color: muted, margin: "10px 0 8px" }}>
                    <strong style={{ color: fg }}>Warum wichtig:</strong> {item.why}
                  </p>
                  <p style={{ fontSize: 12.5, lineHeight: 1.6, color: muted, margin: "0 0 14px" }}>
                    <strong style={{ color: fg }}>Nächster Schritt:</strong> {item.nextStep}
                  </p>
                  <Link
                    href={item.href}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "9px 13px",
                      borderRadius: 999,
                      border: `1px solid ${tone}44`,
                      background: "transparent",
                      color: tone,
                      fontSize: 12,
                      fontWeight: 800,
                      textDecoration: "none",
                    }}
                  >
                    {item.cta}
                  </Link>
                </article>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <section
            style={{
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 20,
              padding: 22,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase", color: yellow, marginBottom: 12 }}>
              Ehrlicher Status
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: muted }}>
              <strong style={{ color: fg }}>Noch nicht live vorhanden:</strong> eine echte automatische Feedback-Inbox, die unbekannte Voice-Fragen,
              Fehlantworten und Wunschfunktionen selbstständig sammelt. Genau das ist der nächste große Ausbau für iCura.
            </div>
          </section>

          <section
            style={{
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 20,
              padding: 22,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase", color: red, marginBottom: 12 }}>
              Self-Improvement Pipeline
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {PIPELINE.map((step, index) => (
                <div key={step.title} style={{ border: `1px solid ${border}`, borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: fg, marginBottom: 6 }}>
                    {step.title}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.65, color: muted }}>{step.text}</div>
                </div>
              ))}
            </div>
          </section>

          <section
            style={{
              background: dk ? "rgba(74,222,128,0.08)" : "#f3fbf5",
              border: `1px solid ${dk ? "rgba(74,222,128,0.16)" : "#d8f2df"}`,
              borderRadius: 20,
              padding: 22,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase", color: green, marginBottom: 12 }}>
              Schnellzugriffe
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link href="/zahlungen" style={{ textDecoration: "none", padding: "10px 14px", borderRadius: 999, background: dk ? "rgba(255,255,255,0.05)" : "#fff", border: `1px solid ${border}`, color: fg, fontSize: 12, fontWeight: 800 }}>Zahlungen öffnen</Link>
              <Link href="/patienten" style={{ textDecoration: "none", padding: "10px 14px", borderRadius: 999, background: dk ? "rgba(255,255,255,0.05)" : "#fff", border: `1px solid ${border}`, color: fg, fontSize: 12, fontWeight: 800 }}>Patienten öffnen</Link>
              <Link href="/kasse" style={{ textDecoration: "none", padding: "10px 14px", borderRadius: 999, background: dk ? "rgba(255,255,255,0.05)" : "#fff", border: `1px solid ${border}`, color: fg, fontSize: 12, fontWeight: 800 }}>Kasse öffnen</Link>
              <Link href="/automatisierungen" style={{ textDecoration: "none", padding: "10px 14px", borderRadius: 999, background: dk ? "rgba(255,255,255,0.05)" : "#fff", border: `1px solid ${border}`, color: fg, fontSize: 12, fontWeight: 800 }}>Automatisierungen öffnen</Link>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
