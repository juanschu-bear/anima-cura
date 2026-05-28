"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/hooks/useAppStore";
import { MessageSquare, Send, ArrowLeft, User, Bot } from "lucide-react";

interface Conversation {
  patient_id: string;
  patient_name: string;
  last_message: string;
  last_sender: string;
  last_at: string;
  count: number;
  unread: number;
}

interface Message {
  id: string;
  sender: string;
  text: string;
  created_at: string;
}

export default function NachrichtenPage() {
  const { theme } = useAppStore();
  const dk = theme === "dark";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const grn = "#4ade80";
  const muted = dk ? "#777" : "#999";
  const border = dk ? "rgba(255,255,255,0.06)" : "#e5e8ef";
  const cardBg = dk ? "rgba(16,18,28,0.75)" : "#fff";
  const txtH = dk ? "#f0f0f0" : "#1c3044";

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/praxis/messages");
    if (res.ok) {
      const j = await res.json();
      setConversations(j.conversations || []);
    }
    setLoading(false);
  }, []);

  const fetchMessages = useCallback(async (patientId: string) => {
    setMsgLoading(true);
    const res = await fetch(`/api/praxis/messages?patient_id=${patientId}`);
    if (res.ok) {
      const j = await res.json();
      setMessages(j.messages || []);
      setSelectedName(j.patient || "Patient");
    }
    setMsgLoading(false);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const openConversation = (patientId: string) => {
    setSelected(patientId);
    fetchMessages(patientId);
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    const res = await fetch("/api/praxis/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: selected, text: reply.trim() }),
    });
    if (res.ok) {
      setReply("");
      fetchMessages(selected);
    }
    setSending(false);
  };

  const fmtTime = (d: string) => {
    const dt = new Date(d);
    const now = new Date();
    const diff = now.getTime() - dt.getTime();
    if (diff < 60000) return "Gerade eben";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} Min.`;
    if (diff < 86400000) return dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return dt.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  };

  return (
    <div>
      <h1 className="ac-page-title" style={{ marginBottom: 4 }}>Nachrichten</h1>
      <p style={{ fontSize: 14, color: muted, marginBottom: 20 }}>Patientennachrichten aus dem Portal</p>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "340px 1fr" : "1fr", gap: 16, height: "calc(100vh - 200px)" }}>
        {/* Conversation List */}
        <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, overflow: "hidden", display: "flex", flexDirection: "column", backdropFilter: dk ? "blur(20px)" : undefined }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${border}` }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: txtH, margin: 0 }}>Konversationen</p>
            <p style={{ fontSize: 12, color: muted, margin: 0 }}>{conversations.length} Unterhaltungen</p>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: muted }}>Laden...</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <MessageSquare size={32} color={muted} style={{ marginBottom: 12 }} />
                <p style={{ color: muted, fontSize: 14 }}>Noch keine Nachrichten</p>
              </div>
            ) : conversations.map(c => (
              <motion.div
                key={c.patient_id}
                whileHover={{ backgroundColor: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}
                onClick={() => openConversation(c.patient_id)}
                style={{ padding: "14px 20px", cursor: "pointer", borderBottom: `1px solid ${border}`, background: selected === c.patient_id ? (dk ? "rgba(74,222,128,0.06)" : "rgba(34,197,94,0.04)") : "transparent", transition: "background 0.15s" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: txtH }}>{c.patient_name}</span>
                  <span style={{ fontSize: 11, color: muted }}>{fmtTime(c.last_at)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: 12, color: muted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                    {c.last_sender === "patient" ? "" : c.last_sender === "icura" ? "iCura: " : "Praxis: "}{c.last_message}
                  </p>
                  {c.last_sender === "patient" && (
                    <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: grn, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>!</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Message Detail */}
        {selected && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, display: "flex", flexDirection: "column", overflow: "hidden", backdropFilter: dk ? "blur(20px)" : undefined }}
          >
            {/* Header */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: muted, display: "flex" }}><ArrowLeft size={18} /></button>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: txtH, margin: 0 }}>{selectedName}</p>
                <p style={{ fontSize: 11, color: muted, margin: 0 }}>{messages.length} Nachrichten</p>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {msgLoading ? (
                <div style={{ textAlign: "center", color: muted, padding: 40 }}>Laden...</div>
              ) : messages.map(m => {
                const isPatient = m.sender === "patient";
                const isIcura = m.sender === "icura";
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: isPatient ? "flex-start" : "flex-end", marginBottom: 12 }}>
                    <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: 16, background: isPatient ? (dk ? "rgba(255,255,255,0.06)" : "#f0f0f0") : isIcura ? (dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.06)") : (dk ? "rgba(74,222,128,0.15)" : "rgba(34,197,94,0.12)") }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: isPatient ? muted : grn, marginBottom: 4 }}>
                        {isPatient ? "Patient" : isIcura ? "iCura" : "Praxis"}
                      </div>
                      <p style={{ fontSize: 14, lineHeight: 1.5, color: txtH, margin: 0 }}>{m.text}</p>
                      <div style={{ fontSize: 10, color: muted, marginTop: 4, textAlign: "right" }}>
                        {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Input */}
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${border}`, display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="text"
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendReply()}
                placeholder="Antwort schreiben..."
                style={{ flex: 1, padding: "10px 16px", borderRadius: 12, border: `1px solid ${border}`, background: dk ? "rgba(255,255,255,0.04)" : "#f8f8f8", color: txtH, fontSize: 14, fontFamily: "inherit", outline: "none" }}
              />
              <button onClick={sendReply} disabled={!reply.trim() || sending} style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: reply.trim() ? grn : (dk ? "#333" : "#ddd"), color: "#fff", cursor: reply.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
