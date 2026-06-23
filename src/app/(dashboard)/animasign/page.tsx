"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

type Submission = {
  id: string;
  vorname: string;
  nachname: string;
  created_at: string;
  is_existing: boolean;
  matched_patient_id: string | null;
  account_email: string | null;
  signature_status: string | null;
};

type FilterTab = "today" | "week" | "all" | "open";

export default function AnimaSignPage() {
  const { locale, theme } = useAppStore();
  const isDark = theme === "dark";
  const supabase = createBrowserClient();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("today");
  const [totalBoegen, setTotalBoegen] = useState(0);
  const [todayBoegen, setTodayBoegen] = useState(0);
  const [appRegistrations, setAppRegistrations] = useState(0);
  const [pendingSignatures, setPendingSignatures] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch submissions
    let query = supabase
      .from("anamnese_submissions")
      .select("id, vorname, nachname, created_at, is_existing, matched_patient_id, account_email, signature_status")
      .order("created_at", { ascending: false });

    if (filter === "today") {
      query = query.gte("created_at", todayStart.toISOString());
    } else if (filter === "week") {
      query = query.gte("created_at", weekStart.toISOString());
    } else if (filter === "open") {
      query = query.is("signature_status", null);
    }

    if (search.trim().length >= 2) {
      query = query.or(
        `nachname.ilike.%${search.trim()}%,vorname.ilike.%${search.trim()}%`
      );
    }

    const { data } = await query.limit(200);
    setSubmissions(data || []);

    // Stats
    const { count: total } = await supabase
      .from("anamnese_submissions")
      .select("*", { count: "exact", head: true });
    setTotalBoegen(total || 0);

    const { count: today } = await supabase
      .from("anamnese_submissions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString());
    setTodayBoegen(today || 0);

    const { count: matched } = await supabase
      .from("anamnese_submissions")
      .select("*", { count: "exact", head: true })
      .eq("is_existing", true);
    setMatchedCount(matched || 0);

    const { count: pending } = await supabase
      .from("anamnese_submissions")
      .select("*", { count: "exact", head: true })
      .is("signature_status", null);
    setPendingSignatures(pending || 0);

    // Count app registrations (patients with @animacura.de accounts)
    const { count: regs } = await supabase
      .from("anamnese_submissions")
      .select("*", { count: "exact", head: true })
      .not("account_email", "is", null);
    setAppRegistrations(regs || 0);

    setLoading(false);
  }, [supabase, search, filter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/anima-sign/ivoris-nachsync", { method: "POST" });
      const data = await res.json();
      alert(`Sync abgeschlossen: ${data.total} Patienten verarbeitet.`);
      void fetchData();
    } catch {
      alert("Sync fehlgeschlagen.");
    }
    setSyncing(false);
  };

  const conversionRate = todayBoegen > 0
    ? Math.round((appRegistrations / totalBoegen) * 100)
    : 0;

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  };

  // Colors
  const bg = isDark ? "#0c1014" : "#f5f1eb";
  const cardBg = isDark ? "#141c24" : "#ffffff";
  const cardHover = isDark ? "#1a2430" : "#faf8f5";
  const ink = isDark ? "#e4e8ec" : "#2c2a26";
  const muted = isDark ? "#6b7a8a" : "#8a847a";
  const line = isDark ? "rgba(255,255,255,0.06)" : "#e0d8cc";
  const lineS = isDark ? "rgba(255,255,255,0.1)" : "#d4cbbf";
  const blue = isDark ? "#5ba4d9" : "#3b7fbf";
  const blueBg = isDark ? "rgba(91,164,217,0.1)" : "rgba(59,127,191,0.08)";
  const blueBgS = isDark ? "rgba(91,164,217,0.16)" : "rgba(59,127,191,0.14)";
  const green = isDark ? "#52c48e" : "#3a9670";
  const greenBg = isDark ? "rgba(61,166,122,0.1)" : "rgba(46,122,90,0.08)";
  const gold = isDark ? "#d4a73a" : "#b08a22";
  const goldBg = isDark ? "rgba(212,167,58,0.1)" : "rgba(176,138,34,0.08)";
  const matchC = isDark ? "#8aaa52" : "#6a8a30";
  const matchBg = isDark ? "rgba(138,170,82,0.1)" : "rgba(106,138,48,0.08)";
  const bg2 = isDark ? "#111820" : "#eee9e0";

  const filters: { key: FilterTab; label: string }[] = [
    { key: "today", label: locale === "en" ? `Today (${todayBoegen})` : `Heute (${todayBoegen})` },
    { key: "week", label: locale === "en" ? "This Week" : "Diese Woche" },
    { key: "all", label: locale === "en" ? `Total (${totalBoegen})` : `Gesamt (${totalBoegen})` },
    { key: "open", label: locale === "en" ? "Open only" : "Nur offene" },
  ];

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", padding: "32px 24px", fontFamily: "'Hanken Grotesk', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: ink, letterSpacing: -0.3 }}>AnimaSign</h1>
          <div style={{ fontSize: 13, color: muted, marginTop: 3 }}>
            {locale === "en" ? "Intake forms and app onboarding" : "Anamnesebögen und App-Onboarding"}
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            background: blueBg, border: `1px solid ${isDark ? "rgba(91,164,217,0.2)" : "rgba(59,127,191,0.2)"}`,
            color: blue, fontFamily: "inherit", fontSize: 12, fontWeight: 600,
            padding: "9px 18px", borderRadius: 10, cursor: syncing ? "wait" : "pointer",
            display: "flex", alignItems: "center", gap: 6, opacity: syncing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
          {syncing ? "Sync läuft..." : "Ivoris-Sync nachholen"}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { num: todayBoegen, label: locale === "en" ? "Forms today" : "Bögen heute", color: blue, accent: isDark ? "linear-gradient(90deg,#3a7ab0,#5ba4d9)" : "linear-gradient(90deg,#2d6a9e,#3b7fbf)", badge: `+${todayBoegen} neu` },
          { num: appRegistrations, label: locale === "en" ? "App registrations" : "App-Anmeldungen", color: green, accent: isDark ? "linear-gradient(90deg,#3da67a,#52c48e)" : "linear-gradient(90deg,#2e7a5a,#3a9670)" },
          { num: pendingSignatures, label: locale === "en" ? "Signature pending" : "Unterschrift ausstehend", color: gold, accent: isDark ? "linear-gradient(90deg,#a68428,#d4a73a)" : "linear-gradient(90deg,#8a6a18,#b08a22)" },
          { num: matchedCount, label: locale === "en" ? "Existing patients matched" : "Bestandspatienten gematcht", color: matchC, accent: isDark ? "linear-gradient(90deg,#5a7a2a,#8aaa52)" : "linear-gradient(90deg,#4a6a20,#6a8a30)" },
        ].map((s, i) => (
          <div key={i} style={{ background: cardBg, border: `1px solid ${line}`, borderRadius: 14, padding: 20, position: "relative", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "14px 14px 0 0", background: s.accent }} />
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 600, letterSpacing: -1, color: s.color }}>{s.num}</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 5, fontWeight: 500 }}>{s.label}</div>
            {s.badge && (
              <span style={{ position: "absolute", top: 18, right: 18, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 8, background: greenBg, color: green }}>{s.badge}</span>
            )}
          </div>
        ))}
      </div>

      {/* Conversion bar */}
      <div style={{ background: cardBg, border: `1px solid ${line}`, borderRadius: 14, padding: "18px 22px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: 13, color: muted, whiteSpace: "nowrap", fontWeight: 500 }}>
          {locale === "en" ? "Form → App registration" : "Bogen → App-Anmeldung"}
        </div>
        <div style={{ flex: 1, height: 10, background: bg2, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, background: isDark ? "linear-gradient(90deg,#3a7ab0,#5ba4d9,#52c48e)" : "linear-gradient(90deg,#2d6a9e,#3b7fbf,#3a9670)", width: `${conversionRate}%`, transition: "width 0.6s" }} />
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: green, whiteSpace: "nowrap" }}>{conversionRate}%</div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              background: filter === f.key ? blueBgS : cardBg,
              border: `1px solid ${filter === f.key ? blue : lineS}`,
              borderRadius: 10, padding: "7px 16px", fontSize: 12, fontWeight: 600,
              color: filter === f.key ? blue : muted, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: cardBg, border: `1px solid ${line}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.1fr 1.1fr 1.1fr 0.6fr", padding: "11px 20px", background: bg2, fontSize: 11, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span>Patient</span>
          <span>Bogen</span>
          <span>{locale === "en" ? "Signature" : "Unterschrift"}</span>
          <span>App-Status</span>
          <span style={{ textAlign: "right" }}>{locale === "en" ? "Time" : "Uhrzeit"}</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: muted }}>
            {locale === "en" ? "Loading..." : "Wird geladen..."}
          </div>
        ) : submissions.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: muted }}>
            {locale === "en" ? "No submissions found." : "Keine Einreichungen gefunden."}
          </div>
        ) : (
          submissions.map((s) => (
            <div
              key={s.id}
              style={{
                display: "grid", gridTemplateColumns: "1.8fr 1.1fr 1.1fr 1.1fr 0.6fr",
                padding: "13px 20px", alignItems: "center",
                borderBottom: `1px solid ${line}`,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: ink }}>{s.nachname}, {s.vorname}</div>
                <div style={{ fontSize: 11, color: isDark ? "#4a5a6a" : "#b0a99e", marginTop: 1 }}>
                  {s.is_existing
                    ? (locale === "en" ? "Existing patient" : s.nachname?.endsWith("a") || s.nachname?.endsWith("e") ? "Bestandspatientin" : "Bestandspatient")
                    : (locale === "en" ? "New patient" : s.nachname?.endsWith("a") || s.nachname?.endsWith("e") ? "Neupatientin" : "Neupatient")}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: greenBg, color: green, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  ✓ {locale === "en" ? "Received" : "Eingegangen"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.signature_status === "signed" ? blue : gold, boxShadow: `0 0 6px ${s.signature_status === "signed" ? blueBg : goldBg}` }} />
                <span style={{ fontSize: 12, color: s.signature_status === "signed" ? ink : muted }}>
                  {s.signature_status === "signed" ? (locale === "en" ? "Signed" : "Signiert") : (locale === "en" ? "Pending" : "Ausstehend")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.account_email ? green : gold, boxShadow: `0 0 6px ${s.account_email ? greenBg : goldBg}` }} />
                <span style={{ fontSize: 12, color: s.account_email ? ink : muted }}>
                  {s.account_email ? (locale === "en" ? "Registered" : "Registriert") : (locale === "en" ? "Pending" : "Ausstehend")}
                </span>
              </div>
              <div style={{ fontSize: 12, color: muted, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {filter === "all" || filter === "open" ? fmtDate(s.created_at) : fmtTime(s.created_at)}
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
