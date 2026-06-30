"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";

interface Submission {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  created_at: string;
  status: string;
  is_existing: boolean;
  matched_patient_id: string | null;
  account_email: string | null;
  ivoris_synced: boolean;
  ivoris_doc_synced: boolean;
  ivoris_sync_error: string | null;
  ivoris_sync_failed_permanently: boolean;
  ivoris_doc_failed_permanently: boolean;
  ivoris_manual_review: boolean;
  ivoris_manual_review_reason: string | null;
  has_logged_in: boolean;
  last_login: string | null;
}

interface Stats {
  total: number;
  today: number;
  matched: number;
  pendingSignatures: number;
  registrations: number;
  loggedIn: number;
}

type FilterTab = "today" | "week" | "all" | "open";
const PAGE_SIZE = 15;

export default function AnimaSignPage() {
  const { locale, theme } = useAppStore();
  const dk = theme === "dark";

  const [subs, setSubs] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, today: 0, matched: 0, pendingSignatures: 0, registrations: 0, loggedIn: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("today");
  const [page, setPage] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ filter });
      if (search.trim().length >= 2) p.set("search", search.trim());
      const res = await fetch(`/api/anima-sign/dashboard?${p}`);
      const d = await res.json();
      setSubs(d.submissions || []);
      setStats(d.stats || { total: 0, today: 0, matched: 0, pendingSignatures: 0, registrations: 0, loggedIn: 0 });
    } catch (e) { console.error("[AnimaSign]", e); }
    setLoading(false);
  }, [search, filter]);

  useEffect(() => { void fetchData(); const iv = setInterval(() => { void fetchData(); }, 120_000); return () => clearInterval(iv); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/anima-sign/ivoris-nachsync", { method: "POST" });
      const d = await r.json();
      alert(`Sync: ${d.total} Patienten verarbeitet.`);
      void fetchData();
    } catch { alert("Sync fehlgeschlagen."); }
    setSyncing(false);
  };

  const paged = subs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(subs.length / PAGE_SIZE);
  const rate = stats.total > 0 ? Math.round((stats.loggedIn / stats.total) * 100) : 0;

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

  // Colors
  const bg = dk ? "#0c1014" : "#f5f1eb";
  const cardBg = dk ? "#141c24" : "#ffffff";
  const ink = dk ? "#e4e8ec" : "#2c2a26";
  const muted = dk ? "#6b7a8a" : "#8a847a";
  const line = dk ? "rgba(255,255,255,0.06)" : "#e0d8cc";
  const lineS = dk ? "rgba(255,255,255,0.1)" : "#d4cbbf";
  const bg2 = dk ? "#111820" : "#eee9e0";
  const blue = dk ? "#5ba4d9" : "#3b7fbf";
  const blueBg = dk ? "rgba(91,164,217,0.12)" : "rgba(59,127,191,0.1)";
  const green = dk ? "#52c48e" : "#3a9670";
  const greenBg = dk ? "rgba(61,166,122,0.1)" : "rgba(46,122,90,0.08)";
  const gold = dk ? "#d4a73a" : "#b08a22";
  const goldBg = dk ? "rgba(212,167,58,0.1)" : "rgba(176,138,34,0.08)";
  const matchC = dk ? "#8aaa52" : "#6a8a30";

  const statCards = [
    { n: stats.today, l: "Bögen heute", c: blue, a: dk ? "linear-gradient(90deg,#3a7ab0,#5ba4d9)" : "linear-gradient(90deg,#2d6a9e,#3b7fbf)", badge: `+${stats.today} neu` },
    { n: stats.registrations, l: "Accounts erstellt", c: green, a: dk ? "linear-gradient(90deg,#3da67a,#52c48e)" : "linear-gradient(90deg,#2e7a5a,#3a9670)" },
    { n: stats.loggedIn, l: "Angemeldet", c: dk ? "#7bb8e0" : "#2d6a9e", a: dk ? "linear-gradient(90deg,#2d6a9e,#7bb8e0)" : "linear-gradient(90deg,#1e5a8e,#2d6a9e)" },
    { n: stats.pendingSignatures, l: "Unterschrift ausstehend", c: gold, a: dk ? "linear-gradient(90deg,#a68428,#d4a73a)" : "linear-gradient(90deg,#8a6a18,#b08a22)" },
    { n: stats.matched, l: "Bestandspatienten", c: matchC, a: dk ? "linear-gradient(90deg,#5a7a2a,#8aaa52)" : "linear-gradient(90deg,#4a6a20,#6a8a30)" },
  ];

  const filters: { k: FilterTab; l: string }[] = [
    { k: "today", l: `Heute (${stats.today})` },
    { k: "week", l: "Diese Woche" },
    { k: "all", l: `Gesamt (${stats.total})` },
    { k: "open", l: "Nur offene" },
  ];

  const cols = "1.5fr 0.85fr 0.85fr 0.85fr 0.75fr 0.65fr 0.6fr";

  const dot = (color: string, glow: string) => ({ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${glow}`, flexShrink: 0 } as const);

  const getIvorisStatus = (submission: Submission) => {
    if (submission.ivoris_synced && submission.ivoris_doc_synced) {
      return { label: "OK", color: green, glow: greenBg };
    }

    if (submission.ivoris_manual_review) {
      return { label: "Manuell", color: "#d45a52", glow: "rgba(212,90,82,0.12)" };
    }

    if (submission.ivoris_doc_synced && !submission.ivoris_synced) {
      return { label: "Teilweise", color: blue, glow: blueBg };
    }

    return { label: "Ausstehend", color: gold, glow: goldBg };
  };

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", padding: "32px 24px", fontFamily: "'Hanken Grotesk', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: ink }}>AnimaSign</h1>
          <div style={{ fontSize: 13, color: muted, marginTop: 3 }}>Anamnesebögen und App-Onboarding</div>
        </div>
        <button onClick={handleSync} disabled={syncing} style={{ background: blueBg, border: `1px solid ${dk ? "rgba(91,164,217,0.2)" : "rgba(59,127,191,0.2)"}`, color: blue, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "9px 18px", borderRadius: 10, cursor: syncing ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: syncing ? 0.6 : 1 }}>
          <RefreshCw size={14} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
          {syncing ? "Sync läuft..." : "Ivoris-Sync nachholen"}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
        {statCards.map((s, i) => (
          <div key={i} style={{ background: cardBg, border: `1px solid ${line}`, borderRadius: 14, padding: 20, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "14px 14px 0 0", background: s.a }} />
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 600, color: s.c }}>{s.n}</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 5, fontWeight: 500 }}>{s.l}</div>
            {s.badge && <span style={{ position: "absolute", top: 16, right: 16, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 8, background: greenBg, color: green }}>{s.badge}</span>}
          </div>
        ))}
      </div>

      {/* Conversion */}
      <div style={{ background: cardBg, border: `1px solid ${line}`, borderRadius: 14, padding: "18px 22px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 13, color: muted, whiteSpace: "nowrap", fontWeight: 500 }}>Bogen → Angemeldet</div>
        <div style={{ flex: 1, height: 10, background: bg2, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg,${blue},${green})`, width: `${rate}%`, transition: "width .6s" }} />
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: green }}>{rate}%</div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {filters.map(f => (
          <button key={f.k} onClick={() => { setFilter(f.k); setPage(0); }} style={{ background: filter === f.k ? blueBg : cardBg, border: `1px solid ${filter === f.k ? blue : lineS}`, borderRadius: 10, padding: "7px 16px", fontSize: 12, fontWeight: 600, color: filter === f.k ? blue : muted, cursor: "pointer", fontFamily: "inherit" }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: cardBg, border: `1px solid ${line}`, borderRadius: 14, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: cols, padding: "11px 20px", background: bg2, fontSize: 11, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span>Patient</span><span>Bogen</span><span>Unterschrift</span><span>App-Status</span><span>Angemeldet</span><span>Ivoris</span><span style={{ textAlign: "right" }}>Zeit</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: muted }}>Wird geladen...</div>
        ) : paged.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: muted }}>Keine Einreichungen gefunden.</div>
        ) : paged.map(s => (
          <div key={s.id} title={s.ivoris_manual_review_reason || undefined} style={{ display: "grid", gridTemplateColumns: cols, padding: "13px 20px", alignItems: "center", borderBottom: `1px solid ${line}` }}>
            {/* Patient */}
            <div>
              <div style={{ fontWeight: 600, color: ink }}>{s.nachname}, {s.vorname}</div>
              <div style={{ fontSize: 11, color: dk ? "#4a5a6a" : "#b0a99e", marginTop: 1 }}>
                {s.is_existing ? "Bestandspatient" : "Neupatient"}
              </div>
            </div>
            {/* Bogen */}
            <div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: greenBg, color: green, display: "inline-flex", alignItems: "center", gap: 4 }}>
                ✓ Eingegangen
              </span>
            </div>
            {/* Unterschrift */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={dot(s.status === "signiert" ? blue : s.status === "fehler" ? "#d45a52" : gold, s.status === "signiert" ? blueBg : goldBg)} />
              <span style={{ fontSize: 12, color: s.status === "signiert" ? ink : muted }}>
                {s.status === "signiert" ? "Signiert" : s.status === "fehler" ? "Fehler" : "Ausstehend"}
              </span>
            </div>
            {/* App-Status */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={dot(s.account_email ? green : gold, s.account_email ? greenBg : goldBg)} />
              <span style={{ fontSize: 12, color: s.account_email ? ink : muted }}>
                {s.account_email ? "Registriert" : "Ausstehend"}
              </span>
            </div>
            {/* Angemeldet */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={dot(s.has_logged_in ? green : (dk ? "rgba(255,255,255,0.1)" : "#d4cbbf"), s.has_logged_in ? greenBg : "transparent")} />
              <span style={{ fontSize: 12, color: s.has_logged_in ? ink : muted }}>
                {s.has_logged_in ? "Ja" : "Nein"}
              </span>
            </div>
            {/* Ivoris */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {(() => {
                const ivoris = getIvorisStatus(s);
                return (
                  <>
                    <span style={dot(ivoris.color, ivoris.glow)} />
                    <span style={{ fontSize: 12, color: ivoris.label === "OK" ? ink : muted }}>
                      {ivoris.label}
                    </span>
                  </>
                );
              })()}
            </div>
            {/* Zeit */}
            <div style={{ fontSize: 12, color: muted, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {filter === "today" ? fmtTime(s.created_at) : `${fmtDate(s.created_at)} ${fmtTime(s.created_at)}`}
            </div>
          </div>
        ))}

        {/* Pagination */}
        {!loading && subs.length > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderTop: `1px solid ${line}` }}>
            <span style={{ fontSize: 12, color: muted }}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, subs.length)} von {subs.length}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${lineS}`, background: page === 0 ? "transparent" : cardBg, color: page === 0 ? muted : ink, cursor: page === 0 ? "default" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>←</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${lineS}`, background: page >= totalPages - 1 ? "transparent" : cardBg, color: page >= totalPages - 1 ? muted : ink, cursor: page >= totalPages - 1 ? "default" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>→</button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
