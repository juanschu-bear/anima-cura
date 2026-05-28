"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/hooks/useAppStore";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp, FileText, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

type Zeitraum = "monat" | "quartal" | "jahr";
type ReportData = { zeitraum: { von: string; bis: string }; aktuell: any; vergleich: any; prognose: any[] };

function getRange(z: Zeitraum) {
  const now = new Date();
  const labels: Record<string, string[]> = { monat: [], quartal: [], jahr: [] };
  if (z === "monat") { const v = new Date(now.getFullYear(), now.getMonth(), 1); return { von: v.toISOString().slice(0, 10), bis: now.toISOString().slice(0, 10), label: v.toLocaleDateString("de-DE", { month: "long", year: "numeric" }) }; }
  if (z === "quartal") { const q = Math.floor(now.getMonth() / 3); const v = new Date(now.getFullYear(), q * 3, 1); return { von: v.toISOString().slice(0, 10), bis: now.toISOString().slice(0, 10), label: `Q${q + 1} ${now.getFullYear()}` }; }
  const v = new Date(now.getFullYear(), 0, 1); return { von: v.toISOString().slice(0, 10), bis: now.toISOString().slice(0, 10), label: String(now.getFullYear()) };
}
function getPrev(z: Zeitraum) {
  const now = new Date();
  if (z === "monat") { const v = new Date(now.getFullYear(), now.getMonth() - 1, 1); const b = new Date(now.getFullYear(), now.getMonth(), 0); return { von: v.toISOString().slice(0, 10), bis: b.toISOString().slice(0, 10), label: v.toLocaleDateString("de-DE", { month: "long", year: "numeric" }) }; }
  if (z === "quartal") { const q = Math.floor(now.getMonth() / 3); const v = new Date(now.getFullYear(), (q - 1) * 3, 1); const b = new Date(now.getFullYear(), q * 3, 0); return { von: v.toISOString().slice(0, 10), bis: b.toISOString().slice(0, 10), label: `Q${q} ${now.getFullYear()}` }; }
  const v = new Date(now.getFullYear() - 1, 0, 1); const b = new Date(now.getFullYear() - 1, 11, 31); return { von: v.toISOString().slice(0, 10), bis: b.toISOString().slice(0, 10), label: String(now.getFullYear() - 1) };
}

const fmtEur = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
const fmtMo = (m: string) => { const [, mo] = m.split("-"); return ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][parseInt(mo)-1]; };

