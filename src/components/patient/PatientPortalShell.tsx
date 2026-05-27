"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/db/supabase";
import { motion, AnimatePresence } from "framer-motion";

interface Props { patientId: string; patientName: string; patientEmail: string }
interface RpData {
  plan: { gesamtbetrag: number; anzahl_raten: number; rate_betrag: number } | null;
  investiert: number; offen_betrag: number; raten_bezahlt: number; raten_gesamt: number;
  prozent: number; streak: number;
  naechste_rate: { betrag: number; faellig_am: string } | null;
  ueberfaellig: { betrag: number; faellig_am: string; anzahl: number } | null;
}
interface Phase { id: string; name: string; beschreibung: string | null; status: string; reihenfolge: number; start_datum: string | null; end_datum: string | null }
interface Badge { id: string; icon: string; titel: string; beschreibung: string; freigeschaltet: boolean }
interface Msg { id: string; sender_type: string; sender_name: string | null; text: string; created_at: string }
interface Notif { id: string; typ: string; titel: string; text: string; gelesen: boolean; created_at: string }
interface Doc { id: string; name: string; typ: string; file_url: string | null; hochgeladen_am: string }
interface Tipp { id: string; titel: string; text: string }
interface Zahlung { id: string; rate_nummer: number; betrag: number; faellig_am: string; bezahlt_am: string }
type Tab = "home" | "journey" | "progress" | "chat" | "more";

const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }); } catch { return d; } };
const fmtShort = (d: string) => { try { return new Date(d).toLocaleDateString("de-DE", { day: "numeric", month: "short" }); } catch { return d; } };
const fmtTime = (d: string) => { try { return new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); } catch { return d; } };
const fmtEuro = (n: number) => n.toLocaleString("de-DE") + " €";
const daysTill = (d: string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 864e5));
const docIc: Record<string, string> = { kostenplan: "📋", vertrag: "📝", ratenzahlung: "📝", datenschutz: "🔒", sonstiges: "📄" };

