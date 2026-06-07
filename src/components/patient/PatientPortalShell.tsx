"use client";
import { trackEvent } from "@/lib/useTracking";
import QRCode from "qrcode";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/db/supabase";
import AnimaPayOverlay from "@/components/patient/AnimaPayOverlay";
import { motion, AnimatePresence } from "framer-motion";
import { hapticLight, hapticMedium, hapticStrong, hapticSuccess } from "@/lib/haptics";
import { t, langLabels, translatePhase, translatePhaseButton, translateBadge, getPhaseContent, translateTipp, type Lang } from "@/lib/patient-i18n";

interface Props { patientId: string; patientName: string; patientEmail: string }
interface RpData {
  plan: { gesamtbetrag: number; anzahl_raten: number; rate_betrag: number } | null;
  investiert: number; offen_betrag: number; raten_bezahlt: number; raten_gesamt: number;
  prozent: number; streak: number;
  naechste_rate: { betrag: number; faellig_am: string } | null;
  ueberfaellig: { betrag: number; faellig_am: string; anzahl: number } | null;
}
interface Phase { id: string; name: string; beschreibung: string | null; status: string; reihenfolge: number; start_datum: string | null; end_datum: string | null; video_url?: string | null }
interface Badge { id: string; icon: string; titel: string; beschreibung: string; freigeschaltet: boolean }
interface Msg { id: string; sender_type: string; sender_name: string | null; text: string; created_at: string }
interface Notif { id: string; typ: string; titel: string; text: string; gelesen: boolean; geoeffnet_am?: string | null; bestaetigt_am?: string | null; created_at: string }
interface Doc { id: string; name: string; typ: string; file_url: string | null; hochgeladen_am: string }
interface Tipp { id: string; titel: string; text: string }
interface Zahlung { id: string; rate_nummer: number; betrag: number; faellig_am: string; bezahlt_am: string; status?: string; mahnstufe?: number }
type Tab = "home" | "journey" | "progress" | "chat" | "more";

const getLocale = (l: string) => l === "en" ? "en-GB" : l === "es" ? "es-ES" : "de-DE";
const fmtDateL = (d: string, l: string) => { try { return new Date(d).toLocaleDateString(getLocale(l), { day: "numeric", month: "long", year: "numeric" }); } catch { return d; } };
const fmtShortL = (d: string, l: string) => { try { return new Date(d).toLocaleDateString(getLocale(l), { day: "numeric", month: "short" }); } catch { return d; } };
const fmtTimeL = (d: string, l: string) => { try { return new Date(d).toLocaleTimeString(getLocale(l), { hour: "2-digit", minute: "2-digit" }); } catch { return d; } };
const fmtEuro = (n: number) => n.toLocaleString("de-DE") + " €";
const daysTill = (d: string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 864e5));
const docIc: Record<string, string> = { kostenplan: "📋", vertrag: "📝", ratenzahlung: "📝", datenschutz: "🔒", sonstiges: "📄" };

