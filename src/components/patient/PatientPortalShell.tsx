"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/db/supabase";

// ─── Types ────────────────────────────────────────────────────────
interface Props { patientId: string; patientName: string; patientEmail: string }
interface RatenplanData {
  plan: { gesamtbetrag: number; anzahl_raten: number; rate_betrag: number };
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

// ─── Helpers ──────────────────────────────────────────────────────
const fmtDate = (d: string) => new Date(d).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
const fmtShort = (d: string) => new Date(d).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const fmtEuro = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 0 }) + " €";
const daysTill = (d: string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 864e5));

// ─── Doc type icons ───────────────────────────────────────────────
const docIcon: Record<string, string> = { kostenplan: "📋", vertrag: "📝", ratenzahlung: "📝", datenschutz: "🔒", sonstiges: "📄" };

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function PatientPortalShell({ patientName }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");
  const [dk, setDk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [nOpen, setNOpen] = useState(false);
  const [popup, setPopup] = useState<Badge | null>(null);
  const [msgInput, setMsgInput] = useState("");

  const [rp, setRp] = useState<RatenplanData | null>(null);
  const [phasen, setPhasen] = useState<Phase[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tipps, setTipps] = useState<Tipp[]>([]);
  const [pays, setPays] = useState<Zahlung[]>([]);

  const fetchAll = useCallback(async () => {
    const endpoints = ["ratenplan","behandlung","badges","nachrichten","benachrichtigungen","dokumente","tipps","zahlungen"];
    const results = await Promise.allSettled(endpoints.map(e => fetch(`/api/patient/${e}`)));
    const jsons = await Promise.all(results.map(async (r, i) => {
      if (r.status === "fulfilled" && r.value.ok) return r.value.json();
      return null;
    }));
    if (jsons[0]) setRp(jsons[0]);
    if (jsons[1]) setPhasen(jsons[1].phasen ?? []);
    if (jsons[2]) setBadges(jsons[2].badges ?? []);
    if (jsons[3]) setMsgs(jsons[3].nachrichten ?? []);
    if (jsons[4]) setNotifs(jsons[4].benachrichtigungen ?? []);
    if (jsons[5]) setDocs(jsons[5].dokumente ?? []);
    if (jsons[6]) setTipps(jsons[6].tipps ?? []);
    if (jsons[7]) setPays(jsons[7].zahlungen ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const sendMsg = async () => {
    const text = msgInput.trim();
    if (!text) return;
    setMsgInput("");
    const res = await fetch("/api/patient/nachrichten", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.nachricht) setMsgs(prev => [...prev, d.nachricht]);
    }
  };

  const logout = async () => {
    const sb = createBrowserClient();
    await sb.auth.signOut();
    router.replace("/patient/login");
    router.refresh();
  };

  // Derived
  const firstName = patientName.split(" ")[0];
  const activePhase = phasen.find(p => p.status === "aktiv");
  const unread = notifs.filter(n => !n.gelesen).length;
  const isOverdue = !!rp?.ueberfaellig;
  const dl = rp?.naechste_rate ? daysTill(rp.naechste_rate.faellig_am) : 99;

  // Styles based on theme
  const bg = dk ? "#000" : "#f5f1eb";
  const fg = dk ? "#e5e5e5" : "#222";
  const card = dk ? "#111" : "#fff";
  const border = dk ? "#1a1a1a" : "#e0d8cc";
  const muted = dk ? "#555" : "#999";
  const soft = dk ? "#888" : "#666";
  const grn = dk ? "#4ade80" : "#22c55e";
  const red = "#ef4444";
  const warn = dk ? "#eab308" : "#b08930";
  const purple = dk ? "#a78bfa" : "#7c3aed";
  const btnBg = dk ? "#1a1a1a" : "#e8e2d8";

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: bg, fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: "'Fraunces',serif", margin: "0 auto 16px" }}>A</div>
          <p style={{ color: muted, fontSize: 14 }}>Wird geladen...</p>
        </div>
        <style>{fontImport}</style>
      </div>
    );
  }

  // ─── Header ───────────────────────────────────────────────────
  const Header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: "'Fraunces',serif" }}>A</div>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700 }}>Anima Cura</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setDk(!dk)} style={{ width: 42, height: 42, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: btnBg, color: muted }}>{dk ? "☀️" : "🌙"}</button>
        <button onClick={() => setNOpen(!nOpen)} style={{ width: 42, height: 42, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, position: "relative", background: btnBg }}>
          🔔
          {unread > 0 && <span style={{ position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: red, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unread}</span>}
        </button>
      </div>
    </div>
  );

  // ─── Hint Banner ──────────────────────────────────────────────
  const HintBanner = isOverdue ? (
    <div style={{ margin: "16px 20px 0", padding: "16px 18px", borderRadius: 16, display: "flex", gap: 14, alignItems: "flex-start", background: dk ? "rgba(80,20,15,0.4)" : "rgba(220,80,70,0.06)", border: `1px solid ${dk ? "rgba(200,60,50,0.2)" : "rgba(200,60,50,0.12)"}` }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: dk ? "rgba(200,50,40,0.25)" : "rgba(200,50,40,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: red, flexShrink: 0 }}>!</div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: dk ? "#d4b0a8" : "#7a4a42" }}>
        <strong>Hinweis:</strong> Es gibt eine kleine Verzögerung bei Ihrer letzten Rate. Bitte prüfen Sie dies kurz im Fortschritt-Reiter, damit Ihr Verlauf reibungslos weitergeht.
      </div>
    </div>
  ) : null;

  // ─── Notifications Dropdown ───────────────────────────────────
  const NotifsDropdown = nOpen ? (
    <div style={{ padding: "12px 20px 0" }}>
      {notifs.map(n => (
        <div key={n.id} style={{ padding: 14, borderRadius: 14, marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start", background: card, border: `1px solid ${!n.gelesen ? (dk ? "rgba(74,222,128,0.15)" : "rgba(34,197,94,0.12)") : border}` }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0, background: n.typ === "warnung" ? red : n.typ === "eingang" ? grn : warn }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{n.titel}</div>
            <div style={{ fontSize: 12, color: soft, lineHeight: 1.5 }}>{n.text}</div>
            <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{fmtDate(n.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  ) : null;

  // ─── Card helper ──────────────────────────────────────────────
  const Card = ({ children, style: s, ...rest }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) => (
    <div style={{ borderRadius: 18, padding: 22, margin: "0 20px 14px", background: card, border: `1px solid ${border}`, ...s }} {...rest}>{children}</div>
  );

  // ─── Bottom Nav ───────────────────────────────────────────────
  const Nav = (
    <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, display: "flex", justifyContent: "space-around", padding: "8px 0 24px", zIndex: 100, background: dk ? "rgba(0,0,0,0.92)" : "rgba(245,241,235,0.92)", borderTop: `1px solid ${border}`, backdropFilter: "blur(20px)" }}>
      {([["home","Start","🏠"],["journey","Verlauf","🕐"],["progress","Fortschritt","€"],["chat","Chat","💬"],["more","Mehr","⋯"]] as [Tab, string, string][]).map(([id,label,icon]) => (
        <button key={id} onClick={() => setTab(id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 14px", color: tab === id ? grn : (dk ? "#333" : "#bbb"), fontSize: 10, fontWeight: 600, fontFamily: "inherit" }}>
          <span style={{ fontSize: id === "progress" ? 18 : 16, fontFamily: id === "progress" ? "'Fraunces',serif" : "inherit", fontWeight: id === "progress" ? 700 : 400 }}>{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );

  // ═════════════════════════════════════════════════════════════════
  // TAB: HOME
  // ═════════════════════════════════════════════════════════════════
  const HomeContent = (
    <>
      {Header}
      {HintBanner}
      {NotifsDropdown}

      {/* Greeting */}
      <div style={{ padding: "16px 20px 0" }}>
        <p style={{ fontSize: 13, color: muted }}>Willkommen zurück</p>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 800 }}>Hallo, {firstName}</h1>
      </div>

      {/* Phase Card */}
      <Card style={{ marginTop: 16, background: dk ? "rgba(74,222,128,0.03)" : "rgba(34,197,94,0.03)", border: `1px solid ${dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.1)"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: grn, marginBottom: 4 }}>Aktuelle Phase</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 700 }}>{activePhase?.name ?? "Keine Phase"}</div>
          </div>
          {activePhase && <span style={{ padding: "4px 11px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.06)", color: grn }}>Phase {activePhase.reihenfolge}/{phasen.length}</span>}
        </div>
        {/* Phase bar */}
        <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
          {phasen.map(ph => (
            <div key={ph.id} style={{ flex: 1, height: 5, borderRadius: 3, background: ph.status === "abgeschlossen" ? grn : ph.status === "aktiv" ? purple : (dk ? "#1a1a1a" : "#e0d8cc") }} />
          ))}
        </div>
        {/* Stats */}
        <div style={{ display: "flex", gap: 8 }}>
          {[
            ["Investiert", (rp?.prozent ?? 0) + "%", true],
            ["Nächste Rate", dl > 0 ? dl + "T" : "Heute", false],
            ["Raten", `${rp?.raten_bezahlt ?? 0}/${rp?.raten_gesamt ?? 0}`, false],
          ].map(([label, value, isGreen], i) => (
            <div key={i} style={{ flex: 1, borderRadius: 12, padding: "12px 8px", textAlign: "center", background: dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: muted, marginBottom: 3 }}>{label as string}</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 800, color: isGreen ? grn : fg }}>{value as string}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Badges */}
      {badges.length > 0 && (
        <div style={{ padding: "0 20px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700 }}>Erfolge</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: muted }}>{badges.filter(b => b.freigeschaltet).length}/{badges.length}</span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {badges.map(b => (
              <div key={b.id} onClick={() => setPopup(b)} style={{ minWidth: 76, padding: "14px 8px", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", background: card, border: `1px solid ${border}`, opacity: b.freigeschaltet ? 1 : 0.25, transition: "transform 0.2s" }}>
                <span style={{ fontSize: 28 }}>{b.icon}</span>
                <span style={{ fontSize: 9, fontWeight: 600, textAlign: "center", lineHeight: 1.2, color: soft }}>{b.titel}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 20px", marginBottom: 14 }}>
        <div onClick={() => setTab("chat")} style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, cursor: "pointer", background: card, border: `1px solid ${border}` }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, background: dk ? "rgba(74,222,128,0.06)" : "rgba(34,197,94,0.06)" }}>💬</div>
          <div><div style={{ fontSize: 14, fontWeight: 700 }}>Nachricht</div><div style={{ fontSize: 12, color: muted }}>an die Praxis</div></div>
        </div>
        <div onClick={() => setTab("more")} style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, cursor: "pointer", background: card, border: `1px solid ${border}` }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, background: dk ? "rgba(167,139,250,0.06)" : "rgba(124,58,237,0.06)" }}>📄</div>
          <div><div style={{ fontSize: 14, fontWeight: 700 }}>Dokumente</div><div style={{ fontSize: 12, color: muted }}>Verträge & Pläne</div></div>
        </div>
      </div>

      {/* Tip */}
      {tipps.length > 0 && (
        <div style={{ margin: "0 20px 14px", borderRadius: 14, padding: 16, background: dk ? "rgba(234,179,80,0.04)" : "rgba(234,179,80,0.05)", border: `1px solid ${dk ? "rgba(234,179,80,0.1)" : "rgba(234,179,80,0.12)"}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: warn, marginBottom: 6 }}>💡 Tipp für deine Phase</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: soft }}>{tipps[0].text}</div>
        </div>
      )}
    </>
  );

  // ═════════════════════════════════════════════════════════════════
  // TAB: JOURNEY (Verlauf)
  // ═════════════════════════════════════════════════════════════════
  const JourneyContent = (
    <>
      {Header}
      {HintBanner}
      <div style={{ padding: "16px 20px 0" }}>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 23, fontWeight: 800, marginBottom: 2 }}>Verlauf</h1>
        <p style={{ fontSize: 13, color: muted, marginBottom: 22 }}>Deine Behandlungsreise</p>
      </div>

      {/* Timeline */}
      <div style={{ position: "relative", paddingLeft: 36, margin: "0 20px" }}>
        {/* Line */}
        <div style={{ position: "absolute", left: 13, top: 8, bottom: 8, width: 2, borderRadius: 2, background: `linear-gradient(to bottom, ${grn} 0%, ${grn} ${phasen.length > 0 ? Math.round((phasen.filter(p => p.status === "abgeschlossen").length / phasen.length) * 100) : 0}%, ${border} ${phasen.length > 0 ? Math.round((phasen.filter(p => p.status === "abgeschlossen").length / phasen.length) * 100) : 0}%)` }} />
        {phasen.map(ph => (
          <div key={ph.id} style={{ position: "relative", marginBottom: 20 }}>
            <div style={{ position: "absolute", left: -30, top: 8, width: 14, height: 14, borderRadius: "50%", background: ph.status === "abgeschlossen" ? grn : ph.status === "aktiv" ? purple : (dk ? "#222" : "#e0d8cc"), boxShadow: ph.status === "aktiv" ? `0 0 10px ${purple}40` : ph.status === "abgeschlossen" ? `0 0 8px ${grn}30` : "none" }} />
            <div style={{ borderRadius: 16, padding: 18, background: card, border: `1px solid ${ph.status === "aktiv" ? (dk ? `${purple}25` : `${purple}18`) : border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700 }}>{ph.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 8, color: ph.status === "abgeschlossen" ? grn : ph.status === "aktiv" ? purple : muted }}>
                  {ph.status === "abgeschlossen" ? "✓ Abgeschlossen" : ph.status === "aktiv" ? "● Aktiv" : "Bald"}
                </span>
              </div>
              {ph.start_datum && <p style={{ fontSize: 12, color: muted, marginBottom: 6 }}>{fmtShort(ph.start_datum)}{ph.end_datum ? ` — ${fmtShort(ph.end_datum)}` : " — heute"}</p>}
              {ph.beschreibung && <p style={{ fontSize: 13, lineHeight: 1.55, color: soft }}>{ph.beschreibung}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Tips */}
      {tipps.length > 0 && (
        <div style={{ padding: "12px 20px 0" }}>
          <p style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Pflegetipps</p>
          {tipps.map(t => (
            <div key={t.id} style={{ borderRadius: 14, padding: 16, marginBottom: 10, background: dk ? "rgba(234,179,80,0.04)" : "rgba(234,179,80,0.05)", border: `1px solid ${dk ? "rgba(234,179,80,0.1)" : "rgba(234,179,80,0.12)"}` }}>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t.titel}</p>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: soft }}>{t.text}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ═════════════════════════════════════════════════════════════════
  // TAB: PROGRESS (Fortschritt)
  // ═════════════════════════════════════════════════════════════════
  const pct = rp?.prozent ?? 0;
  const circ = 2 * Math.PI * 76;
  const off = circ - (pct / 100) * circ;
  const ProgressContent = (
    <>
      {Header}
      {HintBanner}
      <div style={{ padding: "16px 20px 0" }}>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 23, fontWeight: 800, marginBottom: 2 }}>Dein Fortschritt</h1>
        <p style={{ fontSize: 13, color: muted, marginBottom: 16 }}>Du bist auf einem tollen Weg</p>
      </div>

      {/* Ring */}
      <div style={{ textAlign: "center", padding: "0 20px 8px" }}>
        <div style={{ position: "relative", width: 200, height: 200, margin: "0 auto" }}>
          <div style={{ position: "absolute", inset: 6, borderRadius: "50%", background: dk ? "radial-gradient(circle at 45% 40%,#1a1a1a,#0a0a0a)" : "radial-gradient(circle at 45% 40%,#fff,#f0ece4)", boxShadow: dk ? "inset 0 4px 16px rgba(0,0,0,0.6)" : "inset 0 4px 16px rgba(0,0,0,0.04)" }} />
          <svg viewBox="0 0 200 200" style={{ position: "relative", zIndex: 2, transform: "rotate(-90deg)", filter: `drop-shadow(0 0 10px ${grn}20)`, width: 200, height: 200 }}>
            <circle cx="100" cy="100" r="76" fill="none" stroke={border} strokeWidth="8" />
            <circle cx="100" cy="100" r="76" fill="none" stroke="url(#pg)" strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)" }} />
            <defs><linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#4ade80" /><stop offset="100%" stopColor="#22c55e" /></linearGradient></defs>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 3 }}>
            <span style={{ fontFamily: "'Fraunces',serif", fontSize: 44, fontWeight: 800 }}>{pct}%</span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: grn, marginTop: 2 }}>Investiert</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <Card style={{ display: "flex", padding: 18 }}>
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 800, color: grn }}>{fmtEuro(rp?.investiert ?? 0)}</div><div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: muted, marginTop: 2 }}>Investiert</div></div>
        <div style={{ width: 1, background: border }} />
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 800 }}>{fmtEuro(rp?.offen_betrag ?? 0)}</div><div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: muted, marginTop: 2 }}>Offen</div></div>
        <div style={{ width: 1, background: border }} />
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 800 }}>{fmtEuro(rp?.plan?.gesamtbetrag ?? 0)}</div><div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: muted, marginTop: 2 }}>Gesamt</div></div>
      </Card>

      {/* Overdue card */}
      {isOverdue && rp?.ueberfaellig && (
        <>
          <Card style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: red, marginBottom: 4 }}>Rate überfällig</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 30, fontWeight: 800, marginBottom: 2 }}>{rp.ueberfaellig.betrag.toFixed(2).replace(".", ",")} €</div>
              <div style={{ fontSize: 13, color: muted }}>Seit {fmtShort(rp.ueberfaellig.faellig_am)}</div>
            </div>
            <div style={{ width: 80, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "14px 0", background: dk ? "#1a1a1a" : "#f0ece4" }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 800 }}>{rp?.raten_bezahlt ?? 0}</div>
              <div style={{ width: 28, height: 1, background: dk ? "#333" : "#d0c8bc", margin: "4px 0" }} />
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: muted }}>VON {rp?.raten_gesamt ?? 0}</div>
            </div>
          </Card>
          <div style={{ margin: "0 20px 14px" }}>
            <button style={{ width: "100%", padding: 18, borderRadius: 16, border: "none", background: red, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Jetzt ausgleichen</button>
          </div>
        </>
      )}

      {/* Normal next rate (when not overdue) */}
      {!isOverdue && rp?.naechste_rate && (
        <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: dl <= 5 ? warn : muted, marginBottom: 4 }}>Nächste Rate</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800 }}>{rp.naechste_rate.betrag} €</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{fmtDate(rp.naechste_rate.faellig_am)}</div>
          </div>
          <div style={{ width: 80, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "14px 0", background: dk ? "#1a1a1a" : "#f0ece4" }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 800 }}>{rp?.raten_bezahlt ?? 0}</div>
            <div style={{ width: 28, height: 1, background: dk ? "#333" : "#d0c8bc", margin: "4px 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: muted }}>VON {rp?.raten_gesamt ?? 0}</div>
          </div>
        </Card>
      )}

      {/* Payment History */}
      {pays.length > 0 && (
        <>
          <div style={{ padding: "0 20px" }}><p style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Historie</p></div>
          <Card style={{ padding: "2px 18px" }}>
            {pays.map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderTop: i > 0 ? `1px solid ${dk ? "#1a1a1a" : "#f0e8dc"}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.06)", color: grn }}>✓</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Monatsrate</div>
                    <div style={{ fontSize: 11, color: muted }}>{fmtDate(p.bezahlt_am)}</div>
                  </div>
                </div>
                <span style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: grn }}>{p.betrag} €</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );

  // ═════════════════════════════════════════════════════════════════
  // TAB: CHAT
  // ═════════════════════════════════════════════════════════════════
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chatRef.current && tab === "chat") chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [msgs, tab]);

  const ChatContent = (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 90px)" }}>
      <div style={{ padding: "18px 20px 14px" }}>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 21, fontWeight: 800 }}>Praxis Chat</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: grn, display: "inline-block", boxShadow: `0 0 6px ${grn}60` }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: grn }}>Praxis Dr. Schubert</span>
        </div>
      </div>

      <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
        {msgs.map(m => (
          <div key={m.id} style={{ display: "flex", marginBottom: 10, justifyContent: m.sender_type === "patient" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "78%", padding: "12px 16px", fontSize: 14, lineHeight: 1.5, borderRadius: 20,
              ...(m.sender_type === "patient"
                ? { background: "#22c55e", color: "#fff", borderBottomRightRadius: 4 }
                : { background: card, border: `1px solid ${border}`, borderBottomLeftRadius: 4 }),
            }}>
              {m.sender_name && m.sender_type === "praxis" && <div style={{ fontSize: 11, fontWeight: 700, color: grn, marginBottom: 3 }}>{m.sender_name}</div>}
              {m.text}
              <div style={{ fontSize: 10, marginTop: 3, textAlign: "right", color: m.sender_type === "patient" ? "rgba(255,255,255,0.5)" : muted }}>{fmtTime(m.created_at)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* iCura banner */}
      <div style={{ padding: "8px 18px", display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 500, background: dk ? "rgba(100,80,200,0.04)" : "rgba(100,80,200,0.03)", borderTop: `1px solid ${dk ? "rgba(100,80,200,0.06)" : "rgba(100,80,200,0.06)"}`, color: purple }}>
        <span>🤖</span> iCura beantwortet häufige Fragen sofort.
      </div>

      {/* Input */}
      <div style={{ padding: "10px 16px", display: "flex", gap: 8, alignItems: "center", borderTop: `1px solid ${border}`, background: dk ? "rgba(0,0,0,0.95)" : "rgba(245,241,235,0.95)" }}>
        <button style={{ width: 42, height: 42, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: "none", background: dk ? "#111" : "#e8e2d8" }}>🎤</button>
        <input
          value={msgInput} onChange={e => setMsgInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMsg()}
          placeholder="Nachricht schreiben..."
          style={{ flex: 1, padding: "11px 16px", borderRadius: 24, fontSize: 14, outline: "none", fontFamily: "inherit", background: dk ? "#111" : "#fff", border: `1px solid ${border}`, color: fg }}
        />
        <button onClick={sendMsg} style={{ width: 42, height: 42, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", background: msgInput.trim() ? "#22c55e" : (dk ? "#1a1a1a" : "#e8e2d8"), transition: "background 0.2s" }}>↑</button>
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════
  // TAB: MORE
  // ═════════════════════════════════════════════════════════════════
  const MoreContent = (
    <>
      {Header}
      <div style={{ padding: "16px 20px 0" }}>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 23, fontWeight: 800, marginBottom: 16 }}>Mehr</h1>
      </div>

      {/* Documents */}
      {docs.length > 0 && (
        <div style={{ padding: "0 20px" }}>
          <p style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Dokumente</p>
        </div>
      )}
      {docs.map(d => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 16px", borderRadius: 14, margin: "0 20px 8px", cursor: "pointer", background: card, border: `1px solid ${border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>{docIcon[d.typ] ?? "📄"}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: muted }}>{fmtDate(d.hochgeladen_am)}</div>
            </div>
          </div>
          <span style={{ fontSize: 16, color: muted }}>↗</span>
        </div>
      ))}

      {/* Video Consult */}
      <div style={{ borderRadius: 18, padding: 28, margin: "18px 20px", textAlign: "center", background: dk ? "rgba(100,80,200,0.06)" : "rgba(100,80,200,0.04)", border: `1px solid ${dk ? "rgba(100,80,200,0.1)" : "rgba(100,80,200,0.08)"}` }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🎥</div>
        <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Beratungsgespräch</h3>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: soft, marginBottom: 18 }}>Fragen zu deinem Ratenplan? Starte ein Videogespräch mit unserem Praxisberater.</p>
        <button style={{ border: "none", borderRadius: 14, padding: "14px 32px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: "#7c3aed", boxShadow: "0 4px 16px rgba(124,58,237,0.2)" }}>Gespräch anfragen</button>
      </div>

      {/* About */}
      <Card>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Über diese App</p>
        <p style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>Anima Cura Patientenportal — Praxis Dr. Maria Schubert, Leipzig.</p>
      </Card>

      {/* Logout + Legal */}
      <div style={{ padding: "0 20px 16px", textAlign: "center" }}>
        <button onClick={logout} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 10, padding: "8px 20px", color: muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>Abmelden</button>
        <p style={{ fontSize: 12, color: dk ? "#222" : "#ccc" }}>Datenschutz · Impressum · Kontakt</p>
      </div>
    </>
  );

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", fontFamily: "'DM Sans',sans-serif", background: bg, color: fg, position: "relative" }}>
      <div style={{ paddingBottom: tab === "chat" ? 0 : 90 }}>
        {tab === "home" && HomeContent}
        {tab === "journey" && JourneyContent}
        {tab === "progress" && ProgressContent}
        {tab === "chat" && ChatContent}
        {tab === "more" && MoreContent}
      </div>
      {tab !== "chat" && Nav}
      {tab === "chat" && Nav}

      {/* Badge Popup */}
      {popup && (
        <div onClick={() => setPopup(null)} style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ borderRadius: 24, padding: "36px 28px", textAlign: "center", maxWidth: 300, width: "100%", background: card, border: `1px solid ${border}` }}>
            <span style={{ fontSize: 56, display: "block", marginBottom: 16 }}>{popup.icon}</span>
            <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{popup.titel}</h3>
            <p style={{ fontSize: 14, color: soft, marginBottom: 18 }}>{popup.beschreibung}</p>
            {popup.freigeschaltet
              ? <span style={{ display: "inline-block", padding: "5px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${grn}15`, color: grn }}>Freigeschaltet ✓</span>
              : <span style={{ display: "inline-block", padding: "5px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", color: muted }}>Noch nicht erreicht</span>}
            <button onClick={() => setPopup(null)} style={{ display: "block", margin: "18px auto 0", background: "none", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", color: soft }}>Schließen</button>
          </div>
        </div>
      )}

      <style>{fontImport}</style>
    </div>
  );
}

const fontImport = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800&display=swap');`;
