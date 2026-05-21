"use client";

/**
 * Thin wrapper around the Web Speech API.
 * Detects support, exposes a recognizer factory + a speak() helper.
 * Silently no-ops on browsers without support.
 */
export function isVoiceInputSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
}

export function isVoiceOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

type StartOpts = {
  locale: "de" | "en";
  onResult: (text: string, isFinal: boolean) => void;
  onError?: (err: string) => void;
  onEnd?: () => void;
};

export interface VoiceRecognizer {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function createRecognizer(opts: StartOpts): VoiceRecognizer | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;

  const recog = new Ctor();
  recog.lang = opts.locale === "en" ? "en-US" : "de-DE";
  recog.interimResults = true;
  recog.continuous = false;
  recog.maxAlternatives = 1;

  recog.onresult = (event: any) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (finalText) opts.onResult(finalText, true);
    else if (interim) opts.onResult(interim, false);
  };
  recog.onerror = (e: any) => opts.onError?.(e?.error || "speech_error");
  recog.onend = () => opts.onEnd?.();

  return {
    start: () => {
      try { recog.start(); } catch { /* already started */ }
    },
    stop: () => {
      try { recog.stop(); } catch { /* */ }
    },
    abort: () => {
      try { recog.abort(); } catch { /* */ }
    },
  };
}

let lastUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string, locale: "de" | "en") {
  if (!isVoiceOutputSupported()) return;
  // strip markdown bold/code for cleaner TTS
  const clean = text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1");
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = locale === "en" ? "en-US" : "de-DE";
  u.rate = 1.04;
  u.pitch = 1.0;
  lastUtterance = u;
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

export function stopSpeaking() {
  if (!isVoiceOutputSupported()) return;
  try { window.speechSynthesis.cancel(); } catch { /* */ }
  lastUtterance = null;
}