export default function PatientPortalShell({ patientName, patientId }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");
  // Tab-Persistenz: nach einem Seiten-Refresh dort weitermachen, wo man war.
  // sessionStorage statt localStorage: ueberlebt den Refresh, aber nicht das
  // Schliessen des Browsers (Familien-Geraete starten neutral auf Start).
  const TABS: Tab[] = ["home", "journey", "progress", "chat", "more"];
  useEffect(() => {
    try {
      const savedTab = sessionStorage.getItem("ac_tab");
      if (savedTab && (TABS as string[]).includes(savedTab)) setTab(savedTab as Tab);
      if (sessionStorage.getItem("ac_balance") === "1") setBalanceView(true);
    } catch { /* Storage gesperrt: neutral starten */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem("ac_tab", tab); } catch { /* ignorieren */ }
  }, [tab]);
  const [dk, setDk] = useState(true);
  const [lang, setLang] = useState<Lang>("de");
  const [loading, setLoading] = useState(true);
  const [nOpen, setNOpen] = useState(false);
  const [popup, setPopup] = useState<Badge | null>(null);
  const [msgInput, setMsgInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [docDrawer, setDocDrawer] = useState<Doc | null>(null);
  const [showIBAN, setShowIBAN] = useState(false);
  const [deviceSize, setDeviceSize] = useState<"phone" | "tablet">("phone");
  const [phaseDrawer, setPhaseDrawer] = useState<Phase | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  const [phaseAnswers, setPhaseAnswers] = useState<Record<string, string>>({});
  const [loadingQuestion, setLoadingQuestion] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [rp, setRp] = useState<RpData | null>(null);
  const [phasen, setPhasen] = useState<Phase[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tipps, setTipps] = useState<Tipp[]>([]);
  const [pays, setPays] = useState<Zahlung[]>([]);
  const [showAllPays, setShowAllPays] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [payingRate, setPayingRate] = useState<{ betrag: number; verwendungszweck: string; rateNummer: number } | null>(null);
  const [chatArchive, setChatArchive] = useState<{msgs: any[]; firstText: string; date: string}[]>([]);
  const [consent, setConsent] = useState<{ portal_nutzung: boolean; datenschutz_akzeptiert: boolean; digitaler_rechnungsempfang: boolean; push_benachrichtigungen: boolean } | null>(null);
  const [consentLoading, setConsentLoading] = useState(true);
  const [showDsgvo, setShowDsgvo] = useState(false);
  const [consentCheck1, setConsentCheck1] = useState(false);
  const [consentCheck2, setConsentCheck2] = useState(false);
  const [consentIsGuardian, setConsentIsGuardian] = useState(false);
  const [deactivatePopup, setDeactivatePopup] = useState<"rechnungen" | "push" | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // ── Anima Balance ──
  const [finSheet, setFinSheet] = useState(false);
  const [balanceView, setBalanceView] = useState(false);
  useEffect(() => {
    try { sessionStorage.setItem("ac_balance", balanceView ? "1" : "0"); } catch { /* ignorieren */ }
  }, [balanceView]);
  const [balance, setBalance] = useState<{ saldo: number; buchungen: any[]; ivoris_nummer: string; nachname: string } | null>(null);
  const [aufladenSheet, setAufladenSheet] = useState(false);
  const [aufladeBetrag, setAufladeBetrag] = useState<number | "frei">(300);
  const [aufladeFrei, setAufladeFrei] = useState("");
  const [aufladeQr, setAufladeQr] = useState<string | null>(null);
  const [rueckholHinweis, setRueckholHinweis] = useState(false);

  const ladeBalance = useCallback(async () => {
    try {
      const r = await fetch("/api/patient/balance");
      if (r.ok) setBalance(await r.json());
    } catch { /* Portal bleibt nutzbar */ }
  }, []);

  useEffect(() => {
    if (balanceView) { ladeBalance(); setRueckholHinweis(false); }
  }, [balanceView, ladeBalance]);

  useEffect(() => {
    if (!aufladenSheet || !balance) { setAufladeQr(null); return; }
    const betrag = aufladeBetrag === "frei" ? parseFloat(aufladeFrei.replace(",", ".")) : aufladeBetrag;
    if (!betrag || betrag <= 0) { setAufladeQr(null); return; }
    const zweck = `AUFLADUNG ${balance.ivoris_nummer} ${balance.nachname}`.trim().slice(0, 140);
    // Hinweis: Empfaenger ist vorerst das Patientenkonto der Praxis.
    // Sobald das separate Balance-Konto eroeffnet ist, wird hier nur
    // die IBAN getauscht.
    const payload = ["BCD", "002", "1", "SCT", "", "Dr. Maria Elena Schubert", "DE03860555921090118941", `EUR${betrag.toFixed(2)}`, "", "", zweck, ""].join("\n");
    QRCode.toDataURL(payload, { width: 220, margin: 1 }).then(setAufladeQr).catch(() => setAufladeQr(null));
  }, [aufladenSheet, aufladeBetrag, aufladeFrei, balance]);

  const BAL_TYP: Record<string, string> = {
    aufladung: "Aufladung per QR",
    ueberzahlung: "Überzahlung gutgeschrieben",
    erstattung: "Erstattung",
    verrechnung: "Verrechnung",
    auszahlung: "Auszahlung",
    korrektur: "Korrektur",
  };

  // Check consent status
  useEffect(() => {
    fetch("/api/patient/consent").then(r => r.json()).then(j => {
      setConsent(j.consent);
      setConsentLoading(false);
    }).catch(() => setConsentLoading(false));
  }, []);

  const acceptConsent = async (opts: { portal: boolean; rechnungen: boolean; push: boolean; datenschutz: boolean }) => {
    const res = await fetch("/api/patient/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portal_nutzung: opts.portal,
        digitaler_rechnungsempfang: opts.rechnungen,
        push_benachrichtigungen: opts.push,
        datenschutz_akzeptiert: opts.datenschutz,
      }),
    });
    if (res.ok) {
      const j = await res.json();
      setConsent(j.consent);
    }
  };

  const exportData = async () => {
    const res = await fetch("/api/patient/dsgvo");
    if (res.ok) {
      const data = await res.json();
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Meine Daten - Anima Cura</title><style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#1a1a1a;line-height:1.6}h1{font-size:22px;border-bottom:2px solid #22c55e;padding-bottom:8px}h2{font-size:16px;margin-top:24px;color:#444}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{text-align:left;padding:6px 10px;border:1px solid #ddd;font-size:13px}th{background:#f5f5f5;font-weight:600}.meta{font-size:12px;color:#888;margin-bottom:20px}@media print{body{margin:20px}}</style></head><body>
<h1>Meine Daten — Anima Cura</h1>
<p class="meta">Exportiert am ${new Date().toLocaleDateString("de-DE")} um ${new Date().toLocaleTimeString("de-DE")} Uhr · Art. 15/20 DSGVO</p>
<h2>Persönliche Daten</h2>
<table>${data.persoenliche_daten ? Object.entries(data.persoenliche_daten).map(([k,v]) => `<tr><th>${k}</th><td>${v || "–"}</td></tr>`).join("") : "<tr><td>Keine Daten</td></tr>"}</table>
<h2>Behandlungsphasen</h2>
<table><tr><th>Phase</th><th>Status</th><th>Von</th><th>Bis</th></tr>${(data.behandlungsphasen||[]).map((p: any) => `<tr><td>${p.name}</td><td>${p.status}</td><td>${p.start_datum||"–"}</td><td>${p.end_datum||"–"}</td></tr>`).join("")}</table>
<h2>Zahlungen</h2>
<table><tr><th>Rate</th><th>Betrag</th><th>Fällig</th><th>Status</th><th>Bezahlt am</th></tr>${(data.ratenplaene||[]).flatMap((rp: any) => (rp.raten||[]).map((r: any) => `<tr><td>${r.rate_nummer}</td><td>${r.betrag} €</td><td>${r.faellig_am}</td><td>${r.status}</td><td>${r.bezahlt_am||"–"}</td></tr>`)).join("")}</table>
<h2>Dokumente</h2>
<table><tr><th>Name</th><th>Typ</th><th>Datum</th></tr>${(data.dokumente||[]).map((d: any) => `<tr><td>${d.name}</td><td>${d.typ}</td><td>${d.hochgeladen_am ? new Date(d.hochgeladen_am).toLocaleDateString("de-DE") : "–"}</td></tr>`).join("")}</table>
<h2>Chat-Nachrichten</h2>
<table><tr><th>Von</th><th>Nachricht</th><th>Datum</th></tr>${(data.chat_nachrichten||[]).map((m: any) => `<tr><td>${m.von}</td><td>${m.text}</td><td>${m.datum ? new Date(m.datum).toLocaleDateString("de-DE") : "–"}</td></tr>`).join("")}</table>
<p class="meta" style="margin-top:30px;border-top:1px solid #ddd;padding-top:12px">Anima Cura Patientenportal · Praxis Dr. Maria Schubert · Daten auf EU-Servern (Frankfurt)</p>
</body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
    }
  };

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
        if (i === 7) setPays([...(j.ueberfaellige || []), ...(j.zahlungen || [])]);
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (chatScrollRef.current && tab === "chat") chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [msgs, tab, typing]);
  // Auto-archive chat after 1 hour of inactivity
  useEffect(() => {
    if (tab !== "chat" || msgs.length === 0) return;
    const lastMsg = msgs[msgs.length - 1];
    if (!lastMsg?.created_at) return;
    const elapsed = Date.now() - new Date(lastMsg.created_at).getTime();
    if (elapsed > 3600000) {
      setMsgs([]);
    }
  }, [tab]);

  // Register Service Worker + Push subscription
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      if (!("PushManager" in window)) return;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY;
      if (!vapidKey) return;
      const b64ToBytes = (b64: string) => {
        const pad = "=".repeat((4 - (b64.length % 4)) % 4);
        const base = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
        return Uint8Array.from(atob(base), c => c.charCodeAt(0));
      };
      try {
        let sub = await reg.pushManager.getSubscription();
        // Schluessel-Rotation abfangen: passt das bestehende Abo nicht mehr
        // zum aktuellen VAPID-Key, wird es verworfen und frisch abgeschlossen.
        if (sub) {
          const aktuell = b64ToBytes(vapidKey);
          const vorhanden = sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
          const passt = !!vorhanden && vorhanden.length === aktuell.length && vorhanden.every((v, i) => v === aktuell[i]);
          if (!passt) { await sub.unsubscribe(); sub = null; }
        }
        if (!sub) {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") return;
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) });
        }
        if (sub && patientId) {
          await fetch("/api/patient/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: sub.toJSON(), patient_id: patientId }),
          });
        }
      } catch (e) { console.log("Push setup skipped:", e); }
    }).catch(() => {});
  }, [patientId]);

  // Track app open with device context + notification click + session tracking
  const sessionStart = useRef(Date.now());
  useEffect(() => {
    if (!patientId) return;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const device = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : "Desktop";
    const fromPush = typeof window !== "undefined" && window.location.search.includes("from=push");
    trackEvent(patientId, "app_open", { device, hour: new Date().getHours() });
    if (fromPush) trackEvent(patientId, "notification_clicked");

    // Track session end when user leaves
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const sessionSeconds = Math.round((Date.now() - sessionStart.current) / 1000);
        if (sessionSeconds > 2) trackEvent(patientId, "session_end", { duration_seconds: sessionSeconds });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Track tab views with duration + sequence + specific interactions
  const tabOpenTime = useRef(Date.now());
  const tabSequence = useRef(0);
  useEffect(() => {
    if (!patientId || !tab) return;
    tabSequence.current++;
    const duration = Math.round((Date.now() - tabOpenTime.current) / 1000);
    trackEvent(patientId, "tab_view", { tab, duration_seconds: duration > 1 ? duration : undefined, sequence: tabSequence.current });
    tabOpenTime.current = Date.now();
    if (tab === "progress") trackEvent(patientId, "payment_view");
    if (tab === "more") trackEvent(patientId, "document_view");
  }, [tab]);

  const openPayment = (rate: { betrag: number; verwendungszweck: string; rateNummer: number }) => {
    if (patientId) {
      trackEvent(patientId, "animapay_open", { verwendungszweck: rate.verwendungszweck });
      trackEvent(patientId, "qrcode_view", { betrag: rate.betrag });
    }
    setPayingRate(rate);
  };

  const sendMsg = async () => {
    const text = msgInput.trim();
    if (!text) return;
    const chatSentAt = Date.now();
    if (patientId) trackEvent(patientId, "chat_message", { sent_at: chatSentAt });
    setMsgInput("");
    const tempId = "temp-" + Date.now();
    setMsgs(prev => [...prev, { id: tempId, sender_type: "patient", sender_name: null, text, created_at: new Date().toISOString() }]);
    hapticSuccess();
    setTyping(true);
    try {
      const res = await fetch("/api/patient/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (res.ok) {
        const d = await res.json();
        if (d.icura_response) {
          const responseTime = Math.round((Date.now() - chatSentAt) / 1000);
          if (patientId) trackEvent(patientId, "chat_response", { response_time_seconds: responseTime });
          setMsgs(prev => [...prev, d.icura_response]);
        } else if (d.fallback) {
          setMsgs(prev => [...prev, { id: "fb-" + Date.now(), sender_type: "praxis", sender_name: "iCura", text: d.message || "Das Praxis-Team wurde benachrichtigt.", created_at: new Date().toISOString() }]);
        }
      }
    } catch { /* ignore */ }
    setTyping(false);
  };

  const openArchive = async () => {
    const res = await fetch("/api/patient/nachrichten");
    if (res.ok) {
      const j = await res.json();
      const allMsgs = (j.nachrichten || []).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const grouped: {msgs: any[]; firstText: string; date: string}[] = [];
      let current: any[] = [];
      allMsgs.forEach((m: any, i: number) => {
        if (i > 0) {
          const gap = new Date(m.created_at).getTime() - new Date(allMsgs[i-1].created_at).getTime();
          if (gap > 3600000) {
            if (current.length > 0) grouped.push({ msgs: [...current], firstText: current.find((x: any) => x.sender_type === "patient")?.text?.slice(0,50) || "Chat", date: current[0]?.created_at });
            current = [];
          }
        }
        current.push(m);
      });
      if (current.length > 0) grouped.push({ msgs: [...current], firstText: current.find((x: any) => x.sender_type === "patient")?.text?.slice(0,50) || "Chat", date: current[0]?.created_at });
      setChatArchive(grouped.reverse());
    }
    setShowArchive(true);
  };

  const logout = async () => { const sb = createBrowserClient(); await sb.auth.signOut(); router.replace("/patient/login"); router.refresh(); };

  const firstName = patientName.split(" ")[0];
  const activePhase = phasen.find(p => p.status === "aktiv");
  const unread = notifs.filter(n => !n.bestaetigt_am).length;
  const [expandedNotif, setExpandedNotif] = useState<string | null>(null);
  const markNotif = (id: string, aktion: "geoeffnet" | "bestaetigt") => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, ...(aktion === "geoeffnet" ? { geoeffnet_am: new Date().toISOString() } : { bestaetigt_am: new Date().toISOString() }) } : n));
    fetch("/api/patient/benachrichtigungen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, aktion }),
    }).catch(() => {});
  };
  const isOverdue = !!(rp && rp.ueberfaellig);
  const dl = rp && rp.naechste_rate ? daysTill(rp.naechste_rate.faellig_am) : 99;
  const pct = rp ? rp.prozent : 0;

  // Phase-based blob colors - hex values for Framer Motion color transitions
  const getPhaseColors = () => {
    const name = activePhase?.name || "";
    switch (name) {
      case "Initialuntersuchung": return { c1: "#4ade80", c2: "#38bdf8", c3: "#34d399", c4: "#a78bfa", c5: "#fbbf24" };
      case "Aligner Set 1-11":    return { c1: "#a78bfa", c2: "#4ade80", c3: "#60a5fa", c4: "#f472b6", c5: "#34d399" };
      case "Aligner Set 12-24":   return { c1: "#fbbf24", c2: "#a78bfa", c3: "#f472b6", c4: "#4ade80", c5: "#38bdf8" };
      case "Retainer & Abschluss": return { c1: "#38bdf8", c2: "#818cf8", c3: "#4ade80", c4: "#fbbf24", c5: "#a78bfa" };
      default:                return { c1: "#4ade80", c2: "#60a5fa", c3: "#a78bfa", c4: "#f472b6", c5: "#fbbf24" };
    }
  };
  const { c1, c2, c3, c4, c5 } = getPhaseColors();

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
          <p style={{ color: muted, fontSize: 14 }}>{t("loading", lang)}</p>
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
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid " + (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)") }}>
          {(["de", "en", "es"] as Lang[]).map(l => (
            <button key={l} onClick={() => { setLang(l); hapticLight(); }} style={{ padding: "6px 8px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit", background: lang === l ? grn : "transparent", color: lang === l ? "#fff" : muted }}>{langLabels[l]}</button>
          ))}
        </div>
        <button onClick={() => { setDk(!dk); hapticLight(); }} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: btnBg, color: soft }}>{dk ? "☀️" : "🌙"}</button>
        <button onClick={() => { setNOpen(!nOpen); hapticLight(); }} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative", background: btnBg }}>
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
        <strong>{t("hint.title", lang)}</strong> {t("hint.text", lang)}
      </div>
    </div>
  ) : null;

  // ── NOTIFICATIONS ──
  const NotifsDD = nOpen ? (
    <div style={{ padding: "12px 20px 0" }}>
      {notifs.map(n => (
        <div
          key={n.id}
          style={{ padding: 14, borderRadius: 14, marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start", opacity: n.bestaetigt_am ? 0.55 : 1, background: cardBg, border: "1px solid " + (!n.bestaetigt_am ? (dk ? "rgba(74,222,128,0.2)" : "rgba(34,197,94,0.15)") : border) }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0, background: n.typ === "warnung" ? red : n.typ === "eingang" ? grn : n.typ === "balance" ? "#f6c453" : warn }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              onClick={() => {
                hapticLight();
                const auf = expandedNotif === n.id ? null : n.id;
                setExpandedNotif(auf);
                if (auf && !n.geoeffnet_am) markNotif(n.id, "geoeffnet");
              }}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 8 }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: fg }}>{n.titel}</span>
              <span style={{ fontSize: 11, color: muted, flexShrink: 0 }}>{fmtDateL(n.created_at, lang)} {expandedNotif === n.id ? "\u25b4" : "\u25be"}</span>
            </div>
            {expandedNotif === n.id && (
              <div>
                <div style={{ fontSize: 12, color: soft, lineHeight: 1.5, marginTop: 6 }}>{n.text}</div>
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 8 }}>
                  {n.typ === "balance" && (
                    <button
                      onClick={() => { hapticLight(); setNOpen(false); setBalanceView(true); setTab("progress"); }}
                      style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#f6c453" }}
                    >{lang === "en" ? "View balance \u2192" : lang === "es" ? "Ver saldo \u2192" : "Zum Guthaben \u2192"}</button>
                  )}
                  {!n.bestaetigt_am && (
                    <button
                      onClick={() => { hapticLight(); markNotif(n.id, "bestaetigt"); }}
                      style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: grn }}
                    >{"\u2713"} {lang === "en" ? "Got it" : lang === "es" ? "Entendido" : "Verstanden"}</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  ) : null;

  // ── BOTTOM NAV ──
  const Nav = (
    <nav className="portal-nav" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, display: "flex", justifyContent: "center", padding: "0 0 12px", pointerEvents: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", gap: 2, padding: "8px 12px", borderRadius: 22, maxWidth: 380, width: "calc(100% - 48px)", pointerEvents: "auto", background: dk ? "rgba(10,10,10,0.75)" : "rgba(255,255,255,0.7)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid " + (dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"), boxShadow: dk ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,0,0,0.08)" }}>
        {([["home", "nav.start", "🏠"], ["journey", "nav.journey", "🕐"], ["progress", "nav.progress", "€"], ["chat", "nav.chat", "💬"], ["more", "nav.more", "⋯"]] as [Tab, string, string][]).map(([id, labelKey, icon]) => {
          const isActive = tab === id;
          return (
            <motion.button
              key={id}
              onClick={() => { if (id === "progress") { setFinSheet(true); } else { setTab(id); setBalanceView(false); } hapticLight(); }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.9 }}
              style={{ position: "relative", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 16px", fontSize: 10, fontWeight: 600, fontFamily: "inherit", color: isActive ? grn : navInactive, transition: "color 0.3s", zIndex: 2 }}
            >
              {isActive && (
                <motion.div
                  layoutId="navBlob"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  style={{ position: "absolute", inset: 2, borderRadius: 16, background: dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.08)", zIndex: -1 }}
                />
              )}
              <span style={{ fontSize: id === "progress" ? 18 : 16, fontFamily: id === "progress" ? "'Fraunces', serif" : "inherit", fontWeight: id === "progress" ? 700 : 400 }}>{icon}</span>
              <span>{t(labelKey, lang)}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );

  // ═══ HOME TAB ═══
  const HomeTab = (
    <div>
      {Header}
      {HintBanner}
      {NotifsDD}
      <div style={{ padding: "16px 20px 0" }}>
        <p style={{ fontSize: 13, color: muted }}>{t("home.welcome", lang)}</p>
        <h1 style={{ ...hd, fontSize: 24, fontWeight: 800, color: fg }}>{t("home.hello", lang)} {firstName}</h1>
      </div>
      <div style={{ ...card, margin: "16px 20px 14px", background: dk ? "rgba(74,222,128,0.04)" : "rgba(34,197,94,0.03)", border: "1px solid " + (dk ? "rgba(74,222,128,0.12)" : "rgba(34,197,94,0.1)") }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ ...lb, color: grn, marginBottom: 4 }}>{t("home.currentPhase", lang)}</div>
            <div style={{ ...hd, fontSize: 19, fontWeight: 700, color: fg }}>{activePhase ? translatePhase(activePhase.name, lang).name : t("home.noPhase", lang)}</div>
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
          {[[t("home.invested", lang), pct + "%", grn], [t("home.nextRate", lang), dl > 0 ? dl + (lang === "en" ? "D" : lang === "es" ? "D" : "T") : t("home.today", lang), fg], [t("home.rates", lang), (rp ? rp.raten_bezahlt : 0) + "/" + (rp ? rp.raten_gesamt : 0), fg]].map(([l, v, c], i) => (
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
            <span style={{ ...hd, fontSize: 15, fontWeight: 700, color: fg }}>{t("home.achievements", lang)}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: muted }}>{badges.filter(b => b.freigeschaltet).length}/{badges.length}</span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {badges.map(b => (
              <div key={b.id} onClick={() => { setPopup(b); hapticLight(); }} style={{ minWidth: 76, padding: "14px 8px", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", background: cardBg, border: "1px solid " + border, opacity: b.freigeschaltet ? 1 : 0.3 }}>
                <span style={{ fontSize: 28 }}>{b.icon}</span>
                <span style={{ fontSize: 9, fontWeight: 600, textAlign: "center", lineHeight: 1.2, color: soft }}>{translateBadge(b.titel, lang).titel}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rp && rp.naechste_rate && dl <= 3 && dl >= 0 && (
        <div style={{ margin: "0 20px 14px", borderRadius: 16, padding: 18, background: dk ? "rgba(34,197,94,0.04)" : "rgba(34,197,94,0.03)", border: "1px solid " + (dk ? "rgba(34,197,94,0.12)" : "rgba(34,197,94,0.1)") }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: grn, textTransform: "uppercase", letterSpacing: "0.1em" }}>AnimaPay</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: fg, marginTop: 2 }}>{lang === "en" ? "Next rate" : lang === "es" ? "Próxima cuota" : "Nächste Rate"}: {rp.naechste_rate.betrag} €</div>
              <div style={{ fontSize: 12, color: muted }}>{dl === 0 ? (lang === "en" ? "Due today" : lang === "es" ? "Vence hoy" : "Heute fällig") : (lang === "en" ? "Due in " + dl + " days" : lang === "es" ? "Vence en " + dl + " días" : "Fällig in " + dl + " Tagen")}</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: grn, fontFamily: "'Fraunces', serif" }}>{rp.naechste_rate.betrag} €</div>
          </div>
          <button onClick={() => rp.naechste_rate && openPayment({ betrag: rp.naechste_rate.betrag, verwendungszweck: "AC-PAT-R" + (rp.raten_bezahlt + 1), rateNummer: rp.raten_bezahlt + 1 })} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "2px solid rgba(34,197,94,0.3)", background: dk ? "rgba(34,197,94,0.06)" : "rgba(34,197,94,0.04)", color: "#22c55e", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", animation: "glowBorder 2.5s ease-in-out infinite" }}>
            {lang === "en" ? "Pay now" : lang === "es" ? "Pagar ahora" : "Jetzt bezahlen"}
          </button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 20px", marginBottom: 14 }}>
        <div onClick={() => { setTab("chat"); hapticMedium(); }} style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, cursor: "pointer", background: cardBg, border: "1px solid " + border }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, background: dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.06)" }}>💬</div>
          <div><div style={{ fontSize: 14, fontWeight: 700, color: fg }}>{t("home.message", lang)}</div><div style={{ fontSize: 12, color: muted }}>{t("home.toPractice", lang)}</div></div>
        </div>
        <div onClick={() => { setTab("more"); hapticMedium(); }} style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, cursor: "pointer", background: cardBg, border: "1px solid " + border }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, background: dk ? "rgba(167,139,250,0.08)" : "rgba(124,58,237,0.06)" }}>📄</div>
          <div><div style={{ fontSize: 14, fontWeight: 700, color: fg }}>{t("home.documents", lang)}</div><div style={{ fontSize: 12, color: muted }}>{t("home.contractsPlans", lang)}</div></div>
        </div>
      </div>
      {tipps.length > 0 && (
        <div style={{ margin: "0 20px 14px", borderRadius: 14, padding: 16, background: dk ? "rgba(251,191,36,0.05)" : "rgba(234,179,80,0.05)", border: "1px solid " + (dk ? "rgba(251,191,36,0.12)" : "rgba(234,179,80,0.12)") }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: warn, marginBottom: 6 }}>💡 {t("home.phaseTip", lang)}</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: soft }}>{translateTipp(tipps[0].text, lang)}</div>
        </div>
      )}
    </div>
  );

  // ═══ JOURNEY TAB ═══
  const JourneyTab = (
    <div>
      {Header}
      
      <div style={{ padding: "16px 20px 0" }}>
        <h1 style={{ ...hd, fontSize: 23, fontWeight: 800, marginBottom: 2, color: fg }}>{t("journey.title", lang)}</h1>
        <p style={{ fontSize: 13, color: muted, marginBottom: 22 }}>{t("journey.subtitle", lang)}</p>
      </div>
      <div style={{ position: "relative", paddingLeft: 36, margin: "0 20px" }}>
        <div style={{ position: "absolute", left: 13, top: 8, bottom: 8, width: 2, borderRadius: 2, background: dk ? "#252525" : "#e0d8cc" }} />
        {phasen.map(ph => (
          <div key={ph.id} style={{ position: "relative", marginBottom: 20 }}>
            <div style={{ position: "absolute", left: -30, top: 8, width: 14, height: 14, borderRadius: "50%", background: ph.status === "abgeschlossen" ? grn : ph.status === "aktiv" ? purple : (dk ? "#333" : "#e0d8cc"), boxShadow: ph.status === "aktiv" ? "0 0 10px " + purple + "40" : "none" }} />
            <div onClick={() => { setPhaseDrawer(ph); setExpandedDetail(null); setPhaseAnswers({}); hapticMedium(); }} style={{ ...card, margin: 0, marginBottom: 0, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ ...hd, fontSize: 16, fontWeight: 700, color: fg }}>{translatePhase(ph.name, lang).name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: ph.status === "abgeschlossen" ? grn : ph.status === "aktiv" ? purple : muted }}>
                  {ph.status === "abgeschlossen" ? t("journey.completed", lang) : ph.status === "aktiv" ? t("journey.active", lang) : t("journey.upcoming", lang)}
                </span>
              </div>
              {ph.start_datum && <p style={{ fontSize: 12, color: muted, marginBottom: 6 }}>{fmtShortL(ph.start_datum, lang)}{ph.end_datum ? " — " + fmtShortL(ph.end_datum, lang) : " — " + t("journey.today", lang)}</p>}
              {ph.beschreibung && <p style={{ fontSize: 13, lineHeight: 1.55, color: soft }}>{translatePhase(ph.name, lang).beschreibung || ph.beschreibung}</p>}
            </div>
          </div>
        ))}
      </div>
      {/* Tipps und Fokus für den Alltag */}
      {(activePhase || tipps.length > 0) && (
        <div style={{ padding: "20px 20px 80px" }}>
          <h2 style={{ ...hd, fontSize: 18, fontWeight: 800, color: fg, marginBottom: 14 }}>{lang === "en" ? "Tips & focus for everyday life" : lang === "es" ? "Consejos y enfoque para el día a día" : "Tipps und Fokus für den Alltag"}</h2>
          {activePhase && (() => {
            const content = getPhaseContent(activePhase.name, lang);
            return content.fokus ? (
              <div style={{ padding: 16, borderRadius: 14, marginBottom: 12, background: dk ? "rgba(74,222,128,0.05)" : "rgba(34,197,94,0.04)", border: "1px solid " + (dk ? "rgba(74,222,128,0.12)" : "rgba(34,197,94,0.1)") }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: fg }}>{lang === "en" ? "Current focus" : lang === "es" ? "Enfoque actual" : "Aktueller Fokus"}</span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: soft, margin: 0 }}>{content.fokus}</p>
              </div>
            ) : null;
          })()}
          {tipps.map(tip => (
            <div key={tip.id} style={{ padding: 16, borderRadius: 14, marginBottom: 10, background: dk ? "rgba(251,191,36,0.04)" : "rgba(234,179,80,0.04)", border: "1px solid " + (dk ? "rgba(251,191,36,0.1)" : "rgba(234,179,80,0.08)") }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>💡</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: fg }}>{tip.titel}</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: soft, margin: 0 }}>{translateTipp(tip.text, lang)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ═══ PROGRESS TAB ═══
  const circ = 2 * Math.PI * 76;
  const off = circ - (pct / 100) * circ;
  const saldoStr = (balance?.saldo ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2 });
  const saldoFont = saldoStr.length >= 10 ? 21 : saldoStr.length >= 8 ? 25 : 29;

  const goldRing: React.CSSProperties = {
    width: "min(190px, 56vw)", height: "min(190px, 56vw)", margin: "4px auto 14px", borderRadius: "50%", position: "relative",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "radial-gradient(circle at 32% 26%, rgba(255,235,180,0.35), transparent 42%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.5), transparent 55%), conic-gradient(from 210deg, #b88a2e, #f6c453, #fff0c2, #f6c453, #9a7224, #b88a2e)",
    boxShadow: "0 22px 46px rgba(0,0,0,0.5), 0 0 38px rgba(246,196,83,0.16), inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -10px 22px rgba(0,0,0,0.45)",
  };

  const BalanceTab = (
    <div>
      {Header}
      <div style={{ padding: "16px 20px 0", textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: fg }}>Anima Balance</h1>
        <p style={{ fontSize: 13, color: muted, margin: "4px 0 14px" }}>Dein Geld bleibt deins, bis behandelt wurde.</p>
      </div>

      <div style={goldRing}>
        <div style={{ width: "min(150px, 44vw)", height: "min(150px, 44vw)", borderRadius: "50%", background: dk ? "radial-gradient(circle at 40% 30%, #1b2018, #0c0f0b 70%)" : "radial-gradient(circle at 40% 30%, #fffdf6, #f3ecd9 70%)", boxShadow: "inset 0 6px 16px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <span style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, color: "#f6c453" }}>Guthaben</span>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: saldoFont, fontWeight: 600, color: fg }}>
            {saldoStr}&nbsp;€
          </span>
        </div>
      </div>

      <div style={{ margin: "0 20px 4px" }}>
        <button onClick={() => { setAufladenSheet(true); hapticLight(); }} style={{ width: "100%", border: "none", cursor: "pointer", borderRadius: 14, padding: "14px 0", fontWeight: 700, fontSize: 15, fontFamily: "inherit", background: "linear-gradient(180deg, #ffd97a, #f6c453)", color: "#231a04", boxShadow: "0 8px 20px rgba(246,196,83,0.25)" }}>Aufladen</button>
      </div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <button onClick={() => setRueckholHinweis(!rueckholHinweis)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: muted, textDecoration: "underline", textUnderlineOffset: 3, padding: 6 }}>Guthaben zurückholen</button>
      </div>
      {rueckholHinweis && (
        <div style={{ ...card, padding: "12px 14px", margin: "0 20px 12px", fontSize: 13, color: muted }}>
          Nicht genutztes Guthaben bekommst du jederzeit zurück. Sag der Praxis kurz Bescheid (Chat oder am Tresen), die Rücküberweisung geht auf dein Konto.
        </div>
      )}

      <div style={{ ...card, padding: "14px 16px", margin: "0 20px 24px" }}>
        <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, color: muted }}>Bewegungen</span>
        {!balance || balance.buchungen.length === 0 ? (
          <p style={{ fontSize: 13, color: muted, marginTop: 8 }}>
            Noch keine Bewegungen. Dein Guthaben entsteht durch Aufladen, Überzahlungen oder Erstattungen, ganz von selbst.
          </p>
        ) : (
          balance.buchungen.map((b: any) => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 0", borderBottom: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, fontSize: 13 }}>
              <span>
                <span style={{ fontWeight: 600, color: fg }}>{BAL_TYP[b.typ] || b.typ}{b.beschreibung ? ` · ${b.beschreibung}` : ""}</span>
                <span style={{ display: "block", fontSize: 11, color: muted, marginTop: 1 }}>{new Date(b.created_at).toLocaleDateString("de-DE")}</span>
              </span>
              <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, whiteSpace: "nowrap", color: Number(b.betrag) >= 0 ? grn : "#f08c8c" }}>
                {Number(b.betrag) >= 0 ? "+" : ""}{Number(b.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })}&nbsp;€
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const ProgressTab = (
    <div>
      {Header}
      
      <div style={{ padding: "16px 20px 0" }}>
        <h1 style={{ ...hd, fontSize: 23, fontWeight: 800, marginBottom: 2, color: fg }}>{t("progress.title", lang)}</h1>
        <p style={{ fontSize: 13, color: muted, marginBottom: 16 }}>{t("progress.subtitle", lang)}</p>
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
            <span style={{ ...lb, color: grn, marginTop: 2 }}>{t("progress.invested", lang)}</span>
          </div>
        </div>
      </div>
      <div style={{ ...card, margin: "8px 20px 14px", display: "flex", padding: 18 }}>
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ ...hd, fontSize: 18, fontWeight: 800, color: grn }}>{fmtEuro(rp ? rp.investiert : 0)}</div><div style={{ ...lb, marginTop: 2 }}>{t("progress.investedLabel", lang)}</div></div>
        <div style={{ width: 1, background: border }} />
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ ...hd, fontSize: 18, fontWeight: 800, color: fg }}>{fmtEuro(rp ? rp.offen_betrag : 0)}</div><div style={{ ...lb, marginTop: 2 }}>{t("progress.open", lang)}</div></div>
        <div style={{ width: 1, background: border }} />
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ ...hd, fontSize: 18, fontWeight: 800, color: fg }}>{fmtEuro(rp && rp.plan ? rp.plan.gesamtbetrag : 0)}</div><div style={{ ...lb, marginTop: 2 }}>{t("progress.total", lang)}</div></div>
      </div>
      {isOverdue && rp && rp.ueberfaellig && (
        <div>
          <div style={{ ...card, margin: "0 20px 14px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...lb, color: red, marginBottom: 4 }}>{t("progress.overdue", lang)}</div>
              <div style={{ ...hd, fontSize: 30, fontWeight: 800, marginBottom: 2, color: fg }}>{rp.ueberfaellig.betrag.toFixed(2).replace(".", ",")} €</div>
              <div style={{ fontSize: 13, color: muted }}>{t("progress.since", lang)} {fmtShortL(rp.ueberfaellig.faellig_am, lang)} ({Math.floor((Date.now() - new Date(rp.ueberfaellig.faellig_am).getTime()) / 864e5)} {lang === "en" ? "days" : lang === "es" ? "días" : "Tage"})</div>
              <button onClick={() => openPayment({ betrag: rp.ueberfaellig!.betrag, verwendungszweck: "AC-PAT-OVD", rateNummer: 0 })} style={{ marginTop: 12, padding: "12px 24px", borderRadius: 14, border: "2px solid rgba(239,68,68,0.6)", background: "#22c55e", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", animation: "animapayGlowRed 2.5s ease-in-out infinite", position: "relative", overflow: "hidden" }}>
                Jetzt bezahlen
              </button>
            </div>
            <div style={{ width: 80, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "14px 0", background: dk ? "#1e1e1e" : "#f0ece4" }}>
              <div style={{ ...hd, fontSize: 28, fontWeight: 800, color: fg }}>{rp.raten_bezahlt}</div>
              <div style={{ width: 28, height: 1, background: dk ? "#444" : "#d0c8bc", margin: "4px 0" }} />
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: muted }}>{t("progress.of", lang)} {rp.raten_gesamt}</div>
            </div>
          </div>
          <div style={{ margin: "0 20px 14px" }}>

          </div>
        </div>
      )}
      {!isOverdue && rp && rp.naechste_rate && (
        <div style={{ ...card, margin: "0 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ ...lb, color: dl <= 5 ? warn : muted, marginBottom: 4 }}>{t("progress.nextPayment", lang)}</div>
            <div style={{ ...hd, fontSize: 26, fontWeight: 800, color: fg }}>{rp.naechste_rate.betrag} €</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{fmtDateL(rp.naechste_rate.faellig_am, lang)}</div>
          </div>
          <div style={{ width: 80, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "14px 0", background: dk ? "#1e1e1e" : "#f0ece4" }}>
            <div style={{ ...hd, fontSize: 28, fontWeight: 800, color: fg }}>{rp.raten_bezahlt}</div>
            <div style={{ width: 28, height: 1, background: dk ? "#444" : "#d0c8bc", margin: "4px 0" }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: muted }}>{t("progress.of", lang)} {rp.raten_gesamt}</div>
          </div>
        </div>
      )}
      {pays.length > 0 && (
        <div>
          <div style={{ padding: "0 20px" }}><p style={{ ...hd, fontSize: 18, fontWeight: 800, marginBottom: 10, color: fg }}>{t("progress.history", lang)}</p></div>
          <div style={{ ...card, margin: "0 20px 14px", padding: "2px 18px" }}>
            {(showAllPays ? pays : pays.slice(0, 6)).map((p, i) => {
              const isOverdueRate = p.status === "überfällig";
              const daysLate = p.bezahlt_am && p.faellig_am ? Math.floor((new Date(p.bezahlt_am).getTime() - new Date(p.faellig_am).getTime()) / 864e5) : 0;
              const wasLate = daysLate > 3;
              const daysSinceOverdue = isOverdueRate ? Math.floor((Date.now() - new Date(p.faellig_am).getTime()) / 864e5) : 0;
              const iconBg = isOverdueRate ? (dk ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.06)") : wasLate ? (dk ? "rgba(251,191,36,0.12)" : "rgba(251,191,36,0.06)") : (dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)");
              const iconColor = isOverdueRate ? red : wasLate ? warn : grn;
              const iconSymbol = isOverdueRate ? "!" : "✓";
              const amountColor = isOverdueRate ? red : wasLate ? warn : grn;
              const lateLabel = lang === "en" ? "days late" : lang === "es" ? "días de retraso" : "Tage verspätet";
              const overdueLabel = lang === "en" ? "days overdue" : lang === "es" ? "días vencidos" : "Tage überfällig";
              return (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderTop: i > 0 ? "1px solid " + (dk ? "#252525" : "#f0e8dc") : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: iconBg, color: iconColor }}>{iconSymbol}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: fg }}>{t("progress.monthlyRate", lang)}{wasLate && !isOverdueRate ? <span style={{ fontSize: 10, fontWeight: 600, color: warn, marginLeft: 6 }}>+{daysLate} {lateLabel}</span> : null}{isOverdueRate ? <span style={{ fontSize: 10, fontWeight: 600, color: red, marginLeft: 6 }}>{daysSinceOverdue} {overdueLabel}</span> : null}</div>
                    <div style={{ fontSize: 11, color: muted }}>{isOverdueRate ? fmtDateL(p.faellig_am, lang) : fmtDateL(p.bezahlt_am, lang)}</div>
                  </div>
                </div>
                <span style={{ ...hd, fontSize: 15, fontWeight: 700, color: amountColor }}>{p.betrag} €</span>
              </div>
              );
            })}
          </div>
          {!showAllPays && pays.length > 6 && (
            <div style={{ padding: "0 20px 14px", textAlign: "center" }}>
              <button onClick={() => { setShowAllPays(true); hapticLight(); }} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid " + (dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"), background: "transparent", color: muted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {lang === "en" ? "Load older" : lang === "es" ? "Cargar anteriores" : "Ältere laden"} ({pays.length - 6})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ═══ CHAT TAB ═══
  const ChatTab = (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)", position: "relative" }}>
      {/* Sticky header - never scrolls */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, padding: "20px 20px 14px", background: dk ? "rgba(3,8,6,0.95)" : "rgba(245,241,235,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid " + border }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ ...hd, fontSize: 19, fontWeight: 800, color: fg, margin: 0 }}>{t("chat.title", lang)}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: grn, display: "inline-block" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: grn }}>{t("chat.practice", lang)}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}><button onClick={openArchive} style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid " + border, background: showArchive ? (dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)") : "transparent", color: showArchive ? grn : muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{lang === "en" ? "Archive" : "Archiv"}</button><button onClick={() => { setMsgs([]); setShowArchive(false); }} style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid " + border, background: "transparent", color: muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{lang === "en" ? "New" : "Neu"}</button></div>
        </div>
      </div>
      {showArchive ? (
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 12 }}>{lang === "en" ? "Past conversations" : "Vergangene Unterhaltungen"}</p>
          {chatArchive.length === 0 ? (
            <p style={{ color: muted, fontSize: 13 }}>{lang === "en" ? "No past conversations yet" : "Noch keine vergangenen Unterhaltungen"}</p>
          ) : chatArchive.map((c, ci) => (
            <button key={ci} onClick={() => { setMsgs(c.msgs); setShowArchive(false); }} style={{ display: "block", width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid " + border, background: "transparent", marginBottom: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{c.firstText}</span>
                <span style={{ fontSize: 11, color: muted }}>{c.msgs.length} Msg</span>
              </div>
              <span style={{ fontSize: 11, color: muted }}>{new Date(c.date).toLocaleDateString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </button>
          ))}
        </div>
      ) : null}
      {/* Messages area */}
      <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 20px", display: showArchive ? "none" : undefined }}>
        {msgs.length === 0 && !typing && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: fg, marginBottom: 6 }}>{lang === "en" ? "Start a conversation" : lang === "es" ? "Inicia una conversación" : "Starte eine Unterhaltung"}</p>
            <p style={{ fontSize: 13, color: muted, lineHeight: 1.5 }}>{lang === "en" ? "Ask iCura about your treatment, installment plan and payments. For appointments use the Doctolib link under More." : lang === "es" ? "Pregunta a iCura sobre tu tratamiento, pagos o citas." : "Frag iCura alles zu deiner Behandlung, deinem Ratenplan und deinen Zahlungen. Für Termine nutze den Doctolib-Link unter Mehr."}</p>
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} style={{ display: "flex", marginBottom: 10, justifyContent: m.sender_type === "patient" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "78%", padding: "12px 16px", fontSize: 14, lineHeight: 1.5, borderRadius: 20, ...(m.sender_type === "patient" ? { background: "#22c55e", color: "#fff", borderBottomRightRadius: 4 } : { background: cardBg, color: fg, border: "1px solid " + border, borderBottomLeftRadius: 4 }) }}>
              {m.sender_name && m.sender_type !== "patient" && <div style={{ fontSize: 11, fontWeight: 700, color: grn, marginBottom: 3 }}>{m.sender_name}</div>}
              {m.text}
              <div style={{ fontSize: 10, marginTop: 3, textAlign: "right" as const, color: m.sender_type === "patient" ? "rgba(255,255,255,0.5)" : muted }}>{fmtTimeL(m.created_at, lang)}</div>
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
                <span style={{ fontSize: 12, color: muted, marginLeft: 6 }}>{t("chat.typing", lang)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Fixed input bar */}
      <div style={{ position: "sticky", bottom: 80, padding: "10px 16px", display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid " + border, borderRadius: "0 0 16px 16px", background: dk ? "rgba(3,8,6,0.98)" : "rgba(245,241,235,0.98)", backdropFilter: "blur(12px)" }}>
        <button style={{ width: 42, height: 42, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: "none", background: dk ? "#141414" : "#e8e2d8" }}>🎤</button>
        <input value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sendMsg(); }} placeholder={t("chat.placeholder", lang)} style={{ flex: 1, padding: "11px 16px", borderRadius: 24, fontSize: 14, outline: "none", fontFamily: "inherit", background: dk ? "#141414" : "#fff", border: "1px solid " + border, color: fg }} />
        <button onClick={sendMsg} style={{ width: 42, height: 42, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", background: msgInput.trim() ? "#22c55e" : btnBg, transition: "background 0.2s" }}>↑</button>
      </div>
    </div>
  );

  // ═══ MORE TAB ═══
  const MoreTab = (
    <div>
      {Header}
      <div style={{ padding: "16px 20px 0" }}>
        <h1 style={{ ...hd, fontSize: 23, fontWeight: 800, marginBottom: 16, color: fg }}>{t("more.title", lang)}</h1>
      </div>
      {docs.length > 0 && <div style={{ padding: "0 20px" }}><p style={{ ...hd, fontSize: 15, fontWeight: 700, marginBottom: 10, color: fg }}>{t("more.documents", lang)}</p></div>}
      {docs.map(d => (
        <div key={d.id} onClick={() => { setDocDrawer(d); hapticMedium(); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 16px", borderRadius: 14, margin: "0 20px 8px", cursor: "pointer", background: cardBg, border: "1px solid " + border, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", transition: "transform 0.15s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>{docIc[d.typ] || "📄"}</span>
            <div><div style={{ fontSize: 14, fontWeight: 600, color: fg }}>{d.name}</div><div style={{ fontSize: 11, color: muted }}>{fmtDateL(d.hochgeladen_am, lang)}</div></div>
          </div>
          <span style={{ fontSize: 16, color: muted }}>↗</span>
        </div>
      ))}
      <div style={{ borderRadius: 18, padding: 28, margin: "18px 20px", textAlign: "center", background: dk ? "rgba(100,80,200,0.06)" : "rgba(100,80,200,0.04)", border: "1px solid " + (dk ? "rgba(100,80,200,0.12)" : "rgba(100,80,200,0.08)") }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🎥</div>
        <h3 style={{ ...hd, fontSize: 17, fontWeight: 700, marginBottom: 6, color: fg }}>{t("more.consult", lang)}</h3>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: soft, marginBottom: 18 }}>{t("more.consultText", lang)}</p>
        <button onClick={async () => { hapticMedium(); try { await fetch("/api/patient/nachrichten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Ich hätte gerne ein Beratungsgespräch zu meinem Ratenplan. Können Sie mir einen Termin vorschlagen?" }) }); } catch {} setTab("chat"); }} style={{ border: "none", borderRadius: 14, padding: "14px 32px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: "#7c3aed" }}>{t("more.requestConsult", lang)}</button>
      </div>
      <div style={{ ...card, margin: "0 20px 14px" }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: fg }}>{t("more.aboutApp", lang)}</p>
        <p style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>{t("more.aboutText", lang)}</p>
      </div>
      
      {/* Doctolib */}
      <div style={{ padding: "0 20px 8px" }}>
        <a href="https://www.doctolib.de/kieferorthopadie/leipzig/maria-elena-schubert/booking/patient-insurance-sector?specialityId=1325&telehealth=false&placeId=practice-270296&source=profile" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 16px", borderRadius: 14, background: cardBg, border: "1px solid " + border, textDecoration: "none" }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: fg }}>{lang === "en" ? "Book an appointment" : lang === "es" ? "Reservar cita" : "Termin vereinbaren"}</div>
            <div style={{ fontSize: 11, color: muted }}>{lang === "en" ? "Opens Doctolib" : lang === "es" ? "Abre Doctolib" : "Öffnet Doctolib zur Terminvereinbarung"}</div>
          </div>
          <span style={{ color: grn, fontSize: 14, fontWeight: 600 }}>→</span>
        </a>
      </div>
      {/* DSGVO Section */}
      <div style={{ padding: "8px 20px 0" }}>
        <p style={{ ...hd, fontSize: 15, fontWeight: 700, marginBottom: 10, color: fg }}>{lang === "en" ? "Data & Privacy" : lang === "es" ? "Datos y Privacidad" : "Datenschutz & Rechte"}</p>
      </div>
      <div style={{ padding: "0 20px 8px" }}>
        <button onClick={exportData} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 16px", borderRadius: 14, cursor: "pointer", background: cardBg, border: "1px solid " + border, fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ fontSize: 20 }}>📥</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: fg }}>{lang === "en" ? "Export my data" : lang === "es" ? "Exportar mis datos" : "Meine Daten exportieren"}</div>
            <div style={{ fontSize: 11, color: muted }}>{lang === "en" ? "View and print all your stored data (Art. 15/20 GDPR)" : lang === "es" ? "Ver e imprimir todos tus datos (Art. 15/20 RGPD)" : "Alle gespeicherten Daten einsehen und drucken (Art. 15/20 DSGVO)"}</div>
          </div>
          <span style={{ color: muted }}>↓</span>
        </button>
      </div>
      <div style={{ padding: "0 20px 8px" }}>
        <button onClick={() => setShowPrivacy(true)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 16px", borderRadius: 14, cursor: "pointer", background: cardBg, border: "1px solid " + border, fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: fg }}>{lang === "en" ? "Privacy Policy" : lang === "es" ? "Política de Privacidad" : "Datenschutzerklärung"}</div>
            <div style={{ fontSize: 11, color: muted }}>{lang === "en" ? "How we handle your data" : lang === "es" ? "Cómo gestionamos tus datos" : "So gehen wir mit deinen Daten um"}</div>
          </div>
          <span style={{ color: muted }}>→</span>
        </button>
      </div>
      <div style={{ padding: "0 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 14, background: cardBg, border: "1px solid " + border }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>📧</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: fg }}>{lang === "en" ? "Digital invoices" : lang === "es" ? "Facturas digitales" : "Digitaler Rechnungsempfang"}</div>
              <div style={{ fontSize: 11, color: muted }}>{lang === "en" ? "Receive invoices in this app" : lang === "es" ? "Recibir facturas en esta app" : "Rechnungen in der App empfangen"}</div>
            </div>
          </div>
          <button onClick={() => { if (consent?.digitaler_rechnungsempfang) { setDeactivatePopup("rechnungen"); } else { acceptConsent({ portal: true, rechnungen: true, push: consent?.push_benachrichtigungen || false, datenschutz: true }); } }} style={{ width: 48, height: 28, borderRadius: 14, border: "none", background: consent?.digitaler_rechnungsempfang ? grn : (dk ? "#333" : "#ddd"), cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", position: "absolute", top: 3, left: consent?.digitaler_rechnungsempfang ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </button>
        </div>
      </div>
      <div style={{ padding: "0 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 14, background: cardBg, border: "1px solid " + border }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>🔔</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: fg }}>{lang === "en" ? "Push notifications" : lang === "es" ? "Notificaciones push" : "Push-Benachrichtigungen"}</div>
              <div style={{ fontSize: 11, color: muted }}>{lang === "en" ? "Get notified about due payments" : lang === "es" ? "Recibe alertas de pagos" : "Benachrichtigungen bei fälligen Raten"}</div>
            </div>
          </div>
          <button onClick={() => { if (consent?.push_benachrichtigungen) { setDeactivatePopup("push"); } else { acceptConsent({ portal: true, rechnungen: consent?.digitaler_rechnungsempfang || false, push: true, datenschutz: true }); } }} style={{ width: 48, height: 28, borderRadius: 14, border: "none", background: consent?.push_benachrichtigungen ? grn : (dk ? "#333" : "#ddd"), cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", position: "absolute", top: 3, left: consent?.push_benachrichtigungen ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </button>
        </div>
      </div>
      <div style={{ padding: "0 20px 16px", textAlign: "center", marginTop: 8 }}>
        <button onClick={logout} style={{ background: "none", border: "1px solid " + border, borderRadius: 10, padding: "8px 20px", color: muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>{t("more.logout", lang)}</button>
        <p style={{ fontSize: 11, color: dk ? "#444" : "#ccc" }}>Anima Cura v1.0 · DSGVO-konform · EU-Server</p>
      </div>
    </div>
  );

  // ═══ CONSENT GATE ═══

  // Determine if patient is minor (from geburtsdatum in patient data, or assume adult if unknown)
  const patientGeb = null;
  const isMinor = patientGeb ? (new Date().getFullYear() - new Date(patientGeb).getFullYear()) < 16 : false;

  if (!consentLoading && consent && !consent.datenschutz_akzeptiert) {
    const canAccept = consentCheck1 && consentCheck2 && (!isMinor || consentIsGuardian);
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: dk ? "#030806" : "#f5f1eb", fontFamily: "'DM Sans', sans-serif", padding: 20 }}>
        <div style={{ maxWidth: 420, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: grn, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff", margin: "0 auto 16px", ...hd }}>A</div>
            <h1 style={{ ...hd, fontSize: 22, fontWeight: 800, color: fg, marginBottom: 6 }}>
              {lang === "en" ? "Welcome to Anima Cura" : lang === "es" ? "Bienvenido a Anima Cura" : "Willkommen bei Anima Cura"}
            </h1>
            <p style={{ fontSize: 13, color: muted }}>
              {lang === "en" ? "Your digital patient portal" : lang === "es" ? "Tu portal digital de pacientes" : "Dein digitales Patientenportal"}
            </p>
          </div>

          {/* What we store */}
          <div style={{ padding: 16, borderRadius: 14, background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: "1px solid " + (dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"), marginBottom: 12, fontSize: 13, lineHeight: 1.7, color: soft }}>
            <strong style={{ color: fg, fontSize: 14 }}>{lang === "en" ? "What we store:" : lang === "es" ? "Lo que almacenamos:" : "Was wir speichern:"}</strong><br/>
            {lang === "en"
              ? "Name, treatment phases, documents, invoices, chat messages. All data stored encrypted on EU servers (Frankfurt, Germany). Only accessible to you and your practice team. We do not process payments — we only provide your documents digitally."
              : lang === "es"
              ? "Nombre, fases de tratamiento, documentos, facturas, mensajes de chat. Todos los datos almacenados encriptados en servidores de la UE (Frankfurt, Alemania). No procesamos pagos — solo proporcionamos tus documentos digitalmente."
              : "Name, Behandlungsphasen, Dokumente, Rechnungen, Chat-Nachrichten. Alle Daten verschlüsselt auf EU-Servern gespeichert (Frankfurt, Deutschland). Nur für dich und dein Praxisteam zugänglich. Wir verarbeiten keine Zahlungen — wir stellen dir deine Unterlagen digital bereit."}
          </div>

          {/* Your rights */}
          <div style={{ padding: 16, borderRadius: 14, background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: "1px solid " + (dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"), marginBottom: 12, fontSize: 13, lineHeight: 1.7, color: soft }}>
            <strong style={{ color: fg, fontSize: 14 }}>{lang === "en" ? "Your rights (GDPR):" : lang === "es" ? "Tus derechos (RGPD):" : "Deine Rechte (DSGVO):"}</strong><br/>
            {lang === "en"
              ? "You can export all your data at any time (Art. 15/20), revoke this consent at any time with future effect (Art. 7), or request complete deletion of your data (Art. 17). All under More > Data & Privacy."
              : lang === "es"
              ? "Puedes exportar todos tus datos en cualquier momento (Art. 15/20), revocar este consentimiento (Art. 7), o solicitar la eliminación de tus datos (Art. 17)."
              : "Du kannst jederzeit alle Daten exportieren (Art. 15/20), diese Einwilligung mit Wirkung für die Zukunft widerrufen (Art. 7) oder die vollständige Löschung deiner Daten beantragen (Art. 17). Alles unter Mehr > Datenschutz & Rechte."}
          </div>

          {/* Minor notice */}
          {isMinor && (
            <div style={{ padding: 16, borderRadius: 14, background: dk ? "rgba(251,191,36,0.05)" : "rgba(234,179,80,0.04)", border: "1px solid " + (dk ? "rgba(251,191,36,0.15)" : "rgba(234,179,80,0.12)"), marginBottom: 12, fontSize: 13, lineHeight: 1.7, color: soft }}>
              <strong style={{ color: warn, fontSize: 14 }}>{lang === "en" ? "Minor patient" : lang === "es" ? "Paciente menor de edad" : "Minderjähriger Patient"}</strong><br/>
              {lang === "en"
                ? "This patient is under 16 years old. According to Art. 8 GDPR, a legal guardian must provide consent for data processing."
                : lang === "es"
                ? "Este paciente es menor de 16 años. Según el Art. 8 RGPD, un tutor legal debe dar el consentimiento."
                : "Dieser Patient ist unter 16 Jahre alt. Gemäß Art. 8 DSGVO muss ein Erziehungsberechtigter die Einwilligung zur Datenverarbeitung erteilen."}
            </div>
          )}

          {/* Checkboxes - must not be pre-checked */}
          <div style={{ marginBottom: 20, textAlign: "left" }}>
            <label style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", cursor: "pointer" }} onClick={() => setConsentCheck1(!consentCheck1)}>
              <div style={{ width: 22, height: 22, minWidth: 22, borderRadius: 6, border: "2px solid " + (consentCheck1 ? grn : (dk ? "#444" : "#ccc")), background: consentCheck1 ? grn : "transparent", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1, transition: "all 0.2s" }}>
                {consentCheck1 && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 13, color: fg, lineHeight: 1.5 }}>
                {lang === "en" ? "I have read and understood the above information about data storage and my rights." : lang === "es" ? "He leído y entendido la información sobre el almacenamiento de datos y mis derechos." : "Ich habe die obigen Informationen zur Datenspeicherung und meinen Rechten gelesen und verstanden."}
              </span>
            </label>
            <label style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", cursor: "pointer" }} onClick={() => setConsentCheck2(!consentCheck2)}>
              <div style={{ width: 22, height: 22, minWidth: 22, borderRadius: 6, border: "2px solid " + (consentCheck2 ? grn : (dk ? "#444" : "#ccc")), background: consentCheck2 ? grn : "transparent", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1, transition: "all 0.2s" }}>
                {consentCheck2 && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 13, color: fg, lineHeight: 1.5 }}>
                {lang === "en" ? "I consent to receiving my invoices, treatment documents and notifications digitally via the Anima Cura app." : lang === "es" ? "Doy mi consentimiento para recibir mis facturas, documentos de tratamiento y notificaciones digitalmente a través de Anima Cura." : "Ich bin einverstanden, meine Rechnungen, Behandlungsunterlagen und Benachrichtigungen digital über die Anima Cura App zu erhalten."}
              </span>
            </label>
            {isMinor && (
              <label style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", cursor: "pointer" }} onClick={() => setConsentIsGuardian(!consentIsGuardian)}>
                <div style={{ width: 22, height: 22, minWidth: 22, borderRadius: 6, border: "2px solid " + (consentIsGuardian ? warn : (dk ? "#444" : "#ccc")), background: consentIsGuardian ? warn : "transparent", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1, transition: "all 0.2s" }}>
                  {consentIsGuardian && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 13, color: fg, lineHeight: 1.5 }}>
                  {lang === "en" ? "I am the legal guardian of this patient and authorize the data processing on their behalf (Art. 8 GDPR)." : lang === "es" ? "Soy el tutor legal de este paciente y autorizo el tratamiento de datos en su nombre (Art. 8 RGPD)." : "Ich bin der/die Erziehungsberechtigte dieses Patienten und erteile die Einwilligung zur Datenverarbeitung in seinem/ihrem Namen (Art. 8 DSGVO)."}
                </span>
              </label>
            )}
          </div>

          <button disabled={!canAccept} onClick={() => acceptConsent({ portal: true, rechnungen: true, push: true, datenschutz: true })} style={{ width: "100%", padding: "16px 32px", borderRadius: 14, border: "none", background: canAccept ? grn : (dk ? "#333" : "#ddd"), color: canAccept ? "#fff" : muted, fontSize: 15, fontWeight: 700, cursor: canAccept ? "pointer" : "not-allowed", fontFamily: "inherit", marginBottom: 10, transition: "all 0.2s" }}>
            {lang === "en" ? "I agree — continue" : lang === "es" ? "Acepto — continuar" : "Einverstanden — weiter"}
          </button>
          <p style={{ fontSize: 11, color: muted, textAlign: "center" }}>
            {lang === "en" ? "You can revoke your consent at any time under More > Data & Privacy." : lang === "es" ? "Puedes revocar tu consentimiento en cualquier momento." : "Du kannst deine Einwilligung jederzeit unter Mehr > Datenschutz & Rechte widerrufen."}
          </p>
          <p style={{ fontSize: 10, color: dk ? "#333" : "#ccc", textAlign: "center", marginTop: 12 }}>Consent v1.0 · DSGVO Art. 6/7/8 · EU-Server Frankfurt</p>
        </div>
      </div>
    );
  }

  // ═══ RENDER ═══
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(ellipse at 30% 20%, #0a1a10 0%, #050505 40%, #030303 100%)", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Branding on desktop - left side */}
      <div className="desktop-brand" style={{ position: "fixed", left: 60, top: "50%", transform: "translateY(-50%)", display: "none", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff", ...hd }}>A</div>
          <div>
            <div style={{ ...hd, fontSize: 24, fontWeight: 800, color: "#f0f0f0" }}>Anima Cura</div>
            <div style={{ fontSize: 12, color: "#666", fontWeight: 500 }}>Patient Portal</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#555", maxWidth: 220, lineHeight: 1.6 }}>
          {lang === "en" ? "Your treatment companion. Track your progress, chat with iCura, manage your payments." : lang === "es" ? "Tu compañero de tratamiento. Sigue tu progreso, chatea con iCura, gestiona tus pagos." : "Dein Behandlungsbegleiter. Verfolge deinen Fortschritt, chatte mit iCura, verwalte deine Raten."}
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24" }} />
        </div>
        <div className="desktop-brand" style={{ display: "none", gap: 6, marginTop: 24 }}>
          {(["phone", "tablet"] as const).map(d => (
            <button key={d} onClick={() => setDeviceSize(d)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: deviceSize === d ? "rgba(255,255,255,0.06)" : "transparent", color: deviceSize === d ? "#f0f0f0" : "#555", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {d === "phone" ? "Phone" : "Tablet"}
            </button>
          ))}
        </div>
      </div>
      {/* Phone frame */}
      <div style={{ position: "relative", width: "100%", maxWidth: deviceSize === "tablet" ? 720 : 430, transition: "max-width 0.4s ease" }}>
        {/* Phone bezel - only visible on desktop */}
        <div className="phone-bezel" style={{ display: "none", position: "absolute", inset: -14, borderRadius: 46, border: "2px solid rgba(255,255,255,0.08)", pointerEvents: "none", zIndex: 50 }} />
        {/* Notch - only visible on desktop */}
        <div className="phone-notch" style={{ display: "none", position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)", width: deviceSize === "tablet" ? 180 : 140, height: 28, borderRadius: "0 0 18px 18px", background: "#0a0a0a", zIndex: 51, boxShadow: "0 2px 8px rgba(0,0,0,0.3)", transition: "width 0.4s ease" }}>
          <div style={{ width: 60, height: 5, borderRadius: 3, background: dk ? "#222" : "#ccc", margin: "14px auto 0" }} />
        </div>
    <div className="phone-app-container" style={{ maxWidth: deviceSize === "tablet" ? 720 : 430, margin: "0 auto", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", background: dk ? "#030806" : "#f5f1eb", color: fg, position: "relative", boxShadow: "0 0 80px rgba(0,0,0,0.5), 0 0 200px rgba(74,222,128,0.03)", overflow: "hidden", borderRadius: 0, transition: "max-width 0.4s ease" }}>
      {/* Lava lamp animated gradient blobs - warm ambient glow, corners lit, middle dark */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        {/* Top-left: warm green-teal glow */}
        <motion.div
          animate={{ scale: [1, 1.3, 1.1, 1], x: [0, 60, -20, 0], y: [0, 50, 20, 0], backgroundColor: [c1, c2, c4, c1] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", top: -150, left: -150, opacity: dk ? 0.18 : 0.1, filter: "blur(80px)" }}
        />
        {/* Bottom-right: warm amber-gold glow */}
        <motion.div
          animate={{ scale: [1, 1.2, 0.95, 1], x: [0, -50, 30, 0], y: [0, -40, 20, 0], backgroundColor: ["#fbbf24", c3, "#f97316", "#fbbf24"] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", width: 450, height: 450, borderRadius: "50%", bottom: -100, right: -120, opacity: dk ? 0.14 : 0.08, filter: "blur(80px)" }}
        />
        {/* Mid-right: subtle purple accent */}
        <motion.div
          animate={{ scale: [1, 1.15, 1.05, 1], x: [0, -40, 25, 0], y: [0, 60, -30, 0], backgroundColor: [c5, c3, c1, c5] }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", width: 350, height: 350, borderRadius: "50%", top: "40%", right: -80, opacity: dk ? 0.12 : 0.06, filter: "blur(70px)" }}
        />
        {/* Top-right: very subtle secondary */}
        <motion.div
          animate={{ scale: [1, 1.25, 1, 1.15, 1], x: [0, -30, 40, -15, 0], y: [0, 30, -20, 35, 0], backgroundColor: [c2, c4, c1, c3, c2] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%", top: -60, right: -40, opacity: dk ? 0.1 : 0.05, filter: "blur(60px)" }}
        />
      </div>
      <div className="portal-content" style={{ position: "relative", zIndex: 1, paddingBottom: 100 }}>
        {tab === "home" && HomeTab}
        {tab === "journey" && JourneyTab}
        {tab === "progress" && (balanceView ? BalanceTab : ProgressTab)}
        {tab === "chat" && ChatTab}
        {tab === "more" && MoreTab}
      </div>
      {Nav}

      {/* Finanzen-Auswahl: Fortschritt oder Anima Balance */}
      {finSheet && (
        <div className="ac-ovl" onClick={() => setFinSheet(false)} style={{ position: "absolute", inset: 0, zIndex: 220, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", margin: 8, borderRadius: 26, background: dk ? "rgba(17,21,17,0.97)" : "rgba(255,255,255,0.98)", border: `1px solid ${dk ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)"}`, padding: "14px 16px 16px" }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: dk ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.15)", margin: "0 auto 14px" }} />
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: fg, marginBottom: 12 }}>Finanzen</h3>
            <button onClick={() => { setBalanceView(false); setTab("progress"); setFinSheet(false); hapticLight(); }} style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", cursor: "pointer", border: `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, borderRadius: 18, padding: "15px 14px", marginBottom: 10, background: dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", fontFamily: "inherit" }}>
              <span style={{ width: 44, height: 44, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: dk ? "rgba(74,222,128,0.12)" : "rgba(34,197,94,0.1)" }}>📈</span>
              <span><b style={{ display: "block", fontSize: 15, color: fg }}>Dein Fortschritt</b><span style={{ fontSize: 12, color: muted }}>Investiert, offen, Raten im Blick</span></span>
              <span style={{ marginLeft: "auto", color: muted, fontSize: 18 }}>›</span>
            </button>
            <button onClick={() => { setBalanceView(true); setTab("progress"); setFinSheet(false); hapticLight(); }} style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid rgba(246,196,83,0.55)", borderRadius: 18, padding: "15px 14px", background: "linear-gradient(160deg, rgba(246,196,83,0.14), rgba(255,255,255,0.02))", boxShadow: "0 0 22px rgba(246,196,83,0.12)", fontFamily: "inherit" }}>
              <span style={{ width: 44, height: 44, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: "rgba(246,196,83,0.16)" }}>🪙</span>
              <span><b style={{ display: "block", fontSize: 15, color: fg }}>Anima Balance <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "#231a04", background: "#f6c453", borderRadius: 999, padding: "2px 8px", verticalAlign: "middle" }}>NEU</span></b><span style={{ fontSize: 12, color: muted }}>Dein Guthaben, deine Bewegungen</span></span>
              <span style={{ marginLeft: "auto", color: muted, fontSize: 18 }}>›</span>
            </button>
          </div>
        </div>
      )}

      {/* Aufladen-Sheet mit Betragsleiter und GiroCode */}
      {aufladenSheet && (
        <div className="ac-ovl" onClick={() => setAufladenSheet(false)} style={{ position: "absolute", inset: 0, zIndex: 220, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", margin: 8, borderRadius: 26, background: dk ? "rgba(17,21,17,0.97)" : "rgba(255,255,255,0.98)", border: `1px solid ${dk ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)"}`, padding: "14px 16px 16px", maxHeight: "85%", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: dk ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.15)", margin: "0 auto 14px" }} />
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: fg, marginBottom: 12 }}>Guthaben aufladen</h3>
            <div style={{ display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
              {([100, 300, 500, 1000, "frei"] as (number | "frei")[]).map((b) => (
                <button key={String(b)} onClick={() => { setAufladeBetrag(b); hapticLight(); }} style={{ flex: "1 0 17%", cursor: "pointer", borderRadius: 12, padding: "11px 0", fontWeight: 700, fontSize: 13.5, fontFamily: "inherit", border: aufladeBetrag === b ? "1px solid #f6c453" : `1px solid ${dk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, background: aufladeBetrag === b ? "rgba(246,196,83,0.14)" : "transparent", color: aufladeBetrag === b ? "#f6c453" : muted }}>
                  {b === "frei" ? "Frei" : `${b} €`}
                </button>
              ))}
            </div>
            {aufladeBetrag === "frei" && (
              <input value={aufladeFrei} onChange={(e) => setAufladeFrei(e.target.value)} placeholder="Betrag in €, z. B. 250" inputMode="decimal" style={{ width: "100%", marginBottom: 10, borderRadius: 12, padding: "12px 14px", fontSize: 15, fontFamily: "inherit", border: `1px solid ${dk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)"}`, background: "transparent", color: fg, outline: "none" }} />
            )}
            {aufladeQr ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={aufladeQr} alt="GiroCode" style={{ display: "block", width: 200, height: 200, margin: "6px auto 10px", borderRadius: 14, background: "#fff", padding: 8 }} />
                <p style={{ textAlign: "center", fontSize: 12, color: muted, lineHeight: 1.55 }}>
                  Mit der Banking-App scannen, alles ist vorausgefüllt.<br />
                  Verwendungszweck: <b style={{ color: fg }}>AUFLADUNG {balance?.ivoris_nummer} {balance?.nachname}</b>
                </p>
              </>
            ) : (
              <p style={{ textAlign: "center", fontSize: 13, color: muted, padding: "18px 0" }}>Betrag wählen, dann erscheint dein GiroCode.</p>
            )}
            <p style={{ textAlign: "center", fontSize: 11, color: muted, marginTop: 10 }}>Nicht genutztes Guthaben holst du dir jederzeit zurück.</p>
          </div>
        </div>
      )}

      {popup && (
        <div className="ac-ovl" onClick={() => setPopup(null)} style={{ position: "absolute", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ borderRadius: 24, padding: "36px 28px", textAlign: "center", maxWidth: 300, width: "100%", background: cardBg, border: "1px solid " + border }}>
            <span style={{ fontSize: 56, display: "block", marginBottom: 16 }}>{popup.icon}</span>
            <h3 style={{ ...hd, fontSize: 22, fontWeight: 700, marginBottom: 8, color: fg }}>{translateBadge(popup.titel, lang).titel}</h3>
            <p style={{ fontSize: 14, color: soft, marginBottom: 18 }}>{translateBadge(popup.titel, lang).beschreibung || popup.beschreibung}</p>
            {popup.freigeschaltet
              ? <span style={{ display: "inline-block", padding: "5px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "rgba(74,222,128,0.1)", color: grn }}>{t("badge.unlocked", lang)}</span>
              : <span style={{ display: "inline-block", padding: "5px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: muted }}>{t("badge.locked", lang)}</span>}
            <button onClick={() => setPopup(null)} style={{ display: "block", margin: "18px auto 0", background: "none", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", color: soft }}>{t("doc.close", lang)}</button>
          </div>
        </div>
      )}
      {/* Document Bottom Sheet Drawer - Framer Motion */}
      <AnimatePresence>
        {docDrawer && (
          <motion.div
            key="doc-backdrop"
            className="ac-ovl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setDocDrawer(null)}
            style={{ position: "absolute", inset: 0, zIndex: 210, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
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
              className="ac-ovl-panel" style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "85vh", borderRadius: "24px 24px 0 0", background: dk ? "rgba(18,18,18,0.95)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid " + (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"), borderBottom: "none", overflow: "hidden" }}
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
                  <p style={{ fontSize: 12, color: muted, marginTop: 2 }}>{t("doc.uploadedOn", lang)} {fmtDateL(docDrawer.hochgeladen_am, lang)}</p>
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
                <motion.button onClick={() => { hapticMedium(); if (navigator.share) { navigator.share({ title: docDrawer.name, text: docDrawer.name + " - Anima Cura Patientenportal" }).catch(() => {}); } }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "1px solid " + (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"), background: "transparent", color: fg, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  📤 Teilen
                </motion.button>
                <motion.button onClick={() => { hapticSuccess(); if (docDrawer.file_url) { window.open(docDrawer.file_url, "_blank"); } }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "none", background: grn, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  ⬇ Herunterladen
                </motion.button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Phase Detail Drawer */}
      <AnimatePresence>
        {phaseDrawer && (() => {
          const info = getPhaseContent(phaseDrawer.name, lang);
          if (!info.summary) {
            info.summary = translatePhase(phaseDrawer.name, lang).beschreibung || phaseDrawer.beschreibung || "";
            if (!info.details.length) info.details = [{ title: lang === "en" ? "More info" : lang === "es" ? "Más información" : "Mehr Info" }];
          }
          return (
            <motion.div
              key="phase-backdrop"
              className="ac-ovl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPhaseDrawer(null)}
              style={{ position: "absolute", inset: 0, zIndex: 215, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 280 }}
                drag="y"
                dragConstraints={{ top: 0 }}
                dragElastic={0.1}
                onDragEnd={(_e, i) => { if (i.offset.y > 100 || i.velocity.y > 500) setPhaseDrawer(null); }}
                onClick={e => e.stopPropagation()}
                className="ac-ovl-panel" style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "90vh", overflowY: "auto", borderRadius: "24px 24px 0 0", background: dk ? "rgba(18,18,18,0.95)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid " + (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)") }}
              >
                <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px", position: "sticky", top: 0 }}>
                  <div style={{ width: 36, height: 4, borderRadius: 2, background: dk ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }} />
                </div>
                {/* Phase header */}
                <div style={{ padding: "4px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>{info.emoji}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: phaseDrawer.status === "abgeschlossen" ? grn : phaseDrawer.status === "aktiv" ? purple : muted, marginBottom: 4 }}>
                      {phaseDrawer.status === "abgeschlossen" ? t("phase.completed", lang) : phaseDrawer.status === "aktiv" ? t("phase.activePhase", lang) : t("phase.upcoming", lang)}
                    </div>
                    <h3 style={{ ...hd, fontSize: 22, fontWeight: 800, color: fg }}>{translatePhase(phaseDrawer.name, lang).name}</h3>
                    {phaseDrawer.start_datum && <p style={{ fontSize: 12, color: muted, marginTop: 4 }}>{fmtDateL(phaseDrawer.start_datum, lang)}{phaseDrawer.end_datum ? " — " + fmtDateL(phaseDrawer.end_datum, lang) : " — " + t("journey.today", lang)}</p>}
                  </motion.div>
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => setPhaseDrawer(null)} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, color: muted }}>✕</motion.button>
                </div>
                {/* Summary */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} style={{ padding: "0 24px 16px" }}>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: soft }}>{info.summary}</p>
                </motion.div>
                {/* Phasen-Video: direkte Datei im eigenen Player, sonst eingebetteter Rahmen */}
                {phaseDrawer.video_url && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} style={{ padding: "0 24px 16px" }}>
                    {/\.(mp4|m4v|webm|mov)(\?|$)/i.test(phaseDrawer.video_url) ? (
                      <video src={phaseDrawer.video_url} controls playsInline preload="metadata" style={{ width: "100%", borderRadius: 14, display: "block", background: "#000" }} />
                    ) : (
                      <iframe src={phaseDrawer.video_url} allowFullScreen style={{ width: "100%", aspectRatio: "16 / 9", border: "none", borderRadius: 14, display: "block", background: "#000" }} title="Phasen-Video" />
                    )}
                  </motion.div>
                )}
                {/* Interactive detail buttons - Claude answers inline */}
                {info.details.map((d, i) => {
                  const answerKey = phaseDrawer.name + "::" + d.title;
                  const answer = phaseAnswers[answerKey];
                  const isLoading = loadingQuestion === answerKey;
                  const askClaude = async () => {
                    if (answer || isLoading) { setExpandedDetail(expandedDetail === d.title ? null : d.title); return; }
                    setExpandedDetail(d.title);
                    setLoadingQuestion(answerKey);
                    hapticMedium();
                    try {
                      const res = await fetch("/api/patient/phase-explain", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ phase_name: phaseDrawer.name, question: d.title, lang }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setPhaseAnswers(prev => ({ ...prev, [answerKey]: data.answer }));
                      }
                    } catch {}
                    setLoadingQuestion(null);
                  };
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.06 }} style={{ margin: "0 24px 8px" }}>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={askClaude}
                        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: expandedDetail === d.title ? "14px 14px 0 0" : 14, background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)", border: "1px solid " + (dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"), borderBottom: expandedDetail === d.title ? "none" : undefined, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 700, color: fg }}>{translatePhaseButton(d.title, lang)}</span>
                        <motion.span animate={{ rotate: expandedDetail === d.title ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ fontSize: 12, color: muted }}>{answer ? "▼" : "→"}</motion.span>
                      </motion.button>
                      <AnimatePresence>
                        {expandedDetail === d.title && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            style={{ overflow: "hidden", borderRadius: "0 0 14px 14px", background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.01)", border: "1px solid " + (dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"), borderTop: "none" }}
                          >
                            <div style={{ padding: "14px 16px" }}>
                              {isLoading ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: grn, animation: "pulse 1.4s infinite" }} />
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: grn, animation: "pulse 1.4s infinite 0.2s" }} />
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: grn, animation: "pulse 1.4s infinite 0.4s" }} />
                                  <span style={{ fontSize: 12, color: muted, marginLeft: 4 }}>iCura denkt nach...</span>
                                </div>
                              ) : answer ? (
                                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0, marginTop: 2 }}>A</div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: grn, marginBottom: 4 }}>iCura</div>
                                    <p style={{ fontSize: 13, lineHeight: 1.7, color: soft, margin: 0 }}>{answer}</p>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
                <div style={{ height: 20 }} />
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
      {/* IBAN Payment Overlay */}
      <AnimatePresence>
        {showIBAN && (
          <motion.div
            key="iban-backdrop"
            className="ac-ovl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowIBAN(false)}
            style={{ position: "absolute", inset: 0, zIndex: 220, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.1}
              onDragEnd={(_e, info) => { if (info.offset.y > 100 || info.velocity.y > 500) setShowIBAN(false); }}
              onClick={e => e.stopPropagation()}
              className="ac-ovl-panel" style={{ position: "absolute", bottom: 0, left: 0, right: 0, borderRadius: "24px 24px 0 0", background: dk ? "rgba(18,18,18,0.95)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid " + (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"), overflow: "hidden" }}
            >
              <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: dk ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }} />
              </div>
              <div style={{ padding: "4px 24px 8px" }}>
                <h3 style={{ ...hd, fontSize: 20, fontWeight: 800, color: fg, marginBottom: 4 }}>{t("iban.title", lang)}</h3>
                <p style={{ fontSize: 13, color: muted, marginBottom: 16 }}>{t("iban.subtitle", lang)}</p>
              </div>
              <div style={{ margin: "0 24px", borderRadius: 16, padding: 20, background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: "1px solid " + (dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)") }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: muted, marginBottom: 4 }}>{t("iban.recipient", lang)}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: fg }}>Praxis Dr. Maria Schubert</div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: muted, marginBottom: 4 }}>IBAN</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: fg, fontFamily: "monospace", letterSpacing: "0.05em" }}>DE89 3704 0044 0532 0130 00</div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: muted, marginBottom: 4 }}>BIC</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: fg, fontFamily: "monospace" }}>COBADEFFXXX</div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: muted, marginBottom: 4 }}>{t("iban.amount", lang)}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: red, ...hd }}>{rp && rp.ueberfaellig ? rp.ueberfaellig.betrag.toFixed(2).replace(".", ",") : "150,00"} €</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: muted, marginBottom: 4 }}>{t("iban.reference", lang)}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: fg }}>Rate {firstName} {patientName.split(" ").pop()}</div>
                </div>
              </div>
              <div style={{ padding: "20px 24px 32px" }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { hapticSuccess(); if (navigator.clipboard) { navigator.clipboard.writeText("DE89 3704 0044 0532 0130 00").catch(() => {}); } }}
                  style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: grn, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}
                >
                  📋 IBAN kopieren
                </motion.button>
                <button onClick={() => setShowIBAN(false)} style={{ width: "100%", padding: 14, borderRadius: 14, border: "1px solid " + (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"), background: "transparent", color: muted, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Schließen</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deactivation Confirmation Popup */}
      <AnimatePresence>
        {deactivatePopup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="ac-ovl" onClick={() => setDeactivatePopup(null)} style={{ position: "absolute", inset: 0, zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} style={{ background: dk ? "#1a1d2b" : "#fff", borderRadius: 20, padding: 24, maxWidth: 360, width: "100%" }}>
              <div style={{ fontSize: 28, textAlign: "center", marginBottom: 12 }}>{deactivatePopup === "push" ? "🔕" : "📭"}</div>
              <h3 style={{ ...hd, fontSize: 18, fontWeight: 700, color: fg, textAlign: "center", marginBottom: 12 }}>
                {deactivatePopup === "push"
                  ? (lang === "en" ? "Disable notifications?" : lang === "es" ? "¿Desactivar notificaciones?" : "Benachrichtigungen deaktivieren?")
                  : (lang === "en" ? "Disable digital invoices?" : lang === "es" ? "¿Desactivar facturas digitales?" : "Digitalen Rechnungsempfang deaktivieren?")}
              </h3>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: soft, marginBottom: 20 }}>
                {deactivatePopup === "push" ? (
                  lang === "en" ? "Without push notifications you will need to check the app yourself for due payments, appointments and updates. No automatic reminders. Missed deadlines are your own responsibility."
                  : lang === "es" ? "Sin notificaciones push, deberás revisar la app tú mismo. Sin recordatorios automáticos. Los plazos perdidos son tu responsabilidad."
                  : "Ohne Push-Benachrichtigungen musst du selbständig in die App schauen, um fällige Raten, Termine und Neuigkeiten zu sehen. Keine automatischen Erinnerungen. Verpasste Fristen liegen in deiner eigenen Verantwortung."
                ) : (
                  lang === "en" ? "Without digital invoices you will receive your invoices only by mail. This causes delays of several days. Late payments due to delayed delivery are your own responsibility."
                  : lang === "es" ? "Sin facturas digitales recibirás tus facturas solo por correo postal. Esto causa retrasos. Los pagos atrasados por entrega tardía son tu responsabilidad."
                  : "Ohne digitalen Rechnungsempfang erhältst du deine Rechnungen ausschließlich per Post. Das verursacht Verzögerungen von mehreren Tagen. Verspätete Zahlungen aufgrund verspäteter Zustellung liegen in deiner eigenen Verantwortung."
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setDeactivatePopup(null)} style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "none", background: grn, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {lang === "en" ? "Keep active" : lang === "es" ? "Mantener activo" : "Aktiviert lassen"}
                </button>
                <button onClick={() => {
                  if (deactivatePopup === "push") acceptConsent({ portal: true, rechnungen: consent?.digitaler_rechnungsempfang || false, push: false, datenschutz: true });
                  else acceptConsent({ portal: true, rechnungen: false, push: consent?.push_benachrichtigungen || false, datenschutz: true });
                  setDeactivatePopup(null);
                }} style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "1px solid " + (dk ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.2)"), background: "transparent", color: red, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  {lang === "en" ? "Deactivate" : lang === "es" ? "Desactivar" : "Deaktivieren"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Privacy Policy Overlay */}
      <AnimatePresence>
        {showPrivacy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, zIndex: 240, background: dk ? "#030806" : "#f5f1eb", overflowY: "auto" }}>
            <div style={{ padding: "24px 20px 100px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ ...hd, fontSize: 20, fontWeight: 800, color: fg, margin: 0 }}>
                  {lang === "en" ? "Privacy Policy" : lang === "es" ? "Política de Privacidad" : "Datenschutzerklärung"}
                </h2>
                <button onClick={() => setShowPrivacy(false)} style={{ background: "none", border: "none", cursor: "pointer", color: muted, fontSize: 22 }}>✕</button>
              </div>
              {[
                { t: lang === "en" ? "Responsible Party" : lang === "es" ? "Responsable" : "Verantwortliche Stelle", c: lang === "en" ? "Dr. Maria Schubert, Orthodontic Practice, Leipzig. Contact: praxis@dr-schubert.de" : lang === "es" ? "Dra. Maria Schubert, Consulta de Ortodoncia, Leipzig." : "Dr. Maria Schubert, Kieferorthopädische Praxis, Leipzig. Kontakt: praxis@dr-schubert.de" },
                { t: lang === "en" ? "What We Store" : lang === "es" ? "Qué almacenamos" : "Welche Daten werden gespeichert", c: lang === "en" ? "Name, date of birth, treatment phases, payment status (not payment processing), chat messages with iCura, documents provided by the practice, notification preferences." : lang === "es" ? "Nombre, fecha de nacimiento, fases de tratamiento, estado de pago, mensajes de chat, documentos, preferencias de notificación." : "Name, Geburtsdatum, Behandlungsphasen, Zahlungsstatus (keine Zahlungsverarbeitung), Chat-Nachrichten mit iCura, von der Praxis bereitgestellte Dokumente, Benachrichtigungseinstellungen." },
                { t: lang === "en" ? "Legal Basis" : lang === "es" ? "Base jurídica" : "Rechtsgrundlage", c: lang === "en" ? "Processing is based on your consent (Art. 6(1)(a) GDPR) and the treatment contract (Art. 6(1)(b) GDPR). Health data processing is based on Art. 9(2)(a) GDPR (explicit consent)." : lang === "es" ? "El tratamiento se basa en tu consentimiento (Art. 6.1.a RGPD) y el contrato de tratamiento (Art. 6.1.b RGPD)." : "Die Verarbeitung erfolgt auf Grundlage deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) und des Behandlungsvertrags (Art. 6 Abs. 1 lit. b DSGVO). Die Verarbeitung von Gesundheitsdaten erfolgt auf Basis deiner ausdrücklichen Einwilligung (Art. 9 Abs. 2 lit. a DSGVO)." },
                { t: lang === "en" ? "Storage Location" : lang === "es" ? "Ubicación" : "Speicherort", c: lang === "en" ? "All data is stored encrypted on EU servers (Supabase, Frankfurt, Germany). Transfer outside the EU does not take place." : lang === "es" ? "Todos los datos se almacenan encriptados en servidores de la UE (Frankfurt, Alemania)." : "Alle Daten werden verschlüsselt auf EU-Servern gespeichert (Supabase, Frankfurt, Deutschland). Eine Übermittlung in Drittstaaten findet nicht statt." },
                { t: lang === "en" ? "Your Rights" : lang === "es" ? "Tus derechos" : "Deine Rechte", c: lang === "en" ? "Right to access (Art. 15), right to rectification (Art. 16), right to erasure (Art. 17), right to data portability (Art. 20), right to withdraw consent at any time (Art. 7). All exercisable under More > Data & Privacy." : lang === "es" ? "Derecho de acceso (Art. 15), rectificación (Art. 16), supresión (Art. 17), portabilidad (Art. 20), revocación del consentimiento (Art. 7)." : "Auskunftsrecht (Art. 15), Recht auf Berichtigung (Art. 16), Recht auf Löschung (Art. 17), Recht auf Datenübertragbarkeit (Art. 20), Recht auf Widerruf der Einwilligung jederzeit mit Wirkung für die Zukunft (Art. 7). Alles ausübbar unter Mehr > Datenschutz & Rechte." },
                { t: lang === "en" ? "Retention Period" : lang === "es" ? "Período de retención" : "Speicherdauer", c: lang === "en" ? "Data is stored for the duration of the treatment relationship. After deletion request, data is removed within 30 days. Anonymized payment data may be retained for 10 years due to legal accounting requirements." : lang === "es" ? "Los datos se conservan durante la relación de tratamiento. Después de solicitar la eliminación, los datos se eliminan en 30 días." : "Daten werden für die Dauer des Behandlungsverhältnisses gespeichert. Nach Löschungsantrag werden Daten innerhalb von 30 Tagen entfernt. Anonymisierte Zahlungsdaten können aufgrund gesetzlicher Aufbewahrungspflichten bis zu 10 Jahre gespeichert bleiben." },
                { t: lang === "en" ? "Complaints" : lang === "es" ? "Reclamaciones" : "Beschwerderecht", c: lang === "en" ? "You have the right to file a complaint with the data protection authority (Art. 77 GDPR). Responsible authority: Sächsischer Datenschutzbeauftragter." : lang === "es" ? "Tienes derecho a presentar una queja ante la autoridad de protección de datos (Art. 77 RGPD)." : "Du hast das Recht, Beschwerde bei der zuständigen Datenschutzaufsichtsbehörde einzulegen (Art. 77 DSGVO). Zuständige Aufsichtsbehörde: Sächsischer Datenschutzbeauftragter." },
              ].map((s, i) => (
                <div key={i} style={{ marginBottom: 16, padding: 16, borderRadius: 14, background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: "1px solid " + (dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)") }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 6 }}>{s.t}</p>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: soft, margin: 0 }}>{s.c}</p>
                </div>
              ))}
              <p style={{ fontSize: 11, color: muted, textAlign: "center", marginTop: 20 }}>Anima Cura v1.0 · Stand: Mai 2026</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {payingRate && (
        <AnimaPayOverlay
          betrag={payingRate.betrag}
          verwendungszweck={payingRate.verwendungszweck}
          rateNummer={payingRate.rateNummer}
          onClose={() => setPayingRate(null)}
          dark={dk}
          lang={lang}
        />
      )}

      <style>{fontCss}{`
        @keyframes animapayGlowRed {
          0% { box-shadow: 0 0 8px rgba(239,68,68,0.4), inset 0 0 8px rgba(239,68,68,0.1); }
          50% { box-shadow: 0 0 20px rgba(239,68,68,0.6), inset 0 0 12px rgba(239,68,68,0.15); }
          100% { box-shadow: 0 0 8px rgba(239,68,68,0.4), inset 0 0 8px rgba(239,68,68,0.1); }
        }
        @keyframes animapayGlow {
          0% { box-shadow: 0 0 8px rgba(34,197,94,0.4), inset 0 0 8px rgba(34,197,94,0.1); }
          50% { box-shadow: 0 0 20px rgba(34,197,94,0.6), inset 0 0 12px rgba(34,197,94,0.15); }
          100% { box-shadow: 0 0 8px rgba(34,197,94,0.4), inset 0 0 8px rgba(34,197,94,0.1); }
        }
        @keyframes glowBorder {
          0% { border-color: rgba(34,197,94,0.3); }
          50% { border-color: rgba(34,197,94,0.8); }
          100% { border-color: rgba(34,197,94,0.3); }
        }
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes skeletonPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @media (min-width: 768px) {
          .desktop-brand { display: flex !important; }
          .phone-bezel { display: block !important; }
          .phone-notch { display: block !important; }
        }
        @media (min-width: 768px) {
          .phone-app-container {
            border-radius: 32px !important;
            height: 88vh !important;
            max-height: 88vh !important;
            min-height: 88vh !important;
            overflow-y: auto !important;
          }
          .phone-app-container::-webkit-scrollbar { width: 0; }
          .portal-nav {
            position: sticky !important;
            bottom: 0 !important;
            left: auto !important;
            right: auto !important;
            border-radius: 0 0 32px 32px !important;
          }
        }
      `}</style>
    </div>
    </div>
    </div>
  );
}

const fontCss = "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800&display=swap');";
