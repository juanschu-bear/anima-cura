"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Sparkles, Target, WalletCards, FolderArchive, ShieldCheck } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import {
  BEHANDLUNGSART_REGELN,
  getConfidenceLabel,
  type Behandlungskategorie,
} from "@/lib/behandlungsart-classification";

type FamilyFilter = "alle" | "aligner" | "multiband" | "removable";

const FAMILY_LABELS: Record<FamilyFilter, string> = {
  alle: "Alle Familien",
  aligner: "Aligner",
  multiband: "Multiband",
  removable: "Herausnehmbar",
};

const FAMILY_TONES: Record<Exclude<FamilyFilter, "alle">, string> = {
  aligner: "#60a5fa",
  multiband: "#4ade80",
  removable: "#fbbf24",
};

const CATEGORY_ORDER: Behandlungskategorie[] = ["A1", "A2", "A3", "MB1", "MB2", "MB3", "H1", "H2"];

const CORE_SIGNALS = [
  "Alter oder Altersgruppe bei Behandlungsstart",
  "Kasse oder Privat",
  "erste Zahlung",
  "monatliche Rate",
  "bisherige Gesamtsumme",
  "Zahlungsdauer / Anzahl der Ratenmonate",
  "typische Zusatzkosten",
];

const EXCLUDED_SIGNALS = [
  "aktuelle Behandlungsphase",
  "klinische Detaildiagnostik",
  "Geschwisterregelung als Hauptmerkmal",
  "freie Textinterpretation ohne Zahlungsmuster",
];

const DECISION_RULES = [
  {
    title: "Aligner vs. alles andere",
    body:
      "Aligner werden primär über Privatlogik, Anfangszahlung um 450 €, Labor-/Materialkosten im Bereich 800–1.600 € und einen längeren Restzahlungsblock über meist 24 Monate erkannt.",
  },
  {
    title: "MB1 vs. MB3",
    body:
      "67,82 € wiederkehrend spricht stark für MB1. 103,02 € wiederkehrend spricht stark für MB3. Das sind die klarsten festen Multiband-Signale im Bestand.",
  },
  {
    title: "MB2 vs. H1/H2",
    body:
      "MB2 bedeutet nicht einfach ‚Spange zuerst‘, sondern ein Gesamtplan mit vorgeschalteter herausnehmbarer Apparatur und späterem Multiband-Teil. H1/H2 sind nur dann richtig, wenn kein späterer Multiband-Teil im selben Plan folgt.",
  },
  {
    title: "Rolle des Alters",
    body:
      "Das Alter entscheidet nie allein, verstärkt aber die Tendenz: jüngere Patienten sprechen eher für H1, H2 oder MB2, ältere Jugendliche und Erwachsene eher für Aligner.",
  },
];

function scoreChipTone(score: number) {
  if (score >= 75) return { bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.28)", color: "#4ade80" };
  if (score >= 50) return { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.28)", color: "#fbbf24" };
  return { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.22)", color: "#94a3b8" };
}

