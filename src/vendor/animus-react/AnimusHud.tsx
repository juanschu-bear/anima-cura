"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createAnimusScene } from "./scene";
import { useAnimus } from "./useAnimus";
import { DokuPanel } from "./DokuPanel";
import { DiaryPanel } from "./DiaryPanel";
import { handlePatientCall as applyPatientCall } from "./patientCall";
import type { AnimusMemorySnapshot, AnimusPatient, AnimusScene, AnimusHudProps, AnimusHandle, AnimusTtsStatus, DokuEntwurf, DokuStartInfo } from "./types";
import { DEFAULT_WAKE_WORD_PHRASES } from "./wakeWord";

const FONT_LINK_ID = "animus-fonts";
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=JetBrains+Mono:wght@400;500;600&display=swap";

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
const TTS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "eleven_multilingual_v2", label: "Multilingual v2" },
  { value: "eleven_turbo_v2_5", label: "Turbo v2.5" },
  { value: "eleven_flash_v2_5", label: "Flash v2.5" },
  { value: "eleven_v3", label: "Eleven v3" },
];

// Mockup chrome, scoped under .ahud so it does not leak. Ported 1:1 from
// ANIMUS-MOCKUP.html (fixed -> absolute within the HUD wrap).
const CHROME_CSS = `
.ahud{ --cyan:#5ED9FF; --blau:#2E78FF; --violet:#9A7CFF; --schrift:#CFE6FF; --gedeckt:#5E7A96; --leise:#33485E; --linie:rgba(94,217,255,.18); }
.ahud .glow{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);width:60vmin;height:60vmin;z-index:0;pointer-events:none;background:radial-gradient(circle,rgba(94,217,255,.30),rgba(154,124,255,.10) 42%,transparent 68%);filter:blur(8px)}
.ahud .grid{position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.5;background-image:linear-gradient(rgba(94,217,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(94,217,255,.05) 1px,transparent 1px);background-size:46px 46px;-webkit-mask-image:radial-gradient(circle at 50% 50%,#000 30%,transparent 80%);mask-image:radial-gradient(circle at 50% 50%,#000 30%,transparent 80%)}
.ahud .ecke{position:absolute;width:46px;height:46px;border:2px solid var(--cyan);opacity:.55;z-index:3}
.ahud .ecke.tl{top:22px;left:22px;border-right:0;border-bottom:0}
.ahud .ecke.tr{top:22px;right:22px;border-left:0;border-bottom:0}
.ahud .ecke.bl{bottom:22px;left:22px;border-right:0;border-top:0}
.ahud .ecke.br{bottom:22px;right:22px;border-left:0;border-top:0}
.ahud .topbar{position:absolute;top:30px;left:42px;right:42px;display:flex;justify-content:space-between;align-items:flex-start;z-index:3}
.ahud .marke{font-family:'Orbitron',sans-serif;font-weight:900;letter-spacing:.32em;font-size:15px;color:#EAF6FF;text-shadow:0 0 18px var(--cyan)}
.ahud .marke small{display:block;font-family:'JetBrains Mono',monospace;font-weight:500;letter-spacing:.34em;font-size:9.5px;color:var(--gedeckt);margin-top:6px}
.ahud .uhr{text-align:right;font-family:'Orbitron',sans-serif;font-weight:700;font-size:22px;color:#EAF6FF;text-shadow:0 0 16px var(--blau)}
.ahud .uhr small{display:block;font-family:'JetBrains Mono',monospace;font-weight:400;font-size:10px;letter-spacing:.24em;color:var(--gedeckt);margin-top:5px}
.ahud .status{position:absolute;top:50%;left:42px;transform:translateY(-50%);z-index:3;font-size:11px;line-height:2.2;letter-spacing:.06em;width:210px}
.ahud .status .row{display:flex;justify-content:space-between;border-bottom:1px solid var(--linie);padding:4px 0}
.ahud .status .k{color:var(--gedeckt)}
.ahud .status .v{color:var(--cyan)}
.ahud .status .v.dim{color:var(--leise)}
.ahud .status .titel{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:.26em;color:var(--gedeckt);margin-bottom:8px}
.ahud .rechts{position:absolute;top:50%;right:42px;transform:translateY(-50%);z-index:3;width:210px;text-align:right}
.ahud .rechts .titel{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:.26em;color:var(--gedeckt);margin-bottom:10px}
.ahud .wave{width:100%;height:60px;display:block}
.ahud .rechts .lines{font-size:10px;line-height:2.1;color:var(--gedeckt);margin-top:12px;letter-spacing:.05em}
.ahud .rechts .lines b{color:var(--cyan);font-weight:600}
.ahud .greet{position:absolute;top:92px;left:0;right:0;z-index:4;text-align:center;padding:0 20px}
.ahud .controls{position:absolute;left:0;right:0;bottom:60px;z-index:3;text-align:center}
.ahud .gruss{font-family:'Orbitron',sans-serif;font-weight:700;font-size:26px;letter-spacing:.04em;color:#EAF6FF;text-shadow:0 0 22px rgba(94,217,255,.6);margin:0}
.ahud .gruss .name{background:linear-gradient(90deg,var(--cyan),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent}
.ahud .sub{font-size:12px;letter-spacing:.22em;color:var(--gedeckt);margin:12px 0 22px;text-transform:uppercase}
.ahud .sub .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 10px var(--cyan);margin-right:9px;vertical-align:middle;animation:ahud-blink 1.6s ease-in-out infinite}
@keyframes ahud-blink{0%,100%{opacity:.35}50%{opacity:1}}
.ahud .knoepfe{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.ahud .btn{min-width:170px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;letter-spacing:.04em;padding:12px 22px;border-radius:999px;cursor:pointer;border:1px solid var(--cyan);background:rgba(94,217,255,.10);color:#Dff3ff;transition:all .15s ease;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.ahud .btn:hover{background:rgba(94,217,255,.2);box-shadow:0 0 26px rgba(94,217,255,.45);transform:translateY(-1px)}
.ahud .btn:disabled{cursor:default;opacity:.7;transform:none;box-shadow:none}
.ahud .btn.ghost{border-color:var(--linie);background:transparent;color:var(--gedeckt)}
.ahud .btn.ghost:hover{border-color:var(--cyan);color:var(--schrift);box-shadow:none}
.ahud .cmd{margin:14px auto 0;display:block;width:min(320px,80vw);text-align:center;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.04em;color:#Dff3ff;background:rgba(6,14,24,.6);border:1px solid var(--linie);border-radius:999px;padding:10px 16px;outline:none}
.ahud .cmd:focus{border-color:var(--cyan);box-shadow:0 0 18px rgba(94,217,255,.3)}
.ahud .cmd::placeholder{color:var(--leise)}
.ahud .nodeLabel{position:fixed;z-index:5;pointer-events:none;font-size:11px;letter-spacing:.08em;color:#EAF6FF;background:rgba(6,14,24,.85);border:1px solid var(--cyan);padding:5px 10px;border-radius:7px;transform:translate(-50%,-150%);white-space:nowrap;box-shadow:0 0 18px rgba(94,217,255,.35)}
.ahud .legende{position:absolute;left:42px;bottom:82px;z-index:3;font-size:11px;letter-spacing:.08em;color:var(--gedeckt)}
.ahud .legende span{display:flex;align-items:center;gap:9px;margin-top:9px}
.ahud .legende i{width:11px;height:11px;border-radius:50%;display:inline-block;box-shadow:0 0 10px rgba(150,190,255,.6)}
@media (max-width:820px){ .ahud .status,.ahud .rechts{display:none} .ahud .gruss{font-size:20px} }
@media (prefers-reduced-motion: reduce){ .ahud .sub .dot{animation:none} }
`;

