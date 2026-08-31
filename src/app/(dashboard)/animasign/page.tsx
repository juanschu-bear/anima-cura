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
  signed_pdf_path: string | null;
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

interface DuplicateReviewGroup {
  key: string;
  patient_name: string;
  geburtsdatum: string | null;
  total: number;
  signed_count: number;
  pending_count: number;
  can_auto_close: boolean;
  canonical_submission_id: string | null;
  rows: Array<{
    id: string;
    created_at: string;
    status: string | null;
    signed_pdf_path: string | null;
    ivoris_patient_id: string | null;
    matched_patient_id: string | null;
  }>;
}

interface ManualReviewItem {
  id: string;
  patient_name: string;
  geburtsdatum: string | null;
  created_at: string;
  status: string | null;
  reason: string | null;
  matched_patient_id: string | null;
  ivoris_patient_id: string | null;
}

type StatusPresentation = {
  label: string;
  color: string;
  glow: string;
  textColor: string;
  note?: string;
};

interface PatientHit {
  id: string;
  name: string;
  geburtsdatum?: string | null;
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
  const [resolveTarget, setResolveTarget] = useState<Submission | null>(null);
  const [resolveSearch, setResolveSearch] = useState("");
  const [resolveHits, setResolveHits] = useState<PatientHit[]>([]);
  const [resolveSaving, setResolveSaving] = useState(false);
  const [resolveIvorisId, setResolveIvorisId] = useState("");
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateReviewGroup[]>([]);
  const [manualReviewItems, setManualReviewItems] = useState<ManualReviewItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [closingGroupKey, setClosingGroupKey] = useState<string | null>(null);

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

