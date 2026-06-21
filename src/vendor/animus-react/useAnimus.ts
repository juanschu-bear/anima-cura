"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { RemoteTrack } from "livekit-client";
import type { AnimusMemorySnapshot, AnimusPatient, AnimusMessage, AnimusTtsStatus, DokuEntwurf, DokuStartInfo } from "./types";
import { DEFAULT_WAKE_WORD_PHRASES, type WakeWordState, wakeWordMatchesTranscript } from "./wakeWord";

export interface UseAnimusOptions {
  /** Token server base URL; GET {tokenEndpoint}/token?room=&identity= is called. */
  tokenEndpoint: string;
  room?: string;
  identity?: string;
  /** Arm browser-side wake word recognition while disconnected. */
  wakeWord?: boolean;
  /** Accepted phrases for the wake word, e.g. ["hey animus"]. */
  wakeWordPhrases?: string[];
  /** 0..1 voice level of the agent, emitted per animation frame. */
  onLevel?: (level: number) => void;
  onPatientCall?: (patient: AnimusPatient) => void;
  onPatientUnfocus?: () => void;
  onDokuStart?: (info: DokuStartInfo) => void;
  onDokuUpdate?: (entwurf: DokuEntwurf, patient: string, frage?: string) => void;
  onDokuOpen?: (entwurf: DokuEntwurf, patient: string) => void;
  onDokuConfirmed?: () => void;
  onMemorySnapshot?: (snapshot: AnimusMemorySnapshot) => void;
  onTtsStatus?: (status: AnimusTtsStatus) => void;
}

export interface UseAnimusResult {
  connect: () => Promise<void>;
  disconnect: () => void;
  sendControl: (message: Record<string, unknown>) => Promise<void>;
  fetchMemorySnapshot: () => Promise<void>;
  requestTtsStatus: () => Promise<void>;
  setTtsModel: (model: string) => Promise<void>;
  enableWakeWord: () => Promise<void>;
  disableWakeWord: () => void;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  wakeWordSupported: boolean;
  wakeWordEnabled: boolean;
  wakeWordListening: boolean;
  wakeWordState: WakeWordState;
  wakeWordError: string | null;
}

type BrowserSpeechRecognitionAlternative = { transcript: string };
type WakeWordRecognitionResult = ArrayLike<BrowserSpeechRecognitionAlternative> & { isFinal?: boolean };
type WakeWordRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<WakeWordRecognitionResult>; resultIndex?: number }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Meter a media track to a 0..1 level callback; returns a stop function. */
function meter(track: MediaStreamTrack, cb: (level: number) => void): () => void {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(new MediaStream([track]));
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  const tick = (): void => {
    analyser.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    cb(Math.min(1, sum / buf.length / 96));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    if (raf) cancelAnimationFrame(raf);
    void ctx.close();
  };
}

