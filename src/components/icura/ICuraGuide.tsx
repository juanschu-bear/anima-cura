"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, Mic, MicOff, Send, Volume2, VolumeX, ChevronDown } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: { type: string; target: string; explanation: string }[];
}

const QUICK_ACTIONS: Record<string, { de: string; en: string }[]> = {
  "/uebersicht": [
    { de: "Zeig mir kritische Patienten", en: "Show critical patients" },
    { de: "Neue Automatisierung erstellen", en: "Create new automation" },
    { de: "Wie ist die Zahlungsquote?", en: "What's the payment rate?" },
  ],
  "/patienten": [
    { de: "Suche einen Patienten", en: "Search for a patient" },
    { de: "Wie viele Kinder sind registriert?", en: "How many children are registered?" },
    { de: "Patienten ohne E-Mail", en: "Patients without email" },
  ],
  "/automatisierungen": [
    { de: "Erstell eine Zahlungserinnerung", en: "Create a payment reminder" },
    { de: "Eskalationspipeline bauen", en: "Build escalation pipeline" },
    { de: "Rücklastschrift-Alert", en: "Chargeback alert" },
  ],
  "/zahlungen": [
    { de: "Bankverbindung einrichten", en: "Set up bank connection" },
    { de: "Was sind Rücklastschriften?", en: "What are chargebacks?" },
  ],
  "/import": [
    { de: "Wie exportiere ich aus IVORIS?", en: "How to export from IVORIS?" },
    { de: "Welche Formate werden unterstützt?", en: "Which formats are supported?" },
  ],
  "/einstellungen": [
    { de: "Benutzer hinzufügen", en: "Add a user" },
    { de: "E-Mail-Provider einrichten", en: "Set up email provider" },
  ],
};

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function ICuraGuide() {
  const { locale, theme } = useAppStore();
  const pathname = usePathname();
  const router = useRouter();
  const isDE = locale === "de";
  const isDark = theme === "dark";

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [highlightEl, setHighlightEl] = useState<HTMLElement | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, minimized]);

  // Clear highlight after 4 seconds
  useEffect(() => {
    if (highlightEl) {
      const timer = setTimeout(() => {
        setHighlightEl(null);
        setHighlightRect(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [highlightEl]);

  // Track highlight element position
  useEffect(() => {
    if (!highlightEl) return;
    const update = () => {
      const rect = highlightEl.getBoundingClientRect();
      setHighlightRect(rect);
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [highlightEl]);

  function getQuickActions() {
    const key = Object.keys(QUICK_ACTIONS).find((k) => pathname?.startsWith(k));
    const actions = QUICK_ACTIONS[key || "/uebersicht"] || QUICK_ACTIONS["/uebersicht"];
    return actions.map((a) => (isDE ? a.de : a.en));
  }

  async function speak(text: string) {
    if (!voiceEnabled) return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 500) }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) { audioRef.current.pause(); }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play();
    } catch {}
  }

  function toggleVoiceInput() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = isDE ? "de-DE" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setInput(transcript);
    };

    recognition.onend = () => {
      setListening(false);
      if (input.trim()) sendMessage(input.trim());
    };

    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function handleAction(action: { type: string; target: string; explanation: string }) {
    if (action.type === "navigate") {
      router.push(action.target);
    } else if (action.type === "highlight") {
      const el = document.querySelector(action.target) as HTMLElement;
      if (el) {
        setHighlightEl(el);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;
    const userMsg: Message = { id: uid(), role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/workflows/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          context: {
            currentPage: pathname,
            locale,
            theme,
            mode: "assistant",
          },
          history: messages.slice(-8).map((m) => ({ role: m.role, content: m.text })),
        }),
      });

      const raw = await res.text();
      let data: any;
      for (const line of raw.split("\n")) {
        if (line.startsWith("data: ")) {
          try { data = JSON.parse(line.slice(6)); } catch {}
        }
      }
      if (!data) {
        try { data = JSON.parse(raw); } catch {}
      }

      let responseText = "";
      let actions: Message["actions"] = [];

      if (data?.type === "proposal") {
        responseText = data.rationale || (isDE ? "Hier ist mein Vorschlag:" : "Here's my suggestion:");
        actions = [{ type: "navigate", target: "/automatisierungen", explanation: isDE ? "Zum Workflow-Builder" : "To workflow builder" }];
      } else if (data?.type === "question") {
        responseText = data.text || data.question || "";
      } else if (data?.type === "guide") {
        responseText = data.explanation || "";
        actions = [{ type: data.action, target: data.target, explanation: data.explanation }];
      } else if (data?.text) {
        responseText = data.text;
      } else if (data?.rationale) {
        responseText = data.rationale;
      } else {
        responseText = isDE ? "Ich konnte die Anfrage nicht verarbeiten." : "I couldn't process that request.";
      }

      // Parse [navigate:/path] and [highlight:selector] tags
      const navMatch = responseText.match(/\[navigate:([^\]]+)\]/);
      const hlMatch = responseText.match(/\[highlight:([^\]]+)\]/);
      if (navMatch) {
        actions = [...(actions || []), { type: "navigate", target: navMatch[1], explanation: "" }];
        responseText = responseText.replace(navMatch[0], "").trim();
      }
      if (hlMatch) {
        actions = [...(actions || []), { type: "highlight", target: hlMatch[1], explanation: "" }];
        responseText = responseText.replace(hlMatch[0], "").trim();
      }

      const assistantMsg: Message = { id: uid(), role: "assistant", text: responseText, actions };
      setMessages((prev) => [...prev, assistantMsg]);

      // Auto-execute first action
      if (actions && actions.length > 0) {
        setTimeout(() => handleAction(actions![0]), 800);
      }

      // Speak the response
      speak(responseText);
    } catch {
      setMessages((prev) => [...prev, {
        id: uid(),
        role: "assistant",
        text: isDE ? "Verbindungsfehler. Bitte versuchen Sie es erneut." : "Connection error. Please try again.",
      }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Highlight Overlay */}
      {highlightRect && (
        <div className="icura-highlight-overlay" style={{
          position: "fixed", inset: 0, zIndex: 99998, pointerEvents: "none",
        }}>
          <div className="icura-highlight-ring" style={{
            position: "absolute",
            left: highlightRect.left - 8,
            top: highlightRect.top - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
            borderRadius: 12,
            border: "2px solid var(--ac-primary)",
            boxShadow: "0 0 0 4px rgba(91, 77, 225, 0.2), 0 0 20px rgba(91, 77, 225, 0.3)",
            animation: "icura-pulse 1.5s ease-in-out infinite",
          }} />
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => { setOpen(!open); setMinimized(false); }}
        className="icura-fab"
        style={{
          position: "fixed",
          bottom: 24,
          right: 88,
          zIndex: 99999,
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #5b4de1 0%, #7c6bf0 50%, #9d8ff5 100%)",
          color: "white",
          boxShadow: open
            ? "0 0 0 3px rgba(91, 77, 225, 0.4), 0 8px 32px rgba(91, 77, 225, 0.5)"
            : "0 0 0 0 rgba(91, 77, 225, 0), 0 8px 24px rgba(91, 77, 225, 0.35)",
          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          transform: open ? "scale(0.9) rotate(45deg)" : "scale(1)",
          animation: open ? "none" : "icura-breathe 3s ease-in-out infinite",
        }}
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {/* Chat Panel */}
      {open && !minimized && (
        <div
          className="icura-panel"
          style={{
            position: "fixed",
            bottom: 92,
            right: 88,
            zIndex: 99999,
            width: 380,
            maxHeight: 540,
            borderRadius: 20,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: isDark
              ? "rgba(16, 19, 26, 0.92)"
              : "rgba(255, 255, 255, 0.88)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
            boxShadow: isDark
              ? "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset"
              : "0 24px 80px rgba(26, 44, 68, 0.18), 0 0 0 1px rgba(255,255,255,0.8) inset",
            animation: "icura-slide-up 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: "linear-gradient(135deg, #5b4de1, #9d8ff5)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Sparkles size={16} color="white" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ac-text)" }}>iCura</div>
                <div style={{ fontSize: 11, color: "var(--ac-text-mute)" }}>
                  {isDE ? "Ihr KI-Assistent" : "Your AI assistant"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setVoiceEnabled(!voiceEnabled)} style={{
                background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8,
                color: "var(--ac-text-mute)", transition: "color 0.2s",
              }}>
                {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <button onClick={() => setMinimized(true)} style={{
                background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8,
                color: "var(--ac-text-mute)", transition: "color 0.2s",
              }}>
                <ChevronDown size={16} />
              </button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8,
                color: "var(--ac-text-mute)", transition: "color 0.2s",
              }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{
            padding: "10px 16px",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"}`,
          }}>
            {getQuickActions().map((action) => (
              <button
                key={action}
                onClick={() => sendMessage(action)}
                disabled={sending}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 20,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(91, 77, 225, 0.15)"}`,
                  background: isDark ? "rgba(255,255,255,0.04)" : "rgba(91, 77, 225, 0.06)",
                  color: "var(--ac-primary)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                {action}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minHeight: 200,
            maxHeight: 320,
          }}>
            {messages.length === 0 && (
              <div style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "var(--ac-text-mute)",
                fontSize: 13,
              }}>
                <Sparkles size={28} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
                <p style={{ fontWeight: 600, color: "var(--ac-text-soft)" }}>
                  {isDE ? "Hallo! Ich bin iCura." : "Hello! I'm iCura."}
                </p>
                <p style={{ marginTop: 4 }}>
                  {isDE
                    ? "Fragen Sie mich was, oder wählen Sie eine Aktion oben."
                    : "Ask me anything, or pick an action above."}
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  animation: "icura-msg-in 0.25s ease-out",
                }}
              >
                <div style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  background: msg.role === "user"
                    ? "linear-gradient(135deg, #5b4de1, #7c6bf0)"
                    : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  color: msg.role === "user" ? "white" : "var(--ac-text)",
                  fontWeight: 500,
                }}>
                  {msg.text}
                  {msg.actions && msg.actions.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {msg.actions.map((action, i) => (
                        <button
                          key={i}
                          onClick={() => handleAction(action)}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: 12,
                            border: "1px solid rgba(91, 77, 225, 0.3)",
                            background: "rgba(91, 77, 225, 0.1)",
                            color: msg.role === "user" ? "rgba(255,255,255,0.9)" : "var(--ac-primary)",
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                        >
                          {action.type === "navigate" ? "→ " : "◉ "}
                          {action.explanation || action.target}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: "flex", gap: 4, padding: "8px 0" }}>
                <span className="icura-dot" style={{ animationDelay: "0s" }} />
                <span className="icura-dot" style={{ animationDelay: "0.15s" }} />
                <span className="icura-dot" style={{ animationDelay: "0.3s" }} />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "12px 16px",
            borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder={isDE ? "Frag mich was..." : "Ask me anything..."}
              disabled={sending}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 20,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "var(--ac-border)"}`,
                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                padding: "0 14px",
                fontSize: 13,
                color: "var(--ac-text)",
                outline: "none",
                transition: "border-color 0.2s",
              }}
            />
            <button
              onClick={toggleVoiceInput}
              style={{
                width: 38, height: 38, borderRadius: "50%",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: listening ? "#cb4f56" : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                color: listening ? "white" : "var(--ac-text-mute)",
                transition: "all 0.2s",
                animation: listening ? "icura-pulse 1s ease-in-out infinite" : "none",
              }}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              onClick={() => sendMessage(input)}
              disabled={sending || !input.trim()}
              style={{
                width: 38, height: 38, borderRadius: "50%",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: input.trim() ? "linear-gradient(135deg, #5b4de1, #7c6bf0)" : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                color: input.trim() ? "white" : "var(--ac-text-mute)",
                transition: "all 0.3s",
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes icura-breathe {
          0%, 100% { box-shadow: 0 0 0 0 rgba(91, 77, 225, 0), 0 8px 24px rgba(91, 77, 225, 0.35); }
          50% { box-shadow: 0 0 0 8px rgba(91, 77, 225, 0.12), 0 8px 32px rgba(91, 77, 225, 0.45); }
        }
        @keyframes icura-slide-up {
          0% { opacity: 0; transform: translateY(16px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes icura-msg-in {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes icura-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        .icura-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--ac-text-mute);
          animation: icura-dot-bounce 1.2s ease-in-out infinite;
        }
        @keyframes icura-dot-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-8px); }
        }
        .icura-fab:hover {
          transform: scale(1.08) !important;
          box-shadow: 0 0 0 6px rgba(91, 77, 225, 0.2), 0 12px 40px rgba(91, 77, 225, 0.5) !important;
        }
      `}</style>
    </>
  );
}
