"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/hooks/useAppStore";

interface BehaviorSignal { text: string; type: "positive" | "neutral" | "warning" | "info"; }
interface Delta { metric: string; previous: number; current: number; change_pct: number; }
interface PatientRisk {
  id: string; name: string; count: number; details: Record<string, number>;
  age?: number; versicherung?: string;
  risk_level?: "high" | "medium" | "low";
  signals?: BehaviorSignal[];
  context_tags?: string[];
  observation?: string;
  activity_summary?: { app_opens_14d: number; total_events: number; last_active_days: number | null; most_used_tab: string | null; avg_session_seconds: number | null; primary_device: string | null; primary_time_of_day: string | null };
  deltas?: Delta[];
  stress_indicators?: string[];
  absence_signals?: string[];
  trend?: string;
}
interface EngData {
  total_events: number; active_patients: number; by_type: Record<string, number>;
  daily: { date: string; count: number }[];
  top_patients: PatientRisk[];
  breakdown?: any;
}
interface ActivityEvent { patient_name: string; patient_id: string; event_type: string; created_at: string; }
interface PraxisData { reaction_time_days: number; success_rate_pct: number; actions_taken: number; signals_ignored: number; chat_response_time_min: number; messages_answered_pct: number; action_log: any[]; }
interface SystemData { level: string; level_progress: number; next_level_events: number; accuracy: any; calibration: any[]; predictions: any[]; calibration_log: any[]; }

const TAB_NAMES: Record<string, string> = { home: "Start", journey: "Verlauf", progress: "Fortschritt", chat: "Chat", more: "Mehr" };
const EVT: Record<string, { icon: string; label: string }> = {
  app_open: { icon: "📱", label: "App geöffnet" }, tab_view: { icon: "📑", label: "Tab gewechselt" },
  chat_message: { icon: "💬", label: "Chat-Nachricht" }, payment_view: { icon: "💰", label: "Zahlung angesehen" },
  animapay_open: { icon: "📱", label: "AnimaPay geöffnet" }, qrcode_view: { icon: "✅", label: "QR-Code angesehen" },
  notification_clicked: { icon: "👆", label: "Push geklickt" }, negative_event: { icon: "⚠️", label: "Negative Event" },
  session_end: { icon: "🔒", label: "Session beendet" }, document_view: { icon: "📄", label: "Dokument angesehen" },
};