export function useAnimus(options: UseAnimusOptions): UseAnimusResult {
  const {
    tokenEndpoint,
    room = "animus",
    identity = "dr-schubert",
    wakeWord = false,
    wakeWordPhrases = DEFAULT_WAKE_WORD_PHRASES,
    onLevel,
    onPatientCall,
    onPatientUnfocus,
    onDokuStart,
    onDokuUpdate,
    onDokuOpen,
  } = options;

  const roomRef = useRef<Room | null>(null);
  const recognitionRef = useRef<WakeWordRecognition | null>(null);
  const stopMeterRef = useRef<(() => void) | null>(null);
  const onLevelRef = useRef(onLevel);
  const onPatientCallRef = useRef(onPatientCall);
  const onPatientUnfocusRef = useRef(onPatientUnfocus);
  const onDokuStartRef = useRef(onDokuStart);
  const onDokuUpdateRef = useRef(onDokuUpdate);
  const onDokuOpenRef = useRef(onDokuOpen);
  const onDokuConfirmedRef = useRef(options.onDokuConfirmed);
  const onMemorySnapshotRef = useRef(options.onMemorySnapshot);
  const onTtsStatusRef = useRef(options.onTtsStatus);
  const wakeWordPhrasesRef = useRef(wakeWordPhrases);
  const connectedRef = useRef(false);
  const connectingRef = useRef(false);
  const wakeWordEnabledRef = useRef(wakeWord);
  const detectedAtRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(wakeWord);
  const [wakeWordState, setWakeWordState] = useState<WakeWordState>("idle");
  const [wakeWordError, setWakeWordError] = useState<string | null>(null);

  onLevelRef.current = onLevel;
  onPatientCallRef.current = onPatientCall;
  onPatientUnfocusRef.current = onPatientUnfocus;
  onDokuStartRef.current = onDokuStart;
  onDokuUpdateRef.current = onDokuUpdate;
  onDokuOpenRef.current = onDokuOpen;
  onDokuConfirmedRef.current = options.onDokuConfirmed;
  onMemorySnapshotRef.current = options.onMemorySnapshot;
  onTtsStatusRef.current = options.onTtsStatus;
  wakeWordPhrasesRef.current = wakeWordPhrases;
  connectedRef.current = connected;
  connectingRef.current = connecting;
  wakeWordEnabledRef.current = wakeWordEnabled;

  const speechWindow = typeof window === "undefined" ? undefined : (window as any);
  const wakeWordSupported = Boolean(speechWindow?.SpeechRecognition || speechWindow?.webkitSpeechRecognition);

  const refreshSnapshotAfterDisconnect = useCallback((): void => {
    window.setTimeout(() => {
      void fetch(`${tokenEndpoint}/memory`)
        .then((res) => (res.ok ? res.json() : null))
        .then((snapshot) => {
          if (snapshot) onMemorySnapshotRef.current?.(snapshot as AnimusMemorySnapshot);
        })
        .catch(() => undefined);
    }, 500);
  }, [tokenEndpoint]);

  const stopWakeWordRecognition = useCallback((): void => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognitionRef.current = null;
    recognition.stop();
  }, []);

  const disconnect = useCallback((): void => {
    stopMeterRef.current?.();
    stopMeterRef.current = null;
    const room = roomRef.current;
    if (!room) {
      setConnected(false);
      return;
    }

    const payload = new TextEncoder().encode(JSON.stringify({ type: "session_closed" }));
    void room.localParticipant.publishData(payload, { reliable: true, topic: "animus-control" }).catch(() => undefined);

    window.setTimeout(() => {
      room.disconnect();
      roomRef.current = null;
      setConnected(false);
      refreshSnapshotAfterDisconnect();
    }, 140);
  }, [refreshSnapshotAfterDisconnect]);

  const sendControl = useCallback(async (message: Record<string, unknown>): Promise<void> => {
    const room = roomRef.current;
    if (!room) return;
    const data = new TextEncoder().encode(JSON.stringify(message));
    await room.localParticipant.publishData(data, { reliable: true, topic: "animus-control" });
  }, []);

  const requestTtsStatus = useCallback(async (): Promise<void> => {
    const res = await fetch(`${tokenEndpoint}/tts-model`);
    if (!res.ok) throw new Error(`tts status failed (${res.status})`);
    const status = (await res.json()) as { current_model: string; voice_id?: string; restarting?: boolean };
    onTtsStatusRef.current?.(status as AnimusTtsStatus);
  }, [tokenEndpoint]);

  const fetchMemorySnapshot = useCallback(async (): Promise<void> => {
    const res = await fetch(`${tokenEndpoint}/memory`);
    if (!res.ok) throw new Error(`memory snapshot failed (${res.status})`);
    const snapshot = (await res.json()) as AnimusMemorySnapshot;
    onMemorySnapshotRef.current?.(snapshot);
  }, [tokenEndpoint]);

  const setTtsModel = useCallback(async (model: string): Promise<void> => {
    const res = await fetch(`${tokenEndpoint}/tts-model?model=${encodeURIComponent(model)}`, { method: "POST" });
    if (!res.ok) throw new Error(`tts switch failed (${res.status})`);
    const status = (await res.json()) as { current_model: string; voice_id?: string; restarting?: boolean };
    onTtsStatusRef.current?.(status as AnimusTtsStatus);
  }, [tokenEndpoint]);

  const connect = useCallback(async (): Promise<void> => {
    if (roomRef.current) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch(`${tokenEndpoint}/token?room=${encodeURIComponent(room)}&identity=${encodeURIComponent(identity)}`);
      if (!res.ok) throw new Error(`token request failed (${res.status})`);
      const { token, url } = (await res.json()) as { token: string; url: string };

      const lk = new Room({ adaptiveStream: true });

      lk.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.style.display = "none";
        document.body.appendChild(el);
        stopMeterRef.current?.();
        if (onLevelRef.current) {
          stopMeterRef.current = meter(track.mediaStreamTrack, (level) => onLevelRef.current?.(level));
        }
      });

      lk.on(RoomEvent.DataReceived, (payload: Uint8Array, _p, _k, topic?: string) => {
        if (topic !== "animus") return;
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as AnimusMessage;
          console.log("DataReceived", topic, msg);
          if (msg.type === "patient_call") onPatientCallRef.current?.(msg.patient);
          else if (msg.type === "patient_unfocus") onPatientUnfocusRef.current?.();
          else if (msg.type === "doku_start") {
            onDokuStartRef.current?.({
              behandlungsart: msg.behandlungsart,
              termin_typ: msg.termin_typ,
              name: msg.name,
              modus: msg.modus,
              behandlungsarten: msg.behandlungsarten,
              termin_optionen: msg.termin_optionen,
              hint: msg.hint,
            });
          }
          else if (msg.type === "doku_update") onDokuUpdateRef.current?.(msg.entwurf, msg.patient, msg.frage);
          else if (msg.type === "doku_open") onDokuOpenRef.current?.(msg.entwurf, msg.patient);
          else if (msg.type === "doku_confirmed") onDokuConfirmedRef.current?.();
          else if (msg.type === "session_end") {
            const delay = typeof msg.delay_ms === "number" ? Math.max(0, msg.delay_ms) : 0;
            window.setTimeout(() => disconnect(), delay);
          }
          else if (msg.type === "tts_model_status") onTtsStatusRef.current?.(msg);
          else if (msg.type === "memory_snapshot") onMemorySnapshotRef.current?.(msg);
        } catch {
          /* ignore malformed data messages */
        }
      });

      lk.on(RoomEvent.Disconnected, () => {
        stopMeterRef.current?.();
        stopMeterRef.current = null;
        roomRef.current = null;
        setConnected(false);
      });

      await lk.connect(url, token);
      await lk.localParticipant.setMicrophoneEnabled(true);
      roomRef.current = lk;
      setConnected(true);
      void fetchMemorySnapshot();
      void requestTtsStatus();
      if (wakeWordEnabledRef.current) setWakeWordState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setConnecting(false);
    }
  }, [fetchMemorySnapshot, tokenEndpoint, room, identity, requestTtsStatus]);

  const startWakeWordRecognition = useCallback((triggerConnect: () => Promise<void>): void => {
    if (!wakeWordSupported || !wakeWordEnabledRef.current || connectedRef.current || connectingRef.current || recognitionRef.current) return;
    const RecognitionCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setWakeWordState("unsupported");
      setWakeWordError("Wake Word wird von diesem Browser nicht unterstützt.");
      return;
    }
    const recognition = new RecognitionCtor() as WakeWordRecognition;
    recognition.lang = "de-DE";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.onstart = () => {
      setWakeWordState("listening");
      setWakeWordError(null);
    };
    recognition.onresult = (event) => {
      let transcript = "";
      const startIndex = event.resultIndex ?? 0;
      for (let i = startIndex; i < event.results.length; i++) {
        const result = event.results[i];
        for (let j = 0; j < result.length; j++) {
          transcript += ` ${result[j]?.transcript ?? ""}`;
        }
      }
      if (!wakeWordMatchesTranscript(transcript, wakeWordPhrasesRef.current)) return;
      const now = Date.now();
      if (now - detectedAtRef.current < 4000) return;
      detectedAtRef.current = now;
      setWakeWordState("detected");
      stopWakeWordRecognition();
      void triggerConnect().catch((e) => {
        setWakeWordState("error");
        setWakeWordError(e instanceof Error ? e.message : String(e));
      });
    };
    recognition.onerror = (event) => {
      const code = event.error ?? "unknown";
      if (code === "aborted") return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        setWakeWordState("unsupported");
        setWakeWordError("Mikrofonzugriff für Wake Word wurde blockiert.");
        return;
      }
      setWakeWordState("error");
      setWakeWordError(`Wake Word Fehler: ${code}`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (!wakeWordEnabledRef.current || connectedRef.current || connectingRef.current) {
        if (!connectedRef.current && !connectingRef.current) setWakeWordState("idle");
        return;
      }
      window.setTimeout(() => {
        if (!wakeWordEnabledRef.current || connectedRef.current || connectingRef.current || recognitionRef.current) return;
        try {
          startWakeWordRecognition(triggerConnect);
        } catch (e) {
          setWakeWordState("error");
          setWakeWordError(e instanceof Error ? e.message : String(e));
        }
      }, 300);
    };
    recognitionRef.current = recognition;
    setWakeWordState("starting");
    try {
      recognition.start();
    } catch (e) {
      recognitionRef.current = null;
      setWakeWordState("error");
      setWakeWordError(e instanceof Error ? e.message : String(e));
    }
  }, [stopWakeWordRecognition, wakeWordSupported]);

  const enableWakeWord = useCallback(async (): Promise<void> => {
    setWakeWordEnabled(true);
    if (!wakeWordSupported) {
      setWakeWordState("unsupported");
      setWakeWordError("Wake Word wird von diesem Browser nicht unterstützt.");
      return;
    }
    setWakeWordError(null);
    startWakeWordRecognition(connect);
  }, [connect, startWakeWordRecognition, wakeWordSupported]);

  const disableWakeWord = useCallback((): void => {
    setWakeWordEnabled(false);
    stopWakeWordRecognition();
    setWakeWordState("idle");
    setWakeWordError(null);
  }, [stopWakeWordRecognition]);

  useEffect(() => {
    if (wakeWord) void enableWakeWord();
    else disableWakeWord();
  }, [wakeWord, enableWakeWord, disableWakeWord]);

  useEffect(() => {
    if (connected || connecting) {
      stopWakeWordRecognition();
      if (wakeWordEnabled) setWakeWordState("idle");
      return;
    }
    if (wakeWordEnabled) startWakeWordRecognition(connect);
  }, [connect, connected, connecting, startWakeWordRecognition, stopWakeWordRecognition, wakeWordEnabled]);

  useEffect(() => () => {
    stopWakeWordRecognition();
    disconnect();
  }, [disconnect, stopWakeWordRecognition]);

  return {
    connect,
    disconnect,
    sendControl,
    fetchMemorySnapshot,
    requestTtsStatus,
    setTtsModel,
    enableWakeWord,
    disableWakeWord,
    connected,
    connecting,
    error,
    wakeWordSupported,
    wakeWordEnabled,
    wakeWordListening: wakeWordState === "starting" || wakeWordState === "listening",
    wakeWordState,
    wakeWordError,
  };
}
