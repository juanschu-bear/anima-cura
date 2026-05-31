"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { Brain, AlertTriangle, TrendingDown, TrendingUp, Activity, Clock, MessageSquare, CreditCard, Bell, Eye, User } from "lucide-react";

interface BehaviorSignal { text: string; type: "positive" | "neutral" | "warning"; }
interface PatientRisk {
  id: string;
  name: string;
  count: number;
  details: Record<string, number>;
  age?: number;
  versicherung?: string;
  risk_level?: "high" | "medium" | "low";
  signals?: BehaviorSignal[];
  context_tags?: string[];
  trend?: "rising" | "stable" | "falling" | "unknown";
  activity_summary?: { app_opens: number; last_active_days: number | null; most_used_tab: string | null; total_events: number };
}

interface EngagementData {
  period_days: number;
  total_events: number;
  active_patients: number;
  by_type: Record<string, number>;
  daily: { date: string; count: number }[];
  top_patients: PatientRisk[];
  breakdown?: {
    app_nutzung: { frequenz: number; tageszeiten: Record<string, number>; geraete: Record<string, number> };
    tab_verhalten: { tabs: Record<string, number> };
    zahlungsinteraktion: { animapay_geoeffnet: number; zahlung_angesehen: number };
    kommunikation: { nachrichten: number };
    benachrichtigungen: { gelesen: number };
  };
}

interface ActivityEvent {
  patient_name: string;
  patient_id: string;
  event_type: string;
  created_at: string;
}

const EVENT_LABELS: Record<string, { icon: string; label: string }> = {
  app_open: { icon: "🔓", label: "App geöffnet" },
  tab_view: { icon: "📑", label: "Tab gewechselt" },
  chat_message: { icon: "💬", label: "Chat-Nachricht" },
  payment_view: { icon: "💰", label: "Zahlung angesehen" },
  animapay_open: { icon: "📱", label: "AnimaPay geöffnet" },
  notification_read: { icon: "🔔", label: "Benachrichtigung gelesen" },
  document_view: { icon: "📄", label: "Dokument angesehen" },
  ratenplan_view: { icon: "📊", label: "Ratenplan angesehen" },
  notification_clicked: { icon: "👆", label: "Push-Notification geklickt" },
  payment_completed: { icon: "✅", label: "Zahlung abgeschlossen" },
  payment_overdue: { icon: "⚠️", label: "Zahlung überfällig" },
};

const TAB_NAMES: Record<string, string> = { home: "Start", journey: "Verlauf", progress: "Fortschritt", chat: "Chat", more: "Mehr" };