export default function PatientPortalShell({ patientName, patientId }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");
  const [dk, setDk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [nOpen, setNOpen] = useState(false);
  const [popup, setPopup] = useState<Badge | null>(null);
  const [msgInput, setMsgInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [docDrawer, setDocDrawer] = useState<Doc | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [rp, setRp] = useState<RpData | null>(null);
  const [phasen, setPhasen] = useState<Phase[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tipps, setTipps] = useState<Tipp[]>([]);
  const [pays, setPays] = useState<Zahlung[]>([]);

  const fetchAll = useCallback(async () => {
    const ep = ["ratenplan", "behandlung", "badges", "nachrichten", "benachrichtigungen", "dokumente", "tipps", "zahlungen"];
    const results = await Promise.allSettled(ep.map(e => fetch("/api/patient/" + e)));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled" || !r.value.ok) continue;
      try {
        const j = await r.value.json();
        if (i === 0) setRp(j);
        if (i === 1) setPhasen(j.phasen || []);
        if (i === 2) setBadges(j.badges || []);
        if (i === 3) setMsgs(j.nachrichten || []);
        if (i === 4) setNotifs(j.benachrichtigungen || []);
        if (i === 5) setDocs(j.dokumente || []);
        if (i === 6) setTipps(j.tipps || []);
        if (i === 7) setPays(j.zahlungen || []);
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (chatScrollRef.current && tab === "chat") chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [msgs, tab, typing]);

  const sendMsg = async () => {
    const text = msgInput.trim();
    if (!text) return;
    setMsgInput("");
    const tempId = "temp-" + Date.now();
    setMsgs(prev => [...prev, { id: tempId, sender_type: "patient", sender_name: null, text, created_at: new Date().toISOString() }]);
    setTyping(true);
    try {
      const res = await fetch("/api/patient/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (res.ok) {
        const d = await res.json();
        if (d.icura_response) {
          setMsgs(prev => [...prev, d.icura_response]);
        } else if (d.fallback) {
          setMsgs(prev => [...prev, { id: "fb-" + Date.now(), sender_type: "praxis", sender_name: "iCura", text: d.message || "Das Praxis-Team wurde benachrichtigt.", created_at: new Date().toISOString() }]);
        }
      }
    } catch { /* ignore */ }
    setTyping(false);
  };

  const logout = async () => { const sb = createBrowserClient(); await sb.auth.signOut(); router.replace("/patient/login"); router.refresh(); };

  const firstName = patientName.split(" ")[0];
  const activePhase = phasen.find(p => p.status === "aktiv");
  const unread = notifs.filter(n => !n.gelesen).length;
  const isOverdue = !!(rp && rp.ueberfaellig);
  const dl = rp && rp.naechste_rate ? daysTill(rp.naechste_rate.faellig_am) : 99;
  const pct = rp ? rp.prozent : 0;

  // Phase-based blob colors
  const phaseColors: Record<string, { a: string; b: string; c: string }> = {
    "Nivellierung":    { a: "74,222,128", b: "56,189,248", c: "52,211,153" },   // green-cyan
    "Lückenschluss":   { a: "167,139,250", b: "74,222,128", c: "96,165,250" },  // purple-green
    "Feineinstellung": { a: "251,191,36", b: "167,139,250", c: "244,114,182" }, // gold-purple-pink
    "Retainer":        { a: "56,189,248", b: "129,140,248", c: "74,222,128" },  // blue-indigo-green
  };
  const phaseName = activePhase?.name || "";
  const blobC = phaseColors[phaseName] || { a: "74,222,128", b: "96,165,250", c: "167,139,250" };

  // Theme colors - improved contrast
  const bg = dk ? "#000" : "#f5f1eb";
  const fg = dk ? "#f0f0f0" : "#1a1a1a";
  const cardBg = dk ? "rgba(20,20,20,0.7)" : "rgba(255,255,255,0.8)";
  const border = dk ? "rgba(255,255,255,0.06)" : "#e0d8cc";
  const muted = dk ? "#777" : "#888";
  const soft = dk ? "#999" : "#555";
  const grn = dk ? "#4ade80" : "#22c55e";
  const red = "#ef4444";
  const warn = dk ? "#fbbf24" : "#b08930";
  const purple = dk ? "#a78bfa" : "#7c3aed";
  const btnBg = dk ? "#1e1e1e" : "#e8e2d8";
  const navInactive = dk ? "#666" : "#aaa";

  const hd: React.CSSProperties = { fontFamily: "'Fraunces', serif" };
  const lb: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: muted };
  const card: React.CSSProperties = { borderRadius: 18, padding: 22, marginBottom: 14, background: cardBg, border: "1px solid " + border, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: bg, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff", ...hd, margin: "0 auto 16px" }}>A</div>
          <p style={{ color: muted, fontSize: 14 }}>Wird geladen...</p>
        </div>
        <style>{fontCss}</style>
      </div>
    );
  }

  // ── HEADER ──
  const Header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff", ...hd }}>A</div>
        <span style={{ ...hd, fontSize: 22, fontWeight: 700, color: fg }}>Anima Cura</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setDk(!dk)} style={{ width: 42, height: 42, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: btnBg, color: soft }}>{dk ? "☀️" : "🌙"}</button>
        <button onClick={() => setNOpen(!nOpen)} style={{ width: 42, height: 42, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, position: "relative", background: btnBg }}>
          🔔
          {unread > 0 && <span style={{ position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: red, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unread}</span>}
        </button>
      </div>
    </div>
  );

  // ── HINT BANNER ──
  const HintBanner = isOverdue ? (
    <div style={{ margin: "16px 20px 0", padding: "16px 18px", borderRadius: 16, display: "flex", gap: 14, alignItems: "flex-start", background: dk ? "rgba(80,20,15,0.4)" : "rgba(220,80,70,0.06)", border: "1px solid " + (dk ? "rgba(200,60,50,0.25)" : "rgba(200,60,50,0.12)") }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: dk ? "rgba(200,50,40,0.3)" : "rgba(200,50,40,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: red, flexShrink: 0 }}>!</div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: dk ? "#d4b0a8" : "#7a4a42" }}>
        <strong>Hinweis:</strong> Es gibt eine kleine Verzögerung bei Ihrer letzten Rate. Bitte prüfen Sie dies kurz im Fortschritt-Reiter, damit Ihr Verlauf reibungslos weitergeht.
      </div>
    </div>
  ) : null;

  // ── NOTIFICATIONS ──
  const NotifsDD = nOpen ? (
    <div style={{ padding: "12px 20px 0" }}>
      {notifs.map(n => (
        <div key={n.id} style={{ padding: 14, borderRadius: 14, marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start", background: cardBg, border: "1px solid " + (!n.gelesen ? (dk ? "rgba(74,222,128,0.2)" : "rgba(34,197,94,0.15)") : border) }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0, background: n.typ === "warnung" ? red : n.typ === "eingang" ? grn : warn }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, color: fg }}>{n.titel}</div>
            <div style={{ fontSize: 12, color: soft, lineHeight: 1.5 }}>{n.text}</div>
            <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{fmtDate(n.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  ) : null;

  // ── BOTTOM NAV ──
  const Nav = (
    <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, display: "flex", justifyContent: "space-around", padding: "8px 0 24px", zIndex: 100, background: dk ? "rgba(0,0,0,0.95)" : "rgba(245,241,235,0.95)", borderTop: "1px solid " + border, backdropFilter: "blur(20px)" }}>
      {([["home", "Start", "🏠"], ["journey", "Verlauf", "🕐"], ["progress", "Fortschritt", "€"], ["chat", "Chat", "💬"], ["more", "Mehr", "⋯"]] as [Tab, string, string][]).map(([id, label, icon]) => (
        <button key={id} onClick={() => setTab(id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 14px", color: tab === id ? grn : navInactive, fontSize: 10, fontWeight: 600, fontFamily: "inherit" }}>
          <span style={{ fontSize: id === "progress" ? 18 : 16, fontFamily: id === "progress" ? "'Fraunces', serif" : "inherit", fontWeight: id === "progress" ? 700 : 400 }}>{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );

  // ═══ HOME TAB ═══
  const HomeTab = (
    <div>
      {Header}
      {HintBanner}
      {NotifsDD}
      <div style={{ padding: "16px 20px 0" }}>
        <p style={{ fontSize: 13, color: muted }}>Willkommen zurück</p>
        <h1 style={{ ...hd, fontSize: 24, fontWeight: 800, color: fg }}>Hallo, {firstName}</h1>
      </div>
      <div style={{ ...card, margin: "16px 20px 14px", background: dk ? "rgba(74,222,128,0.04)" : "rgba(34,197,94,0.03)", border: "1px solid " + (dk ? "rgba(74,222,128,0.12)" : "rgba(34,197,94,0.1)") }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ ...lb, color: grn, marginBottom: 4 }}>Aktuelle Phase</div>
            <div style={{ ...hd, fontSize: 19, fontWeight: 700, color: fg }}>{activePhase ? activePhase.name : "Keine Phase"}</div>
          </div>
          {activePhase && <span style={{ padding: "4px 11px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)", color: grn }}>Phase {activePhase.reihenfolge}/{phasen.length}</span>}
        </div>
        {phasen.length > 0 && (
          <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
            {phasen.map(ph => (
              <div key={ph.id} style={{ flex: 1, height: 5, borderRadius: 3, background: ph.status === "abgeschlossen" ? grn : ph.status === "aktiv" ? purple : (dk ? "#252525" : "#e0d8cc") }} />
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {[["Investiert", pct + "%", grn], ["Nächste Rate", dl > 0 ? dl + "T" : "Heute", fg], ["Raten", (rp ? rp.raten_bezahlt : 0) + "/" + (rp ? rp.raten_gesamt : 0), fg]].map(([l, v, c], i) => (
            <div key={i} style={{ flex: 1, borderRadius: 12, padding: "12px 8px", textAlign: "center", background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: "1px solid " + border }}>
              <div style={{ ...lb, marginBottom: 3 }}>{l as string}</div>
              <div style={{ ...hd, fontSize: 20, fontWeight: 800, color: c as string }}>{v as string}</div>
            </div>
          ))}
        </div>
      </div>
      {badges.length > 0 && (
        <div style={{ padding: "0 20px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ ...hd, fontSize: 15, fontWeight: 700, color: fg }}>Erfolge</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: muted }}>{badges.filter(b => b.freigeschaltet).length}/{badges.length}</span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {badges.map(b => (
              <div key={b.id} onClick={() => setPopup(b)} style={{ minWidth: 76, padding: "14px 8px", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", background: cardBg, border: "1px solid " + border, opacity: b.freigeschaltet ? 1 : 0.3 }}>
                <span style={{ fontSize: 28 }}>{b.icon}</span>
                <span style={{ fontSize: 9, fontWeight: 600, textAlign: "center", lineHeight: 1.2, color: soft }}>{b.titel}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 20px", marginBottom: 14 }}>
        <div onClick={() => setTab("chat")} style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, cursor: "pointer", background: cardBg, border: "1px solid " + border }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, background: dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.06)" }}>💬</div>
          <div><div style={{ fontSize: 14, fontWeight: 700, color: fg }}>Nachricht</div><div style={{ fontSize: 12, color: muted }}>an die Praxis</div></div>
        </div>
        <div onClick={() => setTab("more")} style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, cursor: "pointer", background: cardBg, border: "1px solid " + border }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, background: dk ? "rgba(167,139,250,0.08)" : "rgba(124,58,237,0.06)" }}>📄</div>
          <div><div style={{ fontSize: 14, fontWeight: 700, color: fg }}>Dokumente</div><div style={{ fontSize: 12, color: muted }}>Verträge & Pläne</div></div>
        </div>
      </div>
      {tipps.length > 0 && (
        <div style={{ margin: "0 20px 14px", borderRadius: 14, padding: 16, background: dk ? "rgba(251,191,36,0.05)" : "rgba(234,179,80,0.05)", border: "1px solid " + (dk ? "rgba(251,191,36,0.12)" : "rgba(234,179,80,0.12)") }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: warn, marginBottom: 6 }}>💡 Tipp für deine Phase</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: soft }}>{tipps[0].text}</div>
        </div>
      )}
    </div>
  );

  // ═══ JOURNEY TAB ═══
  const JourneyTab = (
    <div>
      {Header}
      {HintBanner}
      <div style={{ padding: "16px 20px 0" }}>
        <h1 style={{ ...hd, fontSize: 23, fontWeight: 800, marginBottom: 2, color: fg }}>Verlauf</h1>
        <p style={{ fontSize: 13, color: muted, marginBottom: 22 }}>Deine Behandlungsreise</p>
      </div>
      <div style={{ position: "relative", paddingLeft: 36, margin: "0 20px" }}>
        <div style={{ position: "absolute", left: 13, top: 8, bottom: 8, width: 2, borderRadius: 2, background: dk ? "#252525" : "#e0d8cc" }} />
        {phasen.map(ph => (
          <div key={ph.id} style={{ position: "relative", marginBottom: 20 }}>
            <div style={{ position: "absolute", left: -30, top: 8, width: 14, height: 14, borderRadius: "50%", background: ph.status === "abgeschlossen" ? grn : ph.status === "aktiv" ? purple : (dk ? "#333" : "#e0d8cc"), boxShadow: ph.status === "aktiv" ? "0 0 10px " + purple + "40" : "none" }} />
            <div style={{ ...card, margin: 0, marginBottom: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ ...hd, fontSize: 16, fontWeight: 700, color: fg }}>{ph.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: ph.status === "abgeschlossen" ? grn : ph.status === "aktiv" ? purple : muted }}>
                  {ph.status === "abgeschlossen" ? "✓ Abgeschlossen" : ph.status === "aktiv" ? "● Aktiv" : "Bald"}
                </span>
              </div>
              {ph.start_datum && <p style={{ fontSize: 12, color: muted, marginBottom: 6 }}>{fmtShort(ph.start_datum)}{ph.end_datum ? " — " + fmtShort(ph.end_datum) : " — heute"}</p>}
              {ph.beschreibung && <p style={{ fontSize: 13, lineHeight: 1.55, color: soft }}>{ph.beschreibung}</p>}
            </div>
          </div>
        ))}
      </div>
      {tipps.length > 0 && (
        <div style={{ padding: "12px 20px 0" }}>
          <p style={{ ...hd, fontSize: 15, fontWeight: 700, marginBottom: 12, color: fg }}>Pflegetipps</p>
          {tipps.map(t => (
            <div key={t.id} style={{ borderRadius: 14, padding: 16, marginBottom: 10, background: dk ? "rgba(251,191,36,0.05)" : "rgba(234,179,80,0.05)", border: "1px solid " + (dk ? "rgba(251,191,36,0.12)" : "rgba(234,179,80,0.12)") }}>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: fg }}>{t.titel}</p>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: soft }}>{t.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ═══ PROGRESS TAB ═══
  const circ = 2 * Math.PI * 76;
  const off = circ - (pct / 100) * circ;
  const ProgressTab = (
    <div>
      {Header}
      {HintBanner}
      <div style={{ padding: "16px 20px 0" }}>
        <h1 style={{ ...hd, fontSize: 23, fontWeight: 800, marginBottom: 2, color: fg }}>Dein Fortschritt</h1>
        <p style={{ fontSize: 13, color: muted, marginBottom: 16 }}>Du bist auf einem tollen Weg</p>
      </div>
      <div style={{ textAlign: "center", padding: "0 20px 8px" }}>
        <div style={{ position: "relative", width: 200, height: 200, margin: "0 auto" }}>
          <div style={{ position: "absolute", inset: 6, borderRadius: "50%", background: dk ? "radial-gradient(circle at 45% 40%, #1e1e1e, #0a0a0a)" : "radial-gradient(circle at 45% 40%, #fff, #f0ece4)", boxShadow: dk ? "inset 0 4px 16px rgba(0,0,0,0.6)" : "inset 0 4px 16px rgba(0,0,0,0.04)" }} />
          <svg viewBox="0 0 200 200" style={{ position: "relative", zIndex: 2, transform: "rotate(-90deg)", width: 200, height: 200 }}>
            <circle cx="100" cy="100" r="76" fill="none" stroke={dk ? "#252525" : "#e0d8cc"} strokeWidth="8" />
            <circle cx="100" cy="100" r="76" fill="none" stroke={grn} strokeWidth="8" strokeLinecap="round" strokeDasharray={String(circ)} strokeDashoffset={String(off)} style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 3 }}>
            <span style={{ ...hd, fontSize: 44, fontWeight: 800, color: fg }}>{pct}%</span>
            <span style={{ ...lb, color: grn, marginTop: 2 }}>INVESTIERT</span>
          </div>
        </div>
      </div>
      <div style={{ ...card, margin: "8px 20px 14px", display: "flex", padding: 18 }}>
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ ...hd, fontSize: 18, fontWeight: 800, color: grn }}>{fmtEuro(rp ? rp.investiert : 0)}</div><div style={{ ...lb, marginTop: 2 }}>Investiert</div></div>
        <div style={{ width: 1, background: border }} />
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ ...hd, fontSize: 18, fontWeight: 800, color: fg }}>{fmtEuro(rp ? rp.offen_betrag : 0)}</div><div style={{ ...lb, marginTop: 2 }}>Offen</div></div>
        <div style={{ width: 1, background: border }} />
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ ...hd, fontSize: 18, fontWeight: 800, color: fg }}>{fmtEuro(rp && rp.plan ? rp.plan.gesamtbetrag : 0)}</div><div style={{ ...lb, marginTop: 2 }}>Gesamt</div></div>
      </div>
      {isOverdue && rp && rp.ueberfaellig && (
        <div>
          <div style={{ ...card, margin: "0 20px 14px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...lb, color: red, marginBottom: 4 }}>RATE ÜBERFÄLLIG</div>
              <div style={{ ...hd, fontSize: 30, fontWeight: 800, marginBottom: 2, color: fg }}>{rp.ueberfaellig.betrag.toFixed(2).replace(".", ",")} €</div>
              <div style={{ fontSize: 13, color: muted }}>Seit {fmtShort(rp.ueberfaellig.faellig_am)}</div>
            </div>
            <div style={{ width: 80, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "14px 0", background: dk ? "#1e1e1e" : "#f0ece4" }}>
              <div style={{ ...hd, fontSize: 28, fontWeight: 800, color: fg }}>{rp.raten_bezahlt}</div>
              <div style={{ width: 28, height: 1, background: dk ? "#444" : "#d0c8bc", margin: "4px 0" }} />
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: muted }}>VON {rp.raten_gesamt}</div>
            </div>
          </div>
          <div style={{ margin: "0 20px 14px" }}>
            <button style={{ width: "100%", padding: 18, borderRadius: 16, border: "none", background: red, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Jetzt ausgleichen</button>
          </div>
        </div>
      )}
      {!isOverdue && rp && rp.naechste_rate && (
        <div style={{ ...card, margin: "0 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ ...lb, color: dl <= 5 ? warn : muted, marginBottom: 4 }}>Nächste Rate</div>
            <div style={{ ...hd, fontSize: 26, fontWeight: 800, color: fg }}>{rp.naechste_rate.betrag} €</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{fmtDate(rp.naechste_rate.faellig_am)}</div>
          </div>
          <div style={{ width: 80, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "14px 0", background: dk ? "#1e1e1e" : "#f0ece4" }}>
            <div style={{ ...hd, fontSize: 28, fontWeight: 800, color: fg }}>{rp.raten_bezahlt}</div>
            <div style={{ width: 28, height: 1, background: dk ? "#444" : "#d0c8bc", margin: "4px 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: muted }}>VON {rp.raten_gesamt}</div>
          </div>
        </div>
      )}
      {pays.length > 0 && (
        <div>
          <div style={{ padding: "0 20px" }}><p style={{ ...hd, fontSize: 18, fontWeight: 800, marginBottom: 10, color: fg }}>Historie</p></div>
          <div style={{ ...card, margin: "0 20px 14px", padding: "2px 18px" }}>
            {pays.map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderTop: i > 0 ? "1px solid " + (dk ? "#252525" : "#f0e8dc") : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)", color: grn }}>✓</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: fg }}>Monatsrate</div>
                    <div style={{ fontSize: 11, color: muted }}>{fmtDate(p.bezahlt_am)}</div>
                  </div>
                </div>
                <span style={{ ...hd, fontSize: 15, fontWeight: 700, color: grn }}>{p.betrag} €</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ═══ CHAT TAB ═══
  const ChatTab = (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 90px)" }}>
      <div style={{ padding: "18px 20px 14px" }}>
        <h1 style={{ ...hd, fontSize: 21, fontWeight: 800, color: fg }}>Praxis Chat</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: grn, display: "inline-block" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: grn }}>Praxis Dr. Schubert</span>
        </div>
      </div>
      <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
        {msgs.map(m => (
          <div key={m.id} style={{ display: "flex", marginBottom: 10, justifyContent: m.sender_type === "patient" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "78%", padding: "12px 16px", fontSize: 14, lineHeight: 1.5, borderRadius: 20, ...(m.sender_type === "patient" ? { background: "#22c55e", color: "#fff", borderBottomRightRadius: 4 } : { background: cardBg, color: fg, border: "1px solid " + border, borderBottomLeftRadius: 4 }) }}>
              {m.sender_name && m.sender_type === "praxis" && <div style={{ fontSize: 11, fontWeight: 700, color: grn, marginBottom: 3 }}>{m.sender_name}</div>}
              {m.text}
              <div style={{ fontSize: 10, marginTop: 3, textAlign: "right" as const, color: m.sender_type === "patient" ? "rgba(255,255,255,0.5)" : muted }}>{fmtTime(m.created_at)}</div>
            </div>
          </div>
        ))}
        {typing && (
          <div style={{ display: "flex", marginBottom: 10, justifyContent: "flex-start" }}>
            <div style={{ padding: "14px 18px", borderRadius: 20, borderBottomLeftRadius: 4, background: cardBg, border: "1px solid " + border }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: grn, marginBottom: 4 }}>iCura</div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: grn, opacity: 0.6, animation: "pulse 1.4s infinite" }} />
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: grn, opacity: 0.6, animation: "pulse 1.4s infinite 0.2s" }} />
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: grn, opacity: 0.6, animation: "pulse 1.4s infinite 0.4s" }} />
                <span style={{ fontSize: 12, color: muted, marginLeft: 6 }}>schreibt gerade...</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: "8px 18px", display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 500, background: dk ? "rgba(100,80,200,0.05)" : "rgba(100,80,200,0.03)", borderTop: "1px solid " + (dk ? "rgba(100,80,200,0.08)" : "rgba(100,80,200,0.06)"), color: purple }}>
        🤖 iCura beantwortet häufige Fragen sofort.
      </div>
      <div style={{ padding: "10px 16px", display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid " + border, background: dk ? "rgba(0,0,0,0.95)" : "rgba(245,241,235,0.95)" }}>
        <button style={{ width: 42, height: 42, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: "none", background: dk ? "#141414" : "#e8e2d8" }}>🎤</button>
        <input value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sendMsg(); }} placeholder="Nachricht schreiben..." style={{ flex: 1, padding: "11px 16px", borderRadius: 24, fontSize: 14, outline: "none", fontFamily: "inherit", background: dk ? "#141414" : "#fff", border: "1px solid " + border, color: fg }} />
        <button onClick={sendMsg} style={{ width: 42, height: 42, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", background: msgInput.trim() ? "#22c55e" : btnBg, transition: "background 0.2s" }}>↑</button>
      </div>
    </div>
  );

  // ═══ MORE TAB ═══
  const MoreTab = (
    <div>
      {Header}
      <div style={{ padding: "16px 20px 0" }}>
        <h1 style={{ ...hd, fontSize: 23, fontWeight: 800, marginBottom: 16, color: fg }}>Mehr</h1>
      </div>
      {docs.length > 0 && <div style={{ padding: "0 20px" }}><p style={{ ...hd, fontSize: 15, fontWeight: 700, marginBottom: 10, color: fg }}>Dokumente</p></div>}
      {docs.map(d => (
        <div key={d.id} onClick={() => setDocDrawer(d)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 16px", borderRadius: 14, margin: "0 20px 8px", cursor: "pointer", background: cardBg, border: "1px solid " + border, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", transition: "transform 0.15s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>{docIc[d.typ] || "📄"}</span>
            <div><div style={{ fontSize: 14, fontWeight: 600, color: fg }}>{d.name}</div><div style={{ fontSize: 11, color: muted }}>{fmtDate(d.hochgeladen_am)}</div></div>
          </div>
          <span style={{ fontSize: 16, color: muted }}>↗</span>
        </div>
      ))}
      <div style={{ borderRadius: 18, padding: 28, margin: "18px 20px", textAlign: "center", background: dk ? "rgba(100,80,200,0.06)" : "rgba(100,80,200,0.04)", border: "1px solid " + (dk ? "rgba(100,80,200,0.12)" : "rgba(100,80,200,0.08)") }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🎥</div>
        <h3 style={{ ...hd, fontSize: 17, fontWeight: 700, marginBottom: 6, color: fg }}>Beratungsgespräch</h3>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: soft, marginBottom: 18 }}>Fragen zu deinem Ratenplan? Starte ein Videogespräch mit unserem Praxisberater.</p>
        <button style={{ border: "none", borderRadius: 14, padding: "14px 32px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: "#7c3aed" }}>Gespräch anfragen</button>
      </div>
      <div style={{ ...card, margin: "0 20px 14px" }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: fg }}>Über diese App</p>
        <p style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>Anima Cura Patientenportal — Praxis Dr. Maria Schubert, Leipzig.</p>
      </div>
      <div style={{ padding: "0 20px 16px", textAlign: "center" }}>
        <button onClick={logout} style={{ background: "none", border: "1px solid " + border, borderRadius: 10, padding: "8px 20px", color: muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>Abmelden</button>
        <p style={{ fontSize: 12, color: dk ? "#444" : "#ccc" }}>Datenschutz · Impressum · Kontakt</p>
      </div>
    </div>
  );

  // ═══ RENDER ═══
  return (
    <div style={{ minHeight: "100vh", background: dk ? "linear-gradient(135deg, #050505 0%, #0a0a0a 50%, #080808 100%)" : "linear-gradient(135deg, #ebe5db 0%, #f5f1eb 50%, #ede7dd 100%)" }}>
    <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", background: dk ? "#030806" : "#f5f1eb", color: fg, position: "relative", boxShadow: dk ? "0 0 80px rgba(0,0,0,0.5)" : "0 0 80px rgba(0,0,0,0.08)", overflow: "hidden" }}>
      {/* Bold animated gradient blobs - Gemini style, phase-colored */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        {/* Large primary blob - top area */}
        <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", top: -150, left: -100, background: `radial-gradient(circle, rgba(${blobC.a},${dk ? 0.2 : 0.08}) 0%, rgba(${blobC.a},${dk ? 0.08 : 0.03}) 40%, transparent 70%)`, animation: "blobDrift1 20s ease-in-out infinite", filter: "blur(30px)" }} />
        {/* Secondary blob - mid-left */}
        <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", top: "30%", right: -120, background: `radial-gradient(circle, rgba(${blobC.b},${dk ? 0.15 : 0.06}) 0%, rgba(${blobC.b},${dk ? 0.06 : 0.02}) 40%, transparent 70%)`, animation: "blobDrift2 25s ease-in-out infinite", filter: "blur(30px)" }} />
        {/* Third blob - bottom */}
        <div style={{ position: "absolute", width: 450, height: 450, borderRadius: "50%", bottom: -100, left: -80, background: `radial-gradient(circle, rgba(${blobC.c},${dk ? 0.18 : 0.07}) 0%, rgba(${blobC.c},${dk ? 0.07 : 0.03}) 40%, transparent 70%)`, animation: "blobDrift3 18s ease-in-out infinite", filter: "blur(30px)" }} />
        {/* Accent blob - small, bright, moves more */}
        <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", top: "55%", left: "20%", background: `radial-gradient(circle, rgba(${blobC.a},${dk ? 0.12 : 0.05}) 0%, transparent 60%)`, animation: "blobDrift4 15s ease-in-out infinite", filter: "blur(20px)" }} />
      </div>
      <div style={{ position: "relative", zIndex: 1, paddingBottom: 90 }}>
        {tab === "home" && HomeTab}
        {tab === "journey" && JourneyTab}
        {tab === "progress" && ProgressTab}
        {tab === "chat" && ChatTab}
        {tab === "more" && MoreTab}
      </div>
      {Nav}
      {popup && (
        <div onClick={() => setPopup(null)} style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ borderRadius: 24, padding: "36px 28px", textAlign: "center", maxWidth: 300, width: "100%", background: cardBg, border: "1px solid " + border }}>
            <span style={{ fontSize: 56, display: "block", marginBottom: 16 }}>{popup.icon}</span>
            <h3 style={{ ...hd, fontSize: 22, fontWeight: 700, marginBottom: 8, color: fg }}>{popup.titel}</h3>
            <p style={{ fontSize: 14, color: soft, marginBottom: 18 }}>{popup.beschreibung}</p>
            {popup.freigeschaltet
              ? <span style={{ display: "inline-block", padding: "5px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "rgba(74,222,128,0.1)", color: grn }}>Freigeschaltet ✓</span>
              : <span style={{ display: "inline-block", padding: "5px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: muted }}>Noch nicht erreicht</span>}
            <button onClick={() => setPopup(null)} style={{ display: "block", margin: "18px auto 0", background: "none", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", color: soft }}>Schließen</button>
          </div>
        </div>
      )}
      {/* Document Bottom Sheet Drawer - Framer Motion */}
      <AnimatePresence>
        {docDrawer && (
          <motion.div
            key="doc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setDocDrawer(null)}
            style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          >
            <motion.div
              key="doc-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.1}
              onDragEnd={(_e, info) => { if (info.offset.y > 100 || info.velocity.y > 500) setDocDrawer(null); }}
              onClick={e => e.stopPropagation()}
              style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "85vh", borderRadius: "24px 24px 0 0", background: dk ? "rgba(18,18,18,0.95)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid " + (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"), borderBottom: "none", overflow: "hidden" }}
            >
              {/* Handle bar */}
              <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px", cursor: "grab" }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: dk ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }} />
              </div>
              {/* Header */}
              <div style={{ padding: "4px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.3 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: grn, marginBottom: 4 }}>{docDrawer.typ.charAt(0).toUpperCase() + docDrawer.typ.slice(1)}</div>
                  <h3 style={{ ...hd, fontSize: 20, fontWeight: 800, color: fg }}>{docDrawer.name}</h3>
                  <p style={{ fontSize: 12, color: muted, marginTop: 2 }}>Hochgeladen am {fmtDate(docDrawer.hochgeladen_am)}</p>
                </motion.div>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setDocDrawer(null)} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, color: muted }}>✕</motion.button>
              </div>
              {/* Mock PDF Preview */}
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.35 }} style={{ margin: "0 24px", borderRadius: 16, padding: 24, background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: "1px solid " + (dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"), minHeight: 280 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 20 }}>📄</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: fg }}>{docDrawer.name}</div>
                    <div style={{ fontSize: 11, color: muted }}>PDF · Praxis Dr. Schubert</div>
                  </div>
                </div>
                {/* Skeleton wireframe lines with staggered entrance */}
                {[100, 85, 92, 60, 88, 75, 95, 40].map((w, i) => (
                  <motion.div key={i} initial={{ opacity: 0, scaleX: 0.3 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ delay: 0.25 + i * 0.04, duration: 0.3 }} style={{ height: 8, borderRadius: 4, marginBottom: 10, width: w + "%", background: dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", transformOrigin: "left", animation: `skeletonPulse 2.5s ease-in-out infinite ${i * 0.12}s` }} />
                ))}
                {/* Skeleton signature area */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid " + (dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"), display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ height: 6, width: 80, borderRadius: 3, background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", marginBottom: 6 }} />
                    <div style={{ height: 6, width: 120, borderRadius: 3, background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
                  </div>
                  <div style={{ width: 50, height: 50, borderRadius: 8, background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 10, color: muted }}>Siegel</span>
                  </div>
                </motion.div>
              </motion.div>
              {/* Action buttons */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.3 }} style={{ display: "flex", gap: 10, padding: "20px 24px 32px" }}>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "1px solid " + (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"), background: "transparent", color: fg, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  📤 Teilen
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "none", background: grn, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  ⬇ Herunterladen
                </motion.button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <style>{fontCss}{`
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes blobDrift1 { 0% { transform: translate(0, 0) scale(1); } 25% { transform: translate(30px, 40px) scale(1.1); } 50% { transform: translate(-20px, 60px) scale(0.95); } 75% { transform: translate(15px, 20px) scale(1.05); } 100% { transform: translate(0, 0) scale(1); } }
        @keyframes blobDrift2 { 0% { transform: translate(0, 0) scale(1); } 25% { transform: translate(-35px, -25px) scale(1.08); } 50% { transform: translate(20px, -40px) scale(0.92); } 75% { transform: translate(-10px, 15px) scale(1.04); } 100% { transform: translate(0, 0) scale(1); } }
        @keyframes blobDrift3 { 0% { transform: translate(0, 0) scale(1); } 33% { transform: translate(25px, -30px) scale(1.12); } 66% { transform: translate(-30px, 20px) scale(0.9); } 100% { transform: translate(0, 0) scale(1); } }
        @keyframes blobDrift4 { 0% { transform: translate(0, 0) scale(1); opacity: 0.8; } 25% { transform: translate(40px, -20px) scale(1.15); opacity: 1; } 50% { transform: translate(-15px, 35px) scale(0.85); opacity: 0.6; } 75% { transform: translate(25px, 10px) scale(1.1); opacity: 0.9; } 100% { transform: translate(0, 0) scale(1); opacity: 0.8; } }
        @keyframes slideUp { 0% { transform: translateY(100%); } 100% { transform: translateY(0); } }
        @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes skeletonPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
      `}</style>
    </div>
    </div>
  );
}

const fontCss = "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800&display=swap');";