export default function BehandlungslogikPage() {
  const { theme } = useAppStore();
  const dk = theme === "dark";
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>("alle");
  const [openCategory, setOpenCategory] = useState<Behandlungskategorie>("MB2");

  const fg = dk ? "#eef2ff" : "#18243a";
  const muted = dk ? "#94a3b8" : "#66758d";
  const soft = dk ? "#cbd5e1" : "#334155";
  const border = dk ? "rgba(255,255,255,0.08)" : "#dde7f2";
  const card = dk ? "rgba(10,14,24,0.92)" : "#ffffff";
  const panel = dk ? "linear-gradient(145deg, rgba(8,12,22,0.98), rgba(14,19,33,0.98))" : "linear-gradient(145deg, #ffffff, #f7fbff)";
  const glow = dk ? "0 22px 70px rgba(0,0,0,0.3)" : "0 18px 50px rgba(15,23,42,0.08)";

  const filteredRules = useMemo(() => {
    const sorted = [...BEHANDLUNGSART_REGELN].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a.code) - CATEGORY_ORDER.indexOf(b.code),
    );
    return familyFilter === "alle" ? sorted : sorted.filter((item) => item.familie === familyFilter);
  }, [familyFilter]);

  const topPreview = useMemo(
    () =>
      BEHANDLUNGSART_REGELN.map((regel) => ({
        code: regel.code,
        label: regel.label,
        score: regel.score({
          monatlicheRate:
            regel.code === "MB1" ? 67.82 :
            regel.code === "MB3" ? 103.02 :
            regel.code.startsWith("A") ? 160 :
            null,
          ersteZahlung: regel.code.startsWith("A") ? 450 : 450,
          zusatzkostenEinmalig: regel.code.startsWith("A") ? 1200 : null,
          gesamtsummeBisher:
            regel.code === "A1" ? 6400 :
            regel.code === "A2" ? 4800 :
            regel.code === "A3" ? 2800 :
            regel.code === "MB1" ? 1627.68 :
            regel.code === "MB3" ? 1236.23 :
            regel.code === "H1" ? 1700 :
            regel.code === "H2" ? 2600 :
            2400,
          ratenMonate:
            regel.code.startsWith("A") ? 24 :
            regel.code === "MB3" ? 12 :
            regel.code === "H1" ? 16 :
            regel.code === "H2" ? 24 :
            24,
          privatleistung: regel.familie === "aligner",
          kassenfall: regel.familie !== "aligner",
          alterBeiStart: regel.familie === "aligner" ? 19 : 11,
        }),
      })).sort((a, b) => b.score - a.score),
    [],
  );

  return (
    <div style={{ maxWidth: 1420, margin: "0 auto" }}>
      <section
        style={{
          background: panel,
          border: `1px solid ${border}`,
          borderRadius: 28,
          padding: 30,
          boxShadow: glow,
          marginBottom: 18,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: dk
              ? "radial-gradient(circle at 18% 0%, rgba(74,222,128,0.16), transparent 32%), radial-gradient(circle at 88% 18%, rgba(96,165,250,0.15), transparent 28%), radial-gradient(circle at 70% 88%, rgba(251,191,36,0.12), transparent 26%)"
              : "radial-gradient(circle at 18% 0%, rgba(74,222,128,0.1), transparent 30%), radial-gradient(circle at 88% 18%, rgba(96,165,250,0.1), transparent 28%), radial-gradient(circle at 70% 88%, rgba(251,191,36,0.08), transparent 25%)",
          }}
        />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.8, textTransform: "uppercase", color: "#a78bfa", marginBottom: 10 }}>
            Behandlungslogik
          </div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 38, lineHeight: 1.02, letterSpacing: -0.9, color: fg, margin: 0 }}>
            Operatives Archiv & Zuordnungslogik
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: muted, maxWidth: 980, margin: "14px 0 0" }}>
            Dieser Bereich erklärt sichtbar und nachvollziehbar, wie Anima Cura Behandlungsarten aus echten Zahlungsprofilen
            vorsortiert. Keine Black Box, keine Textwüste: klare Kategorien, klare Signale, klare Trennregeln.
          </p>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16, alignItems: "start", marginBottom: 18 }}>
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 24, padding: 20, boxShadow: glow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <FolderArchive size={18} color="#60a5fa" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: fg }}>Was hier als echte Entscheidungsbasis zählt</div>
              <div style={{ fontSize: 12.5, color: muted, marginTop: 4 }}>
                Schlanke Datenbasis, damit die Praxis versteht, worauf die Vorsortierung wirklich schaut.
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ borderRadius: 18, border: `1px solid ${border}`, padding: 16, background: dk ? "rgba(74,222,128,0.04)" : "rgba(34,197,94,0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <WalletCards size={16} color="#4ade80" />
                <span style={{ fontSize: 13, fontWeight: 800, color: fg }}>Verwendete Signale</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {CORE_SIGNALS.map((item) => (
                  <div key={item} style={{ fontSize: 13, color: soft, lineHeight: 1.55 }}>
                    <span style={{ color: "#4ade80", marginRight: 8 }}>•</span>{item}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderRadius: 18, border: `1px solid ${border}`, padding: 16, background: dk ? "rgba(248,113,113,0.04)" : "rgba(248,113,113,0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <ShieldCheck size={16} color="#fbbf24" />
                <span style={{ fontSize: 13, fontWeight: 800, color: fg }}>Bewusst nicht führend</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {EXCLUDED_SIGNALS.map((item) => (
                  <div key={item} style={{ fontSize: 13, color: soft, lineHeight: 1.55 }}>
                    <span style={{ color: "#fbbf24", marginRight: 8 }}>•</span>{item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 24, padding: 20, boxShadow: glow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Target size={18} color="#fbbf24" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: fg }}>Confidence-System</div>
              <div style={{ fontSize: 12.5, color: muted, marginTop: 4 }}>
                So werden spätere Top-1- und Top-2-Vorschläge sprachlich einsortiert.
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {[
              { min: "75+", label: "sehr wahrscheinlich", desc: "starkes Zahlungsmuster mit klaren Signalen", color: "#4ade80" },
              { min: "50–74", label: "wahrscheinlich", desc: "gute Tendenz, aber noch nicht narrensicher", color: "#fbbf24" },
              { min: "<50", label: "unklar", desc: "zu wenig oder zu gemischte Signale", color: "#94a3b8" },
            ].map((row) => (
              <div key={row.label} style={{ borderRadius: 16, border: `1px solid ${border}`, padding: 14, background: dk ? "rgba(255,255,255,0.02)" : "#fbfdff", display: "grid", gridTemplateColumns: "72px 1fr", gap: 12 }}>
                <div style={{ borderRadius: 12, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 900, color: row.color, background: `${row.color}14`, border: `1px solid ${row.color}2f` }}>
                  {row.min}
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: fg }}>{row.label}</div>
                  <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.55, marginTop: 4 }}>{row.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
        <aside style={{ background: card, border: `1px solid ${border}`, borderRadius: 24, padding: 18, boxShadow: glow, position: "sticky", top: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: muted, marginBottom: 12 }}>
            Kategorien
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {(Object.keys(FAMILY_LABELS) as FamilyFilter[]).map((family) => (
              <button
                key={family}
                type="button"
                onClick={() => setFamilyFilter(family)}
                style={{
                  borderRadius: 999,
                  border: `1px solid ${familyFilter === family ? (family === "alle" ? border : `${FAMILY_TONES[family as Exclude<FamilyFilter, "alle">]}66`) : border}`,
                  padding: "9px 12px",
                  background:
                    familyFilter === family
                      ? family === "alle"
                        ? (dk ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)")
                        : `${FAMILY_TONES[family as Exclude<FamilyFilter, "alle">]}14`
                      : "transparent",
                  color: familyFilter === family && family !== "alle" ? FAMILY_TONES[family as Exclude<FamilyFilter, "alle">] : fg,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {FAMILY_LABELS[family]}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {filteredRules.map((regel) => {
              const isActive = openCategory === regel.code;
              const tone = FAMILY_TONES[regel.familie];
              return (
                <button
                  key={regel.code}
                  type="button"
                  onClick={() => setOpenCategory(regel.code)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    borderRadius: 18,
                    border: `1px solid ${isActive ? `${tone}55` : border}`,
                    background: isActive ? `${tone}12` : (dk ? "rgba(255,255,255,0.02)" : "#fbfdff"),
                    padding: 14,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: tone, marginBottom: 5 }}>
                        {regel.code}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: fg }}>{regel.label}</div>
                    </div>
                    <ChevronDown size={16} color={isActive ? tone : muted} style={{ transform: isActive ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div style={{ display: "grid", gap: 16 }}>
          {filteredRules.map((regel) => {
            if (regel.code !== openCategory) return null;
            const tone = FAMILY_TONES[regel.familie];
            const preview = topPreview.find((item) => item.code === regel.code);
            const confidence = preview ? getConfidenceLabel(preview.score) : "unklar";
            const confidenceTone = scoreChipTone(preview?.score ?? 0);

            return (
              <section key={regel.code} style={{ background: card, border: `1px solid ${border}`, borderRadius: 24, padding: 22, boxShadow: glow }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
                  <div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "7px 12px", background: `${tone}12`, border: `1px solid ${tone}2f`, color: tone, fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 }}>
                      <Sparkles size={13} />
                      {regel.code} · {regel.familie}
                    </div>
                    <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, lineHeight: 1.04, color: fg, margin: 0 }}>
                      {regel.label}
                    </h2>
                    <p style={{ fontSize: 14.5, color: muted, lineHeight: 1.7, margin: "12px 0 0", maxWidth: 820 }}>
                      {regel.beschreibung}
                    </p>
                  </div>
                  <div style={{ minWidth: 190, borderRadius: 18, border: `1px solid ${confidenceTone.border}`, background: confidenceTone.bg, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: confidenceTone.color, marginBottom: 8 }}>
                      Beispiel-Confidence
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: fg, lineHeight: 1 }}>{preview?.score ?? 0}</div>
                    <div style={{ fontSize: 13, color: confidenceTone.color, fontWeight: 800, marginTop: 6 }}>{confidence}</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16 }}>
                  <div style={{ borderRadius: 20, border: `1px solid ${border}`, padding: 18, background: dk ? "rgba(255,255,255,0.02)" : "#fbfdff" }}>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: muted, marginBottom: 12 }}>
                      Typische Signale
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {regel.typischeSignale.map((signal) => (
                        <div key={signal} style={{ fontSize: 14, color: soft, lineHeight: 1.6, borderRadius: 14, padding: "12px 14px", background: dk ? "rgba(255,255,255,0.02)" : "#ffffff", border: `1px solid ${border}` }}>
                          <span style={{ color: tone, marginRight: 8 }}>•</span>{signal}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 16 }}>
                    <div style={{ borderRadius: 20, border: `1px solid ${border}`, padding: 18, background: dk ? "rgba(255,255,255,0.02)" : "#fbfdff" }}>
                      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: muted, marginBottom: 10 }}>
                        Wie das System später urteilt
                      </div>
                      <div style={{ fontSize: 13.5, color: soft, lineHeight: 1.7 }}>
                        Für aktive Patienten werden aus echten Zahlungen Top-1- und Top-2-Vorschläge berechnet. Diese Kategorie wird stärker,
                        sobald Rate, Gesamtsumme, Zahlungsdauer und Kasse/Privat zur hier gezeigten Signatur passen.
                      </div>
                    </div>

                    <div style={{ borderRadius: 20, border: `1px solid ${border}`, padding: 18, background: dk ? "rgba(255,255,255,0.02)" : "#fbfdff" }}>
                      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: muted, marginBottom: 10 }}>
                        Praxisnutzen
                      </div>
                      <div style={{ fontSize: 13.5, color: soft, lineHeight: 1.7 }}>
                        Unsichere Fälle bleiben offen. Klare Muster werden vorsortiert, damit Sabine und das Team nicht hunderte Patienten
                        manuell von null einordnen müssen.
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            );
          })}

          <section style={{ background: card, border: `1px solid ${border}`, borderRadius: 24, padding: 22, boxShadow: glow }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase", color: muted, marginBottom: 14 }}>
              Zentrale Trennregeln
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {DECISION_RULES.map((rule, index) => (
                <details
                  key={rule.title}
                  open={index === 0}
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${border}`,
                    background: dk ? "rgba(255,255,255,0.02)" : "#fbfdff",
                    padding: 16,
                  }}
                >
                  <summary style={{ listStyle: "none", cursor: "pointer", fontSize: 14, fontWeight: 800, color: fg }}>
                    {rule.title}
                  </summary>
                  <div style={{ fontSize: 13.5, color: soft, lineHeight: 1.7, marginTop: 10 }}>{rule.body}</div>
                </details>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