export default function IntelligencePage() {
  const { theme } = useAppStore();
  const router = useRouter();
  const dk = theme === "dark";
  const [tab, setTab] = useState<"patienten" | "praxis" | "system">("patienten");
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<EngData | null>(null);
  const [feed, setFeed] = useState<ActivityEvent[]>([]);
  const [praxis, setPraxis] = useState<PraxisData | null>(null);
  const [system, setSystem] = useState<SystemData | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Colors
  const bg = dk ? "#060911" : "#f8f9fc";
  const card = dk ? "rgba(12,15,24,0.9)" : "#fff";
  const border = dk ? "rgba(255,255,255,0.05)" : "#e8eaef";
  const fg = dk ? "#e8ecf2" : "#1a2030";
  const muted = dk ? "#4a5568" : "#8797ac";
  const grn = "#4ade80";
  const red = "#f87171";
  const yellow = "#fbbf24";
  const purple = "#a78bfa";
  const blue = "#60a5fa";
  const cyan = "#22d3ee";

  useEffect(() => {
    fetch("/api/praxis/engagement?days=" + period).then(r => r.ok ? r.json() : null).then(d => { if (d) setData(d); });
    fetch("/api/praxis/intelligence/feed").then(r => r.ok ? r.json() : null).then(d => { if (d?.events) setFeed(d.events); });
  }, [period]);

  useEffect(() => {
    if (tab === "praxis" && !praxis) fetch("/api/praxis/intelligence/praxis").then(r => r.ok ? r.json() : null).then(d => { if (d) setPraxis(d); });
    if (tab === "system" && !system) fetch("/api/praxis/intelligence/system").then(r => r.ok ? r.json() : null).then(d => { if (d) setSystem(d); });
  }, [tab, praxis, system]);

  const riskColor = (l?: string) => l === "high" ? red : l === "medium" ? yellow : grn;
  const timeAgo = (iso: string) => { const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); if (m < 60) return `vor ${m}m`; const h = Math.floor(m / 60); return h < 24 ? `vor ${h}h` : `vor ${Math.floor(h / 24)}d`; };

  const patients = data?.top_patients || [];
  const high = patients.filter(p => p.risk_level === "high");
  const med = patients.filter(p => p.risk_level === "medium");
  const low = patients.filter(p => p.risk_level === "low");

  const sLabel = { fontSize: 10, fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: 1.5, color: grn, marginBottom: 14 };
  const cardS = { background: card, border: `1px solid ${border}`, borderRadius: 16, padding: 22, marginBottom: 16 };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: fg, margin: 0 }}>Revenue Intelligence</h1>
          <p style={{ fontSize: 12, color: muted, marginTop: 3 }}>Zahlungsverhalten verstehen, Muster erkennen, Risiken vorhersagen</p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setPeriod(d)} style={{ padding: "6px 14px", borderRadius: 18, border: `1px solid ${period === d ? grn : border}`, background: period === d ? "rgba(74,222,128,0.06)" : "transparent", color: period === d ? grn : muted, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{d} Tage</button>
          ))}
        </div>
      </div>

      {/* Intelligence Status */}
      <div style={{ background: dk ? "linear-gradient(135deg,rgba(74,222,128,0.04),rgba(167,139,250,0.03))" : "linear-gradient(135deg,rgba(74,222,128,0.06),rgba(167,139,250,0.04))", border: `1px solid ${border}`, borderRadius: 14, padding: "18px 24px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: grn, boxShadow: "0 0 12px rgba(74,222,128,0.5)" }} />
          <div style={{ fontSize: 13, color: fg }}>Basierend auf <strong style={{ color: grn }}>{data?.total_events || 0} Datenpunkten</strong> von <strong style={{ color: grn }}>{data?.active_patients || 0} Patienten</strong> <span style={{ color: muted }}>· {period} Tage</span></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, padding: "5px 12px", borderRadius: 6, background: "rgba(167,139,250,0.08)", color: purple }}>Aufbauphase</span>
          <div><div style={{ width: 120, height: 4, borderRadius: 2, background: dk ? "#2d3748" : "#e2e8f0", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg,${purple},${grn})`, width: "35%" }} /></div><div style={{ fontSize: 10, color: muted }}>~1.200 Events bis Muster-Erkennung</div></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: `1px solid ${border}` }}>
        {(["patienten", "praxis", "system"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", border: "none", background: "transparent", color: tab === t ? grn : muted, borderBottom: `2px solid ${tab === t ? grn : "transparent"}`, transition: "all 0.2s" }}>
            {t === "patienten" ? "Patienten" : t === "praxis" ? "Praxis" : "System"}
          </button>
        ))}
      </div>

      {/* ═══ SÄULE 1: PATIENTEN ═══ */}
      {tab === "patienten" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
          <div>
            {/* System-Erkenntnisse */}
            <div style={cardS}>
              <div style={sLabel}>Das System hat gelernt</div>
              {(data?.breakdown?.app_nutzung?.frequenz || 0) > 0 && (
                <div style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${border}`, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.55 }}>Basierend auf <strong style={{ color: grn }}>{data?.breakdown?.app_nutzung?.frequenz || 0} App-Öffnungen</strong> und <strong style={{ color: grn }}>{Object.values(data?.breakdown?.tab_verhalten?.tabs || {}).reduce((a: number, b: any) => a + (b as number), 0)} Tab-Wechseln</strong>.</div>
                  <div style={{ fontSize: 10, color: muted, marginTop: 6 }}>Datensammlung läuft. Muster-Erkennung beginnt bei ausreichender Datenbasis.</div>
                </div>
              )}
            </div>

            {/* Datenqualität */}
            <div style={cardS}>
              <div style={sLabel}>Datenqualität</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { name: "App-Nutzung", count: data?.by_type?.app_open || 0, pct: Math.min(((data?.by_type?.app_open || 0) / 50) * 100, 100) },
                  { name: "Tab-Verhalten", count: data?.by_type?.tab_view || 0, pct: Math.min(((data?.by_type?.tab_view || 0) / 100) * 100, 100) },
                  { name: "Zahlungsinteraktion", count: (data?.by_type?.animapay_open || 0) + (data?.by_type?.payment_view || 0), pct: Math.min((((data?.by_type?.animapay_open || 0) + (data?.by_type?.payment_view || 0)) / 30) * 100, 100) },
                  { name: "Chat-Verhalten", count: data?.by_type?.chat_message || 0, pct: Math.min(((data?.by_type?.chat_message || 0) / 20) * 100, 100) },
                  { name: "Benachrichtigungen", count: (data?.by_type?.notification_clicked || 0) + (data?.by_type?.notification_read || 0), pct: Math.min((((data?.by_type?.notification_clicked || 0)) / 10) * 100, 100) },
                  { name: "Sessions", count: data?.by_type?.session_end || 0, pct: Math.min(((data?.by_type?.session_end || 0) / 30) * 100, 100) },
                ].map(h => (
                  <div key={h.name} style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>{h.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 60, height: 4, borderRadius: 2, background: dk ? "#2d3748" : "#e2e8f0", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, background: h.pct > 60 ? grn : h.pct > 25 ? yellow : red, width: `${h.pct}%` }} />
                      </div>
                      <span style={{ fontSize: 10, color: muted, fontWeight: 600, minWidth: 28, textAlign: "right" }}>{h.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Patienten-Profile */}
            <div style={cardS}>
              <div style={sLabel}>Patienten-Profile</div>
              {[...high, ...med, ...low].map(p => (
                <div key={p.id}>
                  <div onClick={() => setExpanded(expanded === p.id ? null : p.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: expanded === p.id ? "10px 10px 0 0" : 10, border: `1px solid ${expanded === p.id ? "rgba(74,222,128,0.25)" : border}`, marginBottom: expanded === p.id ? 0 : 6, cursor: "pointer", transition: "all 0.2s" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: riskColor(p.risk_level), boxShadow: `0 0 8px ${riskColor(p.risk_level)}66`, flexShrink: 0 }} />
                    <div style={{ fontSize: 13, fontWeight: 700, flex: 1, color: fg }}>{p.name}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(p.context_tags || []).slice(0, 4).map((t, i) => (
                        <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: dk ? "rgba(255,255,255,0.04)" : "#f0f1f5", color: muted, fontWeight: 600 }}>{t}</span>
                      ))}
                    </div>
                  </div>

                  {expanded === p.id && (
                    <div style={{ border: `1px solid rgba(74,222,128,0.25)`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: 20, marginBottom: 6, background: dk ? "rgba(8,12,20,0.95)" : "#fafbfd" }}>
                      {/* Observation */}
                      {p.observation && (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: muted, marginBottom: 8 }}>Das System hat beobachtet</div>
                          <div style={{ fontSize: 12, lineHeight: 1.6, padding: "10px 14px", borderRadius: 8, background: dk ? "rgba(255,255,255,0.02)" : "#f5f6fa", borderLeft: `2px solid ${purple}`, marginBottom: 12 }}>{p.observation}</div>
                        </>
                      )}

                      {/* Metriken */}
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: muted, marginBottom: 8 }}>Verhaltens-Metriken (14 Tage)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
                        <div style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${border}`, textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Fraunces',serif", color: (p.activity_summary?.app_opens_14d || 0) > 0 ? grn : red }}>{p.activity_summary?.app_opens_14d || 0}</div>
                          <div style={{ fontSize: 9, color: muted, marginTop: 2, fontWeight: 600, textTransform: "uppercase" }}>App-Öffnungen</div>
                          {p.activity_summary?.primary_time_of_day && <div style={{ fontSize: 10, color: muted, marginTop: 3 }}>{p.activity_summary.primary_time_of_day} · {p.activity_summary.primary_device || "?"}</div>}
                        </div>
                        <div style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${border}`, textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Fraunces',serif" }}>{p.details?.chat_message || 0}</div>
                          <div style={{ fontSize: 9, color: muted, marginTop: 2, fontWeight: 600, textTransform: "uppercase" }}>Chat-Nachr.</div>
                        </div>
                        <div style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${border}`, textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Fraunces',serif" }}>{p.details?.animapay_open || 0}</div>
                          <div style={{ fontSize: 9, color: muted, marginTop: 2, fontWeight: 600, textTransform: "uppercase" }}>AnimaPay</div>
                        </div>
                        <div style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${border}`, textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Fraunces',serif", color: (p.details?.notification_clicked || 0) === 0 ? red : grn }}>{p.details?.notification_clicked || 0}</div>
                          <div style={{ fontSize: 9, color: muted, marginTop: 2, fontWeight: 600, textTransform: "uppercase" }}>Push gelesen</div>
                        </div>
                      </div>

                      {/* Deltas */}
                      {p.deltas && p.deltas.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: muted, marginBottom: 8 }}>Verhaltensänderung (vs. Vorperiode)</div>
                          <div style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${border}`, marginBottom: 12 }}>
                            {p.deltas.map((d, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", fontSize: 12 }}>
                                <span style={{ flex: 1, color: fg }}>{d.metric}</span>
                                <span style={{ fontSize: 10, color: muted }}>vorher: {d.previous}</span>
                                <span style={{ fontWeight: 700, color: d.change_pct > 0 ? grn : d.change_pct < 0 ? red : muted }}>{d.change_pct > 0 ? "↑" : d.change_pct < 0 ? "↓" : "→"} {d.change_pct > 0 ? "+" : ""}{d.change_pct}%</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Stress + Absence */}
                      {((p.stress_indicators?.length || 0) > 0 || (p.absence_signals?.length || 0) > 0) && (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: muted, marginBottom: 8 }}>Besondere Signale</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                            {(p.stress_indicators || []).map((s, i) => (
                              <span key={"st" + i} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, fontWeight: 600, background: "rgba(251,191,36,0.08)", color: yellow }}>{s}</span>
                            ))}
                            {(p.absence_signals || []).map((s, i) => (
                              <span key={"ab" + i} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, fontWeight: 600, background: dk ? "rgba(255,255,255,0.04)" : "#f0f1f5", color: muted, border: "1px dashed rgba(255,255,255,0.1)" }}>{s}</span>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Signals */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {(p.signals || []).map((s, i) => (
                          <span key={i} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, fontWeight: 600, background: s.type === "positive" ? "rgba(74,222,128,0.08)" : s.type === "warning" ? "rgba(248,113,113,0.08)" : s.type === "info" ? "rgba(96,165,250,0.08)" : dk ? "rgba(255,255,255,0.04)" : "#f0f1f5", color: s.type === "positive" ? grn : s.type === "warning" ? red : s.type === "info" ? blue : muted }}>{s.text}</span>
                        ))}
                      </div>

                      {/* Activity summary line */}
                      {p.activity_summary && (
                        <div style={{ fontSize: 10.5, color: muted, marginTop: 10 }}>
                          {p.activity_summary.last_active_days === 0 ? "Heute aktiv" : p.activity_summary.last_active_days === 1 ? "Gestern aktiv" : p.activity_summary.last_active_days != null ? `Zuletzt vor ${p.activity_summary.last_active_days} Tagen` : ""}
                          {p.activity_summary.most_used_tab && <> · Nutzt meist {TAB_NAMES[p.activity_summary.most_used_tab] || p.activity_summary.most_used_tab}</>}
                          {p.activity_summary.avg_session_seconds && <> · Ø {Math.floor(p.activity_summary.avg_session_seconds / 60)}:{String(p.activity_summary.avg_session_seconds % 60).padStart(2, "0")} Session</>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Feed */}
          <div>
            <div style={cardS}>
              <div style={sLabel}>Live-Datenfluss</div>
              {feed.length === 0 ? <p style={{ fontSize: 12, color: muted, textAlign: "center", padding: 20 }}>Noch keine Aktivitäten</p> : feed.slice(0, 15).map((ev, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, fontSize: 11 }}>
                  <span style={{ fontSize: 12, width: 20, textAlign: "center" }}>{EVT[ev.event_type]?.icon || "📋"}</span>
                  <div style={{ flex: 1 }}><strong>{ev.patient_name}</strong> <span style={{ color: muted }}>{EVT[ev.event_type]?.label || ev.event_type}</span></div>
                  <span style={{ fontSize: 10, color: muted, flexShrink: 0 }}>{timeAgo(ev.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ SÄULE 2: PRAXIS ═══ */}
      {tab === "praxis" && praxis && (
        <div>
          <div style={cardS}>
            <div style={sLabel}>Meta-Intelligence: Wie gut reagiert die Praxis?</div>
            <p style={{ fontSize: 13, color: muted, marginBottom: 20, lineHeight: 1.5 }}>Revenue Intelligence bewertet nicht nur Patienten, sondern auch wie effektiv die Praxis auf Warnsignale reagiert.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {[
                { value: `${praxis.reaction_time_days} Tage`, label: "Ø Reaktionszeit", sub: "Praxen die innerhalb von 24h reagieren, verhindern 40% mehr Zahlungsausfälle.", color: yellow },
                { value: `${praxis.success_rate_pct}%`, label: "Erfolgsquote", sub: `Von ${praxis.actions_taken} Maßnahmen führten ${Math.round(praxis.actions_taken * praxis.success_rate_pct / 100)} zum Erfolg.`, color: grn },
                { value: String(praxis.actions_taken), label: "Maßnahmen ergriffen (30 Tage)", sub: "Anrufe, Nachrichten, Ratengespräche und Mahnungen.", color: fg },
                { value: String(praxis.signals_ignored), label: "Signale ignoriert", sub: "Patienten bei denen das System warnte, aber nichts passierte.", color: red },
              ].map((k, i) => (
                <div key={i} style={{ padding: 20, borderRadius: 14, border: `1px solid ${border}`, background: card }}>
                  <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Fraunces',serif", color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 4, fontWeight: 600 }}>{k.label}</div>
                  <div style={{ fontSize: 10, color: muted, marginTop: 6, lineHeight: 1.4 }}>{k.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={cardS}>
            <div style={sLabel}>Maßnahmen-Protokoll</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>{["Datum", "Patient", "Warnsignal", "Maßnahme", "Ergebnis", "Reaktion"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: muted, borderBottom: `1px solid ${border}` }}>{h}</th>)}</tr></thead>
              <tbody>
                {praxis.action_log.map((a: any, i: number) => (
                  <tr key={i}>
                    <td style={{ padding: "10px", borderBottom: `1px solid ${border}`, color: muted }}>{a.date}</td>
                    <td style={{ padding: "10px", borderBottom: `1px solid ${border}`, fontWeight: 600 }}>{a.patient}</td>
                    <td style={{ padding: "10px", borderBottom: `1px solid ${border}`, fontSize: 11 }}>{a.signal}</td>
                    <td style={{ padding: "10px", borderBottom: `1px solid ${border}` }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: a.action === "anruf" ? "rgba(74,222,128,0.08)" : a.action === "nachricht" ? "rgba(96,165,250,0.08)" : a.action === "ratengespraech" ? "rgba(167,139,250,0.08)" : "rgba(251,191,36,0.08)", color: a.action === "anruf" ? grn : a.action === "nachricht" ? blue : a.action === "ratengespraech" ? purple : yellow }}>{a.action === "ratengespraech" ? "Ratengespräch" : a.action.charAt(0).toUpperCase() + a.action.slice(1)}</span>
                    </td>
                    <td style={{ padding: "10px", borderBottom: `1px solid ${border}` }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: a.result === "erfolg" ? "rgba(74,222,128,0.08)" : a.result === "kein" ? "rgba(248,113,113,0.08)" : dk ? "rgba(255,255,255,0.04)" : "#f0f1f5", color: a.result === "erfolg" ? grn : a.result === "kein" ? red : muted }}>{a.result === "erfolg" ? "Erfolg ✓" : a.result === "kein" ? "Keine Reaktion" : "Offen"}</span>
                    </td>
                    <td style={{ padding: "10px", borderBottom: `1px solid ${border}` }}>{a.reaction_days} Tage</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={cardS}><div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Fraunces',serif", color: grn }}>{praxis.chat_response_time_min} min</div><div style={{ fontSize: 11, color: muted, fontWeight: 600, marginTop: 4 }}>Ø Chat-Antwortzeit</div></div>
            <div style={cardS}><div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Fraunces',serif" }}>{praxis.messages_answered_pct}%</div><div style={{ fontSize: 11, color: muted, fontWeight: 600, marginTop: 4 }}>Nachrichten beantwortet</div></div>
          </div>
        </div>
      )}

      {/* ═══ SÄULE 3: SYSTEM ═══ */}
      {tab === "system" && system && (
        <div>
          {/* Evolution */}
          <div style={cardS}>
            <div style={sLabel}>Intelligence-Evolution</div>
            <div style={{ display: "flex", alignItems: "center", margin: "20px 0" }}>
              {["Datensammlung", "Aufbauphase", "Muster-Erkennung", "Vorhersage", "Kalibriert"].map((step, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center", position: "relative" }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", margin: "0 auto 6px", border: `2px solid ${i === 0 ? grn : i === 1 ? purple : (dk ? "#2d3748" : "#e2e8f0")}`, background: i === 0 ? grn : i === 1 ? purple : "transparent", boxShadow: i <= 1 ? `0 0 10px ${i === 0 ? grn : purple}66` : "none" }} />
                  <div style={{ fontSize: 10, color: i === 1 ? purple : muted, fontWeight: 600 }}>{step}</div>
                  {i < 4 && <div style={{ position: "absolute", top: 7, left: "50%", width: "100%", height: 2, background: i === 0 ? grn : (dk ? "#2d3748" : "#e2e8f0"), zIndex: -1 }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Accuracy */}
          <div style={cardS}>
            <div style={sLabel}>Vorhersage-Qualität</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${border}`, background: card, textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Fraunces',serif", color: grn }}>{system.accuracy.hit_rate}%</div><div style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: "uppercase", marginTop: 4 }}>Trefferquote</div></div>
              <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${border}`, background: card, textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Fraunces',serif", color: yellow }}>{system.accuracy.false_alarms}%</div><div style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: "uppercase", marginTop: 4 }}>Fehlalarme</div></div>
              <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${border}`, background: card, textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Fraunces',serif", color: red }}>{system.accuracy.missed}%</div><div style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: "uppercase", marginTop: 4 }}>Verpasst</div></div>
              <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${border}`, background: card, textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Fraunces',serif" }}>±{system.accuracy.avg_deviation_days}</div><div style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: "uppercase", marginTop: 4 }}>Ø Abweichung (Tage)</div></div>
            </div>
          </div>

          {/* Calibration curve */}
          <div style={cardS}>
            <div style={sLabel}>Konfidenz-Kalibrierung</div>
            <p style={{ fontSize: 12, color: muted, marginBottom: 16, lineHeight: 1.5 }}>Wenn das System "80%" sagt, passiert es auch in ~80% der Fälle?</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "0 10px" }}>
              {system.calibration.map((c: any, i: number) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: "70%", height: `${c.actual}%`, borderRadius: "4px 4px 0 0", background: `linear-gradient(180deg,rgba(74,222,128,${0.3 + i * 0.1}),rgba(74,222,128,0.08))`, minHeight: 2 }} />
                  <span style={{ fontSize: 9, color: muted, fontWeight: 600 }}>{c.range}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Predictions */}
          <div style={cardS}>
            <div style={sLabel}>Vorhersage-Protokoll</div>
            {system.predictions.map((p: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, border: `1px solid ${border}`, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 130, color: fg }}>{p.patient}</span>
                <span style={{ fontSize: 11, color: muted, flex: 1 }}>{p.text}</span>
                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Fraunces',serif", minWidth: 45, textAlign: "right", color: p.confidence >= 80 ? grn : p.confidence >= 60 ? yellow : red }}>{p.confidence}%</span>
                <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, fontWeight: 700, minWidth: 80, textAlign: "center", background: p.result === "richtig" ? "rgba(74,222,128,0.08)" : p.result === "falsch" ? "rgba(248,113,113,0.08)" : dk ? "rgba(255,255,255,0.04)" : "#f0f1f5", color: p.result === "richtig" ? grn : p.result === "falsch" ? red : muted }}>{p.result === "richtig" ? "Richtig ✓" : p.result === "falsch" ? "Falsch ✗" : "Offen ⏳"}</span>
              </div>
            ))}
          </div>

          {/* Calibration log */}
          <div style={cardS}>
            <div style={sLabel}>Kalibrierungs-Log</div>
            {system.calibration_log.map((l: any, i: number) => (
              <div key={i} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${border}`, marginBottom: 8, fontSize: 12, lineHeight: 1.6 }}>
                <div style={{ color: muted, fontSize: 10, marginBottom: 4 }}>Kalibrierung #{system.calibration_log.length - i} · {l.date}</div>
                {l.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