  useEffect(() => {
    if (!resolveTarget || resolveSearch.trim().length < 2) {
      setResolveHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/praxis/search?q=${encodeURIComponent(resolveSearch.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setResolveHits((data.results || []).map((entry: { id: string; name: string; geburtsdatum?: string | null }) => ({
          id: entry.id,
          name: entry.name,
          geburtsdatum: entry.geburtsdatum ?? null,
        })));
      } catch {
        setResolveHits([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [resolveSearch, resolveTarget]);

  useEffect(() => { void fetchData(); const iv = setInterval(() => { void fetchData(); }, 120_000); return () => clearInterval(iv); }, [fetchData]);

  const fetchReviewQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await fetch("/api/anima-sign/review-queue");
      const data = await res.json();
      setDuplicateGroups(data.duplicateGroups || []);
      setManualReviewItems(data.manualReview || []);
    } catch (error) {
      console.error("[AnimaSign][review-queue]", error);
      setDuplicateGroups([]);
      setManualReviewItems([]);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReviewQueue();
  }, [fetchReviewQueue]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/anima-sign/ivoris-nachsync", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d?.message || "Sync fehlgeschlagen.");
      }
      alert(
        d?.message ||
          `Sync: ${d?.processed ?? 0} Fälle verarbeitet, ${d?.patientSuccess ?? 0} Patienten-Syncs, ${d?.documentSuccess ?? 0} Dokumente.`
      );
      void fetchData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Sync fehlgeschlagen.");
    }
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

  const cols = "1.45fr 0.82fr 0.82fr 0.82fr 0.72fr 0.7fr 0.82fr 0.6fr";

  const dot = (color: string, glow: string) => ({ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${glow}`, flexShrink: 0 } as const);

  const hasSignedPdf = (submission: Submission) => Boolean(submission.signed_pdf_path);

  const errorRed = "#d45a52";
  const errorRedBg = "rgba(212,90,82,0.12)";

  const getSignatureStatus = (submission: Submission): StatusPresentation => {
    if (hasSignedPdf(submission)) {
      return { label: "Signiert", color: blue, glow: blueBg, textColor: ink, note: "PDF liegt vor" };
    }

    if (submission.status === "fehler") {
      return { label: "Fehler", color: errorRed, glow: errorRedBg, textColor: ink, note: "Bitte pruefen" };
    }

    return { label: "Ausstehend", color: gold, glow: goldBg, textColor: muted, note: "Patient muss noch unterschreiben" };
  };

  const getAppStatus = (submission: Submission): StatusPresentation => {
    if (submission.account_email) {
      return {
        label: "Registriert",
        color: green,
        glow: greenBg,
        textColor: ink,
        note: submission.has_logged_in ? "Login erfolgt" : "Account angelegt",
      };
    }

    return { label: "Ausstehend", color: gold, glow: goldBg, textColor: muted, note: "Noch kein Zugang erstellt" };
  };

  const getIvorisStatus = (submission: Submission): StatusPresentation => {
    if (submission.ivoris_synced && submission.ivoris_doc_synced) {
      return { label: "Vollstaendig", color: green, glow: greenBg, textColor: ink, note: "Stammdaten und PDF in Ivoris" };
    }

    if (!hasSignedPdf(submission)) {
      if (submission.ivoris_manual_review) {
        return {
          label: "Stammdaten pruefen",
          color: errorRed,
          glow: errorRedBg,
          textColor: ink,
          note: "Ivoris blockiert das Update, PDF folgt nach Signatur",
        };
      }

      if (submission.ivoris_synced) {
        return { label: "Wartet auf PDF", color: gold, glow: goldBg, textColor: muted, note: "Patientenabgleich ist erledigt" };
      }

      return { label: "Wartet auf Signatur", color: gold, glow: goldBg, textColor: muted, note: "Noch kein unterschriebenes PDF vorhanden" };
    }

    if (submission.ivoris_doc_synced && !submission.ivoris_synced) {
      return { label: "Dokument da", color: blue, glow: blueBg, textColor: ink, note: "PDF ist in Ivoris, Stammdaten offen" };
    }

    if (submission.ivoris_manual_review) {
      return { label: "Stammdaten pruefen", color: errorRed, glow: errorRedBg, textColor: ink, note: "Kontakt- oder Adressupdate manuell in Ivoris pruefen" };
    }

    if (submission.ivoris_synced && !submission.ivoris_doc_synced) {
      return { label: "PDF-Sync offen", color: blue, glow: blueBg, textColor: ink, note: "Patient ist verbunden, Dokument wird noch uebertragen" };
    }

    return { label: "Ausstehend", color: gold, glow: goldBg, textColor: muted, note: "Sync noch nicht abgeschlossen" };
  };

  const getPdfStatusNote = (submission: Submission) => {
    if (submission.signed_pdf_path) {
      return submission.ivoris_doc_synced ? "In Ivoris abgelegt" : "Liegt vor, Sync noch offen";
    }

    if (submission.status === "fehler") {
      return "PDF konnte noch nicht erstellt werden";
    }

    return "Wartet auf Signatur";
  };

  const resolveSubmission = async (payload: { patientId?: string; ivorisId?: string }) => {
    if (!resolveTarget) return;
    setResolveSaving(true);
    try {
      const res = await fetch(`/api/anima-sign/submission/${resolveTarget.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Zuordnung fehlgeschlagen.");
      }
      alert("AnimaSign-Fall wurde übernommen und erneut synchronisiert.");
      setResolveTarget(null);
      setResolveSearch("");
      setResolveHits([]);
      setResolveIvorisId("");
      void fetchData();
      void fetchReviewQueue();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Zuordnung fehlgeschlagen.");
    } finally {
      setResolveSaving(false);
    }
  };

  const closeDuplicateGroup = async (group: DuplicateReviewGroup) => {
    if (!group.can_auto_close || !group.canonical_submission_id) return;
    const closeIds = group.rows
      .filter((row) => row.id !== group.canonical_submission_id && !row.signed_pdf_path && (row.status === "signatur_ausstehend" || row.status === "offen"))
      .map((row) => row.id);
    if (closeIds.length === 0) return;

    setClosingGroupKey(group.key);
    try {
      const res = await fetch("/api/anima-sign/review-queue/resolve-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keepSubmissionId: group.canonical_submission_id,
          closeSubmissionIds: closeIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Dubletten konnten nicht geschlossen werden.");
      }
      alert(`Dubletten bereinigt. Referenzfall bleibt ${group.canonical_submission_id}.`);
      void fetchData();
      void fetchReviewQueue();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Dubletten konnten nicht geschlossen werden.");
    } finally {
      setClosingGroupKey(null);
    }
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

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: cardBg, border: `1px solid ${line}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Sichere Dubletten-Auflösung
              </div>
              <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
                Fälle mit klarer Referenzeinreichung können hier ohne Blindflug bereinigt werden.
              </div>
            </div>
            <button onClick={() => void fetchReviewQueue()} style={{ background: bg2, border: `1px solid ${lineS}`, borderRadius: 10, padding: "8px 12px", color: ink, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Aktualisieren
            </button>
          </div>

          {queueLoading ? (
            <div style={{ fontSize: 13, color: muted, padding: "18px 0" }}>Review-Queue wird geladen…</div>
          ) : duplicateGroups.length === 0 ? (
            <div style={{ fontSize: 13, color: muted, padding: "18px 0" }}>Keine offenen Dublettengruppen im Beobachtungsfenster.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {duplicateGroups.map((group) => (
                <div key={group.key} style={{ border: `1px solid ${line}`, borderRadius: 14, padding: 14, background: bg2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: ink }}>{group.patient_name}</div>
                      <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>
                        {group.geburtsdatum || "Geburtsdatum unbekannt"} · {group.total} Einreichungen · {group.signed_count} signiert · {group.pending_count} offen
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 9px", borderRadius: 999, background: group.can_auto_close ? greenBg : goldBg, color: group.can_auto_close ? green : gold }}>
                      {group.can_auto_close ? "Sicher schließbar" : "Manuell prüfen"}
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    {group.rows.map((row) => (
                      <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: ink, borderTop: `1px solid ${line}`, paddingTop: 8 }}>
                        <span>{row.id.slice(0, 8)} · {row.status || "unbekannt"}</span>
                        <span style={{ color: muted }}>{fmtDate(row.created_at)} {fmtTime(row.created_at)}</span>
                      </div>
                    ))}
                  </div>
                  {group.can_auto_close && group.canonical_submission_id && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: muted }}>
                        Referenzfall: <span style={{ color: ink, fontWeight: 700 }}>{group.canonical_submission_id.slice(0, 8)}</span>
                      </div>
                      <button
                        type="button"
                        disabled={closingGroupKey === group.key}
                        onClick={() => void closeDuplicateGroup(group)}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 10,
                          border: `1px solid ${green}`,
                          background: greenBg,
                          color: green,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: closingGroupKey === group.key ? "wait" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {closingGroupKey === group.key ? "Bereinige…" : "Offene Dubletten schließen"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: cardBg, border: `1px solid ${line}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Manuelle Prüffälle
          </div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>
            Diese Fälle bleiben absichtlich unter menschlicher Kontrolle, wenn Ivoris mehrere plausible Treffer liefert.
          </div>
          {queueLoading ? (
            <div style={{ fontSize: 13, color: muted, padding: "18px 0" }}>Prüffälle werden geladen…</div>
          ) : manualReviewItems.length === 0 ? (
            <div style={{ fontSize: 13, color: muted, padding: "18px 0" }}>Keine offenen Prüffälle.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {manualReviewItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    const [firstName = "", ...rest] = item.patient_name.split(" ");
                    setResolveTarget({
                      id: item.id,
                      vorname: firstName,
                      nachname: rest.join(" "),
                      email: null,
                      created_at: item.created_at,
                      status: item.status || "fehler",
                      is_existing: Boolean(item.matched_patient_id),
                      matched_patient_id: item.matched_patient_id,
                      account_email: null,
                      signed_pdf_path: null,
                      ivoris_synced: false,
                      ivoris_sync_error: item.reason,
                      ivoris_doc_synced: false,
                      ivoris_sync_failed_permanently: true,
                      ivoris_doc_failed_permanently: false,
                      ivoris_manual_review: true,
                      ivoris_manual_review_reason: item.reason,
                      has_logged_in: false,
                      last_login: null,
                    });
                    setResolveSearch(item.patient_name);
                    setResolveIvorisId(item.ivoris_patient_id || "");
                    setResolveHits([]);
                  }}
                  style={{ textAlign: "left", border: `1px solid ${line}`, borderRadius: 14, background: bg2, padding: 14, color: ink, cursor: "pointer", fontFamily: "inherit" }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{item.patient_name}</div>
                  <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>
                    {item.geburtsdatum || "Geburtsdatum unbekannt"} · {fmtDate(item.created_at)}
                  </div>
                  <div style={{ fontSize: 12, color: ink, marginTop: 8, lineHeight: 1.5 }}>{item.reason || "Manuelle Auflösung erforderlich."}</div>
                </button>
              ))}
            </div>
          )}
        </div>
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
          <span>Patient</span><span>Bogen</span><span>Unterschrift</span><span>App-Status</span><span>Angemeldet</span><span>Ivoris</span><span>PDF</span><span style={{ textAlign: "right" }}>Zeit</span>
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
            <div>
              {(() => {
                const signature = getSignatureStatus(s);
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={dot(signature.color, signature.glow)} />
                      <span style={{ fontSize: 12, color: signature.textColor }}>
                        {signature.label}
                      </span>
                    </div>
                    {signature.note && (
                      <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>{signature.note}</div>
                    )}
                  </>
                );
              })()}
            </div>
            {/* App-Status */}
            <div>
              {(() => {
                const appStatus = getAppStatus(s);
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={dot(appStatus.color, appStatus.glow)} />
                      <span style={{ fontSize: 12, color: appStatus.textColor }}>
                        {appStatus.label}
                      </span>
                    </div>
                    {appStatus.note && (
                      <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>{appStatus.note}</div>
                    )}
                  </>
                );
              })()}
            </div>
            {/* Angemeldet */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={dot(s.has_logged_in ? green : (dk ? "rgba(255,255,255,0.1)" : "#d4cbbf"), s.has_logged_in ? greenBg : "transparent")} />
              <span style={{ fontSize: 12, color: s.has_logged_in ? ink : muted }}>
                {s.has_logged_in ? "Ja" : "Nein"}
              </span>
            </div>
            {/* Ivoris */}
            <div>
              {(() => {
                const ivoris = getIvorisStatus(s);
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={dot(ivoris.color, ivoris.glow)} />
                      <span style={{ fontSize: 12, color: ivoris.textColor }}>
                        {ivoris.label}
                      </span>
                      {s.ivoris_manual_review && (
                        <button
                          type="button"
                          onClick={() => {
                            setResolveTarget(s);
                            setResolveSearch(`${s.nachname} ${s.vorname}`.trim());
                            setResolveIvorisId("");
                            setResolveHits([]);
                          }}
                          style={{
                            marginLeft: 8,
                            padding: "5px 8px",
                            borderRadius: 8,
                            border: `1px solid ${lineS}`,
                            background: bg2,
                            color: ink,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          Zuordnen
                        </button>
                      )}
                    </div>
                    {ivoris.note && (
                      <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>{ivoris.note}</div>
                    )}
                  </>
                );
              })()}
            </div>
            {/* PDF */}
            <div>
              {s.signed_pdf_path ? (
                <>
                  <a
                    href={`/api/anima-sign/submission/${s.id}/signed-pdf`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 78,
                      padding: "6px 10px",
                      borderRadius: 9,
                      border: `1px solid ${blue}`,
                      background: blueBg,
                      color: blue,
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Oeffnen
                  </a>
                  <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>{getPdfStatusNote(s)}</div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12, color: muted }}>Noch nicht da</span>
                  <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>{getPdfStatusNote(s)}</div>
                </>
              )}
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

      {resolveTarget && (
        <div
          onClick={() => !resolveSaving && setResolveTarget(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(680px, 100%)",
              background: cardBg,
              border: `1px solid ${line}`,
              borderRadius: 18,
              padding: 22,
              boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: ink }}>
                  AnimaSign manuell auflösen
                </div>
                <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
                  {resolveTarget.nachname}, {resolveTarget.vorname}
                </div>
              </div>
              <button
                type="button"
                onClick={() => !resolveSaving && setResolveTarget(null)}
                style={{ border: "none", background: "transparent", color: muted, cursor: "pointer", fontSize: 20 }}
              >
                ×
              </button>
            </div>

            {resolveTarget.ivoris_manual_review_reason && (
              <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, background: bg2, border: `1px solid ${line}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Warum hakt es?
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: ink }}>{resolveTarget.ivoris_manual_review_reason}</div>
              </div>
            )}

            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: ink, marginBottom: 8 }}>1. Lokalen Patienten auswählen</div>
                <input
                  value={resolveSearch}
                  onChange={(event) => setResolveSearch(event.target.value)}
                  placeholder="Patient in Anima Cura suchen"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: `1px solid ${lineS}`,
                    background: bg,
                    color: ink,
                    fontSize: 14,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                {resolveHits.length > 0 && (
                  <div style={{ marginTop: 10, display: "grid", gap: 8, maxHeight: 240, overflowY: "auto" }}>
                    {resolveHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        disabled={resolveSaving}
                        onClick={() => void resolveSubmission({ patientId: hit.id })}
                        style={{
                          textAlign: "left",
                          padding: "12px 14px",
                          borderRadius: 12,
                          border: `1px solid ${line}`,
                          background: bg2,
                          color: ink,
                          cursor: resolveSaving ? "wait" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{hit.name}</div>
                        <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{hit.geburtsdatum || "Geburtsdatum unbekannt"}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: ink, marginBottom: 8 }}>2. Oder direkte Ivoris-ID eintragen</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    value={resolveIvorisId}
                    onChange={(event) => setResolveIvorisId(event.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    style={{
                      flex: 1,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1px solid ${lineS}`,
                      background: bg,
                      color: ink,
                      fontSize: 14,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    type="button"
                    disabled={resolveSaving || !resolveIvorisId.trim()}
                    onClick={() => void resolveSubmission({ ivorisId: resolveIvorisId.trim() })}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: `1px solid ${blue}`,
                      background: blueBg,
                      color: blue,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: resolveSaving ? "wait" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Jetzt auflösen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
