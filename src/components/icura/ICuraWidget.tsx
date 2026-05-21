"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, Minus, ChevronUp } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { useICura } from "./useICura";
import { ICuraChat } from "./ICuraChat";
import { ICuraInput } from "./ICuraInput";
import { ICuraQuickActions } from "./ICuraQuickActions";
import { speak } from "./ICuraVoice";
import type { AppContext, ICuraMessage } from "./types";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function ICuraWidget() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { locale, theme } = useAppStore();
  const open = useICura((s) => s.open);
  const minimized = useICura((s) => s.minimized);
  const messages = useICura((s) => s.messages);
  const sending = useICura((s) => s.sending);
  const speakEnabled = useICura((s) => s.speakEnabled);
  const setOpen = useICura((s) => s.setOpen);
  const setMinimized = useICura((s) => s.setMinimized);
  const setMessages = useICura((s) => s.setMessages);
  const setSending = useICura((s) => s.setSending);
  const toggleSpeak = useICura((s) => s.toggleSpeak);
  const highlight = useICura((s) => s.highlight);

  const [input, setInput] = useState("");
  const sessionIdRef = useRef<string | null>(null);
  const mounted = useRef(false);

  // Welcome message on first open
  useEffect(() => {
    if (!open || messages.length > 0) return;
    setMessages([
      {
        id: uid(),
        role: "assistant",
        text: t("icura.welcome", locale),
      },
    ]);
  }, [open, messages.length, locale, setMessages]);

  // re-translate welcome if locale changed AND only welcome message present
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (messages.length === 1 && messages[0].role === "assistant") {
      setMessages([{ ...messages[0], text: t("icura.welcome", locale) }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const context = useMemo<AppContext>(() => ({
    currentPage: pathname,
    locale,
    theme,
  }), [pathname, locale, theme]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    const pendingId = uid();
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", text: trimmed },
      { id: pendingId, role: "assistant", text: t("icura.thinking", locale), pending: true },
    ]);
    setSending(true);

    try {
      const res = await fetch("/api/workflows/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current || undefined,
          message: trimmed,
          mode: "assistant",
          context,
          history: messages
            .filter((m) => !m.pending && !m.error)
            .slice(-12)
            .map((m) => ({ role: m.role, content: m.text })),
        }),
      });

      const sid = res.headers.get("X-Session-Id");
      if (sid) sessionIdRef.current = sid;

      if (!res.ok) {
        if (res.status === 404) throw new Error(t("icura.error.backend404", locale));
        throw new Error(t("icura.error.serverStatus", locale, { status: res.status }));
      }

      const raw = await res.text();
      // SSE: parse "data: {...}" lines, keep the last one (the "final" event)
      let data: any;
      for (const line of raw.split("\n")) {
        if (line.startsWith("data: ")) {
          try { data = JSON.parse(line.slice(6)); } catch { /* skip */ }
        }
      }
      if (!data) {
        try { data = JSON.parse(raw); } catch { throw new Error(t("icura.error.parse", locale)); }
      }

      let response: ICuraMessage;
      if (data.type === "guide") {
        response = {
          id: uid(),
          role: "assistant",
          text: data.explanation,
          guide: { action: data.action, target: data.target, explanation: data.explanation },
        };
        // Execute the guide action
        if (data.action === "navigate" && typeof data.target === "string") {
          // small delay so the message appears before the route swap
          window.setTimeout(() => router.push(data.target), 320);
        } else if (data.action === "highlight" && typeof data.target === "string") {
          window.setTimeout(() => highlight(data.target, data.explanation), 200);
        }
      } else if (data.type === "proposal") {
        response = {
          id: uid(),
          role: "assistant",
          text: data.rationale || t("icura.proposalDefault", locale),
        };
        // If the user is currently on /automatisierungen, offer to apply via existing workflow-chat;
        // otherwise we just informed them — they'll re-trigger after navigation.
      } else if (data.type === "question") {
        response = { id: uid(), role: "assistant", text: data.text || t("icura.error.clarify", locale) };
      } else if (typeof data.text === "string") {
        response = { id: uid(), role: "assistant", text: data.text };
      } else {
        response = { id: uid(), role: "assistant", text: t("icura.error.unexpected", locale) };
      }

      setMessages((prev) => prev.filter((m) => m.id !== pendingId).concat(response));

      if (speakEnabled && !response.error && response.text) {
        speak(response.text, locale);
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.filter((m) => m.id !== pendingId).concat({
          id: uid(),
          role: "assistant",
          text: err?.message || t("icura.error.generic", locale),
          error: true,
        })
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {(!open || minimized) && (
        <button
          type="button"
          className="icura-fab"
          onClick={() => { setOpen(true); setMinimized(false); }}
          aria-label={t("icura.open", locale)}
        >
          <span className="icura-fab-aura" aria-hidden />
          <span className="icura-fab-ring" aria-hidden />
          <Sparkles size={18} strokeWidth={2.4} />
          <span className="icura-fab-label">iCura</span>
        </button>
      )}

      {open && !minimized && (
        <aside className="icura-widget" role="dialog" aria-label="iCura">
          <span className="icura-widget-seam" aria-hidden />
          <header className="icura-head">
            <div className="icura-head-id">
              <span className="icura-avatar">
                <Sparkles size={14} strokeWidth={2.4} />
              </span>
              <div>
                <p className="icura-name">iCura</p>
                <p className="icura-tagline">{t("icura.tagline", locale)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="icura-head-btn"
                aria-label={t("icura.minimize", locale)}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icura-head-btn"
                aria-label={t("common.close", locale)}
              >
                <X size={14} />
              </button>
            </div>
          </header>

          <ICuraChat messages={messages} locale={locale} />

          <ICuraQuickActions
            currentPage={pathname}
            locale={locale}
            onPick={send}
            disabled={sending}
          />

          <ICuraInput
            locale={locale}
            value={input}
            sending={sending}
            speakEnabled={speakEnabled}
            onChange={setInput}
            onSubmit={send}
            onToggleSpeak={toggleSpeak}
          />
        </aside>
      )}
    </>
  );
}
