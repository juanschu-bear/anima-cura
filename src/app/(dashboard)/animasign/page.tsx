"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { ImportReviewList } from '@/components/animasign/ImportReviewList';
import { t } from '@/lib/i18n';

type ErrorKind = "duplicate_closed" | "rejected" | "signing_service" | "pdf_service" | "config";

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
  ivoris_field_results?: Record<string, { status: "verified" | "mismatch" | "not_provided" | "unsupported"; target: string | null; verifiedAt?: string }>;
  error_kind?: ErrorKind | null;
  error_reason?: string | null;
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

interface PatientIdentityConflict {
  key: string;
  patient_name: string;
  geburtsdatum: string | null;
  ivoris_ids: string[];
  match_kind: "exact" | "first_name_variant";
  patients: Array<{ id: string; ivoris_id: string | null; vorname: string | null; nachname: string | null; created_at: string }>;
}

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

interface OutboxStats {
  queued: number;
  processing: number;
  retryWait: number;
  manualReview: number;
  patientOpen: number;
  documentOpen: number;
  scribeOpen: number;
  maxAttempts: number;
  oldestAgeMinutes: number;
  nextRetryAt: string | null;
  serviceOutageJobs: number;
  dominantOutage: string | null;
}

const EMPTY_OUTBOX: OutboxStats = {
  queued: 0,
  processing: 0,
  retryWait: 0,
  manualReview: 0,
  patientOpen: 0,
  documentOpen: 0,
  scribeOpen: 0,
  maxAttempts: 0,
  oldestAgeMinutes: 0,
  nextRetryAt: null,
  serviceOutageJobs: 0,
  dominantOutage: null,
};

interface StabilityEvidence {
  latestDate: string | null;
  latestObservedAt: string | null;
  latestHealthy: boolean | null;
  healthyDayStreak: number;
  observedDays: number;
}

const EMPTY_STABILITY: StabilityEvidence = {
  latestDate: null,
  latestObservedAt: null,
  latestHealthy: null,
  healthyDayStreak: 0,
  observedDays: 0,
};

interface SignatureServiceState {
  checkedAt: string;
  healthy: boolean;
  httpStatus: number | null;
  serviceStatus: string | null;
  databaseStatus: string | null;
  certificateStatus: string | null;
  responseMs: number | null;
}

type FilterTab = "today" | "week" | "all" | "open";
type QueueKey = "assign" | "identity" | "import" | "duplicates";
/** done = erledigt, wait = Patient ist am Zug, prog = läuft automatisch, act = Praxis ist am Zug, closed = bewusst geschlossen */
type Kind = "done" | "wait" | "prog" | "act" | "closed";
type StepState = "ok" | "now" | "prog" | "act" | "off";
type Notice = { ok: boolean; text: string } | null;

const PAGE_SIZE = 15;
const TECHNICAL: ErrorKind[] = ["signing_service", "pdf_service", "config"];

