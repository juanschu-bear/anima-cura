"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Mic, MicOff, Loader2, Volume2, VolumeX } from "lucide-react";
import { t } from "@/lib/i18n";
import { createRecognizer, isVoiceInputSupported, isVoiceOutputSupported, stopSpeaking, type VoiceRecognizer } from "./ICuraVoice";

interface Props {
  locale: "de" | "en";
  value: string;
  sending: boolean;
  speakEnabled: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onToggleSpeak: () => void;
}

export function ICuraInput({ locale, value, sending, speakEnabled, onChange, onSubmit, onToggleSpeak }: Props) {
  const [recording, setRecording] = useState(false);
  const recognizerRef = useRef<VoiceRecognizer | null>(null);
  const voiceIn = isVoiceInputSupported();
  const voiceOut = isVoiceOutputSupported();
  const baseValueRef = useRef<string>("");

  useEffect(() => () => {
    recognizerRef.current?.abort();
    recognizerRef.current = null;
  }, []);

  function toggleRecord() {
    if (!voiceIn) return;
    if (recording) {
      recognizerRef.current?.stop();
      return;
    }
    baseValueRef.current = value ? value + " " : "";
    const recog = createRecognizer({
      locale,
      onResult: (text, isFinal) => {
        onChange((baseValueRef.current + text).trim());
        if (isFinal) baseValueRef.current = (baseValueRef.current + text).trim() + " ";
      },
      onError: () => setRecording(false),
      onEnd: () => setRecording(false),
    });
    if (!recog) return;
    recognizerRef.current = recog;
    recog.start();
    setRecording(true);
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    onSubmit(trimmed);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      className="icura-input-row"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <textarea
        className="icura-input"
        value={value}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={t("icura.placeholder", locale)}
        disabled={sending}
      />
      {voiceOut && (
        <button
          type="button"
          className={`icura-iconbtn ${speakEnabled ? "icura-iconbtn-on" : ""}`}
          onClick={() => {
            if (speakEnabled) stopSpeaking();
            onToggleSpeak();
          }}
          aria-pressed={speakEnabled}
          title={speakEnabled ? t("icura.muteVoice", locale) : t("icura.enableVoice", locale)}
        >
          {speakEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
      )}
      {voiceIn && (
        <button
          type="button"
          className={`icura-iconbtn icura-mic ${recording ? "icura-mic-on" : ""}`}
          onClick={toggleRecord}
          aria-pressed={recording}
          title={recording ? t("icura.stopRecording", locale) : t("icura.startRecording", locale)}
        >
          {recording ? <MicOff size={14} /> : <Mic size={14} />}
          {recording && <span className="icura-mic-pulse" aria-hidden />}
        </button>
      )}
      <button
        type="submit"
        className="icura-send"
        disabled={sending || !value.trim()}
        aria-label={t("common.send", locale)}
      >
        {sending ? <Loader2 size={14} className="icura-spin" /> : <Send size={14} />}
      </button>
    </form>
  );
}