export default function IntelligencePage() {
  const { theme, locale } = useAppStore();
  const router = useRouter();
  const dk = theme === "dark";
  const fg = dk ? "#f0f0f0" : "#1c3044";
  const muted = dk ? "#666" : "#999";
  const grn = "#4ade80";
  const red = "#ef4444";
  const yellow = "#fbbf24";
  const border = dk ? "rgba(255,255,255,0.06)" : "#e5e8ef";
  const cardBg = dk ? "rgba(16,18,28,0.75)" : "#fff";

  const [data, setData] = useState<EngagementData | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    fetch("/api/praxis/engagement?days=" + period)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {});

    fetch("/api/praxis/intelligence/feed")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.events) setActivity(d.events); })
      .catch(() => {});
  }, [period]);

  // Risk profiles come from the API (buildProfile engine)
  const riskPatients = (data?.top_patients || []);

  const highRisk = riskPatients.filter(p => p.risk_level === "high");
  const mediumRisk = riskPatients.filter(p => p.risk_level === "medium");
  const healthyPatients = riskPatients.filter(p => p.risk_level === "low");

  const riskColor = (level: string) => level === "high" ? red : level === "medium" ? yellow : grn;
  const riskLabel = (level: string) => level === "high" ? "Hohes Risiko" : level === "medium" ? "Aufmerksamkeit" : "Stabil";

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `vor ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `vor ${hrs}h`;
    return `vor ${Math.floor(hrs / 24)}d`;
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: fg, margin: 0, fontFamily: "'Fraunces', serif" }}>Revenue Intelligence</h1>
          <p style={{ fontSize: 13, color: muted, marginTop: 4 }}>Zahlungsrisiken erkennen, bevor sie eintreten</p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[7, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setPeriod(d)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", border: period === d ? `1px solid ${grn}` : `1px solid ${border}`, background: period === d ? (dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.04)") : "transparent", color: period === d ? grn : muted }}>
              {d} Tage
            </button>
          ))}
        </div>
      </div>

      {/* Plain-language insight banner */}
      <div style={{ background: dk ? "linear-gradient(135deg, rgba(74,222,128,0.08), rgba(124,58,237,0.05))" : "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(124,58,237,0.04))", borderRadius: 16, border: `1px solid ${border}`, padding: "18px 22px", marginBottom: 20 }}>
        <p style={{ fontSize: 15, color: fg, margin: 0, lineHeight: 1.5 }}>
          {highRisk.length === 0 && mediumRisk.length === 0
            ? <>Alle aktiven Kunden zeigen <strong style={{ color: grn }}>gesundes Verhalten</strong>. Keine Warnsignale im gewählten Zeitraum.</>
            : <>
                {highRisk.length > 0 && <><strong style={{ color: red }}>{highRisk.length} {highRisk.length === 1 ? "Kunde braucht" : "Kunden brauchen"} jetzt Aufmerksamkeit</strong>. </>}
                {mediumRisk.length > 0 && <><strong style={{ color: yellow }}>{mediumRisk.length} {mediumRisk.length === 1 ? "zeigt" : "zeigen"} erste Warnsignale</strong>. </>}
                {healthyPatients.length > 0 && <>{healthyPatients.length} {healthyPatients.length === 1 ? "ist" : "sind"} stabil.</>}
              </>
          }
        </p>
      </div>

      {/* Summary Cards with explanations */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <div style={{ background: cardBg, borderRadius: 14, border: `1px solid ${highRisk.length > 0 ? red + "44" : border}`, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><AlertTriangle size={14} color={red} /><span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>Hohes Risiko</span></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: highRisk.length > 0 ? red : grn, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>{highRisk.length}</div>
          <p style={{ fontSize: 10.5, color: muted, marginTop: 6, lineHeight: 1.4 }}>Mehrere Warnsignale. Zahlungsausfall wahrscheinlich ohne Eingreifen.</p>
        </div>
        <div style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><Eye size={14} color={yellow} /><span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>Aufmerksamkeit</span></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: fg, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>{mediumRisk.length}</div>
          <p style={{ fontSize: 10.5, color: muted, marginTop: 6, lineHeight: 1.4 }}>Erste Anzeichen nachlassender Bindung. Beobachten.</p>
        </div>
        <div style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><TrendingUp size={14} color={grn} /><span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>Stabil</span></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: grn, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>{healthyPatients.length}</div>
          <p style={{ fontSize: 10.5, color: muted, marginTop: 6, lineHeight: 1.4 }}>Engagiert und zuverlässig. Kein Handlungsbedarf.</p>
        </div>
        <div style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><Activity size={14} color={grn} /><span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>Interaktionen</span></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: fg, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>{data?.total_events || 0}</div>
          <p style={{ fontSize: 10.5, color: muted, marginTop: 6, lineHeight: 1.4 }}>Aktionen in der App: Öffnen, Tabs, Chat, Zahlungen.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
        {/* Left: Risk Profiles */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Risk Patients */}
          {[...highRisk, ...mediumRisk, ...healthyPatients].length > 0 && (
            <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <Brain size={16} color={grn} /> Patienten-Profile
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...highRisk, ...mediumRisk, ...healthyPatients].map((p, i) => (
                  <div key={p.id} onClick={() => router.push("/patienten/" + p.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: `1px solid ${border}`, cursor: "pointer", transition: "border-color 0.2s" }} onMouseEnter={e => (e.currentTarget.style.borderColor = riskColor(p.risk_level || "low"))} onMouseLeave={e => (e.currentTarget.style.borderColor = border)}>
                    {/* Risk indicator */}
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: riskColor(p.risk_level || "low"), flexShrink: 0, boxShadow: `0 0 8px ${riskColor(p.risk_level || "low")}44` }} />

                    {/* Patient info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: fg }}>{p.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: `${riskColor(p.risk_level || "low")}15`, color: riskColor(p.risk_level || "low") }}>{riskLabel(p.risk_level || "low")}</span>
                        {p.trend === "falling" && <span style={{ fontSize: 10, color: red }}>↓ sinkt</span>}
                        {p.trend === "rising" && <span style={{ fontSize: 10, color: grn }}>↑ steigt</span>}
                      </div>
                      {/* Context tags (age, insurance, treatment) */}
                      {p.context_tags && p.context_tags.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                          {p.context_tags.map((tag, j) => (
                            <span key={j} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: dk ? "rgba(124,58,237,0.12)" : "rgba(124,58,237,0.08)", color: dk ? "#a78bfa" : "#7c3aed", fontWeight: 600 }}>{tag}</span>
                          ))}
                        </div>
                      )}
                      {/* Behavioral signals */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        {(p.signals || []).map((s, j) => (
                          <span key={j} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: s.type === "positive" ? (dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.08)") : s.type === "warning" ? (dk ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.06)") : (dk ? "rgba(255,255,255,0.04)" : "#f5f5f5"), color: s.type === "positive" ? grn : s.type === "warning" ? red : muted }}>{s.text}{s.type === "positive" ? " ✓" : ""}</span>
                        ))}
                      </div>
                      {/* Activity summary line */}
                      {p.activity_summary && (
                        <div style={{ fontSize: 10.5, color: muted, marginTop: 6 }}>
                          {p.activity_summary.last_active_days === 0 ? "Heute aktiv" : p.activity_summary.last_active_days === 1 ? "Gestern aktiv" : p.activity_summary.last_active_days != null ? `Zuletzt vor ${p.activity_summary.last_active_days} Tagen` : "Noch nicht aktiv"}
                          {p.activity_summary.most_used_tab && <> · Nutzt meist {p.activity_summary.most_used_tab === "home" ? "Start" : p.activity_summary.most_used_tab === "progress" ? "Fortschritt" : p.activity_summary.most_used_tab === "chat" ? "Chat" : p.activity_summary.most_used_tab === "journey" ? "Verlauf" : p.activity_summary.most_used_tab}</>}
                        </div>
                      )}
                    </div>

                    {/* Activity summary */}
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: grn, fontFamily: "'Fraunces', serif" }}>{p.count}</div>
                      <div style={{ fontSize: 10, color: muted }}>Aktionen</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Chart */}
          {data?.daily && (
            <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={16} color={grn} /> Aktivität ({period} Tage)
              </h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
                {data.daily.map((d, i) => {
                  const max = Math.max(...data.daily.map(x => x.count), 1);
                  const h = Math.max((d.count / max) * 70, 2);
                  return <div key={i} title={`${d.date}: ${d.count} Events`} style={{ flex: 1, height: h, borderRadius: 3, background: d.count > 0 ? grn : (dk ? "#1a2030" : "#e5e7eb"), transition: "height 0.3s" }} />;
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 10, color: muted }}>{data.daily[0]?.date}</span>
                <span style={{ fontSize: 10, color: muted }}>{data.daily[data.daily.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {/* Structured Behavioral Breakdown */}
          {data?.breakdown && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* App-Nutzung */}
              <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>📱 App-Nutzung</h3>
                <p style={{ fontSize: 11, color: muted, marginBottom: 14 }}>Wie oft, wann und womit Kunden die App öffnen</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, color: muted, fontWeight: 600, marginBottom: 6 }}>FREQUENZ</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: fg, fontFamily: "'Fraunces', serif" }}>{data.breakdown.app_nutzung.frequenz}</div>
                    <div style={{ fontSize: 10, color: muted }}>Öffnungen gesamt</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: muted, fontWeight: 600, marginBottom: 6 }}>TAGESZEITEN</div>
                    {Object.entries(data.breakdown.app_nutzung.tageszeiten).filter(([, v]) => v > 0).map(([k, v]) => (
                      <div key={k} style={{ fontSize: 11, color: fg, display: "flex", justifyContent: "space-between", marginBottom: 2 }}><span>{k.split(" ")[0]}</span><span style={{ fontWeight: 700 }}>{v}</span></div>
                    ))}
                    {Object.values(data.breakdown.app_nutzung.tageszeiten).every(v => v === 0) && <div style={{ fontSize: 10, color: muted }}>Keine Daten</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: muted, fontWeight: 600, marginBottom: 6 }}>GERÄT</div>
                    {Object.entries(data.breakdown.app_nutzung.geraete).map(([k, v]) => (
                      <div key={k} style={{ fontSize: 11, color: fg, display: "flex", justifyContent: "space-between", marginBottom: 2 }}><span>{k}</span><span style={{ fontWeight: 700 }}>{v}</span></div>
                    ))}
                    {Object.keys(data.breakdown.app_nutzung.geraete).length === 0 && <div style={{ fontSize: 10, color: muted }}>Keine Daten</div>}
                  </div>
                </div>
              </div>

              {/* Tab-Verhalten */}
              <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>📑 Tab-Verhalten</h3>
                <p style={{ fontSize: 11, color: muted, marginBottom: 14 }}>Welche Bereiche der App genutzt werden</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {Object.entries(data.breakdown.tab_verhalten.tabs).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <div key={k} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${border}`, background: dk ? "rgba(255,255,255,0.02)" : "#fafafa", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: fg, fontWeight: 600 }}>{TAB_NAMES[k] || k}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: grn }}>{v}</span>
                    </div>
                  ))}
                  {Object.keys(data.breakdown.tab_verhalten.tabs).length === 0 && <div style={{ fontSize: 11, color: muted }}>Keine Daten</div>}
                </div>
              </div>

              {/* Zahlungsinteraktion */}
              <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>💰 Zahlungsinteraktion</h3>
                <p style={{ fontSize: 11, color: muted, marginBottom: 14 }}>Zeigt Interesse an Zahlungen und AnimaPay</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${border}`, background: dk ? "rgba(255,255,255,0.02)" : "#fafafa" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: fg, fontFamily: "'Fraunces', serif" }}>{data.breakdown.zahlungsinteraktion.animapay_geoeffnet}</div>
                    <div style={{ fontSize: 11, color: muted }}>AnimaPay geöffnet</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${border}`, background: dk ? "rgba(255,255,255,0.02)" : "#fafafa" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: fg, fontFamily: "'Fraunces', serif" }}>{data.breakdown.zahlungsinteraktion.zahlung_angesehen}</div>
                    <div style={{ fontSize: 11, color: muted }}>Zahlungen angesehen</div>
                  </div>
                </div>
              </div>

              {/* Kommunikation + Benachrichtigungen */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>💬 Kommunikation</h3>
                  <p style={{ fontSize: 11, color: muted, marginBottom: 14 }}>Chat-Aktivität mit der Praxis</p>
                  <div style={{ fontSize: 22, fontWeight: 800, color: fg, fontFamily: "'Fraunces', serif" }}>{data.breakdown.kommunikation.nachrichten}</div>
                  <div style={{ fontSize: 11, color: muted }}>Nachrichten gesendet</div>
                </div>
                <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>🔔 Benachrichtigungen</h3>
                  <p style={{ fontSize: 11, color: muted, marginBottom: 14 }}>Reaktion auf Erinnerungen</p>
                  <div style={{ fontSize: 22, fontWeight: 800, color: fg, fontFamily: "'Fraunces', serif" }}>{data.breakdown.benachrichtigungen.gelesen}</div>
                  <div style={{ fontSize: 11, color: muted }}>Geöffnet / gelesen</div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Right: Live Feed */}
        <div>
          <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, position: "sticky", top: 80 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={16} color={grn} /> Live-Aktivität
            </h3>
            {activity.length === 0 ? (
              <p style={{ fontSize: 12, color: muted, textAlign: "center", padding: 20 }}>Noch keine Aktivitäten</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {activity.slice(0, 20).map((ev, i) => (
                  <div key={i} onClick={() => router.push("/patienten/" + ev.patient_id)} style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 8, transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = dk ? "rgba(74,222,128,0.04)" : "rgba(0,0,0,0.02)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <span style={{ fontSize: 14 }}>{EVENT_LABELS[ev.event_type]?.icon || "📋"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: fg }}>{ev.patient_name}</span>
                      <span style={{ color: muted }}> {EVENT_LABELS[ev.event_type]?.label || ev.event_type}</span>
                    </div>
                    <span style={{ fontSize: 10, color: muted, flexShrink: 0 }}>{timeAgo(ev.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