type HoverState = { patient: AnimusPatient; x: number; y: number } | null;

/**
 * ANIMUS voice HUD. Drop into a Next.js App Router client route. Drives a
 * reactive orb from the agent's voice and zooms to a patient when the agent
 * calls one. The visible chrome mirrors ANIMUS-MOCKUP.html; the wiring (LiveKit
 * via useAnimus, the doku panel, the callbacks) is unchanged.
 */
export const AnimusHud = forwardRef<AnimusHandle, AnimusHudProps>(function AnimusHud(props, ref): React.ReactElement {
  const {
    tokenEndpoint, room, identity, patients,
    greetingLead = "Guten Abend,", userName = "Dr. Schubert",
    autoConnect = false, wakeWord = false, wakeWordPhrases = DEFAULT_WAKE_WORD_PHRASES,
    onPatientCall, onPatientFocus, onPatientUnfocus, onDokuStart, onDokuUpdate, onDokuOpen, onDokuConfirm,
    showCard = true, className, style,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<AnimusScene | null>(null);
  // Kept in refs so the scene, built once, always calls the latest handlers.
  const onPatientFocusRef = useRef(onPatientFocus);
  onPatientFocusRef.current = onPatientFocus;
  const onPatientUnfocusRef = useRef(onPatientUnfocus);
  onPatientUnfocusRef.current = onPatientUnfocus;
  // Live voice level for the waveform RAF, without re-rendering per frame.
  const levelRef = useRef(0);

  const [card, setCard] = useState<AnimusPatient | null>(null);
  const [hover, setHover] = useState<HoverState>(null);
  const [level, setLevel] = useState(0);
  const [zeit, setZeit] = useState("--:--:--");
  const [datum, setDatum] = useState("—");
  const [uptime, setUptime] = useState("00:00");
  const [dokuStart, setDokuStart] = useState<DokuStartInfo | null>(null);
  const [dokuPreview, setDokuPreview] = useState<DokuEntwurf | null>(null);
  const [dokuPreviewHint, setDokuPreviewHint] = useState<string | null>(null);
  const [dokuEntwurf, setDokuEntwurf] = useState<DokuEntwurf | null>(null);
  const [dokuPatient, setDokuPatient] = useState<string>("");
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [memorySnapshot, setMemorySnapshot] = useState<AnimusMemorySnapshot | null>(null);
  const [ttsStatus, setTtsStatus] = useState<AnimusTtsStatus | null>(null);
  const [ttsSelection, setTtsSelection] = useState("eleven_multilingual_v2");
  const [ttsApplying, setTtsApplying] = useState(false);

  const handlePatientCall = useCallback((p: AnimusPatient) => {
    applyPatientCall({
      scene: sceneRef.current,
      patient: p,
      showCard,
      setCard,
      onPatientCall,
      onPatientFocus: onPatientFocusRef.current,
    });
  }, [onPatientCall, showCard]);

  const handlePatientUnfocus = useCallback(() => {
    sceneRef.current?.unfocus();
    setCard(null);
    setHover(null);
    onPatientUnfocus?.();
  }, [onPatientUnfocus]);

  const handleDokuStart = useCallback((info: DokuStartInfo) => {
    setDokuEntwurf(null);
    setDokuPreview(null);
    setDokuPreviewHint(info.hint ?? null);
    setDokuStart(info);
    onDokuStart?.(info);
  }, [onDokuStart]);

  const handleDokuUpdate = useCallback((entwurf: DokuEntwurf, patient: string, frage?: string) => {
    setDokuPreview(entwurf);
    setDokuPatient(patient);
    setDokuPreviewHint(frage ?? null);
    onDokuUpdate?.(entwurf, patient, frage);
  }, [onDokuUpdate]);

  const handleDokuOpen = useCallback((entwurf: DokuEntwurf, patient: string) => {
    setDokuEntwurf(entwurf);
    setDokuPreview(entwurf);
    setDokuPreviewHint(null);
    setDokuPatient(patient);
    onDokuOpen?.(entwurf, patient);
  }, [onDokuOpen]);

  const closeDoku = useCallback(() => {
    setDokuEntwurf(null);
    setDokuPreview(null);
    setDokuPreviewHint(null);
    setDokuStart(null);
  }, []);

  const openManualDoku = useCallback(() => {
    setDokuEntwurf(null);
    setDokuStart({
      behandlungsart: "",
      termin_typ: "",
      name: card?.name ?? dokuPatient ?? "",
      modus: "chooser",
      hint: "ANIMUS blendet das Doku-Menü ein …",
    });
    setDokuPreview(null);
    setDokuPreviewHint("ANIMUS blendet das Doku-Menü ein …");
  }, [card, dokuPatient]);

  const {
    connect,
    disconnect,
    sendControl,
    enableWakeWord,
    disableWakeWord,
    connected,
    connecting,
    error,
    wakeWordSupported,
    wakeWordEnabled,
    wakeWordListening,
    wakeWordState,
    wakeWordError,
  } = useAnimus({
    tokenEndpoint,
    room,
    identity,
    wakeWord,
    wakeWordPhrases,
    onLevel: (v) => { sceneRef.current?.setLevel(v); levelRef.current = v; setLevel(v); },
    onPatientCall: handlePatientCall,
    onPatientUnfocus: handlePatientUnfocus,
    onDokuStart: handleDokuStart,
    onDokuUpdate: handleDokuUpdate,
    onDokuOpen: handleDokuOpen,
    onDokuConfirmed: closeDoku,
    onMemorySnapshot: setMemorySnapshot,
    onTtsStatus: (status) => {
      setTtsStatus(status);
      setTtsSelection(status.current_model);
      setTtsApplying(Boolean(status.restarting));
    },
  });

  const confirmDoku = useCallback(async (entwurf: DokuEntwurf) => {
    await onDokuConfirm?.(entwurf);
    try {
      await sendControl({ type: "doku_confirmed", patient_id: entwurf.patient_id });
    } catch {
      /* non-fatal: confirmation already succeeded on the host */
    }
    closeDoku();
  }, [onDokuConfirm, closeDoku, sendControl]);

  const requestMemorySnapshot = useCallback(() => {
    void sendControl({ type: "memory_snapshot_request" });
  }, [sendControl]);

  const requestTtsStatus = useCallback(() => {
    void sendControl({ type: "tts_model_request" });
  }, [sendControl]);

  const applyTtsModel = useCallback(async () => {
    if (!connected || ttsApplying) return;
    setTtsApplying(true);
    try {
      await sendControl({ type: "set_tts_model", model: ttsSelection });
    } catch {
      setTtsApplying(false);
    }
  }, [connected, sendControl, ttsApplying, ttsSelection]);

  useImperativeHandle(ref, () => ({
    unfocus: () => sceneRef.current?.unfocus(),
    focusByName: (name: string) => sceneRef.current?.focusByName(name) ?? false,
  }), []);

  // Live clock + session uptime, exactly like the mockup (per second).
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const n = new Date();
      setZeit(n.toLocaleTimeString("de-DE"));
      setDatum(n.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase());
      const s = Math.floor((Date.now() - start) / 1000);
      setUptime(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // SIGNAL waveform, driven by the live voice level (mockup zeichneWave).
  useEffect(() => {
    const cv = waveRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = (cv.width = cv.clientWidth || 210);
      const h = (cv.height = 60);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "#5ED9FF";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const amp = levelRef.current;
      const t = performance.now() / 240;
      for (let x = 0; x < w; x++) {
        const y = h / 2 + Math.sin(x * 0.14 + t) * (6 + amp * 22) * Math.sin(x * 0.03 + t * 0.7);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    draw();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, []);

  // Scene last, so a failure here can never block the clock or waveform effects
  // above. The first frame is scheduled via rAF inside start(), not run inline.
  useEffect(() => {
    ensureFonts();
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const animus = createAnimusScene(canvas, patients, {
      onHover: (patient, x, y) => setHover(patient ? { patient, x, y } : null),
      onFocus: (patient) => { setCard(patient); onPatientFocusRef.current?.(patient); },
      onUnfocus: () => { setCard(null); onPatientUnfocusRef.current?.(); },
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

  useEffect(() => {
    if (!connected) return;
    requestMemorySnapshot();
    requestTtsStatus();
  }, [connected, requestMemorySnapshot, requestTtsStatus]);

  const rufeZufall = useCallback(() => {
    if (!patients || patients.length === 0) return;
    const p = patients[Math.floor(Math.random() * patients.length)];
    sceneRef.current?.focusByName(p.name);
  }, [patients]);

  const onCmd = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const val = e.currentTarget.value.trim();
    if (val) sceneRef.current?.focusByName(val);
    e.currentTarget.value = "";
  }, []);

  const wakeLabel = wakeWordPhrases[0] ?? DEFAULT_WAKE_WORD_PHRASES[0];
  const liveError = error ?? wakeWordError;
  const sysStatus = liveError ? "FEHLER" : connecting ? "VERBINDE" : connected ? "VERBUNDEN" : wakeWordEnabled ? "WAKE" : "BEREIT";
  const micStatus = connected ? "live" : wakeWordListening ? "wake" : "inaktiv";
  const wakeStatus = !wakeWord
    ? "—"
    : !wakeWordSupported
      ? "nicht verfügbar"
      : wakeWordEnabled
        ? wakeWordState === "detected"
          ? "erkannt"
          : wakeWordListening
            ? "lauscht"
            : "bereit"
        : "aus";
  const zustand = liveError
    ? liveError
    : connected
      ? "Sprich mit Animus …"
      : connecting
        ? "verbinde …"
        : wakeWordEnabled
          ? `Sag „${wakeLabel}“ zum Aktivieren`
          : "Sagen Sie mir die Diagnose, ich dokumentiere";
  const aktivierenLabel = connecting ? "verbinde …" : connected ? "■ Animus beenden" : "▸ Animus aktivieren";
  const wakeWordLabel = !wakeWordSupported
    ? "◌ Wake Word nicht verfügbar"
    : wakeWordEnabled
      ? "◉ Wake Word an"
      : "◌ Wake Word aus";

  return (
    <div ref={wrapRef} className={`ahud ${className ?? ""}`} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#03060E", color: "#CFE6FF", fontFamily: MONO, ...style }}>
      <style>{CHROME_CSS}</style>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", zIndex: 0 }} />

      <div className="glow" style={{ opacity: 0.55 + level * 0.45 }} aria-hidden="true" />
      <div className="grid" aria-hidden="true" />

      <div className="ecke tl" aria-hidden="true" />
      <div className="ecke tr" aria-hidden="true" />
      <div className="ecke bl" aria-hidden="true" />
      <div className="ecke br" aria-hidden="true" />

      <div className="topbar">
        <div className="marke">ANIMUS<small>ORTHODONTIC INTELLIGENCE</small></div>
        <div className="uhr"><span>{zeit}</span><small>{datum}</small></div>
      </div>

      <div className="greet">
        <p className="gruss">{greetingLead} <span className="name">{userName}</span>.</p>
        <p className="sub"><span className="dot" />{zustand}</p>
      </div>

      <div className="status">
        <div className="titel">SYSTEM</div>
        <div className="row"><span className="k">STATUS</span><span className="v">{sysStatus}</span></div>
        <div className="row"><span className="k">ANSICHT</span><span className="v">REMIX</span></div>
        <div className="row"><span className="k">MIKROFON</span><span className={`v ${connected ? "" : "dim"}`}>{micStatus}</span></div>
        {wakeWord && <div className="row"><span className="k">WAKE WORD</span><span className={`v ${wakeWordEnabled ? "" : "dim"}`}>{wakeStatus}</span></div>}
        <div className="row"><span className="k">TTS</span><span className={`v ${ttsApplying ? "" : "dim"}`}>{ttsStatus?.current_model ?? "—"}</span></div>
        <div className="row"><span className="k">PEGEL</span><span className="v">{Math.round(level * 100)}%</span></div>
      </div>

      <div className="rechts">
        <div className="titel">SIGNAL</div>
        <canvas ref={waveRef} className="wave" />
        <div className="lines">
          <div>LATENZ <b>&lt; 1 s</b></div>
          <div>SESSION <b>{uptime}</b></div>
        </div>
      </div>

      <div className="controls">
        <div className="knoepfe">
          <button className="btn" type="button" onClick={() => { if (connected) disconnect(); else void connect(); }} disabled={connecting}>
            {aktivierenLabel}
          </button>
          {wakeWord && (
            <button
              className="btn ghost"
              type="button"
              onClick={() => { if (wakeWordEnabled) disableWakeWord(); else void enableWakeWord(); }}
              disabled={!wakeWordSupported}
            >
              {wakeWordLabel}
            </button>
          )}
          <button className="btn ghost" type="button" onClick={rufeZufall}>▤ Patient aufrufen</button>
          <button className="btn ghost" type="button" onClick={openManualDoku}>✎ Doku-Menü</button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <select
            value={ttsSelection}
            onChange={(e) => setTtsSelection(e.target.value)}
            style={{
              minWidth: 220,
              borderRadius: 999,
              border: "1px solid rgba(94,217,255,.22)",
              background: "rgba(6,14,24,.74)",
              color: "#Dff3ff",
              padding: "10px 16px",
              fontFamily: MONO,
              fontSize: 12,
            }}
          >
            {TTS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button className="btn ghost" type="button" onClick={() => void applyTtsModel()} disabled={!connected || ttsApplying}>
            {ttsApplying ? "TTS wechselt …" : "TTS übernehmen"}
          </button>
        </div>
        <input className="cmd" placeholder={'Befehl tippen: „Ruf Anna auf"'} onKeyDown={onCmd} />
      </div>

      <button
        type="button"
        onClick={() => {
          setDiaryOpen((current) => {
            const next = !current;
            if (next) requestMemorySnapshot();
            return next;
          });
        }}
        style={{
          position: "absolute",
          right: 32,
          bottom: 28,
          zIndex: 4,
          borderRadius: 999,
          padding: "12px 18px",
          border: "1px solid rgba(198,171,117,.24)",
          background: "rgba(24,18,12,.82)",
          color: "#e7d2aa",
          fontFamily: MONO,
          fontSize: 13,
          letterSpacing: ".08em",
          cursor: "pointer",
          backdropFilter: "blur(8px)",
        }}
      >
        Diary
      </button>

      {hover && (
        <div className="nodeLabel" style={{ left: hover.x, top: hover.y }}>
          {hover.patient.name}{hover.patient.treatment ? ` · ${hover.patient.treatment}` : ""}
        </div>
      )}

      <div className="legende">
        <span><i style={{ background: "#FF8AD6" }} /> weiblich</span>
        <span><i style={{ background: "#5ED9FF" }} /> männlich</span>
        <span><i style={{ background: "#F5C56B" }} /> divers</span>
      </div>

      {/* Built-in card, only for standalone use. AnimaScribe sets showCard=false
          and draws its own mockup-styled card with real data. */}
      {showCard && card && (
        <div style={{ position: "absolute", top: 90, right: 26, width: 280, padding: 18, borderRadius: 14, background: "rgba(8,14,26,.92)", border: "1px solid rgba(94,217,255,.35)", boxShadow: "0 10px 40px rgba(0,0,0,.5)", zIndex: 6 }}>
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
        preview={dokuPreview}
        previewHint={dokuPreviewHint}
        entwurf={dokuEntwurf}
        patient={dokuPatient}
        onConfirm={confirmDoku}
        onClose={closeDoku}
      />
      <DiaryPanel
        open={diaryOpen}
        snapshot={memorySnapshot}
        onClose={() => setDiaryOpen(false)}
        onRefresh={requestMemorySnapshot}
      />
    </div>
  );
});

function CardRow({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
      <span style={{ opacity: 0.6 }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}
