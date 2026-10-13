"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Mail, MessageCircle, Mic, Send, Volume2, X } from "lucide-react";
import { t } from "@/lib/i18n";

type Message = { role: "user" | "assistant"; content: string };
type BrowserRecognition = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  start: () => void; stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
};
type RecognitionConstructor = new () => BrowserRecognition;

export default function PatientAccessAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: t("accessHelp.welcome") }]);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    setVoiceAvailable(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  async function send(value = input) {
    const message = value.trim();
    if (!message || loading) return;
    setMessages(current => [...current, { role: "user", content: message }]);
    setInput("");
    setLoading(true);
    try {
      const response = await fetch("/api/patient/access-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, locale: "de" }),
      });
      const payload = await response.json().catch(() => null) as { text?: string } | null;
      setMessages(current => [...current, { role: "assistant", content: response.ok && payload?.text ? payload.text : t("accessHelp.unavailable") }]);
    } catch {
      setMessages(current => [...current, { role: "assistant", content: t("accessHelp.unavailable") }]);
    } finally {
      setLoading(false);
    }
  }

  function startListening() {
    const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition || listening) return;
    const recognition = new Recognition();
    recognition.lang = "de-DE";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() || "";
      if (transcript) void send(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
  }

  const quickQuestions = [t("accessHelp.quickPassword"), t("accessHelp.quickInvoice"), t("accessHelp.quickPayment")];

  return (
    <div className="access-help-root">
      {open ? (
        <section className="access-help-panel" aria-label={t("accessHelp.title")}>
          <header className="access-help-head">
            <div className="access-help-mark"><Headphones size={21} aria-hidden="true" /></div>
            <div><strong>{t("accessHelp.title")}</strong><span>{t("accessHelp.status")}</span></div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("accessHelp.close")}><X size={20} /></button>
          </header>
          <div ref={scrollRef} className="access-help-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`access-help-message ${message.role}`}>
                <p>{message.content}</p>
                {message.role === "assistant" ? <button type="button" onClick={() => speak(message.content)} aria-label={t("accessHelp.readAloud")}><Volume2 size={14} /></button> : null}
              </div>
            ))}
            {messages.length === 1 ? <div className="access-help-quick">{quickQuestions.map(question => <button type="button" key={question} onClick={() => void send(question)}>{question}</button>)}</div> : null}
            {loading ? <div className="access-help-thinking"><i /><i /><i /><span>{t("accessHelp.thinking")}</span></div> : null}
          </div>
          <form className="access-help-compose" onSubmit={event => { event.preventDefault(); void send(); }}>
            <input value={input} onChange={event => setInput(event.target.value)} maxLength={800} placeholder={t("accessHelp.placeholder")} aria-label={t("accessHelp.placeholder")} />
            {voiceAvailable ? <button type="button" className={listening ? "listening" : ""} onClick={startListening} aria-label={t("accessHelp.speak")}><Mic size={18} /></button> : null}
            <button type="submit" disabled={!input.trim() || loading} aria-label={t("accessHelp.send")}><Send size={18} /></button>
          </form>
          <a className="access-help-mail" href="mailto:praxisteam@animacura.io"><Mail size={14} />{t("accessHelp.emailTeam")}</a>
          <p className="access-help-safety">{t("accessHelp.safety")}</p>
        </section>
      ) : (
        <button type="button" className="access-help-launch" onClick={() => setOpen(true)} aria-label={t("accessHelp.open")}>
          <span className="access-help-pulse" aria-hidden="true" /><MessageCircle size={22} /><span>{t("accessHelp.open")}</span>
        </button>
      )}
      <style jsx>{`
        .access-help-root{position:fixed;right:22px;bottom:22px;z-index:1200;font-family:'DM Sans',Arial,sans-serif;color:#f7fbf9}.access-help-launch{position:relative;display:flex;align-items:center;gap:10px;border:1px solid rgba(143,219,184,.35);border-radius:999px;padding:13px 17px;background:#123d32;color:#fff;box-shadow:0 14px 40px rgba(0,18,13,.32);font:700 14px/1.2 inherit;cursor:pointer}.access-help-launch:focus-visible,.access-help-panel button:focus-visible,.access-help-panel a:focus-visible,.access-help-panel input:focus-visible{outline:3px solid rgba(73,222,147,.75);outline-offset:3px}.access-help-pulse{width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 0 rgba(74,222,128,.55);animation:helpPulse 2s infinite}.access-help-panel{width:min(390px,calc(100vw - 28px));height:min(620px,calc(100vh - 38px));display:grid;grid-template-rows:auto 1fr auto auto auto;overflow:hidden;border:1px solid rgba(151,205,183,.28);border-radius:26px;background:rgba(7,28,23,.97);box-shadow:0 28px 90px rgba(0,15,11,.48);backdrop-filter:blur(18px)}
        .access-help-head{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:17px 18px;border-bottom:1px solid rgba(192,226,212,.13);background:linear-gradient(135deg,rgba(39,115,91,.36),rgba(10,45,36,.2))}.access-help-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:15px;background:#dff8ec;color:#123d32;box-shadow:inset 0 1px #fff,0 7px 20px rgba(0,0,0,.2)}.access-help-head strong{display:block;font:750 17px/1.2 inherit}.access-help-head span{display:block;margin-top:3px;color:#9bc6b6;font-size:12px}.access-help-head>button{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:#cfe1da;cursor:pointer}
        .access-help-messages{overflow-y:auto;padding:18px;scrollbar-width:thin}.access-help-message{max-width:88%;margin:0 0 12px;display:flex;align-items:flex-end;gap:6px}.access-help-message p{margin:0;padding:12px 14px;border-radius:17px;font:500 14px/1.55 inherit;white-space:pre-wrap}.access-help-message.assistant p{background:#173e34;border:1px solid rgba(140,205,178,.16);border-bottom-left-radius:5px}.access-help-message.user{margin-left:auto;justify-content:flex-end}.access-help-message.user p{background:#eef7f3;color:#123129;border-bottom-right-radius:5px}.access-help-message>button{flex:0 0 auto;display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:50%;background:transparent;color:#83b7a4;cursor:pointer}.access-help-quick{display:flex;flex-wrap:wrap;gap:7px;margin-top:7px}.access-help-quick button{border:1px solid rgba(137,201,175,.25);border-radius:999px;padding:8px 10px;background:rgba(15,58,47,.55);color:#d9ece5;font:650 12px/1.3 inherit;cursor:pointer;text-align:left}.access-help-thinking{display:flex;align-items:center;gap:5px;color:#9bc6b6;font-size:12px}.access-help-thinking i{width:6px;height:6px;border-radius:50%;background:#6ee7b7;animation:helpDot 1s infinite alternate}.access-help-thinking i:nth-child(2){animation-delay:.16s}.access-help-thinking i:nth-child(3){animation-delay:.32s}.access-help-thinking span{margin-left:4px}
        .access-help-compose{display:grid;grid-template-columns:1fr auto auto;gap:7px;margin:0 14px;padding:8px;border:1px solid rgba(149,202,181,.24);border-radius:18px;background:#0b231d}.access-help-compose input{min-width:0;border:0;background:transparent;color:#fff;padding:8px 7px;font:500 14px/1.4 inherit;outline:0}.access-help-compose input::placeholder{color:#7da294}.access-help-compose button{display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:13px;background:#1a493b;color:#cde7dd;cursor:pointer}.access-help-compose button[type='submit']{background:#e6f8f0;color:#12382e}.access-help-compose button:disabled{opacity:.35;cursor:not-allowed}.access-help-compose button.listening{background:#b73737;color:#fff;animation:helpPulse 1.15s infinite}.access-help-mail{display:flex;align-items:center;justify-content:center;gap:7px;margin:10px 14px 0;color:#9dd8c1;font:650 12px/1.3 inherit;text-decoration:none}.access-help-safety{margin:9px 16px 13px;color:#718f84;text-align:center;font:500 10px/1.4 inherit}
        @keyframes helpPulse{70%{box-shadow:0 0 0 9px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}@keyframes helpDot{to{opacity:.25;transform:translateY(-2px)}}@media(max-width:620px){.access-help-root{right:14px;bottom:14px}.access-help-panel{width:calc(100vw - 28px);height:min(72vh,620px);border-radius:24px}.access-help-launch>span:last-child{display:none}.access-help-launch{width:54px;height:54px;justify-content:center;padding:0}.access-help-pulse{position:absolute;right:7px;top:7px}}@media(prefers-reduced-motion:reduce){.access-help-pulse,.access-help-thinking i,.access-help-compose button.listening{animation:none}}
      `}</style>
    </div>
  );
}