export default function AnimaSignPage() {
  const { locale, theme } = useAppStore();
  const dk = theme === "dark";
  const tt = useCallback((key: string, vars?: Record<string, string | number>) => t(`animasign.${key}`, locale, vars), [locale]);

  const [subs, setSubs] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, today: 0, matched: 0, pendingSignatures: 0, registrations: 0, loggedIn: 0 });
  const [outbox, setOutbox] = useState<OutboxStats>(EMPTY_OUTBOX);
  const [stability, setStability] = useState<StabilityEvidence>(EMPTY_STABILITY);
  const [signatureService, setSignatureService] = useState<SignatureServiceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
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
  const [patientIdentityConflicts, setPatientIdentityConflicts] = useState<PatientIdentityConflict[]>([]);
  const [importTotal, setImportTotal] = useState<number | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [reviewError, setReviewError] = useState(false);
  const [reviewPage, setReviewPage] = useState(0);
  const manualPages = Math.max(1, Math.ceil(manualReviewItems.length / 15));
  const manualPage = Math.min(reviewPage, manualPages - 1);
  const [closingGroupKey, setClosingGroupKey] = useState<string | null>(null);
  const [openQueue, setOpenQueue] = useState<QueueKey | null>(null);
  const [detail, setDetail] = useState<Submission | null>(null);
  const [systemOpen, setSystemOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // Suche erst nach kurzer Tipp-Pause an den Server geben.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ filter });
      if (search.trim().length >= 2) p.set("search", search.trim());
      const res = await fetch(`/api/anima-sign/dashboard?${p}`);
      const d = await res.json();
      setSubs(d.submissions || []);
      setStats(d.stats || { total: 0, today: 0, matched: 0, pendingSignatures: 0, registrations: 0, loggedIn: 0 });
      setOutbox(d.outbox || EMPTY_OUTBOX);
      setStability(d.stability || EMPTY_STABILITY);
      setSignatureService(d.signatureService ?? null);
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
    setReviewError(false);
    try {
      const res = await fetch("/api/anima-sign/review-queue");
      if (!res.ok) throw new Error('review_queue_unavailable');
      const data = await res.json();
      setDuplicateGroups(data.duplicateGroups || []);
      setManualReviewItems(data.manualReview || []);
      setPatientIdentityConflicts(data.patientIdentityConflicts || []);
    } catch (error) {
      setReviewError(true);
      console.error("[AnimaSign][review-queue]", error);
      setDuplicateGroups([]);
      setManualReviewItems([]);
      setPatientIdentityConflicts([]);
    } finally {
      setQueueLoading(false);
    }
    try {
      const res = await fetch("/api/anima-sign/import-reviews?page=0", { cache: "no-store" });
      const data = res.ok ? await res.json() : null;
      setImportTotal(data && Number.isSafeInteger(data.total) ? data.total : null);
    } catch {
      setImportTotal(null);
    }
  }, []);

  useEffect(() => {
    void fetchReviewQueue();
  }, [fetchReviewQueue]);

  useEffect(() => {
    if (!detail && !resolveTarget) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (resolveTarget && !resolveSaving) setResolveTarget(null);
      else setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, resolveTarget, resolveSaving]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/anima-sign/ivoris-nachsync", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d?.message || tt("sync.failed"));
      }
      setNotice({
        ok: true,
        text: d?.message || tt("sync.done", { processed: d?.processed ?? 0, patients: d?.patientSuccess ?? 0, documents: d?.documentSuccess ?? 0 }),
      });
      void fetchData();
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : tt("sync.failed") });
    }
    setSyncing(false);
  };

  const paged = subs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(subs.length / PAGE_SIZE);
  const rate = stats.total > 0 ? Math.round((stats.loggedIn / stats.total) * 100) : 0;

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const fmtShort = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  const fmtAge = (minutes: number) => minutes >= 1440
    ? tt("age.days", { d: Math.floor(minutes / 1440), h: Math.floor((minutes % 1440) / 60) })
    : minutes >= 60
      ? tt("age.hours", { h: Math.floor(minutes / 60), m: minutes % 60 })
      : tt("age.minutes", { m: minutes });

  // Farben und Schriften der bisherigen AnimaSign-Seite.
  const bg = dk ? "#0c1014" : "#f5f1eb";
  const cardBg = dk ? "#141c24" : "#ffffff";
  const ink = dk ? "#e4e8ec" : "#2c2a26";
  const muted = dk ? "#6b7a8a" : "#8a847a";
  const faint = dk ? "#4a5a6a" : "#b0a99e";
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
  const errorRed = "#d45a52";
  const errorRedBg = "rgba(212,90,82,0.12)";
  const serif = "'Fraunces', serif";

  const kindColor: Record<Kind, { c: string; bg: string }> = {
    done: { c: green, bg: greenBg },
    wait: { c: muted, bg: bg2 },
    prog: { c: blue, bg: blueBg },
    act: { c: gold, bg: goldBg },
    closed: { c: muted, bg: bg2 },
  };
  const stepColor: Record<StepState, string> = { ok: green, now: "transparent", prog: blue, act: gold, off: line };

  const statCards = [
    { n: stats.today, l: tt("stat.today"), c: blue, a: dk ? "linear-gradient(90deg,#3a7ab0,#5ba4d9)" : "linear-gradient(90deg,#2d6a9e,#3b7fbf)", badge: tt("stat.todayBadge", { n: stats.today }) },
    { n: stats.registrations, l: tt("stat.accounts"), c: green, a: dk ? "linear-gradient(90deg,#3da67a,#52c48e)" : "linear-gradient(90deg,#2e7a5a,#3a9670)" },
    { n: stats.loggedIn, l: tt("stat.loggedIn"), c: dk ? "#7bb8e0" : "#2d6a9e", a: dk ? "linear-gradient(90deg,#2d6a9e,#7bb8e0)" : "linear-gradient(90deg,#1e5a8e,#2d6a9e)" },
    { n: stats.pendingSignatures, l: tt("stat.pending"), c: gold, a: dk ? "linear-gradient(90deg,#a68428,#d4a73a)" : "linear-gradient(90deg,#8a6a18,#b08a22)" },
    { n: stats.matched, l: tt("stat.matched"), c: matchC, a: dk ? "linear-gradient(90deg,#5a7a2a,#8aaa52)" : "linear-gradient(90deg,#4a6a20,#6a8a30)" },
  ];

  const filters: { k: FilterTab; l: string }[] = [
    { k: "today", l: tt("filter.today", { n: stats.today }) },
    { k: "week", l: tt("filter.week") },
    { k: "all", l: tt("filter.all", { n: stats.total }) },
    { k: "open", l: tt("filter.open") },
  ];

  const daysOpen = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

  /** Ein Stand pro Einreichung, in Praxissprache. Technische Ausfälle sind keine Praxisarbeit. */
  const describe = (s: Submission): { kind: Kind; label: string; note: string } => {
    const kind = s.error_kind ?? null;
    if (kind === "duplicate_closed") return { kind: "closed", label: tt("state.closed"), note: tt("state.closedNote") };
    if (s.signed_pdf_path && s.ivoris_synced && s.ivoris_doc_synced) return { kind: "done", label: tt("state.done"), note: tt("state.doneNote") };
    if (s.ivoris_manual_review) return { kind: "act", label: tt("state.assign"), note: s.ivoris_manual_review_reason || tt("state.assignNote") };
    if (kind === "rejected") return { kind: "act", label: tt("state.rejected"), note: s.error_reason || tt("state.rejectedNote") };
    if (kind && TECHNICAL.includes(kind)) return { kind: "prog", label: tt(`state.technical.${kind}`), note: tt(`state.technicalNote.${kind}`) };
    if (!s.signed_pdf_path) {
      const d = daysOpen(s.created_at);
      return { kind: "wait", label: tt("state.waiting"), note: d === 0 ? tt("state.waitingToday") : d === 1 ? tt("state.waitingOne") : tt("state.waitingDays", { n: d }) };
    }
    if (s.ivoris_doc_synced && !s.ivoris_synced) return { kind: "prog", label: tt("state.docOnly"), note: tt("state.docOnlyNote") };
    if (s.ivoris_synced && !s.ivoris_doc_synced) return { kind: "prog", label: tt("state.patientOnly"), note: tt("state.patientOnlyNote") };
    return { kind: "prog", label: tt("state.transfer"), note: tt("state.transferNote") };
  };

  const STEP_KEYS = ["form", "signature", "ivoris", "app"] as const;
  const steps = (s: Submission): StepState[] => {
    const kind = s.error_kind ?? null;
    if (kind === "duplicate_closed") return ["ok", "off", "off", "off"];
    const signature: StepState = s.signed_pdf_path ? "ok" : kind === "rejected" ? "act" : kind && TECHNICAL.includes(kind) ? "prog" : "now";
    const ivoris: StepState = s.ivoris_synced && s.ivoris_doc_synced ? "ok" : s.ivoris_manual_review ? "act" : s.ivoris_synced || s.ivoris_doc_synced ? "prog" : "off";
    const app: StepState = s.has_logged_in ? "ok" : s.account_email ? "prog" : "off";
    return ["ok", signature, ivoris, app];
  };
  const stepLabel = (s: Submission, kind: Kind) => {
    if (kind === "closed") return tt("progress.closed");
    const st = steps(s);
    const i = st.findIndex((x) => x !== "ok");
    if (i < 0) return tt("progress.allDone");
    const name = tt(`step.${STEP_KEYS[i]}`);
    return kind === "wait" ? tt("progress.waitingAt", { step: name }) : kind === "act" ? tt("progress.stuckAt", { step: name }) : tt("progress.runningAt", { step: name });
  };

  const getFieldEvidenceNote = (submission: Submission) => {
    const labels: Record<string, string> = {
      email: tt("field.email"),
      telefon: tt("field.phone"),
      mobiltelefon: tt("field.mobile"),
      adresse: tt("field.address"),
    };
    const verified = Object.entries(submission.ivoris_field_results ?? {})
      .filter(([field, result]) => labels[field] && result.status === "verified")
      .map(([field]) => labels[field]);
    return verified.length > 0 ? tt("field.verified", { fields: verified.join(", ") }) : null;
  };

  const openResolve = (s: Submission) => {
    setResolveTarget(s);
    setResolveSearch(`${s.nachname} ${s.vorname}`.trim());
    setResolveIvorisId("");
    setResolveHits([]);
  };

  const openResolveFromReview = (item: ManualReviewItem) => {
    const [firstName = "", ...rest] = item.patient_name.split(" ");
    setResolveTarget({
      id: item.id,
      vorname: firstName,
      nachname: rest.join(" "),
      email: null,
      created_at: item.created_at,
      status: item.status || "offen",
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
        throw new Error(data?.error || tt("resolve.failed"));
      }
      setNotice({ ok: true, text: tt("resolve.done") });
      setResolveTarget(null);
      setDetail(null);
      setResolveSearch("");
      setResolveHits([]);
      setResolveIvorisId("");
      void fetchData();
      void fetchReviewQueue();
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : tt("resolve.failed") });
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
        throw new Error(data?.error || tt("dup.failed"));
      }
      setNotice({ ok: true, text: tt("dup.done") });
      void fetchData();
      void fetchReviewQueue();
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : tt("dup.failed") });
    } finally {
      setClosingGroupKey(null);
    }
  };

  const queues: { k: QueueKey; l: string; hint: string; n: number | null; a: string }[] = useMemo(() => [
    { k: "assign", l: tt("queue.assign"), hint: tt("queue.assignHint"), n: queueLoading ? null : manualReviewItems.length, a: dk ? "linear-gradient(90deg,#a68428,#d4a73a)" : "linear-gradient(90deg,#8a6a18,#b08a22)" },
    { k: "identity", l: tt("queue.identity"), hint: tt("queue.identityHint"), n: queueLoading ? null : patientIdentityConflicts.length, a: dk ? "linear-gradient(90deg,#a68428,#d4a73a)" : "linear-gradient(90deg,#8a6a18,#b08a22)" },
    { k: "import", l: tt("queue.import"), hint: tt("queue.importHint"), n: importTotal, a: dk ? "linear-gradient(90deg,#a68428,#d4a73a)" : "linear-gradient(90deg,#8a6a18,#b08a22)" },
    { k: "duplicates", l: tt("queue.duplicates"), hint: tt("queue.duplicatesHint"), n: queueLoading ? null : duplicateGroups.length, a: dk ? "linear-gradient(90deg,#a68428,#d4a73a)" : "linear-gradient(90deg,#8a6a18,#b08a22)" },
  ], [tt, queueLoading, manualReviewItems.length, patientIdentityConflicts.length, importTotal, duplicateGroups.length, dk]);

  // Systemlage: rot nur, wenn wirklich etwas ausgefallen ist.
  const signDown = signatureService ? !signatureService.healthy : false;
  const ivorisDown = outbox.serviceOutageJobs > 0;
  const nextRetryFuture = outbox.nextRetryAt ? new Date(outbox.nextRetryAt).getTime() > Date.now() : false;

  const label = { fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.08em" } as const;
  const card = { background: cardBg, border: `1px solid ${line}`, borderRadius: 14 } as const;
  const dot = (color: string, hollow = false) => ({ width: 8, height: 8, borderRadius: "50%", background: hollow ? "transparent" : color, border: hollow ? `1.5px solid ${color}` : "none", boxShadow: hollow ? "none" : `0 0 6px ${color}55`, flexShrink: 0 } as const);
  const smallBtn = (c: string, b: string) => ({ padding: "7px 12px", borderRadius: 9, border: `1px solid ${c}`, background: b, color: c, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" } as const);

  const dupStatus = (status: string | null) => tt(`dupStatus.${status ?? "unknown"}`);

  const renderQueuePanel = () => {
    if (!openQueue) return null;
    if (openQueue === "import") {
      return <div style={{ ...card, padding: "4px 20px", marginBottom: 24, color: ink }}><ImportReviewList /></div>;
    }
    if (queueLoading) return <div style={{ ...card, padding: 20, marginBottom: 24, fontSize: 13, color: muted }}>{tt("queue.loading")}</div>;
    if (reviewError) {
      return (
        <div role="alert" style={{ ...card, padding: 20, marginBottom: 24, fontSize: 13, color: ink, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>{tt("queue.loadError")}</span>
          <button type="button" onClick={() => void fetchReviewQueue()} style={smallBtn(ink, bg2)}>{tt("queue.retry")}</button>
        </div>
      );
    }
    if (openQueue === "assign") {
      if (manualReviewItems.length === 0) return <div style={{ ...card, padding: 20, marginBottom: 24, fontSize: 13, color: muted }}>{tt("queue.empty")}</div>;
      return (
        <div style={{ ...card, overflow: "hidden", marginBottom: 24 }}>
          {manualReviewItems.slice(manualPage * 15, (manualPage + 1) * 15).map((item, i) => (
            <div key={item.id} className="as-qrow" style={{ borderTop: i ? `1px solid ${line}` : "none" }}>
              <div>
                <div style={{ fontWeight: 600, color: ink }}>{item.patient_name}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{item.geburtsdatum ? tt("born", { date: item.geburtsdatum }) : tt("birthUnknown")} · {tt("received", { date: fmtDate(item.created_at) })}</div>
              </div>
              <div style={{ fontSize: 13, color: ink, lineHeight: 1.5 }}>{item.reason || tt("state.assignNote")}</div>
              <div style={{ textAlign: "right" }}><button type="button" onClick={() => openResolveFromReview(item)} style={smallBtn(gold, goldBg)}>{tt("next.assign")}</button></div>
            </div>
          ))}
          {manualPages > 1 && (
            <nav aria-label={t('intake.reviewPage', locale, { page: manualPage + 1, pages: manualPages, total: manualReviewItems.length })} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderTop: `1px solid ${line}`, background: bg2, fontSize: 12, color: muted }}>
              <span>{t('intake.reviewPage', locale, { page: manualPage + 1, pages: manualPages, total: manualReviewItems.length })}</span>
              <span style={{ display: "flex", gap: 8 }}>
                <button type="button" disabled={manualPage === 0} onClick={() => setReviewPage(manualPage - 1)} style={smallBtn(ink, cardBg)}>{t('intake.previous', locale)}</button>
                <button type="button" disabled={manualPage + 1 >= manualPages} onClick={() => setReviewPage(manualPage + 1)} style={smallBtn(ink, cardBg)}>{t('intake.next', locale)}</button>
              </span>
            </nav>
          )}
        </div>
      );
    }
    if (openQueue === "identity") {
      if (patientIdentityConflicts.length === 0) return <div style={{ ...card, padding: 20, marginBottom: 24, fontSize: 13, color: muted }}>{tt("queue.empty")}</div>;
      return (
        <div style={{ ...card, overflow: "hidden", marginBottom: 24 }}>
          {patientIdentityConflicts.map((conflict, i) => (
            <div key={conflict.key} className="as-idrow" style={{ borderTop: i ? `1px solid ${line}` : "none" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: gold, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {conflict.match_kind === "first_name_variant" ? tt("identity.variant") : tt("identity.twoFiles")}
                </div>
                <div style={{ fontWeight: 600, color: ink, marginTop: 5 }}>{conflict.patient_name}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{conflict.geburtsdatum ? tt("born", { date: conflict.geburtsdatum }) : tt("birthUnknown")}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 6, lineHeight: 1.5 }}>
                  {conflict.match_kind === "first_name_variant" ? tt("identity.variantText") : tt("identity.twoFilesText")}
                </div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {conflict.patients.map((patient) => (
                  <div key={patient.id} style={{ border: `1px solid ${line}`, background: bg2, borderRadius: 10, padding: "8px 12px", fontSize: 12, color: muted }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: ink }}>{[patient.vorname, patient.nachname].filter(Boolean).join(" ") || tt("unknown")}</div>
                    {patient.ivoris_id ? tt("identity.record", { id: patient.ivoris_id, date: fmtDate(patient.created_at) }) : tt("identity.notLinked", { date: fmtDate(patient.created_at) })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (duplicateGroups.length === 0) return <div style={{ ...card, padding: 20, marginBottom: 24, fontSize: 13, color: muted }}>{tt("dup.empty")}</div>;
    return (
      <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
        {duplicateGroups.map((group) => (
          <div key={group.key} style={{ ...card, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: ink }}>{group.patient_name}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 3 }}>
                  {group.geburtsdatum ? tt("born", { date: group.geburtsdatum }) : tt("birthUnknown")} · {tt("dup.counts", { total: group.total, signed: group.signed_count, pending: group.pending_count })}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 9px", borderRadius: 999, background: group.can_auto_close ? greenBg : goldBg, color: group.can_auto_close ? green : gold }}>
                {group.can_auto_close ? tt("dup.safe") : tt("dup.manual")}
              </span>
            </div>
            <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
              {group.rows.map((row) => (
                <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: ink, borderTop: `1px solid ${line}`, paddingTop: 7 }}>
                  <span>{fmtDate(row.created_at)} {fmtTime(row.created_at)} · {dupStatus(row.status)}{row.id === group.canonical_submission_id ? ` · ${tt("dup.valid")}` : ""}</span>
                </div>
              ))}
            </div>
            {group.can_auto_close && group.canonical_submission_id && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button type="button" disabled={closingGroupKey === group.key} onClick={() => void closeDuplicateGroup(group)} style={{ ...smallBtn(green, greenBg), cursor: closingGroupKey === group.key ? "wait" : "pointer" }}>
                  {closingGroupKey === group.key ? tt("dup.closing") : tt("dup.close")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderDetail = () => {
    if (!detail) return null;
    const s = detail;
    const d = describe(s);
    const kc = kindColor[d.kind];
    const evidence = getFieldEvidenceNote(s);
    const kind = s.error_kind ?? null;
    const technical = Boolean(kind && TECHNICAL.includes(kind));
    const tl: { st: StepState; name: string; note: string; when?: string }[] = [
      { st: "ok", name: tt("detail.form"), note: "", when: `${fmtShort(s.created_at)} ${fmtTime(s.created_at)}` },
      kind === "duplicate_closed"
        ? { st: "off", name: tt("detail.closed"), note: tt("state.closedNote") }
        : { st: s.signed_pdf_path ? "ok" : kind === "rejected" ? "act" : technical ? "prog" : "now", name: tt("detail.signature"), note: s.signed_pdf_path ? tt("detail.signed") : kind === "rejected" ? tt("state.rejected") : technical ? tt(`state.technical.${kind}`) : tt("detail.open") },
      ...(kind === "duplicate_closed" ? [] : [
        { st: (s.ivoris_synced ? "ok" : s.ivoris_manual_review ? "act" : "off") as StepState, name: tt("detail.ivorisPatient"), note: s.ivoris_synced ? [tt("detail.matched"), evidence].filter(Boolean).join(" · ") : s.ivoris_manual_review ? tt("state.assign") : tt("detail.open") },
        { st: (s.ivoris_doc_synced ? "ok" : s.signed_pdf_path ? "prog" : "off") as StepState, name: tt("detail.ivorisDocument"), note: s.ivoris_doc_synced ? tt("detail.filed") : s.signed_pdf_path ? tt("detail.transferring") : tt("detail.afterSignature") },
        { st: (s.has_logged_in ? "ok" : s.account_email ? "prog" : "off") as StepState, name: tt("detail.app"), note: s.has_logged_in ? (s.last_login ? tt("detail.loggedInAt", { date: fmtDate(s.last_login) }) : tt("detail.loggedIn")) : s.account_email ? tt("detail.accountCreated") : tt("detail.noAccount") },
      ]),
    ];
    const iconChar: Record<StepState, string> = { ok: "✓", act: "!", prog: "…", now: "", off: "" };
    return (
      <>
        <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 90 }} />
        <aside role="dialog" aria-modal="true" aria-labelledby="as-detail-title" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(480px, 100%)", background: cardBg, borderLeft: `1px solid ${line}`, boxShadow: "0 24px 70px rgba(0,0,0,0.35)", zIndex: 91, display: "flex", flexDirection: "column", fontFamily: "'Hanken Grotesk', sans-serif" }}>
          <div style={{ padding: "22px 22px 16px", borderBottom: `1px solid ${line}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 id="as-detail-title" style={{ fontFamily: serif, fontSize: 24, fontWeight: 600, color: ink, margin: 0 }}>{s.nachname}, {s.vorname}</h2>
              <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{s.is_existing ? tt("patient.existing") : tt("patient.new")} · {tt("received", { date: `${fmtDate(s.created_at)} ${fmtTime(s.created_at)}` })}</div>
            </div>
            <button type="button" aria-label={tt("close")} onClick={() => setDetail(null)} style={{ border: "none", background: bg2, borderRadius: 10, width: 36, height: 36, color: muted, cursor: "pointer", fontSize: 18, flexShrink: 0 }}>×</button>
          </div>
          <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1 }}>
            <div style={{ borderRadius: 12, padding: "12px 14px", marginBottom: 20, background: kc.bg, border: `1px solid ${d.kind === "act" ? gold : line}` }}>
              <div style={{ ...label, fontSize: 11, color: d.kind === "act" ? gold : muted, marginBottom: 5 }}>{d.kind === "act" ? tt("detail.todo") : tt("detail.state")}</div>
              <div style={{ fontSize: 14, color: ink, lineHeight: 1.5 }}><b>{d.label}.</b> {d.note}</div>
            </div>
            <div style={{ ...label, marginBottom: 6 }}>{tt("detail.timeline")}</div>
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {tl.map((step, i) => (
                <li key={i} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${line}` : "none", alignItems: "flex-start" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, marginTop: 1, color: "#fff", background: step.st === "now" ? "transparent" : step.st === "off" ? line : stepColor[step.st], border: step.st === "now" ? `1.5px solid ${muted}` : "none" }}>{iconChar[step.st]}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: ink }}>{step.name}</div>
                    {step.note && <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{step.note}</div>}
                  </div>
                  <span style={{ fontSize: 12, color: muted, whiteSpace: "nowrap" }}>{step.when || ""}</span>
                </li>
              ))}
            </ol>
          </div>
          <div style={{ padding: "14px 22px", borderTop: `1px solid ${line}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {s.ivoris_manual_review && <button type="button" onClick={() => openResolve(s)} style={smallBtn(gold, goldBg)}>{tt("next.assign")}</button>}
            {s.signed_pdf_path && <a href={`/api/anima-sign/submission/${s.id}/signed-pdf`} target="_blank" rel="noreferrer" style={{ ...smallBtn(blue, blueBg), textDecoration: "none" }}>{tt("next.pdf")}</a>}
            <button type="button" onClick={() => setDetail(null)} style={{ ...smallBtn(ink, bg2), marginLeft: "auto" }}>{tt("close")}</button>
          </div>
        </aside>
      </>
    );
  };

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", padding: "32px 24px", fontFamily: "'Hanken Grotesk', sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .as-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 24px; }
        .as-queues { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 14px; }
        .as-sys { display: grid; grid-template-columns: 1fr 1fr; }
        .as-sys > div + div { border-left: 1px solid ${line}; }
        .as-kv { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 18px; }
        .as-row { display: grid; grid-template-columns: 1.3fr 1.9fr 0.95fr 0.85fr 0.55fr; gap: 14px; align-items: center; padding: 13px 20px; }
        .as-row.as-body { cursor: pointer; transition: background .12s; }
        .as-row.as-body:hover { background: ${bg2}; }
        .as-row.as-body:focus-visible { outline: 2px solid ${blue}; outline-offset: -2px; }
        .as-qrow { display: grid; grid-template-columns: 1fr 1.6fr auto; gap: 16px; align-items: center; padding: 14px 20px; }
        .as-idrow { display: grid; grid-template-columns: 1fr 1.2fr; gap: 16px; align-items: start; padding: 16px 20px; }
        .as-q { text-align: left; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; justify-content: flex-start; align-items: stretch; }
        .as-q:hover { border-color: ${lineS} !important; }
        @media (max-width: 900px) {
          .as-stats { grid-template-columns: repeat(2, 1fr); }
          .as-queues { grid-template-columns: repeat(2, 1fr); }
          .as-sys { grid-template-columns: 1fr; }
          .as-sys > div + div { border-left: none; border-top: 1px solid ${line}; }
          .as-kv { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .as-row.as-head { display: none; }
          .as-row { grid-template-columns: 1fr auto; gap: 8px 12px; }
          .as-row .as-c-state, .as-row .as-c-progress { grid-column: 1 / -1; }
          .as-row .as-c-next { grid-column: 1; grid-row: 4; }
          .as-row .as-c-time { grid-column: 2; grid-row: 1; align-self: start; }
          .as-qrow, .as-idrow { grid-template-columns: 1fr; }
          .as-qrow > div:last-child { text-align: left !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: serif, fontSize: 26, fontWeight: 600, color: ink }}>{tt("title")}</h1>
          <div style={{ fontSize: 13, color: muted, marginTop: 3 }}>{tt("subtitle")}</div>
        </div>
        <button onClick={handleSync} disabled={syncing} style={{ background: blueBg, border: `1px solid ${dk ? "rgba(91,164,217,0.2)" : "rgba(59,127,191,0.2)"}`, color: blue, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "9px 18px", borderRadius: 10, cursor: syncing ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 7, opacity: syncing ? 0.7 : 1 }}>
          <RefreshCw size={14} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
          {syncing ? tt("sync.running") : tt("sync.button")}
        </button>
      </div>

      {notice && (
        <div role="status" style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px", marginBottom: 20, borderColor: notice.ok ? green : errorRed, background: notice.ok ? greenBg : errorRedBg }}>
          <span style={{ flex: 1, fontSize: 13, color: ink, lineHeight: 1.5 }}>{notice.text}</span>
          <button type="button" aria-label={tt("close")} onClick={() => setNotice(null)} style={{ border: "none", background: "transparent", color: muted, cursor: "pointer", padding: 2 }}><X size={16} /></button>
        </div>
      )}

      {/* Kennzahlen */}
      <div className="as-stats">
        {statCards.map((s, i) => (
          <div key={i} style={{ ...card, padding: 20, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "14px 14px 0 0", background: s.a }} />
            <div style={{ fontFamily: serif, fontSize: 32, fontWeight: 600, color: s.c }}>{s.n}</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 5, fontWeight: 500 }}>{s.l}</div>
            {s.badge && <span style={{ position: "absolute", top: 16, right: 16, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 8, background: greenBg, color: green }}>{s.badge}</span>}
          </div>
        ))}
      </div>

      {/* Conversion */}
      <div style={{ ...card, padding: "18px 22px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 13, color: muted, whiteSpace: "nowrap", fontWeight: 500 }}>{tt("conversion")}</div>
        <div style={{ flex: 1, height: 10, background: bg2, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg,${blue},${green})`, width: `${rate}%`, transition: "width .6s" }} />
        </div>
        <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, color: green }}>{rate}%</div>
      </div>

      {/* Systemlage: Unterschrift und IVORIS an einer Stelle */}
      <div style={{ ...card, marginBottom: 24, overflow: "hidden", borderColor: signDown || ivorisDown ? errorRed : line }}>
        <div className="as-sys">
          <div style={{ padding: "16px 20px", display: "flex", gap: 12, background: signDown ? errorRedBg : "transparent" }}>
            <span style={{ ...dot(signatureService ? (signDown ? errorRed : green) : muted), marginTop: 6 }} />
            <div>
              <div style={label}>{tt("sys.sign.title")}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: signDown ? errorRed : ink, marginTop: 5 }}>
                {!signatureService ? tt("sys.sign.unknown") : signDown ? tt("sys.sign.down") : tt("sys.sign.ok")}
              </div>
              <div style={{ fontSize: 12, color: muted, marginTop: 3 }}>
                {!signatureService ? tt("sys.sign.unknownNote") : tt(signDown ? "sys.sign.downNote" : "sys.sign.okNote", { time: `${fmtShort(signatureService.checkedAt)} ${fmtTime(signatureService.checkedAt)}` })}
              </div>
            </div>
          </div>
          <div style={{ padding: "16px 20px", display: "flex", gap: 12, background: ivorisDown ? errorRedBg : "transparent" }}>
            <span style={{ ...dot(ivorisDown ? errorRed : green), marginTop: 6 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={label}>{tt("sys.ivoris.title")}</div>
                <button type="button" aria-expanded={systemOpen} onClick={() => setSystemOpen(!systemOpen)} style={{ border: "none", background: "transparent", color: blue, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                  {systemOpen ? tt("sys.less") : tt("sys.details")}
                </button>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: ivorisDown ? errorRed : ink, marginTop: 5 }}>
                {ivorisDown ? tt("sys.ivoris.outage") : tt("sys.ivoris.ok")}
              </div>
              <div style={{ fontSize: 12, color: muted, marginTop: 3, lineHeight: 1.6 }}>
                {ivorisDown
                  ? tt("sys.ivoris.outageNote", { n: outbox.serviceOutageJobs })
                  : tt("sys.ivoris.summary", { transfer: outbox.queued + outbox.processing, retry: outbox.retryWait })}
                {outbox.manualReview > 0 && <> · <span style={{ color: gold, fontWeight: 600 }}>{tt("sys.ivoris.manual", { n: outbox.manualReview })}</span></>}
              </div>
            </div>
          </div>
        </div>
        {systemOpen && (
          <div style={{ borderTop: `1px solid ${line}`, background: bg2, padding: "14px 20px" }}>
            <div className="as-kv" style={{ fontSize: 13, color: ink }}>
              {[
                [tt("sys.kv.queued"), outbox.queued],
                [tt("sys.kv.processing"), outbox.processing],
                [tt("sys.kv.retry"), outbox.retryWait],
                [tt("sys.kv.manual"), outbox.manualReview],
                [tt("sys.kv.byType"), tt("sys.kv.types", { p: outbox.patientOpen, d: outbox.documentOpen, s: outbox.scribeOpen })],
                [tt("sys.kv.oldest"), outbox.oldestAgeMinutes ? fmtAge(outbox.oldestAgeMinutes) : "—"],
                [tt("sys.kv.attempts"), outbox.maxAttempts],
                [tt("sys.kv.next"), outbox.nextRetryAt ? (nextRetryFuture ? `${fmtDate(outbox.nextRetryAt)} ${fmtTime(outbox.nextRetryAt)}` : tt("sys.kv.overdue", { date: fmtDate(outbox.nextRetryAt) })) : tt("sys.kv.none")],
                [tt("sys.kv.stability"), stability.latestHealthy === null ? tt("sys.kv.stabilityNone") : stability.latestHealthy ? tt("sys.kv.stabilityOk", { n: stability.healthyDayStreak }) : tt("sys.kv.stabilityBad")],
                [tt("sys.kv.signCheck"), signatureService ? tt("sys.kv.signCheckValue", { ms: signatureService.responseMs ?? "—", time: `${fmtShort(signatureService.checkedAt)} ${fmtTime(signatureService.checkedAt)}` }) : "—"],
              ].map(([k, v], i) => (
                <div key={i}><div style={{ fontSize: 11, color: muted }}>{k}</div><div style={{ fontWeight: 600, marginTop: 2 }}>{v}</div></div>
              ))}
            </div>
            {outbox.serviceOutageJobs > 0 && outbox.dominantOutage && (
              <div style={{ fontSize: 12, color: muted, marginTop: 10 }}>{tt("sys.kv.outageKind", { kind: outbox.dominantOutage })}</div>
            )}
          </div>
        )}
      </div>

      {/* Für die Praxis zu erledigen */}
      <div style={{ ...label, marginBottom: 10 }}>{tt("queue.title")}</div>
      <div className="as-queues">
        {queues.map((q) => {
          const active = openQueue === q.k;
          const zero = q.n === 0;
          return (
            <button key={q.k} type="button" className="as-q" aria-pressed={active} onClick={() => setOpenQueue(active ? null : q.k)}
              style={{ ...card, padding: "18px 18px 16px", position: "relative", overflow: "hidden", borderColor: active ? blue : line, background: active ? blueBg : cardBg }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "14px 14px 0 0", background: zero ? line : q.a }} />
              <div style={{ fontFamily: serif, fontSize: 28, fontWeight: 600, color: q.n === null ? muted : zero ? faint : gold, lineHeight: 1.1 }}>{q.n === null ? "—" : q.n}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: zero ? muted : ink, marginTop: 8 }}>{q.l}</div>
              <div style={{ fontSize: 12, color: muted, marginTop: 3, lineHeight: 1.4 }}>{zero ? tt("queue.none") : q.hint}</div>
            </button>
          );
        })}
      </div>
      {renderQueuePanel()}

      {/* Einreichungen */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: openQueue ? 0 : 10, flexWrap: "wrap", alignItems: "center" }}>
        {filters.map(f => (
          <button key={f.k} onClick={() => { setFilter(f.k); setPage(0); }} style={{ background: filter === f.k ? blueBg : cardBg, border: `1px solid ${filter === f.k ? blue : lineS}`, borderRadius: 10, padding: "7px 16px", fontSize: 12, fontWeight: 600, color: filter === f.k ? blue : muted, cursor: "pointer", fontFamily: "inherit" }}>
            {f.l}
          </button>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 200px", maxWidth: 300, marginLeft: "auto", background: cardBg, border: `1px solid ${lineS}`, borderRadius: 10, padding: "0 12px", height: 34, color: muted }}>
          <Search size={14} />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={tt("search")} aria-label={tt("search")}
            style={{ border: "none", outline: "none", background: "transparent", color: ink, fontSize: 13, fontFamily: "inherit", width: "100%" }} />
        </label>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div className="as-row as-head" style={{ padding: "11px 20px", background: bg2, fontSize: 11, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span>{tt("col.patient")}</span><span>{tt("col.state")}</span><span>{tt("col.progress")}</span><span>{tt("col.next")}</span><span style={{ textAlign: "right" }}>{tt("col.time")}</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: muted }}>{tt("loading")}</div>
        ) : paged.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: muted }}>{tt("empty")}</div>
        ) : paged.map((s) => {
          const d = describe(s);
          const kc = kindColor[d.kind];
          const st = steps(s);
          return (
            <div key={s.id} className="as-row as-body" role="button" tabIndex={0} aria-label={tt("openDetail", { name: `${s.vorname} ${s.nachname}` })}
              onClick={() => setDetail(s)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetail(s); } }}
              style={{ borderTop: `1px solid ${line}` }}>
              <div>
                <div style={{ fontWeight: 600, color: ink }}>{s.nachname}, {s.vorname}</div>
                <div style={{ fontSize: 11, color: faint, marginTop: 1 }}>{s.is_existing ? tt("patient.existing") : tt("patient.new")}</div>
              </div>
              <div className="as-c-state" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ ...dot(kc.c, d.kind === "closed"), marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: d.kind === "closed" ? muted : d.kind === "act" ? gold : ink }}>{d.label}</div>
                  <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{d.note}</div>
                </div>
              </div>
              <div className="as-c-progress">
                <div style={{ display: "flex", gap: 3 }} title={STEP_KEYS.map((k) => tt(`step.${k}`)).join(" · ")}>
                  {st.map((x, i) => (
                    <i key={i} style={{ display: "block", height: 6, flex: 1, borderRadius: 3, background: x === "now" ? "transparent" : stepColor[x], boxShadow: x === "now" ? `inset 0 0 0 1.5px ${muted}` : "none", opacity: x === "prog" ? 0.7 : 1 }} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: muted, marginTop: 5 }}>{stepLabel(s, d.kind)}</div>
              </div>
              <div className="as-c-next">
                {s.ivoris_manual_review ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); openResolve(s); }} style={smallBtn(gold, goldBg)}>{tt("next.assign")}</button>
                ) : s.signed_pdf_path ? (
                  <a href={`/api/anima-sign/submission/${s.id}/signed-pdf`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...smallBtn(blue, blueBg), textDecoration: "none", display: "inline-block" }}>{tt("next.pdf")}</a>
                ) : (
                  <span style={{ fontSize: 12, color: muted }}>{d.kind === "wait" ? tt("next.patient") : d.kind === "closed" ? tt("next.none") : d.kind === "act" ? tt("next.details") : tt("next.auto")}</span>
                )}
              </div>
              <div className="as-c-time" style={{ fontSize: 12, color: muted, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {filter === "today" ? fmtTime(s.created_at) : `${fmtShort(s.created_at)} ${fmtTime(s.created_at)}`}
              </div>
            </div>
          );
        })}

        {!loading && subs.length > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderTop: `1px solid ${line}` }}>
            <span style={{ fontSize: 12, color: muted }}>{tt("pager", { from: page * PAGE_SIZE + 1, to: Math.min((page + 1) * PAGE_SIZE, subs.length), total: subs.length })}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${lineS}`, background: page === 0 ? "transparent" : cardBg, color: page === 0 ? muted : ink, fontSize: 12, cursor: page === 0 ? "default" : "pointer", fontFamily: "inherit" }}>{tt("prev")}</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${lineS}`, background: page >= totalPages - 1 ? "transparent" : cardBg, color: page >= totalPages - 1 ? muted : ink, fontSize: 12, cursor: page >= totalPages - 1 ? "default" : "pointer", fontFamily: "inherit" }}>{tt("next")}</button>
            </div>
          </div>
        )}
      </div>

      {renderDetail()}

      {resolveTarget && (
        <div
          onClick={() => !resolveSaving && setResolveTarget(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="as-resolve-title"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(680px, 100%)", background: cardBg, border: `1px solid ${line}`, borderRadius: 18, padding: 22, boxShadow: "0 24px 70px rgba(0,0,0,0.35)", fontFamily: "'Hanken Grotesk', sans-serif" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
              <div>
                <div id="as-resolve-title" style={{ fontFamily: serif, fontSize: 24, fontWeight: 600, color: ink }}>{tt("resolve.title")}</div>
                <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{resolveTarget.nachname}, {resolveTarget.vorname}</div>
              </div>
              <button type="button" aria-label={tt("close")} onClick={() => !resolveSaving && setResolveTarget(null)} style={{ border: "none", background: "transparent", color: muted, cursor: "pointer", fontSize: 20 }}>×</button>
            </div>

            {resolveTarget.ivoris_manual_review_reason && (
              <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, background: bg2, border: `1px solid ${line}` }}>
                <div style={{ ...label, fontSize: 11, marginBottom: 6 }}>{tt("resolve.why")}</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: ink }}>{resolveTarget.ivoris_manual_review_reason}</div>
              </div>
            )}

            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: ink, marginBottom: 8 }}>{tt("resolve.step1")}</div>
                <input
                  value={resolveSearch}
                  onChange={(event) => setResolveSearch(event.target.value)}
                  placeholder={tt("resolve.placeholder")}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${lineS}`, background: bg, color: ink, fontSize: 14, outline: "none", fontFamily: "inherit" }}
                />
                {resolveHits.length > 0 && (
                  <div style={{ marginTop: 10, display: "grid", gap: 8, maxHeight: 240, overflowY: "auto" }}>
                    {resolveHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        disabled={resolveSaving}
                        onClick={() => void resolveSubmission({ patientId: hit.id })}
                        style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, border: `1px solid ${line}`, background: bg2, color: ink, cursor: resolveSaving ? "wait" : "pointer", fontFamily: "inherit" }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{hit.name}</div>
                        <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{hit.geburtsdatum || tt("birthUnknown")}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: ink, marginBottom: 8 }}>{tt("resolve.step2")}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    value={resolveIvorisId}
                    onChange={(event) => setResolveIvorisId(event.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    style={{ flex: "1 1 240px", padding: "12px 14px", borderRadius: 12, border: `1px solid ${lineS}`, background: bg, color: ink, fontSize: 14, outline: "none", fontFamily: "inherit" }}
                  />
                  <button
                    type="button"
                    disabled={resolveSaving || !resolveIvorisId.trim()}
                    onClick={() => void resolveSubmission({ ivorisId: resolveIvorisId.trim() })}
                    style={{ padding: "12px 16px", borderRadius: 12, border: `1px solid ${blue}`, background: blueBg, color: blue, fontSize: 13, fontWeight: 700, cursor: resolveSaving ? "wait" : "pointer", fontFamily: "inherit" }}
                  >
                    {tt("resolve.now")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
