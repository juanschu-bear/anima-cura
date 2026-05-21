"use client";

import { useEffect, useRef } from "react";
import { Bot, User, AlertCircle, Loader2, Navigation, Eye } from "lucide-react";
import type { ICuraMessage } from "./types";
import { t } from "@/lib/i18n";

function renderMarkdown(text: string) {
  const parts = text.split("\n");
  return (
    <>
      {parts.map((line, i) => {
        const html = line
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/`(.+?)`/g, "<code>$1</code>");
        return (
          <span key={i}>
            {i > 0 && <br />}
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </span>
        );
      })}
    </>
  );
}

export function ICuraChat({
  messages,
  locale,
}: {
  messages: ICuraMessage[];
  locale: "de" | "en";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);

  return (
    <div ref={ref} className="icura-body">
      {messages.map((m) => (
        <div key={m.id} className={`icura-msg icura-msg-${m.role}`}>
          <span className="icura-msg-avatar">
            {m.role === "user" ? <User size={12} /> : <Bot size={12} />}
          </span>
          <div className="icura-msg-bubble">
            {m.pending ? (
              <span className="icura-thinking">
                <Loader2 size={12} className="icura-spin" /> {m.text}
              </span>
            ) : m.error ? (
              <span className="icura-error">
                <AlertCircle size={12} /> {m.text}
              </span>
            ) : (
              <span className="icura-text">{renderMarkdown(m.text)}</span>
            )}

            {m.guide && (
              <div className="icura-guide-pill">
                {m.guide.action === "navigate" ? <Navigation size={11} /> : <Eye size={11} />}
                <span>
                  {m.guide.action === "navigate"
                    ? t("icura.guide.navigated", locale, { target: m.guide.target })
                    : t("icura.guide.highlighted", locale, { target: m.guide.target })}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