export default function BerichtePage() {
  const { theme } = useAppStore();
  const dk = theme === "dark";
  const [zeitraum, setZeitraum] = useState<Zeitraum>("jahr");
  const [vergleich, setVergleich] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllPosten, setShowAllPosten] = useState(false);
  const [aiReport, setAiReport] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const r = getRange(zeitraum);
    const p = vergleich ? getPrev(zeitraum) : null;
    const params = new URLSearchParams({ von: r.von, bis: r.bis });
    if (p) { params.set("vergleich_von", p.von); params.set("vergleich_bis", p.bis); }
    const res = await fetch(`/api/reporting?${params}`);
    if (res.ok) { setData(await res.json()); setAiReport(""); }
    setLoading(false);
  }, [zeitraum, vergleich]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const generateAiReport = async () => {
    if (!data?.aktuell) return;
    setAiLoading(true);
    try {
      const a = data.aktuell;
      const v = data.vergleich;
      const range = getRange(zeitraum);
      const prevRange = getPrev(zeitraum);
      const prompt = `Du bist ein Finanzanalyst für eine Kieferorthopädie-Praxis. Erstelle einen kurzen, professionellen Bericht (max 250 Wörter, auf Deutsch) für den Zeitraum ${range.label}.

Daten:
- Einnahmen: ${fmtEur(a.einnahmen)} (${a.zahlendePatienten} zahlende Patienten, ${fmtEur(a.einnahmenProKopf)} pro Kopf)
- Zahlungsquote: ${a.zahlungsquote}%
- Ø Verzögerung: ${a.avgVerzoegerung} Tage
- Mahnquote: ${a.mahnquote}%
- Aktive Ratenpläne: ${a.aktivePlaene}
- Offene Posten: ${fmtEur(a.offenePosten)} (${a.offenePostenListe?.length || 0} Forderungen)
- Forderungsalter: <30T: ${fmtEur(a.forderungsalter?.unter30?.betrag || 0)}, 30-60T: ${fmtEur(a.forderungsalter?.bis60?.betrag || 0)}, >60T: ${fmtEur(a.forderungsalter?.ueber60?.betrag || 0)}
${v ? `- Vorperiode (${prevRange.label}): Einnahmen ${fmtEur(v.einnahmen)}, Zahlungsquote ${v.zahlungsquote}%, Mahnquote ${v.mahnquote}%` : ""}

Struktur: 1) Zusammenfassung (2 Sätze) 2) Highlights 3) Risiken 4) Empfehlungen. Keine Bullet-Points, fließender Text. Professionell aber verständlich.`;

      const res = await fetch("/api/ai-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      if (res.ok) { const j = await res.json(); setAiReport(j.reply || "Bericht konnte nicht generiert werden."); }
    } catch { setAiReport("Fehler bei der Berichterstellung."); }
    setAiLoading(false);
  };

  const a = data?.aktuell;
  const v = data?.vergleich;
  const range = getRange(zeitraum);
  const prevRange = getPrev(zeitraum);

  function delta(curr: number, prev: number | undefined) {
    if (prev === undefined || prev === 0) return null;
    const pct = Math.round(((curr - prev) / prev) * 100);
    return { pct, dir: pct > 1 ? "up" : pct < -1 ? "down" : "flat" };
  }

  const grn = "#4ade80", ylw = "#fbbf24", red = "#ef4444", orn = "#f97316", blu = "#60a5fa", prp = "#a78bfa";
  const gry = dk ? "#333" : "#e5e7eb";
  const soft = dk ? "#2a2a2a" : "#f0f0f0";
  const muted = dk ? "#777" : "#999";
  const cardBg = dk ? "rgba(16,18,28,0.75)" : "#fff";
  const border = dk ? "rgba(255,255,255,0.06)" : "#e5e8ef";
  const txtH = dk ? "#f0f0f0" : "#1c3044";

  const anim = (d: number) => ({ initial: { opacity: 0, y: 16 } as const, animate: { opacity: 1, y: 0 } as const, transition: { duration: 0.4, delay: d } });

  if (loading || !a) return (
    <div>
      <h1 className="ac-page-title" style={{ marginBottom: 24 }}>Berichte</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ height: 110, borderRadius: 16, background: dk ? "rgba(255,255,255,0.03)" : "#f5f5f5", animation: "skeletonPulse 1.5s infinite" }} />)}
      </div>
      <style>{`@keyframes skeletonPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
    </div>
  );

  const postenList = a.offenePostenListe || [];
  const visiblePosten = showAllPosten ? postenList : postenList.slice(0, 5);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="ac-page-title" style={{ marginBottom: 4 }}>Berichte</h1>
          <p style={{ fontSize: 14, color: muted }}>{range.label}{vergleich && v ? ` vs. ${prevRange.label}` : ""} — Echtzeit-Daten</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {(["monat", "quartal", "jahr"] as Zeitraum[]).map(z => (
            <button key={z} onClick={() => setZeitraum(z)} style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${zeitraum === z ? grn : border}`, background: zeitraum === z ? (dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)") : "transparent", color: zeitraum === z ? grn : muted, cursor: "pointer", fontFamily: "inherit" }}>
              {z === "monat" ? "Monat" : z === "quartal" ? "Quartal" : "Jahr"}
            </button>
          ))}
          <div style={{ width: 1, height: 24, background: border, margin: "0 4px" }} />
          <button onClick={() => setVergleich(!vergleich)} style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${vergleich ? prp : border}`, background: vergleich ? (dk ? "rgba(167,139,250,0.1)" : "rgba(139,92,246,0.06)") : "transparent", color: vergleich ? prp : muted, cursor: "pointer", fontFamily: "inherit" }}>
            <TrendingUp size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Vergleich
          </button>
          <button onClick={generateAiReport} disabled={aiLoading} style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${border}`, background: dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.04)", color: grn, cursor: "pointer", fontFamily: "inherit", opacity: aiLoading ? 0.5 : 1 }}>
            <Sparkles size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{aiLoading ? "Erstellt..." : "AI-Report"}
          </button>
        </div>
      </div>

      {/* AI Report */}
      {aiReport && (
        <motion.div {...anim(0)} style={{ background: dk ? "rgba(74,222,128,0.04)" : "rgba(34,197,94,0.03)", border: `1px solid ${dk ? "rgba(74,222,128,0.12)" : "rgba(34,197,94,0.1)"}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Sparkles size={16} color={grn} />
            <span style={{ fontSize: 14, fontWeight: 700, color: txtH }}>AI-Analyse — {range.label}</span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: dk ? "#ccc" : "#444", margin: 0, whiteSpace: "pre-wrap" }}>{aiReport}</p>
        </motion.div>
      )}

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard dk={dk} label="Einnahmen" value={a.einnahmen} fmt="eur" d={v ? delta(a.einnahmen, v.einnahmen) : null} good="up" i={0} />
        <KpiCard dk={dk} label="Pro Kopf" value={a.einnahmenProKopf} fmt="eur" d={v ? delta(a.einnahmenProKopf, v.einnahmenProKopf) : null} good="up" i={1} sub={`${a.zahlendePatienten} Patienten`} />
        <KpiCard dk={dk} label="Zahlungsquote" value={a.zahlungsquote} fmt="pct" d={v ? delta(a.zahlungsquote, v.zahlungsquote) : null} good="up" i={2} />
        <KpiCard dk={dk} label="Ø Verzögerung" value={a.avgVerzoegerung} fmt="tage" d={v ? delta(a.avgVerzoegerung, v.avgVerzoegerung) : null} good="down" i={3} />
        <KpiCard dk={dk} label="Mahnquote" value={a.mahnquote} fmt="pct" d={v ? delta(a.mahnquote, v.mahnquote) : null} good="down" i={4} />
        <KpiCard dk={dk} label="Aktive Pläne" value={a.aktivePlaene} fmt="num" i={5} />
        <KpiCard dk={dk} label="Offene Posten" value={a.offenePosten} fmt="eur" d={v ? delta(a.offenePosten, v.offenePosten) : null} good="down" i={6} accent />
        <KpiCard dk={dk} label="Bezahlt" value={a.bezahltCount} fmt="num" i={7} sub={`von ${a.faelligCount} fällig`} />
      </div>

      {/* Forderungsalter */}
      {a.forderungsalter && (
        <motion.div {...anim(0.1)} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "< 30 Tage", ...a.forderungsalter.unter30, color: ylw },
            { label: "30–60 Tage", ...a.forderungsalter.bis60, color: orn },
            { label: "> 60 Tage", ...a.forderungsalter.ueber60, color: red },
          ].map((b, i) => (
            <div key={i} style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, padding: "14px 18px", backdropFilter: dk ? "blur(20px)" : undefined }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: b.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{b.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: txtH, fontFamily: "'Fraunces', serif" }}>{fmtEur(b.betrag)}</div>
              <div style={{ fontSize: 12, color: muted }}>{b.count} Forderungen</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Einnahmen-Verlauf */}
        <motion.div {...anim(0.12)} style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, gridColumn: "span 2", backdropFilter: dk ? "blur(20px)" : undefined }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: txtH }}>Einnahmen-Verlauf</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={a.monatlich}>
              <defs><linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={grn} stopOpacity={0.3} /><stop offset="100%" stopColor={grn} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={soft} />
              <XAxis dataKey="monat" tick={{ fill: muted, fontSize: 11 }} tickFormatter={fmtMo} />
              <YAxis tick={{ fill: muted, fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
              <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 10, fontSize: 13 }} formatter={(val: number) => [fmtEur(val)]} labelFormatter={m => { const [y, mo] = m.split("-"); return ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"][parseInt(mo)-1] + " " + y; }} />
              <Area type="monotone" dataKey="einnahmen" stroke={grn} fill="url(#gG)" strokeWidth={2.5} name="Einnahmen" />
              <Line type="monotone" dataKey="geplant" stroke={muted} strokeDasharray="6 4" strokeWidth={1.5} dot={false} name="Geplant" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Zahlungsstatus Donut */}
        <motion.div {...anim(0.16)} style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, backdropFilter: dk ? "blur(20px)" : undefined }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: txtH }}>Zahlungsstatus</h3>
          <div style={{ position: "relative" }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={[{ name: "Pünktlich", value: a.verteilung.puenktlich }, { name: "Verspätet", value: a.verteilung.verspaetet }, { name: "Überfällig", value: a.verteilung.ueberfaellig }, { name: "Offen", value: a.verteilung.offen }].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                  {[grn, ylw, red, gry].map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
                <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 10, fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: txtH, fontFamily: "'Fraunces', serif" }}>{a.zahlungsquote}%</div>
              <div style={{ fontSize: 11, color: muted }}>Quote</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
            {[{ l: "Pünktlich", c: grn, v: a.verteilung.puenktlich }, { l: "Verspätet", c: ylw, v: a.verteilung.verspaetet }, { l: "Überfällig", c: red, v: a.verteilung.ueberfaellig }].map(x => (
              <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: muted }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: x.c }} />{x.l}: {x.v}</div>
            ))}
          </div>
        </motion.div>

        {/* Mahnstufen */}
        <motion.div {...anim(0.2)} style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, backdropFilter: dk ? "blur(20px)" : undefined }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: txtH }}>Mahnstufen</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={[{ name: "Stufe 1", count: a.mahnstufen.stufe1 }, { name: "Stufe 2", count: a.mahnstufen.stufe2 }, { name: "Stufe 3", count: a.mahnstufen.stufe3 }]}>
              <CartesianGrid strokeDasharray="3 3" stroke={soft} />
              <XAxis dataKey="name" tick={{ fill: muted, fontSize: 12 }} />
              <YAxis tick={{ fill: muted, fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 10, fontSize: 13 }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Anzahl">{[ylw, orn, red].map((c, i) => <Cell key={i} fill={c} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Prognose + Offene Posten */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <motion.div {...anim(0.24)} style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, backdropFilter: dk ? "blur(20px)" : undefined }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: txtH }}>3-Monats-Prognose</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data?.prognose || []}>
              <defs><linearGradient id="bG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={blu} stopOpacity={0.25} /><stop offset="100%" stopColor={blu} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={soft} />
              <XAxis dataKey="monat" tick={{ fill: muted, fontSize: 11 }} tickFormatter={fmtMo} />
              <YAxis tick={{ fill: muted, fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
              <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 10, fontSize: 13 }} formatter={(val: number) => [fmtEur(val)]} />
              <Area type="monotone" dataKey="erwartet" stroke={blu} fill="url(#bG)" strokeWidth={2.5} name="Erwartet" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Offene Posten Liste */}
        <motion.div {...anim(0.28)} style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, backdropFilter: dk ? "blur(20px)" : undefined }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: txtH, margin: 0 }}>Offene Posten</h3>
            <span style={{ fontSize: 12, fontWeight: 600, color: red }}>{postenList.length} Forderungen — {fmtEur(a.offenePosten)}</span>
          </div>
          {postenList.length === 0 ? (
            <p style={{ fontSize: 14, color: muted, textAlign: "center", padding: "40px 0" }}>Keine überfälligen Posten</p>
          ) : (
            <>
              {visiblePosten.map((p: any, i: number) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: i > 0 ? `1px solid ${dk ? "rgba(255,255,255,0.04)" : "#f0f0f0"}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: txtH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.patient_name}</div>
                    <div style={{ fontSize: 11, color: muted }}>{p.tage} Tage überfällig · Mahnstufe {p.mahnstufe}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: red, marginLeft: 12 }}>{fmtEur(p.betrag)}</div>
                </div>
              ))}
              {postenList.length > 5 && (
                <button onClick={() => setShowAllPosten(!showAllPosten)} style={{ width: "100%", padding: "10px 0", border: "none", background: "transparent", color: muted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  {showAllPosten ? <><ChevronUp size={14} />Weniger anzeigen</> : <><ChevronDown size={14} />Alle {postenList.length} anzeigen</>}
                </button>
              )}
            </>
          )}
        </motion.div>
      </div>

      <style>{`@keyframes skeletonPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
    </div>
  );
}

function KpiCard({ dk, label, value, fmt, d, good, i, accent, sub }: {
  dk: boolean; label: string; value: number; fmt: "eur" | "pct" | "num" | "tage";
  d?: { pct: number; dir: string } | null; good?: "up" | "down"; i: number; accent?: boolean; sub?: string;
}) {
  const grn = "#4ade80", red = "#ef4444", muted = dk ? "#777" : "#999";
  const border = dk ? "rgba(255,255,255,0.06)" : "#e5e8ef";
  const txtH = dk ? "#f0f0f0" : "#1c3044";
  const isGood = d ? (good === "up" ? d.dir === "up" : d.dir === "down") : true;

  const fv = (n: number) => {
    if (fmt === "eur") return n.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
    if (fmt === "pct") return n + "%";
    if (fmt === "tage") return n + " Tage";
    return n.toLocaleString("de-DE");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.04 }}
      whileHover={{ scale: 1.02, y: -2 }}
      style={{ background: dk ? "rgba(16,18,28,0.75)" : "#fff", borderRadius: 14, border: `1px solid ${accent ? "rgba(239,68,68,0.2)" : border}`, padding: "16px 18px", cursor: "default", backdropFilter: dk ? "blur(20px)" : undefined }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent ? red : txtH, lineHeight: 1, marginBottom: d || sub ? 6 : 0, fontFamily: "'Fraunces', serif" }}>
        <AnimatedNumber value={value} formatFn={fv} />
      </div>
      {sub && <div style={{ fontSize: 12, color: muted, marginBottom: d ? 4 : 0 }}>{sub}</div>}
      {d && d.dir !== "flat" && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: isGood ? grn : red }}>
          {d.dir === "up" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {d.pct > 0 ? "+" : ""}{d.pct}%
        </div>
      )}
      {d && d.dir === "flat" && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: muted }}><Minus size={14} />Stabil</div>}
    </motion.div>
  );
}
