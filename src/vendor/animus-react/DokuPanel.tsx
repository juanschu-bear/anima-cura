"use client";

import { useState } from "react";
import type { DokuEntwurf, DokuGruppe, DokuStartInfo } from "./types";

const MONO = '"JetBrains Mono", ui-monospace, monospace';
const DISPLAY = '"Orbitron", system-ui, sans-serif';

// v4 Doku-Farben (AnimaScribe-Originalfarben)
const D_BG = "#12171c";
const D_BORDER = "rgba(255,255,255,0.08)";
const D_BLUE = "#5b9dff";
const D_BLUE_SOFT = "rgba(91,157,255,0.14)";
const D_CREAM = "#f4efe6";
const D_MUTED = "#8b97a4";
const D_DANGER = "#ff6b6b";
const D_GREEN = "#4ce08c";
const TEXT = "#dfeaff";

const BEHANDLUNGSARTEN: ReadonlyArray<{ key: string; label: string }> = [
  { key: "aligner", label: "Aligner" },
  { key: "multiband", label: "Multiband" },
  { key: "removable", label: "Herausnehmbar" },
];

function schoen(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface DokuPanelProps {
  /** Set while the agent is dictating but no draft is ready yet. */
  building?: DokuStartInfo | null;
  /** The finished draft, ready for the doctor to confirm. */
  entwurf?: DokuEntwurf | null;
  /** Spoken patient name for the header. */
  patient?: string;
  /** Doctor confirms: the host writes it via its AnimaScribe session. */
  onConfirm: (entwurf: DokuEntwurf) => void | Promise<void>;
  onClose: () => void;
}

/**
 * Doku-Seitenfläche, 1:1 nach Mockup v4: dunkle Fläche, die von rechts über den
 * Orb fährt. ANIMUS legt den Eintrag vor, die Ärztin bestätigt. Bestätigen wird
 * über onConfirm an den Host zurückgegeben, damit Identität und §630f-Signatur
 * auf der AnimaScribe-Seite bleiben.
 */
export function DokuPanel(props: DokuPanelProps): React.ReactElement {
  const { building, entwurf, patient, onConfirm, onClose } = props;
  const [saving, setSaving] = useState(false);
  const open = Boolean(building || entwurf);

  const name = patient || building?.name || "";
  const behandlungsart = entwurf?.behandlungsart ?? building?.behandlungsart ?? null;
  const terminTyp = entwurf?.termin_typ ?? building?.termin_typ ?? "";
  const metaZeile = [schoen(behandlungsart), schoen(terminTyp)].filter(Boolean).join(" · ");
  const gruppen: DokuGruppe[] = entwurf?.gruppen ?? [];
  const positionen = entwurf?.positionen ?? [];
  const chooserMode = building?.modus === "chooser";

  const confirm = async (): Promise<void> => {
    if (!entwurf) return;
    setSaving(true);
    try {
      await onConfirm(entwurf);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .animus-doku::-webkit-scrollbar { width: 7px; }
            .animus-doku::-webkit-scrollbar-thumb { background: rgba(91,157,255,0.25); border-radius: 4px; }
          `,
        }}
      />

      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 18,
          background: "rgba(0,0,0,0.45)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.45s",
        }}
        aria-hidden
      />

      {/* Doku-Fläche */}
      <aside
        className="animus-doku"
        aria-hidden={!open}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: 440,
          maxWidth: "92%",
          zIndex: 20,
          background: D_BG,
          borderLeft: `1px solid ${D_BORDER}`,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.5s cubic-bezier(0.22,1,0.36,1)",
          overflowY: "auto",
          boxShadow: "-30px 0 60px rgba(0,0,0,0.5)",
          color: TEXT,
          fontFamily: MONO,
        }}
      >
        <div style={{ padding: 22 }}>
          {/* head */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 14, letterSpacing: 2, color: TEXT }}>DOKU</div>
            <button
              onClick={onClose}
              aria-label="schließen"
              style={{ background: "none", border: `1px solid ${D_BORDER}`, color: D_MUTED, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 14 }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 11, color: D_MUTED, marginBottom: 18 }}>
            {name ? `${name} · ` : ""}vorgelegt von ANIMUS, bestätigt im Behandler-Login
          </div>

          {/* füllt-Zustand: Agent diktiert noch, kein Entwurf */}
          {!entwurf && building && (
            <div style={{ fontSize: 13, color: D_MUTED, lineHeight: 1.6, padding: "6px 0 4px" }}>
              {chooserMode ? (building.hint ?? "ANIMUS öffnet das Doku-Menü …") : "ANIMUS hört zu und füllt den Eintrag …"}
            </div>
          )}

          {/* Patient */}
          {(name || metaZeile) && (
            <Section>
              <DLabel>Patient</DLabel>
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: 12, borderRadius: 11, border: "1px solid rgba(91,157,255,0.4)", background: D_BLUE_SOFT }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: D_BLUE, boxShadow: `0 0 10px ${D_BLUE}`, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{name || "Patient"}</div>
                  {metaZeile && <div style={{ fontSize: 11, color: D_MUTED, marginTop: 2 }}>{metaZeile}</div>}
                </div>
              </div>
            </Section>
          )}

          {/* Behandlungsart + Leistungen */}
          <Section>
            <DLabel>Behandlungsart</DLabel>
            {BEHANDLUNGSARTEN.map((b) => (
              <Chip key={b.key} on={behandlungsart === b.key}>{b.label}</Chip>
            ))}
            {terminTyp && (
              <>
                <DLabel style={{ marginTop: 13 }}>Leistungen dieser Sitzung · stapelbar</DLabel>
                <Chip add>⊕ {schoen(terminTyp)}</Chip>
              </>
            )}
          </Section>

          {chooserMode && (
            <>
              {building?.behandlungsarten && building.behandlungsarten.length > 0 && (
                <Section>
                  <DLabel>Sprachwahl · Behandlungsart</DLabel>
                  {building.behandlungsarten.map((option) => (
                    <Chip key={option} on={schoen(behandlungsart) === option}>{option}</Chip>
                  ))}
                </Section>
              )}

              {building?.termin_optionen && building.termin_optionen.length > 0 && (
                <Section>
                  <DLabel>Sprachwahl · Terminarten</DLabel>
                  {building.termin_optionen.map((option) => (
                    <Chip key={option}>{option}</Chip>
                  ))}
                </Section>
              )}
            </>
          )}

          {/* Eintrag */}
          {entwurf?.text && (
            <Section>
              <DLabel>Eintrag</DLabel>
              <div style={{ background: D_CREAM, color: "#1c1c1c", borderRadius: 11, padding: 15, fontSize: 12.5, lineHeight: 1.6 }}>
                {metaZeile && <div style={{ color: "#6a6a6a", fontSize: 11, marginBottom: 8 }}>{name ? `${name} · ` : ""}{metaZeile}</div>}
                {entwurf.text}
                <div style={{ color: "#8a8a8a", fontSize: 10.5, marginTop: 11, borderTop: "1px dashed #cfc8ba", paddingTop: 8 }}>
                  Entwurf. Wird mit Bestätigung Teil der Akte. Aufbewahrung 10 Jahre.
                </div>
              </div>
            </Section>
          )}

          {/* Zähne (wenn die Vorlage sie nutzt) */}
          {entwurf && entwurf.zaehne.length > 0 && (
            <Section>
              <DLabel>Zähne</DLabel>
              {entwurf.zaehne.map((z) => (
                <Chip key={z} on>{z}</Chip>
              ))}
            </Section>
          )}

          {/* Bausteine je Gruppe (Befund, Einschätzung …) — kommt von ANIMUS */}
          {gruppen.map((g) => (
            <Section key={g.gid}>
              <DLabel>
                {g.label}
                {g.req && <span style={{ color: D_DANGER }}> · Pflicht</span>}
              </DLabel>
              {g.opts.map((o, i) => (
                <Chip key={`${g.gid}-${i}`} on={o.on}>{o.text}</Chip>
              ))}
            </Section>
          ))}

          {/* Bestätigen */}
          <Section>
            <button
              onClick={() => { void confirm(); }}
              disabled={!entwurf || saving}
              style={{
                width: "100%",
                padding: 13,
                borderRadius: 11,
                border: "none",
                background: entwurf ? D_GREEN : "rgba(255,255,255,0.12)",
                color: entwurf ? "#07140c" : D_MUTED,
                fontWeight: 700,
                fontSize: 13.5,
                fontFamily: MONO,
                cursor: entwurf && !saving ? "pointer" : "default",
              }}
            >
              {saving ? "speichere …" : "Bestätigen & eintragen"}
            </button>
            {entwurf && (
              <div style={{ fontSize: 11.5, color: D_GREEN, textAlign: "center", marginTop: 8 }}>
                Bereit · Patient, Befund und Einschätzung gesetzt
              </div>
            )}
          </Section>

          {/* Ausgänge */}
          <Section>
            <DLabel>Ausgänge · zwei Artefakte, eine Quelle</DLabel>
            <div style={{ border: `1px solid ${D_BORDER}`, borderRadius: 11, padding: 13, marginTop: 10, background: "rgba(20,26,31,0.6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <b style={{ fontSize: 12.5 }}>Verlauf → Akte (ivoris)</b>
                <span style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: D_MUTED, border: `1px solid ${D_BORDER}`, borderRadius: 5, padding: "3px 6px" }}>§ 630f</span>
              </div>
              <div style={{ fontSize: 11, color: D_MUTED, marginTop: 6, lineHeight: 1.5 }}>
                Erscheint nach Bestätigung als Karteieintrag.
              </div>
            </div>
            <div style={{ border: `1px solid ${D_BORDER}`, borderRadius: 11, padding: 13, marginTop: 10, background: "rgba(20,26,31,0.6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <b style={{ fontSize: 12.5 }}>KZV-Abrechnung (BEMA)</b>
                <span style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: D_MUTED, border: `1px solid ${D_BORDER}`, borderRadius: 5, padding: "3px 6px" }}>nur Positionen</span>
              </div>
              {positionen.length > 0 ? (
                positionen.map((p, i) => (
                  <div key={`${p.code}-${i}`} style={{ color: D_BLUE, fontSize: 12, marginTop: 5 }}>
                    BEMA {p.code} · {p.text}{p.anzahl && p.anzahl > 1 ? ` ×${p.anzahl}` : ""}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, color: D_MUTED, marginTop: 6 }}>noch keine Position</div>
              )}
            </div>
          </Section>
        </div>
      </aside>
    </>
  );
}

function Section({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div style={{ marginBottom: 18 }}>{children}</div>;
}

function DLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return (
    <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: D_MUTED, marginBottom: 11, ...style }}>
      {children}
    </div>
  );
}

function Chip({ children, on, add }: { children: React.ReactNode; on?: boolean; add?: boolean }): React.ReactElement {
  const base: React.CSSProperties = {
    display: "inline-block",
    margin: "0 6px 7px 0",
    padding: "8px 12px",
    borderRadius: 999,
    border: `1px solid ${D_BORDER}`,
    background: "rgba(255,255,255,0.02)",
    color: TEXT,
    fontSize: 12,
    lineHeight: 1.3,
  };
  if (on) {
    base.borderColor = D_BLUE;
    base.color = "#cfe0ff";
    base.background = D_BLUE_SOFT;
  } else if (add) {
    base.borderColor = "rgba(91,157,255,0.5)";
    base.color = D_BLUE;
  }
  return <span style={base}>{children}</span>;
}
