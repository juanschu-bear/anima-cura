"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { RemoteTrack } from "livekit-client";
import type { AnimusPatient, AnimusMessage, DokuEntwurf } from "./types";

export interface UseAnimusOptions {
  /** Token server base URL; GET {tokenEndpoint}/token?room=&identity= is called. */
  tokenEndpoint: string;
  room?: string;
  identity?: string;
  /** 0..1 voice level of the agent, emitted per animation frame. */
  onLevel?: (level: number) => void;
  onPatientCall?: (patient: AnimusPatient) => void;
  onDokuStart?: (info: { behandlungsart: string; termin_typ: string; name: string }) => void;
  onDokuOpen?: (entwurf: DokuEntwurf, patient: string) => void;
}

export interface UseAnimusResult {
  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

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
  const { tokenEndpoint, room = "animus", identity = "dr-schubert", onLevel, onPatientCall, onDokuStart, onDokuOpen } = options;

  const roomRef = useRef<Room | null>(null);
  const stopMeterRef = useRef<(() => void) | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disconnect = useCallback((): void => {
    stopMeterRef.current?.();
    stopMeterRef.current = null;
    roomRef.current?.disconnect();
    roomRef.current = null;
    setConnected(false);
  }, []);

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
        if (onLevel) stopMeterRef.current = meter(track.mediaStreamTrack, onLevel);
      });

      lk.on(RoomEvent.DataReceived, (payload: Uint8Array, _p, _k, topic?: string) => {
        if (topic !== "animus") return;
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as AnimusMessage;
          if (msg.type === "patient_call") onPatientCall?.(msg.patient);
          else if (msg.type === "doku_start") onDokuStart?.({ behandlungsart: msg.behandlungsart, termin_typ: msg.termin_typ, name: msg.name });
          else if (msg.type === "doku_open") onDokuOpen?.(msg.entwurf, msg.patient);
        } catch {
          /* ignore malformed data messages */
        }
      });

      lk.on(RoomEvent.Disconnected, () => setConnected(false));

      await lk.connect(url, token);
      await lk.localParticipant.setMicrophoneEnabled(true);
      roomRef.current = lk;
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setConnecting(false);
    }
  }, [tokenEndpoint, room, identity, onLevel, onPatientCall, onDokuStart, onDokuOpen]);

  useEffect(() => () => disconnect(), [disconnect]);

  return { connect, disconnect, connected, connecting, error };
}
