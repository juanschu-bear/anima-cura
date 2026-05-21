"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Check,
  Loader2,
  Wand2,
  AlertCircle,
} from "lucide-react";
import type { Workflow, WorkflowEdge, WorkflowNode } from "./types";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/hooks/useAppStore";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  text: string;
  proposal?: {
    rationale: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  pending?: boolean;
  error?: boolean;
}

interface Props {
  workflow: Workflow;
  onApplyProposal: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function ICuraChat({ workflow, onApplyProposal }: Props) {
  const { locale } = useAppStore();
  const QUICK_PROMPTS = [
    t("chat.quick.reminder", locale),
    t("chat.quick.escalation", locale),
    t("chat.quick.chargeback", locale),
    t("chat.quick.scoring", locale),
  ];
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: "assistant",
      text: [
        t("chat.welcome.intro", locale),
        t("chat.welcome.ex1", locale),
        t("chat.welcome.ex2", locale),
        t("chat.welcome.ex3", locale),
      ].join("\n"),
    },
  ]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    const userMsg: Message = { id: uid(), role: "user", text: trimmed };
    const pendingId = uid();
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: pendingId, role: "assistant", text: t("chat.thinking", locale), pending: true },
    ]);
    setSending(true);

    try {
      const res = await fetch("/api/workflows/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages
            .filter((m) => !m.pending && !m.error)
            .slice(-12)
            .map((m) => ({ role: m.role, content: m.text })),
          currentWorkflow: {
            nodes: workflow.nodes,
            edges: workflow.edges,
          },
        }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(t("chat.error.backend404", locale));
        }
        throw new Error(t("chat.error.serverStatus", locale, { status: res.status }));
      }

      const text = await res.text();
      // Parse SSE response: extract JSON from "data: {...}" lines
      let data: any;
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            // skip non-JSON data lines
          }
        }
      }
      if (!data) {
        // Fallback: try parsing entire response as JSON
        try { data = JSON.parse(text); } catch {
          throw new Error(t("chat.error.parse", locale));
        }
      }
      let response: Message;
      if (data.type === "proposal") {
        response = {
          id: uid(),
          role: "assistant",
          text: data.rationale || t("chat.proposal.default", locale),
          proposal: { rationale: data.rationale || "", nodes: data.nodes || [], edges: data.edges || [] },
        };
      } else if (data.type === "question") {
        response = { id: uid(), role: "assistant", text: data.text || t("chat.proposal.clarify", locale) };
      } else if (typeof data.text === "string") {
        response = { id: uid(), role: "assistant", text: data.text };
      } else {
        response = { id: uid(), role: "assistant", text: t("chat.error.unexpected", locale) };
      }
      setMessages((prev) => prev.filter((m) => m.id !== pendingId).concat(response));
    } catch (err: any) {
      setMessages((prev) =>
        prev.filter((m) => m.id !== pendingId).concat({
          id: uid(),
          role: "assistant",
          text: err?.message || t("chat.error.generic", locale),
          error: true,
        })
      );
    } finally {
      setSending(false);
    }
  }

  function applyProposal(p: Message["proposal"]) {
    if (!p) return;
    onApplyProposal(p.nodes, p.edges);
    setMessages((prev) =>
      prev.concat({
        id: uid(),
        role: "assistant",
        text: t("chat.proposal.applied", locale),
      })
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`icura-fab ${open ? "icura-fab-hidden" : ""}`}
        aria-label={t("chat.open", locale)}
      >
        <span className="icura-fab-glow" />
        <Sparkles size={16} strokeWidth={2.4} />
        <span className="icura-fab-label">iCura</span>
      </button>

      {open && (
        <aside className="icura-panel">
          <header className="icura-head">
            <div className="flex items-center gap-2">
              <span className="icura-avatar">
                <Sparkles size={14} strokeWidth={2.4} />
              </span>
              <div>
                <p className="icura-name">iCura</p>
                <p className="icura-tagline">{t("chat.tagline", locale)}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="wf-iconbtn" aria-label={t("common.close", locale)}>
              <X size={15} />
            </button>
          </header>

          <div ref={scrollRef} className="icura-body">
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

                  {m.proposal && (
                    <div className="icura-proposal">
                      <div className="icura-proposal-head">
                        <Wand2 size={12} /> {t("chat.proposal.head", locale, { count: m.proposal.nodes.length })}
                      </div>
                      <ul className="icura-proposal-list">
                        {m.proposal.nodes.map((n, i) => (
                          <li key={i}>
                            <span className="icura-proposal-kind">{n.type}</span>
                            {nodeSummary(n, locale)}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => applyProposal(m.proposal)}
                        className="wf-primary-btn"
                        style={{ marginTop: 10, padding: "7px 12px", fontSize: 12 }}
                        type="button"
                      >
                        <Check size={12} /> {t("common.apply", locale)}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="icura-quick">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={sending}
                className="icura-quick-chip"
                type="button"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            className="icura-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              className="icura-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("chat.inputPlaceholder", locale)}
              disabled={sending}
            />
            <button
              type="submit"
              className="icura-send"
              disabled={sending || !input.trim()}
              aria-label={t("common.send", locale)}
            >
              {sending ? <Loader2 size={14} className="icura-spin" /> : <Send size={14} />}
            </button>
          </form>
        </aside>
      )}
    </>
  );
}

function nodeSummary(n: WorkflowNode, locale: "de" | "en" = "de"): string {
  const d: any = n.data || {};
  const daysOverdue = locale === "en" ? "days overdue" : "Tage überfällig";
  const daily = locale === "en" ? "daily" : "täglich";
  const toLbl = locale === "en" ? "to" : "an";
  const stage = locale === "en" ? "Stage" : "Stufe";
  switch (n.type) {
    case "trigger":
      return d.event === "rate_overdue"
        ? ` · ${d.days ?? "?"} ${daysOverdue}`
        : d.event === "daily_at"
        ? ` · ${daily} ${d.time || "06:00"}`
        : ` · ${d.event || ""}`;
    case "condition":
      return ` · ${d.field || ""} ${d.operator || ""} ${d.value ?? ""}`;
    case "action_email":
      return ` · ${toLbl} ${d.recipient || "?"}`;
    case "action_wait":
      return ` · ${d.amount || 1} ${d.unit || "days"}`;
    case "action_mahnstufe":
      return ` · ${stage} ${d.stufe ?? "?"}`;
    case "action_scoring":
      return ` · ${d.delta > 0 ? "+" : ""}${d.delta ?? 0}`;
    default:
      return "";
  }
}

function renderMarkdown(text: string) {
  // tiny inline renderer: **bold**, • bullets, line breaks
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
