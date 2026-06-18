"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAnimusScene } from "./scene";
import { useAnimus } from "./useAnimus";
import { DokuPanel } from "./DokuPanel";
import type { AnimusPatient, AnimusScene, AnimusHudProps, DokuEntwurf } from "./types";

const FONT_LINK_ID = "animus-fonts";
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=JetBrains+Mono:wght@400;600&display=swap";

function ensureFonts(): void {
  if (typeof document === "undefined" || document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

const MONO = '"JetBrains Mono", ui-monospace, monospace';
const DISPLAY = '"Orbitron", system-ui, sans-serif';

type HoverState = { patient: AnimusPatient; x: number; y: number } | null;

/**
 * ANIMUS voice HUD. Drop into a Next.js App Router client route. Drives a
 * reactive orb from the agent's voice and zooms to a patient when the agent
 * calls one. Self-contained styling; only external asset is the Google Font.
 */
export function AnimusHud(props: AnimusHudProps): React.ReactElement {
  const { tokenEndpoint, room, identity, patients, greeting = "Guten Abend, Dr. Schubert.", autoConnect = false, onPatientCall, onPatientFocus, onDokuStart, onDokuOpen, onDokuConfirm, showCard = true, className, style } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<AnimusScene | null>(null);
  // Kept in a ref so the scene, built once, always calls the latest handler.
  const onPatientFocusRef = useRef(onPatientFocus);
  onPatientFocusRef.current = onPatientFocus;

  const [card, setCard] = useState<AnimusPatient | null>(null);
  const [hover, setHover] = useState<HoverState>(null);
  const [level, setLevel] = useState(0);
  const [dokuStart, setDokuStart] = useState<{ behandlungsart: string; termin_typ: string; name: string } | null>(null);
  const [dokuEntwurf, setDokuEntwurf] = useState<DokuEntwurf | null>(null);
  const [dokuPatient, setDokuPatient] = useState<string>("");

  const handlePatientCall = useCallback((p: AnimusPatient) => {
    sceneRef.current?.focusByName(p.name);
    onPatientCall?.(p);
  }, [onPatientCall]);

  const handleDokuStart = useCallback((info: { behandlungsart: string; termin_typ: string; name: string }) => {
    setDokuEntwurf(null);
    setDokuStart(info);
    onDokuStart?.(info);
  }, [onDokuStart]);

  const handleDokuOpen = useCallback((entwurf: DokuEntwurf, patient: string) => {
    setDokuEntwurf(entwurf);
    setDokuPatient(patient);
    onDokuOpen?.(entwurf, patient);
  }, [onDokuOpen]);

  const closeDoku = useCallback(() => {
    setDokuEntwurf(null);
    setDokuStart(null);
  }, []);

  const confirmDoku = useCallback(async (entwurf: DokuEntwurf) => {
    await onDokuConfirm?.(entwurf);
    closeDoku();
  }, [onDokuConfirm, closeDoku]);

  const { connect, connected, connecting, error } = useAnimus({
    tokenEndpoint,
    room,
    identity,
    onLevel: (v) => { sceneRef.current?.setLevel(v); setLevel(v); },
    onPatientCall: handlePatientCall,
    onDokuStart: handleDokuStart,
    onDokuOpen: handleDokuOpen,
  });

  useEffect(() => {
    ensureFonts();
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const animus = createAnimusScene(canvas, patients, {
      onHover: (patient, x, y) => setHover(patient ? { patient, x, y } : null),
      onFocus: (patient) => { setCard(patient); onPatientFocusRef.current?.(patient); },
      onUnfocus: () => setCard(null),
    });
    sceneRef.current = animus;

    const doResize = () => animus.resize(wrap.clientWidth, wrap.clientHeight);
    doResize();
    animus.start();

    const ro = new ResizeObserver(doResize);
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      animus.dispose();
      sceneRef.current = null;
    };
  }, [patients]);

  const closeCard = () => { sceneRef.current?.unfocus(); setCard(null); };

  useEffect(() => {
    if (autoConnect) void connect();
  }, [autoConnect, connect]);


  const status = error ? "FEHLER" : connecting ? "VERBINDE" : connected ? "VERBUNDEN" : "BEREIT";

  return (
    <div ref={wrapRef} className={className} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#05070e", color: "#dfeaff", fontFamily: MONO, ...style }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

      {/* wordmark */}
      <div style={{ position: "absolute", top: 22, left: 26, letterSpacing: 6, fontFamily: DISPLAY }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>ANIMA</div>
        <div style={{ fontSize: 10, opacity: 0.55, letterSpacing: 4 }}>ORTHODONTIC INTELLIGENCE</div>
      </div>

      {/* status panel */}
      <div style={{ position: "absolute", bottom: 26, left: 26, minWidth: 210, fontSize: 12 }}>
        <Row k="STATUS" v={status} />
        <Row k="ANSICHT" v="REMIX" />
        <Row k="PEGEL" v={`${Math.round(level * 100)}%`} />
      </div>

      {/* legend */}
      <div style={{ position: "absolute", bottom: 26, left: 0, right: 0, margin: "0 auto", width: "fit-content", display: "flex", gap: 18, fontSize: 12, opacity: 0.8 }}>
        <Legend color="#FF8AD6" label="weiblich" />
        <Legend color="#66CFFF" label="männlich" />
        <Legend color="#F5C56B" label="divers" />
      </div>

      {/* greeting + activate */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 120, textAlign: "center" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 500 }}>{greeting}</div>
        <button
          onClick={() => { void connect(); }}
          disabled={connected || connecting}
          style={{ marginTop: 22, padding: "12px 26px", borderRadius: 999, cursor: connected ? "default" : "pointer", background: connected ? "rgba(94,217,255,.12)" : "rgba(94,217,255,.18)", border: "1px solid rgba(94,217,255,.5)", color: "#dfeaff", fontFamily: MONO, fontSize: 14, letterSpacing: 1 }}
        >
          {connected ? "Anima verbunden" : connecting ? "verbinde …" : "▸ Anima aktivieren"}
        </button>
        {error && <div style={{ marginTop: 10, color: "#ff8aad", fontSize: 12 }}>{error}</div>}
      </div>

      {/* hover label */}
      {hover && (
        <div style={{ position: "fixed", left: hover.x + 12, top: hover.y + 12, padding: "4px 8px", borderRadius: 6, background: "rgba(10,16,30,.85)", border: "1px solid rgba(94,217,255,.35)", fontSize: 12, pointerEvents: "none", whiteSpace: "nowrap" }}>
          {hover.patient.name}{hover.patient.treatment ? ` · ${hover.patient.treatment}` : ""}
        </div>
      )}

      {/* patient card */}
      {showCard && card && (
        <div style={{ position: "absolute", top: 90, right: 26, width: 280, padding: 18, borderRadius: 14, background: "rgba(8,14,26,.92)", border: "1px solid rgba(94,217,255,.35)", boxShadow: "0 10px 40px rgba(0,0,0,.5)" }}>
          <button onClick={closeCard} aria-label="schließen" style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: "#9fb6da", cursor: "pointer", fontSize: 16 }}>✕</button>
          <h3 style={{ margin: "0 0 4px", fontFamily: DISPLAY, fontSize: 20 }}>{card.name}</h3>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 14 }}>{card.age != null ? `${card.age} Jahre · ` : ""}Patient:in</div>
          <CardRow k="Behandlung" v={card.treatment ?? "—"} />
          <CardRow k="Phase" v={card.phase ?? "—"} />
          <CardRow k="Nächster Termin" v={card.next ?? "—"} />
          <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.08)", marginTop: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${card.progress ?? 0}%`, background: "linear-gradient(90deg,#5ED9FF,#9A7CFF)" }} />
          </div>
        </div>
      )}

      <DokuPanel
        building={dokuStart}
        entwurf={dokuEntwurf}
        patient={dokuPatient}
        onConfirm={confirmDoku}
        onClose={closeDoku}
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,.06)", padding: "6px 0" }}>
      <span style={{ opacity: 0.5 }}>{k}</span>
      <span style={{ color: "#5ED9FF" }}>{v}</span>
    </div>
  );
}

function CardRow({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
      <span style={{ opacity: 0.6 }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }): React.ReactElement {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
