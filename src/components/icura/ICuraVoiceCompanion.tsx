"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Mic, Radio, Volume2 } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";

type VoiceState = "idle" | "listening" | "processing" | "speaking";

type CompanionAction = {
  type: "navigate" | "highlight";
  target: string;
  explanation: string;
};

type BubbleState = {
  visible: boolean;
  speaker: "user" | "assistant" | null;
  text: string;
};

type HighlightState = {
  selector: string;
  rect: DOMRect | null;
} | null;

type BrowserSpeechRecognitionAlternative = {
  transcript: string;
};

type BrowserSpeechRecognitionResult = ArrayLike<BrowserSpeechRecognitionAlternative>;

type BrowserSpeechRecognitionEvent = {
  results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

export default function ICuraVoiceCompanion() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, theme } = useAppStore();

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [bubble, setBubble] = useState<BubbleState>({
    visible: false,
    speaker: null,
    text: "",
  });
  const [highlight, setHighlight] = useState<HighlightState>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingChunksRef = useRef<Blob[]>([]);
  const shouldSendRecordingRef = useRef(false);
  const interactionModeRef = useRef<"hold" | "toggle" | null>(null);
  const suppressClickRef = useRef(false);
  const lastTranscriptRef = useRef("");
  const hideBubbleTimeoutRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);

  const isDark = theme === "dark";
  const label = useMemo(() => {
    if (locale === "de") {
      if (voiceState === "listening") return "iCura hört zu";
      if (voiceState === "processing") return "iCura denkt";
      if (voiceState === "speaking") return "iCura spricht";
      return "Mit iCura sprechen";
    }
    if (voiceState === "listening") return "iCura is listening";
    if (voiceState === "processing") return "iCura is thinking";
    if (voiceState === "speaking") return "iCura is speaking";
    return "Talk to iCura";
  }, [locale, voiceState]);

  const clearBubbleTimer = useCallback(() => {
    if (hideBubbleTimeoutRef.current) {
      window.clearTimeout(hideBubbleTimeoutRef.current);
      hideBubbleTimeoutRef.current = null;
    }
  }, []);

  const showBubble = useCallback(
    (speaker: BubbleState["speaker"], text: string, autoHideMs?: number) => {
      clearBubbleTimer();
      setBubble({
        visible: Boolean(text),
        speaker,
        text,
      });
      if (autoHideMs) {
        hideBubbleTimeoutRef.current = window.setTimeout(() => {
          setBubble((current) => ({ ...current, visible: false }));
        }, autoHideMs);
      }
    },
    [clearBubbleTimer]
  );

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    speechRecognitionRef.current?.stop();
    speechRecognitionRef.current = null;
  }, []);

  const stopAudioPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = "";
    }
    audioRef.current = null;
  }, []);

  const clearHighlight = useCallback(() => {
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    setHighlight(null);
  }, []);

  const stopCurrentInteraction = useCallback(
    (keepBubble = true) => {
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      shouldSendRecordingRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      stopMediaTracks();
      stopSpeechRecognition();
      stopAudioPlayback();
      if (!keepBubble) {
        setBubble({
          visible: false,
          speaker: null,
          text: "",
        });
      }
      setVoiceState("idle");
    },
    [stopAudioPlayback, stopMediaTracks, stopSpeechRecognition]
  );

  const applyHighlight = useCallback(
    (selector: string) => {
      clearHighlight();

      const attempt = (remaining = 12) => {
        const element = document.querySelector(selector) as HTMLElement | null;
        if (!element) {
          if (remaining > 0) {
            window.setTimeout(() => attempt(remaining - 1), 180);
          }
          return;
        }

        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });

        const rect = element.getBoundingClientRect();
        setHighlight({
          selector,
          rect,
        });

        highlightTimeoutRef.current = window.setTimeout(() => {
          setHighlight(null);
        }, 2600);
      };

      attempt();
    },
    [clearHighlight]
  );

  const updateHighlightRect = useCallback(() => {
    if (!highlight?.selector) {
      return;
    }
    const element = document.querySelector(highlight.selector) as HTMLElement | null;
    if (!element) {
      return;
    }
    setHighlight({
      selector: highlight.selector,
      rect: element.getBoundingClientRect(),
    });
  }, [highlight]);

  useEffect(() => {
    if (!highlight) {
      return;
    }

    const handle = () => updateHighlightRect();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [highlight, updateHighlightRect]);

  useEffect(() => {
    return () => {
      stopCurrentInteraction(false);
      clearHighlight();
      clearBubbleTimer();
    };
  }, [clearBubbleTimer, clearHighlight, stopCurrentInteraction]);

  const executeActions = useCallback(
    async (actions: CompanionAction[]) => {
      for (const action of actions) {
        if (action.type === "navigate") {
          router.push(action.target);
          await new Promise((resolve) => window.setTimeout(resolve, 450));
        }

        if (action.type === "highlight") {
          applyHighlight(action.target);
          await new Promise((resolve) => window.setTimeout(resolve, 350));
        }
      }
    },
    [applyHighlight, router]
  );

  const sendAudioToBackend = useCallback(
    async (audioBlob: Blob, fallbackText?: string) => {
      if (!audioBlob.size && !fallbackText?.trim()) {
        setVoiceState("idle");
        return;
      }

      setVoiceState("processing");
      setErrorText(null);

      const controller = new AbortController();
      requestAbortRef.current = controller;

      const formData = new FormData();
      if (audioBlob.size) {
        formData.append("audio", audioBlob, "icura-input.webm");
      }
      formData.append(
        "context",
        JSON.stringify({
          currentPage: pathname,
          locale,
          theme,
        })
      );
      if (fallbackText?.trim()) {
        formData.append("text", fallbackText.trim());
      }

      try {
        const response = await fetch("/api/icura/voice", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        requestAbortRef.current = null;

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          throw new Error(
            errorPayload?.error ||
              (locale === "de" ? "Die Sprachroute hat nicht geantwortet." : "The voice endpoint did not respond.")
          );
        }

        const assistantText = decodeURIComponent(response.headers.get("X-ICura-Text") || "");
        const transcriptText =
          decodeURIComponent(response.headers.get("X-ICura-Transcript") || "") || fallbackText || lastTranscriptRef.current;
        const actions = JSON.parse(
          decodeURIComponent(response.headers.get("X-ICura-Actions") || "[]")
        ) as CompanionAction[];

        if (transcriptText) {
          showBubble("user", transcriptText);
        }

        const audioBlobResponse = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlobResponse);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.addEventListener("ended", () => {
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          setVoiceState("idle");
          if (assistantText) {
            showBubble("assistant", assistantText, 5000);
          } else {
            showBubble("assistant", locale === "de" ? "Fertig." : "Done.", 2500);
          }
        });

        audio.addEventListener("error", () => {
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          setVoiceState("idle");
        });

        setVoiceState("speaking");
        showBubble("assistant", assistantText || (locale === "de" ? "Einen Moment." : "One moment."));
        window.setTimeout(() => {
          void executeActions(actions);
        }, 320);
        await audio.play();
      } catch (error) {
        requestAbortRef.current = null;
        setVoiceState("idle");
        const message =
          error instanceof Error
            ? error.message
            : locale === "de"
              ? "Die Sprachfunktion ist gerade nicht verfügbar."
              : "Voice is not available right now.";
        setErrorText(message);
        showBubble("assistant", message, 4200);
      }
    },
    [executeActions, locale, pathname, showBubble, theme]
  );

  const startBrowserRecognition = useCallback(() => {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      return;
    }

    const recognition = new RecognitionCtor();
    recognition.lang = locale === "de" ? "de-DE" : "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();

      if (transcript) {
        lastTranscriptRef.current = transcript;
        showBubble("user", transcript);
      }
    };

    recognition.onerror = () => {
      speechRecognitionRef.current = null;
    };

    recognition.onend = () => {
      speechRecognitionRef.current = null;
    };

    speechRecognitionRef.current = recognition;
    recognition.start();
  }, [locale, showBubble]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      return;
    }

    shouldSendRecordingRef.current = true;
    mediaRecorderRef.current.stop();
    stopSpeechRecognition();
    setVoiceState("processing");
  }, [stopSpeechRecognition]);

  const startRecording = useCallback(
    async (interactionMode: "hold" | "toggle") => {
      if (voiceState === "listening") {
        return;
      }

      stopCurrentInteraction();
      interactionModeRef.current = interactionMode;
      lastTranscriptRef.current = "";
      pendingChunksRef.current = [];
      setErrorText(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const preferredMimeTypes = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
        ];
        const mimeType = preferredMimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            pendingChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = () => {
          const blobType = recorder.mimeType || "audio/webm";
          const blob = new Blob(pendingChunksRef.current, { type: blobType });
          const shouldSend = shouldSendRecordingRef.current;
          const transcript = lastTranscriptRef.current.trim();

          pendingChunksRef.current = [];
          mediaRecorderRef.current = null;
          stopMediaTracks();

          if (!shouldSend) {
            setVoiceState("idle");
            return;
          }

          void sendAudioToBackend(blob, transcript);
        };

        mediaRecorderRef.current = recorder;
        shouldSendRecordingRef.current = false;
        recorder.start();
        startBrowserRecognition();
        setVoiceState("listening");
        showBubble("user", locale === "de" ? "Ich höre zu ..." : "Listening ...");
      } catch (error) {
        setVoiceState("idle");
        setErrorText(
          error instanceof Error
            ? error.message
            : locale === "de"
              ? "Mikrofonzugriff wurde nicht erlaubt."
              : "Microphone access was not allowed."
        );
        showBubble(
          "assistant",
          locale === "de"
            ? "Bitte erlauben Sie den Mikrofonzugriff, damit ich zuhören kann."
            : "Please allow microphone access so I can listen.",
          4200
        );
      }
    },
    [locale, sendAudioToBackend, showBubble, startBrowserRecognition, stopCurrentInteraction, stopMediaTracks, voiceState]
  );

  const handlePointerDown = useCallback(
    async (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      suppressClickRef.current = true;

      if (voiceState === "listening") {
        return;
      }

      await startRecording("hold");
    },
    [startRecording, voiceState]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (voiceState === "listening" && interactionModeRef.current === "hold") {
        stopRecording();
      }
    },
    [stopRecording, voiceState]
  );

  const handlePointerCancel = useCallback(() => {
    if (voiceState === "listening" && interactionModeRef.current === "hold") {
      stopRecording();
    }
  }, [stopRecording, voiceState]);

  const handleClick = useCallback(async () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (voiceState === "listening") {
      interactionModeRef.current = "toggle";
      stopRecording();
      return;
    }

    await startRecording("toggle");
  }, [startRecording, stopRecording, voiceState]);

  const handleInterrupt = useCallback(async () => {
    stopCurrentInteraction();
    await startRecording("toggle");
  }, [startRecording, stopCurrentInteraction]);

  return (
    <>
      <div className="icura-voice-root" aria-live="polite">
        {bubble.visible && bubble.text ? (
          <div
            className={`icura-bubble ${bubble.speaker === "user" ? "icura-bubble-user" : "icura-bubble-assistant"} ${isDark ? "icura-bubble-dark" : ""}`}
          >
            <div className="icura-bubble-label">
              {bubble.speaker === "user" ? (locale === "de" ? "Sie" : "You") : "iCura"}
            </div>
            <p>{bubble.text}</p>
          </div>
        ) : null}

        {highlight?.rect ? (
          <div className="icura-highlight-layer" aria-hidden="true">
            <div
              className="icura-highlight-ring"
              style={{
                top: Math.max(8, highlight.rect.top - 10),
                left: Math.max(8, highlight.rect.left - 10),
                width: highlight.rect.width + 20,
                height: highlight.rect.height + 20,
              }}
            />
          </div>
        ) : null}

        <button
          type="button"
          className={`icura-button icura-button-${voiceState}`}
          aria-label={label}
          title={label}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerCancel}
          onClick={handleClick}
        >
          <span className="icura-button-core">
            {voiceState === "idle" ? <Mic size={22} /> : null}
            {voiceState === "listening" ? <Radio size={22} /> : null}
            {voiceState === "processing" ? <Loader2 size={22} className="icura-spin" /> : null}
            {voiceState === "speaking" ? <Volume2 size={22} /> : null}
          </span>
          <span className="icura-button-ring icura-button-ring-outer" />
          <span className="icura-button-ring icura-button-ring-inner" />
        </button>

        {voiceState === "speaking" || voiceState === "processing" ? (
          <button type="button" className="icura-interrupt-pill" onClick={handleInterrupt}>
            {locale === "de" ? "Unterbrechen" : "Interrupt"}
          </button>
        ) : null}

        {errorText ? <span className="sr-only">{errorText}</span> : null}
      </div>

      <style jsx global>{`
        .icura-voice-root {
          position: fixed;
          right: 88px;
          bottom: 24px;
          z-index: 99999;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 14px;
        }

        .icura-bubble {
          width: min(320px, calc(100vw - 32px));
          max-height: 5.85rem;
          overflow: hidden;
          border-radius: 22px;
          padding: 14px 16px;
          border: 1px solid rgba(120, 141, 176, 0.22);
          background: rgba(255, 255, 255, 0.76);
          color: #1f304c;
          backdrop-filter: blur(20px);
          box-shadow: 0 18px 52px rgba(26, 44, 68, 0.16);
          pointer-events: none;
          animation: icuraBubbleIn 180ms ease-out;
        }

        .icura-bubble-dark {
          background: rgba(12, 16, 24, 0.78);
          color: #edf1f9;
          border-color: rgba(164, 178, 203, 0.2);
          box-shadow: 0 24px 54px rgba(0, 0, 0, 0.35);
        }

        .icura-bubble-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          opacity: 0.58;
          margin-bottom: 6px;
        }

        .icura-bubble p {
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          font-size: 14px;
          line-height: 1.35;
        }

        .icura-highlight-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 99998;
        }

        .icura-highlight-ring {
          position: fixed;
          border-radius: 22px;
          border: 2px solid rgba(107, 94, 255, 0.88);
          box-shadow:
            0 0 0 10px rgba(141, 134, 255, 0.16),
            0 0 0 18px rgba(124, 201, 255, 0.08),
            0 20px 40px rgba(39, 71, 128, 0.18);
          animation: icuraHighlightPulse 1.6s ease-out 1;
        }

        .icura-button {
          position: relative;
          width: 56px;
          height: 56px;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          pointer-events: auto;
          color: white;
          background:
            radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.26), transparent 36%),
            linear-gradient(145deg, #5f66ff 0%, #4465cf 54%, #4f9ae8 100%);
          box-shadow:
            0 12px 34px rgba(79, 100, 223, 0.34),
            inset 0 1px 0 rgba(255, 255, 255, 0.22);
          transition: transform 140ms ease, box-shadow 180ms ease, filter 180ms ease;
          touch-action: none;
        }

        .icura-button:hover {
          transform: translateY(-1px) scale(1.015);
        }

        .icura-button:active {
          transform: scale(0.985);
        }

        .icura-button-core {
          position: relative;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .icura-button-ring {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          pointer-events: none;
        }

        .icura-button-idle .icura-button-ring-outer {
          animation: icuraBreath 2.8s ease-in-out infinite;
          box-shadow: 0 0 0 0 rgba(95, 102, 255, 0.38);
        }

        .icura-button-listening {
          background:
            radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.18), transparent 34%),
            linear-gradient(145deg, #ee6673 0%, #cc4555 60%, #8d1225 100%);
          box-shadow:
            0 16px 38px rgba(177, 34, 55, 0.34),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        .icura-button-listening .icura-button-ring-outer {
          animation: icuraListenPulse 1.15s ease-out infinite;
          border: 1px solid rgba(255, 155, 168, 0.5);
        }

        .icura-button-listening .icura-button-ring-inner {
          inset: 6px;
          border: 1px solid rgba(255, 226, 230, 0.42);
          animation: icuraInnerPulse 1.15s ease-in-out infinite;
        }

        .icura-button-processing {
          background:
            radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.2), transparent 36%),
            linear-gradient(145deg, #5f9339 0%, #3d7f65 52%, #2f847e 100%);
          box-shadow:
            0 16px 38px rgba(52, 133, 110, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        .icura-button-speaking {
          background:
            radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.2), transparent 36%),
            linear-gradient(145deg, #7e8df9 0%, #5b4de1 58%, #4c87f2 100%);
          box-shadow:
            0 16px 40px rgba(87, 97, 226, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        .icura-button-speaking .icura-button-ring-outer,
        .icura-button-processing .icura-button-ring-outer {
          animation: icuraSpeakerWave 1.35s ease-out infinite;
          border: 1px solid rgba(216, 222, 255, 0.38);
        }

        .icura-interrupt-pill {
          position: absolute;
          right: calc(100% + 10px);
          top: 50%;
          transform: translateY(-50%);
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: white;
          background: rgba(13, 18, 29, 0.8);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
          pointer-events: auto;
          cursor: pointer;
        }

        .icura-spin {
          animation: icuraSpin 1s linear infinite;
        }

        @keyframes icuraBreath {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(95, 102, 255, 0.34);
            opacity: 0.9;
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 0 18px rgba(95, 102, 255, 0);
            opacity: 0.55;
          }
        }

        @keyframes icuraListenPulse {
          0% {
            transform: scale(1);
            opacity: 0.85;
          }
          100% {
            transform: scale(1.34);
            opacity: 0;
          }
        }

        @keyframes icuraInnerPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.62;
          }
          50% {
            transform: scale(1.06);
            opacity: 1;
          }
        }

        @keyframes icuraSpeakerWave {
          0% {
            transform: scale(1);
            opacity: 0.85;
          }
          100% {
            transform: scale(1.28);
            opacity: 0;
          }
        }

        @keyframes icuraSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes icuraBubbleIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes icuraHighlightPulse {
          0% {
            opacity: 0;
            transform: scale(0.96);
          }
          18% {
            opacity: 1;
            transform: scale(1);
          }
          38% {
            box-shadow:
              0 0 0 12px rgba(141, 134, 255, 0.16),
              0 0 0 20px rgba(124, 201, 255, 0.08),
              0 20px 40px rgba(39, 71, 128, 0.18);
          }
          62% {
            box-shadow:
              0 0 0 18px rgba(141, 134, 255, 0.04),
              0 0 0 28px rgba(124, 201, 255, 0),
              0 22px 42px rgba(39, 71, 128, 0.12);
          }
          100% {
            opacity: 0;
            transform: scale(1.02);
          }
        }

        @media (max-width: 640px) {
          .icura-voice-root {
            right: 16px;
            bottom: 16px;
          }

          .icura-button {
            width: 48px;
            height: 48px;
          }

          .icura-bubble {
            width: min(260px, calc(100vw - 24px));
            padding: 12px 14px;
          }

          .icura-interrupt-pill {
            font-size: 10px;
            padding: 6px 9px;
          }
        }
      `}</style>
    </>
  );
}
