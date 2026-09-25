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

type SmokeMask = { set: boolean; preview: string };

type IvorisSmokeResponse = {
  ok: boolean;
  reason?: "missing_env";
  env: {
    relayHost: SmokeMask;
    linkname: SmokeMask;
    app: SmokeMask;
    appVersion: SmokeMask;
    apiKey: SmokeMask;
    username: SmokeMask;
    password: SmokeMask;
    profileId: SmokeMask;
    missing: string[];
  };
  testedBaseUrl?: string;
  ping?: {
    endpoint: string;
    ok: boolean;
    status: number | null;
    durationMs: number;
    preview?: string;
    error?: string | null;
  };
  documentation?: {
    endpoint: string;
    ok: boolean;
    status: number | null;
    durationMs: number;
    preview?: string;
    error?: string | null;
    inspection?: {
      isOpenApiLike: boolean;
      pathCount: number;
      hasDocumentGet: boolean;
      hasDocumentPost: boolean;
      hasDocumentEntries: boolean;
      hasPatientGet: boolean;
    };
  };
};

type IvorisDocumentProbeResponse = {
  ok: boolean;
  error?: string;
  patient: {
    id: string | null;
    ivorisId: string | null;
    vorname: string | null;
    nachname: string | null;
    geburtsdatum: string | null;
  } | null;
  range: {
    begin: string | null;
    end: string | null;
  };
  entriesTotal: number;
  documentEntriesTotal: number;
  entries: Array<{
    id: string | null;
    date: string | null;
    type: string | null;
    treatment: string | null;
    tooth: string | null;
    text: string | null;
    documentId: string | null;
    looksLikeInvoice: boolean;
  }>;
  hydratedDocuments: Array<{
    documentId: string;
    entryId: string | null;
    entryDate: string | null;
    entryText: string | null;
    name: string | null;
    date: string | null;
    contentBytes: number;
    contentType: string;
    looksLikeInvoice: boolean;
    downloadUrl: string;
    error: string | null;
  }>;
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
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentYearStart = `${new Date().getFullYear()}-01-01`;
  const [activeId, setActiveId] = useState<string>(OPS_ITEMS[0]?.id ?? "");
  const [smokeLoading, setSmokeLoading] = useState(false);
  const [smokeData, setSmokeData] = useState<IvorisSmokeResponse | null>(null);
  const [smokeError, setSmokeError] = useState<string | null>(null);
  const [smokeTestedAt, setSmokeTestedAt] = useState<string | null>(null);
  const [documentProbeRef, setDocumentProbeRef] = useState("");
  const [documentProbeBegin, setDocumentProbeBegin] = useState(currentYearStart);
  const [documentProbeEnd, setDocumentProbeEnd] = useState(todayIso);
  const [documentProbeLoading, setDocumentProbeLoading] = useState(false);
  const [documentProbeData, setDocumentProbeData] = useState<IvorisDocumentProbeResponse | null>(null);
  const [documentProbeError, setDocumentProbeError] = useState<string | null>(null);

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

  const runSmokeTest = async () => {
    setSmokeLoading(true);
    setSmokeError(null);
    try {
      const response = await fetch("/api/ivoris/smoke-test", { cache: "no-store" });
      const payload = (await response.json()) as IvorisSmokeResponse | { error?: string };
      if (!response.ok && !("env" in payload)) {
        throw new Error(payload?.error || `IVORIS-Test fehlgeschlagen (${response.status})`);
      }
      setSmokeData(payload as IvorisSmokeResponse);
      setSmokeTestedAt(new Date().toISOString());
    } catch (error) {
      setSmokeError(error instanceof Error ? error.message : "IVORIS-Test fehlgeschlagen");
    } finally {
      setSmokeLoading(false);
    }
  };

  const runDocumentProbe = async () => {
    const ref = documentProbeRef.trim();
    if (!ref) {
      setDocumentProbeError("Bitte lokale patient_id oder IVORIS-ID eintragen.");
      setDocumentProbeData(null);
      return;
    }

    setDocumentProbeLoading(true);
    setDocumentProbeError(null);
    try {
      const params = new URLSearchParams({ patient_ref: ref, hydrate_limit: "6" });
      if (documentProbeBegin) params.set("begin", documentProbeBegin);
      if (documentProbeEnd) params.set("end", documentProbeEnd);

      const response = await fetch(`/api/ivoris/documents?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as IvorisDocumentProbeResponse | { error?: string };
      if (!response.ok) {
        throw new Error(payload?.error || `IVORIS-Dokumentcheck fehlgeschlagen (${response.status})`);
      }
      setDocumentProbeData(payload as IvorisDocumentProbeResponse);
    } catch (error) {
      setDocumentProbeData(null);
      setDocumentProbeError(
        error instanceof Error ? error.message : "IVORIS-Dokumentcheck fehlgeschlagen"
      );
    } finally {
      setDocumentProbeLoading(false);
    }
  };

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
          <div
            style={{
              border: `1px solid ${border}`,
              borderRadius: 18,
              padding: 16,
              marginBottom: 16,
              background: dk ? "rgba(96,165,250,0.06)" : "#f8fbff",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase", color: "#60a5fa", marginBottom: 10 }}>
              IVORIS Live-Check
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: fg, marginBottom: 12 }}>
              Prüft direkt in der echten Runtime, ob Anima Cura die aktuelle IVORIS-API wirklich erreicht und ob die Dokument-Endpunkte sichtbar sind.
            </div>

            <button
              type="button"
              onClick={runSmokeTest}
              disabled={smokeLoading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                background: smokeLoading ? (dk ? "#243247" : "#dbe7ff") : "#60a5fa",
                color: smokeLoading ? muted : "#fff",
                fontSize: 12.5,
                fontWeight: 800,
                cursor: smokeLoading ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {smokeLoading ? "IVORIS wird geprüft…" : "IVORIS-Zugang jetzt testen"}
            </button>

            {smokeError ? (
              <div style={{ marginTop: 12, borderRadius: 12, padding: 12, background: dk ? "rgba(248,113,113,0.10)" : "#fff5f5", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171", fontSize: 12.5, lineHeight: 1.6 }}>
                {smokeError}
              </div>
            ) : null}

            {smokeData ? (
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <div style={{ borderRadius: 12, padding: 12, background: smokeData.ok ? (dk ? "rgba(74,222,128,0.10)" : "#f2fff6") : (dk ? "rgba(251,191,36,0.10)" : "#fff9eb"), border: `1px solid ${smokeData.ok ? "rgba(74,222,128,0.28)" : "rgba(251,191,36,0.28)"}` }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: smokeData.ok ? "#4ade80" : "#fbbf24" }}>
                    {smokeData.ok ? "IVORIS erreichbar" : smokeData.reason === "missing_env" ? "Runtime unvollständig konfiguriert" : "IVORIS noch nicht sauber bestätigt"}
                  </div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.6, color: muted, marginTop: 6 }}>
                    {smokeData.ok
                      ? "Mindestens einer der Kernchecks antwortet in der echten App-Runtime."
                      : smokeData.reason === "missing_env"
                        ? "Die laufende Umgebung hat nicht alle nötigen IVORIS-Variablen."
                        : "Die App hat getestet, aber weder Ping noch Dokumentation konnten eindeutig erfolgreich bestätigt werden."}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <div style={{ border: `1px solid ${border}`, borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: muted, marginBottom: 6 }}>Ping</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: smokeData.ping?.ok ? "#4ade80" : "#f87171" }}>
                      {smokeData.ping ? `${smokeData.ping.ok ? "OK" : "Fehler"}${smokeData.ping.status ? ` · HTTP ${smokeData.ping.status}` : ""}` : "—"}
                    </div>
                    <div style={{ fontSize: 11.5, color: muted, marginTop: 6 }}>
                      {smokeData.ping ? `${smokeData.ping.durationMs} ms` : "Noch nicht getestet"}
                    </div>
                  </div>

                  <div style={{ border: `1px solid ${border}`, borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: muted, marginBottom: 6 }}>Dokumentation</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: smokeData.documentation?.ok ? "#4ade80" : "#f87171" }}>
                      {smokeData.documentation ? `${smokeData.documentation.ok ? "OK" : "Fehler"}${smokeData.documentation.status ? ` · HTTP ${smokeData.documentation.status}` : ""}` : "—"}
                    </div>
                    <div style={{ fontSize: 11.5, color: muted, marginTop: 6 }}>
                      {smokeData.documentation ? `${smokeData.documentation.durationMs} ms` : "Noch nicht getestet"}
                    </div>
                  </div>
                </div>

                {smokeData.documentation?.inspection ? (
                  <div style={{ border: `1px solid ${border}`, borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: muted, marginBottom: 8 }}>
                      Dokument-Endpunkte
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[
                        { label: "GetDocument", ok: smokeData.documentation.inspection.hasDocumentGet },
                        { label: "DocumentEntries", ok: smokeData.documentation.inspection.hasDocumentEntries },
                        { label: "Patient", ok: smokeData.documentation.inspection.hasPatientGet },
                      ].map((item) => (
                        <span
                          key={item.label}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: `1px solid ${item.ok ? "rgba(74,222,128,0.32)" : "rgba(248,113,113,0.22)"}`,
                            color: item.ok ? "#4ade80" : "#f87171",
                            background: item.ok ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.08)",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11.5, color: muted, marginTop: 8 }}>
                      {smokeData.documentation.inspection.isOpenApiLike
                        ? `${smokeData.documentation.inspection.pathCount} dokumentierte API-Pfade erkannt`
                        : "Antwort war keine klar erkennbare OpenAPI-Struktur"}
                    </div>
                  </div>
                ) : null}

                {smokeData.env.missing.length > 0 ? (
                  <div style={{ borderRadius: 12, padding: 12, background: dk ? "rgba(248,113,113,0.08)" : "#fff5f5", border: "1px solid rgba(248,113,113,0.22)" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: "#f87171" }}>
                      Fehlende Runtime-Werte: {smokeData.env.missing.join(", ")}
                    </div>
                  </div>
                ) : null}

                <div style={{ fontSize: 11, lineHeight: 1.55, color: muted }}>
                  Basis: {smokeData.testedBaseUrl || "—"}<br />
                  Letzter Test: {smokeTestedAt ? new Date(smokeTestedAt).toLocaleString("de-DE") : "—"}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11.5, lineHeight: 1.6, color: muted, marginTop: 12 }}>
                Ein Klick reicht. Danach sehen wir direkt, ob die laufende Anima-Cura-Instanz IVORIS wirklich erreicht oder ob Konfiguration, Pfad oder Netzwerk blockieren.
              </div>
            )}
          </div>

          <div
            style={{
              border: `1px solid ${border}`,
              borderRadius: 18,
              padding: 16,
              marginBottom: 16,
              background: dk ? "rgba(74,222,128,0.05)" : "#f7fff9",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: "#4ade80",
                marginBottom: 10,
              }}
            >
              IVORIS Rechnungsdokumente
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: fg, marginBottom: 12 }}>
              Prüft pro Patient direkt über <code style={{ fontSize: "0.92em" }}>DocumentEntries</code> und{" "}
              <code style={{ fontSize: "0.92em" }}>GetDocument</code>, ob IVORIS echte Dokumente
              zurückliefert - also genau den Weg, den Sven Möckel für Rechnungsdokumente beschrieben hat.
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <input
                value={documentProbeRef}
                onChange={(event) => setDocumentProbeRef(event.target.value)}
                placeholder="Lokale patient_id oder IVORIS-ID einfügen"
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: `1px solid ${border}`,
                  background: dk ? "rgba(255,255,255,0.03)" : "#fff",
                  color: fg,
                  padding: "12px 14px",
                  fontSize: 13,
                  outline: "none",
                }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <input
                  type="date"
                  value={documentProbeBegin}
                  onChange={(event) => setDocumentProbeBegin(event.target.value)}
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: `1px solid ${border}`,
                    background: dk ? "rgba(255,255,255,0.03)" : "#fff",
                    color: fg,
                    padding: "12px 14px",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <input
                  type="date"
                  value={documentProbeEnd}
                  onChange={(event) => setDocumentProbeEnd(event.target.value)}
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: `1px solid ${border}`,
                    background: dk ? "rgba(255,255,255,0.03)" : "#fff",
                    color: fg,
                    padding: "12px 14px",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={runDocumentProbe}
              disabled={documentProbeLoading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                background: documentProbeLoading ? (dk ? "#243247" : "#dbe7ff") : "#4ade80",
                color: documentProbeLoading ? muted : "#08111c",
                fontSize: 12.5,
                fontWeight: 800,
                cursor: documentProbeLoading ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {documentProbeLoading ? "Dokumente werden live geprüft…" : "Rechnungsdokumente live prüfen"}
            </button>

            {documentProbeError ? (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 12,
                  padding: 12,
                  background: dk ? "rgba(248,113,113,0.10)" : "#fff5f5",
                  border: "1px solid rgba(248,113,113,0.25)",
                  color: "#f87171",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                }}
              >
                {documentProbeError}
              </div>
            ) : null}

            {documentProbeData ? (
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <div
                  style={{
                    borderRadius: 12,
                    padding: 12,
                    background: dk ? "rgba(96,165,250,0.07)" : "#f7fbff",
                    border: `1px solid ${border}`,
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: fg }}>
                    {documentProbeData.patient?.vorname || documentProbeData.patient?.nachname
                      ? `${documentProbeData.patient?.vorname || ""} ${documentProbeData.patient?.nachname || ""}`.trim()
                      : "IVORIS-Dokumentprüfung"}
                  </div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.65, color: muted, marginTop: 6 }}>
                    {documentProbeData.documentEntriesTotal} Dokument-Einträge gefunden,{" "}
                    {documentProbeData.hydratedDocuments.length} davon direkt per{" "}
                    <code style={{ fontSize: "0.92em" }}>GetDocument</code> geöffnet.
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.65, color: muted, marginTop: 8 }}>
                    Zeitraum: {documentProbeData.range.begin || "offen"} bis{" "}
                    {documentProbeData.range.end || "offen"}
                  </div>
                </div>

                {documentProbeData.hydratedDocuments.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {documentProbeData.hydratedDocuments.map((doc) => (
                      <div
                        key={doc.documentId}
                        style={{
                          border: `1px solid ${border}`,
                          borderRadius: 12,
                          padding: 12,
                          background: dk ? "rgba(255,255,255,0.02)" : "#fbfcfe",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 800, color: fg }}>
                              {doc.name || "Dokument ohne Namen"}
                            </div>
                            <div style={{ fontSize: 11.5, lineHeight: 1.65, color: muted, marginTop: 6 }}>
                              {doc.date || doc.entryDate || "Kein Datum"} ·{" "}
                              {doc.contentBytes > 0
                                ? `${Math.max(1, Math.round(doc.contentBytes / 1024))} KB`
                                : "Inhalt nicht gemessen"}
                            </div>
                            {doc.entryText ? (
                              <div style={{ fontSize: 11.5, lineHeight: 1.6, color: muted, marginTop: 6 }}>
                                {doc.entryText}
                              </div>
                            ) : null}
                            {doc.error ? (
                              <div style={{ fontSize: 11.5, lineHeight: 1.6, color: "#f87171", marginTop: 6 }}>
                                {doc.error}
                              </div>
                            ) : null}
                          </div>

                          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                            <span
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: `1px solid ${
                                  doc.looksLikeInvoice
                                    ? "rgba(74,222,128,0.30)"
                                    : "rgba(148,163,184,0.22)"
                                }`,
                                color: doc.looksLikeInvoice ? "#4ade80" : muted,
                                background: doc.looksLikeInvoice
                                  ? "rgba(74,222,128,0.10)"
                                  : "rgba(148,163,184,0.08)",
                                fontSize: 10.5,
                                fontWeight: 800,
                                letterSpacing: 0.4,
                                textTransform: "uppercase",
                              }}
                            >
                              {doc.looksLikeInvoice ? "Rechnungs-Kandidat" : "Dokument"}
                            </span>

                            {!doc.error ? (
                              <a
                                href={doc.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "9px 12px",
                                  borderRadius: 10,
                                  textDecoration: "none",
                                  background: "#60a5fa",
                                  color: "#fff",
                                  fontSize: 11.5,
                                  fontWeight: 800,
                                }}
                              >
                                Dokument öffnen
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, lineHeight: 1.6, color: muted }}>
                    Für diesen Patienten kamen in dem Zeitraum keine direkt verknüpften
                    Dokument-Einträge zurück.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 11.5, lineHeight: 1.6, color: muted, marginTop: 12 }}>
                Hier geht es nicht um „API da oder nicht da“, sondern um den echten Beweis:
                kommt für einen konkreten Patienten ein Dokument zurück und lässt es sich öffnen?
              </div>
            )}
          </div>

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
