"use client";

import { useState } from "react";
import type { DokuEntwurf } from "./types";

const MONO = '"JetBrains Mono", ui-monospace, monospace';
const DISPLAY = '"Orbitron", system-ui, sans-serif';
// AnimaScribe-Akte: warmes Creme mit dunkler Schrift und blauen Chips.
const AKTE = "#f5efe3";
const INK = "#2a2622";
const BLUE = "#2f6df0";

export interface DokuPanelProps {
  /** Set while the agent is dictating but no draft is ready yet. */
  building?: { behandlungsart: string; termin_typ: string; name: string } | null;
  /** The finished draft, ready for the doctor to confirm. */
  entwurf?: DokuEntwurf | null;
  /** Spoken patient name for the header. */
  patient?: string;
  /** Doctor confirms: the host writes it via its AnimaScribe session. */
  onConfirm: (entwurf: DokuEntwurf) => void | Promise<void>;
  onClose: () => void;
}

/**
 * The documentation surface. It is NOT the orb HUD repainted: it keeps the
 * AnimaScribe look (cream chart, blue chips) and slides in from the right over
 * the orb when ANIMUS has a draft. The orb stays alive behind it. Confirming is
 * handed back to the host through onConfirm, so the doctor's identity and the
 * §630f signature stay on the AnimaScribe side.
 */
export function DokuPanel(props: DokuPanelProps): React.ReactElement {
  const { building, entwurf, patient, onConfirm, onClose } = props;
  const [saving, setSaving] = useState(false);
  const open = Boolean(building || entwurf);

  const titel = entwurf?.termin_typ ?? building?.termin_typ ?? "";
  const name = building?.name ?? "";

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
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(460px, 92%)",
        transform: open ? "translateX(0)" : "translateX(102%)",
        transition: "transform .42s cubic-bezier(.22,.61,.36,1)",
        background: AKTE,
        color: INK,
        boxShadow: "-24px 0 60px rgba(0,0,0,.45)",
        display: "flex",
        flexDirection: "column",
        fontFamily: MONO,
        zIndex: 20,
      }}
      aria-hidden={!open}
    >
      {/* header */}
      <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: 3, color: BLUE }}>ANIMUS · DOKUMENTATION</span>
          <button onClick={onClose} aria-label="schließen" style={{ background: "none", border: "none", color: INK, cursor: "pointer", fontSize: 18, opacity: 0.55 }}>✕</button>
        </div>
        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 600 }}>
          {name || titel || "Eintrag"}
        </div>
        {patient && <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>Patient:in: {patient}</div>}
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
        {!entwurf && building && (
          <div style={{ fontSize: 14, opacity: 0.7, lineHeight: 1.6 }}>
            ANIMUS hört zu und füllt den Eintrag …
          </div>
        )}

        {entwurf && (
          <>
            <Label>Verlaufstext</Label>
            <div style={{ background: "#fffdf8", border: "1px solid rgba(0,0,0,.1)", borderRadius: 10, padding: "14px 16px", fontSize: 15, lineHeight: 1.6 }}>
              {entwurf.text}
            </div>

            {entwurf.zaehne.length > 0 && (
              <>
                <Label>Zähne</Label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {entwurf.zaehne.map((z) => (
                    <span key={z} style={{ background: "rgba(47,109,240,.12)", color: BLUE, border: "1px solid rgba(47,109,240,.35)", borderRadius: 999, padding: "3px 10px", fontSize: 13 }}>{z}</span>
                  ))}
                </div>
              </>
            )}

            {entwurf.positionen.length > 0 && (
              <>
                <Label>Abrechnung</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {entwurf.positionen.map((p, i) => (
                    <div key={`${p.code}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, background: "#fffdf8", border: "1px solid rgba(0,0,0,.08)", borderRadius: 8, padding: "8px 12px" }}>
                      <span style={{ color: BLUE, fontWeight: 600, whiteSpace: "nowrap" }}>{p.code}</span>
                      <span style={{ flex: 1 }}>{p.text}</span>
                      {p.anzahl && p.anzahl > 1 && <span style={{ opacity: 0.6 }}>×{p.anzahl}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* footer */}
      <div style={{ padding: "14px 22px 20px", borderTop: "1px solid rgba(0,0,0,.08)", display: "flex", gap: 10 }}>
        <button
          onClick={() => { void confirm(); }}
          disabled={!entwurf || saving}
          style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", cursor: entwurf && !saving ? "pointer" : "default", background: entwurf ? BLUE : "rgba(0,0,0,.12)", color: "#fff", fontFamily: MONO, fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}
        >
          {saving ? "speichere …" : "Bestätigen"}
        </button>
        <button
          onClick={onClose}
          style={{ padding: "12px 18px", borderRadius: 10, border: "1px solid rgba(0,0,0,.18)", cursor: "pointer", background: "transparent", color: INK, fontFamily: MONO, fontSize: 14 }}
        >
          Verwerfen
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.5, margin: "16px 0 7px" }}>{children}</div>;
}
