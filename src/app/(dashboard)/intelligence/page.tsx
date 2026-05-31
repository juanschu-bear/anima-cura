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

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <div style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><AlertTriangle size={14} color={red} /><span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>Hohes Risiko</span></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: highRisk.length > 0 ? red : grn, fontFamily: "'Fraunces', serif" }}>{highRisk.length}</div>
        </div>
        <div style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><Eye size={14} color={yellow} /><span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>Aufmerksamkeit</span></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: fg, fontFamily: "'Fraunces', serif" }}>{mediumRisk.length}</div>
        </div>
        <div style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><TrendingUp size={14} color={grn} /><span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>Stabil</span></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: grn, fontFamily: "'Fraunces', serif" }}>{healthyPatients.length}</div>
        </div>
        <div style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><Activity size={14} color={grn} /><span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>Interaktionen</span></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: fg, fontFamily: "'Fraunces', serif" }}>{data?.total_events || 0}</div>
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
                    </div>

                    {/* Activity breakdown */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {Object.entries(p.details || {}).slice(0, 4).map(([k, v]) => (
                        <span key={k} title={EVENT_LABELS[k]?.label || k} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 2, color: muted }}>
                          {EVENT_LABELS[k]?.icon || "📋"}{v as number}
                        </span>
                      ))}
                    </div>

                    {/* Total */}
                    <div style={{ fontSize: 16, fontWeight: 800, color: grn, fontFamily: "'Fraunces', serif", flexShrink: 0, width: 40, textAlign: "right" }}>{p.count}</div>
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

          {/* Event Type Breakdown */}
          {data?.by_type && (
            <div style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <Activity size={16} color={grn} /> Interaktionen nach Typ
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {Object.entries(data.by_type).map(([key, count]) => (
                  <div key={key} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${border}`, background: dk ? "rgba(255,255,255,0.02)" : "#fafafa" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: fg }}>{count}</div>
                    <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{EVENT_LABELS[key]?.icon} {EVENT_LABELS[key]?.label || key}</div>
                  </div>
                ))}
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
