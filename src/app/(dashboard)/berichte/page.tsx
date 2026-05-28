"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/hooks/useAppStore";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";

type Zeitraum = "monat" | "quartal" | "jahr";
type ReportData = { zeitraum: { von: string; bis: string }; aktuell: any; vergleich: any; prognose: any[] };

// Month/Quarter/Year selector options
function getMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ label: d.toLocaleDateString("de-DE", { month: "long", year: "numeric" }), von: d.toISOString().slice(0, 10), bis: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) });
  }
  return opts;
}
function getQuarterOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const q = Math.floor(now.getMonth() / 3) - i;
    const y = now.getFullYear() + Math.floor(q / 4);
    const qn = ((q % 4) + 4) % 4;
    const d = new Date(y, qn * 3, 1);
    const end = new Date(y, qn * 3 + 3, 0);
    opts.push({ label: `Q${qn + 1} ${y}`, von: d.toISOString().slice(0, 10), bis: end.toISOString().slice(0, 10) });
  }
  return opts;
}
function getYearOptions() {
  const now = new Date();
  return [0, 1, 2].map(i => {
    const y = now.getFullYear() - i;
    return { label: String(y), von: `${y}-01-01`, bis: i === 0 ? now.toISOString().slice(0, 10) : `${y}-12-31` };
  });
}

const fmtEur = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
const fmtMo = (m: string) => { const [, mo] = m.split("-"); return ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][parseInt(mo)-1]; };
const fmtDay = (d: string) => { const dt = new Date(d); return dt.getDate() + "." + (dt.getMonth()+1) + "."; };

export default function BerichtePage() {
  const { theme } = useAppStore();
  const dk = theme === "dark";
  const [viewMode, setViewMode] = useState<"jahr" | "quartal" | "monat">("jahr");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedQ, setSelectedQ] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [selectedM, setSelectedM] = useState(new Date().getMonth() + 1);
  const [vergleich, setVergleich] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllPosten, setShowAllPosten] = useState(false);
  const [aiReport, setAiReport] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<string | false>(false);
  const [popup, setPopup] = useState<string | null>(null);

  // Calculate date range based on selections
  function getSelected() {
    const now = new Date();
    if (viewMode === "jahr") {
      const bis = selectedYear === now.getFullYear() ? now.toISOString().slice(0, 10) : `${selectedYear}-12-31`;
      return { von: `${selectedYear}-01-01`, bis, label: String(selectedYear) };
    }
    if (viewMode === "quartal") {
      const sm = (selectedQ - 1) * 3;
      const von = new Date(selectedYear, sm, 1);
      const bis = selectedYear === now.getFullYear() && selectedQ === Math.floor(now.getMonth() / 3) + 1 ? now : new Date(selectedYear, sm + 3, 0);
      return { von: von.toISOString().slice(0, 10), bis: bis.toISOString().slice(0, 10), label: `Q${selectedQ} ${selectedYear}` };
    }
    const von = new Date(selectedYear, selectedM - 1, 1);
    const bis = selectedYear === now.getFullYear() && selectedM === now.getMonth() + 1 ? now : new Date(selectedYear, selectedM, 0);
    const mNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
    return { von: von.toISOString().slice(0, 10), bis: bis.toISOString().slice(0, 10), label: `${mNames[selectedM - 1]} ${selectedYear}` };
  }
  function getPrevPeriod() {
    if (viewMode === "jahr") {
      const py = selectedYear - 1;
      return { von: `${py}-01-01`, bis: `${py}-12-31`, label: String(py) };
    }
    if (viewMode === "quartal") {
      let pq = selectedQ - 1, py = selectedYear;
      if (pq < 1) { pq = 4; py--; }
      const sm = (pq - 1) * 3;
      return { von: new Date(py, sm, 1).toISOString().slice(0, 10), bis: new Date(py, sm + 3, 0).toISOString().slice(0, 10), label: `Q${pq} ${py}` };
    }
    let pm = selectedM - 1, py = selectedYear;
    if (pm < 1) { pm = 12; py--; }
    const mNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
    return { von: new Date(py, pm - 1, 1).toISOString().slice(0, 10), bis: new Date(py, pm, 0).toISOString().slice(0, 10), label: `${mNames[pm - 1]} ${py}` };
  }

  const selected = getSelected();
  const prev = getPrevPeriod();

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ von: selected.von, bis: selected.bis });
    if (vergleich) { params.set("vergleich_von", prev.von); params.set("vergleich_bis", prev.bis); }
    const res = await fetch(`/api/reporting?${params}`);
    if (res.ok) { setData(await res.json()); setAiReport(""); }
    setLoading(false);
  }, [viewMode, selectedYear, selectedQ, selectedM, vergleich]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const generateAiReport = async () => {
    if (!data?.aktuell) return;
    setAiLoading(true);
    try {
      const a = data.aktuell;
      const v = data.vergleich;
      const prompt = `Du bist ein Finanzanalyst für eine Kieferorthäpädie-Praxis. Erstelle einen kurzen, professionellen Bericht (max 250 Wörter, auf Deutsch) für den Zeitraum ${selected.label}.\n\nDaten:\n- Einnahmen: ${fmtEur(a.einnahmen)} (${a.zahlendePatienten} zahlende Patienten, ${fmtEur(a.einnahmenProKopf)} Ø pro Patient)\n- Zahlungsquote: ${a.zahlungsquote}%\n- Ø Verzögerung: ${a.avgVerzoegerung} Tage\n- Mahnquote: ${a.mahnquote}%\n- Aktive Ratenpläne: ${a.aktivePlaene}\n- Offene Posten: ${fmtEur(a.offenePosten)} (${a.offenePostenListe?.length || 0} überfällige Forderungen)\n- Forderungsalter: <30T: ${fmtEur(a.forderungsalter?.unter30?.betrag || 0)}, 30-60T: ${fmtEur(a.forderungsalter?.bis60?.betrag || 0)}, >60T: ${fmtEur(a.forderungsalter?.ueber60?.betrag || 0)}\n${v ? `- Vorperiode (${prev?.label}): Einnahmen ${fmtEur(v.einnahmen)}, Zahlungsquote ${v.zahlungsquote}%, Mahnquote ${v.mahnquote}%` : ""}\n\nStruktur: 1) Zusammenfassung (2 Sätze) 2) Highlights 3) Risiken 4) Empfehlungen. Kein Markdown, kein **, kein ##. Fließender Text, professionell aber verständlich. Absätze mit Leerzeilen.`;
      const res = await fetch("/api/ai-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      if (res.ok) { const j = await res.json(); setAiReport(j.reply || "Bericht konnte nicht generiert werden."); }
    } catch { setAiReport("Fehler bei der Berichterstellung."); }
    setAiLoading(false);
  };

  const a = data?.aktuell;
  const v = data?.vergleich;

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

  // For monthly view, show daily data
  const chartData = viewMode === "monat" ? (a.monatlich || []) : (a.monatlich || []);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="ac-page-title" style={{ marginBottom: 4 }}>Berichte</h1>
          <p style={{ fontSize: 14, color: muted }}>{selected.label}{vergleich && v ? ` vs. ${prev?.label}` : ""} — Echtzeit-Daten</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Year dropdown */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setDropdownOpen(dropdownOpen === "jahr" ? false : "jahr")} style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${grn}`, background: dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)", color: grn, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
              {selectedYear} <ChevronDown size={13} />
            </button>
            {dropdownOpen === "jahr" && (
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 12, padding: 4, zIndex: 100, minWidth: 120, boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
                {[2026, 2025, 2024].map(y => (
                  <button key={y} onClick={() => { setSelectedYear(y); setViewMode("jahr"); setDropdownOpen(false); }} style={{ display: "block", width: "100%", padding: "8px 14px", borderRadius: 8, border: "none", background: selectedYear === y && viewMode === "jahr" ? (dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)") : "transparent", color: selectedYear === y && viewMode === "jahr" ? grn : (dk ? "#ccc" : "#444"), fontSize: 13, fontWeight: selectedYear === y ? 700 : 500, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>{y}</button>
                ))}
              </div>
            )}
          </div>
          {/* Quartal dropdown */}
          <div style={{ position: "relative" }}>
            <button onClick={() => { setViewMode("quartal"); setDropdownOpen(dropdownOpen === "quartal" ? false : "quartal"); }} style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${viewMode === "quartal" ? grn : border}`, background: viewMode === "quartal" ? (dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)") : "transparent", color: viewMode === "quartal" ? grn : muted, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
              {viewMode === "quartal" ? `Q${selectedQ}` : "Quartal"} <ChevronDown size={13} />
            </button>
            {dropdownOpen === "quartal" && (
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 12, padding: 4, zIndex: 100, minWidth: 100, boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
                {[1, 2, 3, 4].map(q => (
                  <button key={q} onClick={() => { setSelectedQ(q); setViewMode("quartal"); setDropdownOpen(false); }} style={{ display: "block", width: "100%", padding: "8px 14px", borderRadius: 8, border: "none", background: selectedQ === q && viewMode === "quartal" ? (dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)") : "transparent", color: selectedQ === q && viewMode === "quartal" ? grn : (dk ? "#ccc" : "#444"), fontSize: 13, fontWeight: selectedQ === q ? 700 : 500, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>Q{q}</button>
                ))}
              </div>
            )}
          </div>
          {/* Monat dropdown */}
          <div style={{ position: "relative" }}>
            <button onClick={() => { setViewMode("monat"); setDropdownOpen(dropdownOpen === "monat" ? false : "monat"); }} style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${viewMode === "monat" ? grn : border}`, background: viewMode === "monat" ? (dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)") : "transparent", color: viewMode === "monat" ? grn : muted, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
              {viewMode === "monat" ? ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][selectedM - 1] : "Monat"} <ChevronDown size={13} />
            </button>
            {dropdownOpen === "monat" && (
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 12, padding: 4, zIndex: 100, minWidth: 140, boxShadow: "0 12px 40px rgba(0,0,0,0.3)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                {["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"].map((m, i) => (
                  <button key={i} onClick={() => { setSelectedM(i + 1); setViewMode("monat"); setDropdownOpen(false); }} style={{ padding: "8px 10px", borderRadius: 8, border: "none", background: selectedM === i + 1 && viewMode === "monat" ? (dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)") : "transparent", color: selectedM === i + 1 && viewMode === "monat" ? grn : (dk ? "#ccc" : "#444"), fontSize: 13, fontWeight: selectedM === i + 1 ? 700 : 500, cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>{m}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{ width: 1, height: 24, background: border, margin: "0 4px" }} />
          <button onClick={() => setVergleich(!vergleich)} style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${vergleich ? prp : border}`, background: vergleich ? (dk ? "rgba(167,139,250,0.1)" : "rgba(139,92,246,0.06)") : "transparent", color: vergleich ? prp : muted, cursor: "pointer", fontFamily: "inherit" }}>
            <TrendingUp size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{vergleich && prev ? `vs. ${prev.label}` : "Vergleich"}
          </button>
          <button onClick={generateAiReport} disabled={aiLoading} style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${border}`, background: dk ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.04)", color: grn, cursor: "pointer", fontFamily: "inherit", opacity: aiLoading ? 0.5 : 1 }}>
            <Sparkles size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{aiLoading ? "Erstellt..." : "AI-Report"}
          </button>
        </div>
      </div>

      {/* AI Report */}
      {aiReport && (
        <motion.div {...anim(0)} style={{ background: dk ? "rgba(74,222,128,0.04)" : "rgba(34,197,94,0.03)", border: `1px solid ${dk ? "rgba(74,222,128,0.12)" : "rgba(34,197,94,0.1)"}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={16} color={grn} /><span style={{ fontSize: 14, fontWeight: 700, color: txtH }}>AI-Analyse — {selected.label}</span></div>
            <button onClick={() => setAiReport("")} style={{ background: "none", border: "none", cursor: "pointer", color: muted }}><X size={16} /></button>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: dk ? "#ccc" : "#444", margin: 0, whiteSpace: "pre-wrap" }}>{aiReport}</p>
        </motion.div>
      )}

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard dk={dk} label="Einnahmen" value={a.einnahmen} fmt="eur" d={v ? delta(a.einnahmen, v.einnahmen) : null} good="up" i={0} />
        <KpiCard dk={dk} label={"Ø pro Patient"} value={a.einnahmenProKopf} fmt="eur" d={v ? delta(a.einnahmenProKopf, v.einnahmenProKopf) : null} good="up" i={1} sub={`${a.zahlendePatienten} zahlende Patienten`} />
        <KpiCard dk={dk} label="Zahlungsquote" value={a.zahlungsquote} fmt="pct" d={v ? delta(a.zahlungsquote, v.zahlungsquote) : null} good="up" i={2} />
        <KpiCard dk={dk} label={"Ø Verzögerung"} value={a.avgVerzoegerung} fmt="tage" d={v ? delta(a.avgVerzoegerung, v.avgVerzoegerung) : null} good="down" i={3} />
        <KpiCard dk={dk} label="Mahnquote" value={a.mahnquote} fmt="pct" d={v ? delta(a.mahnquote, v.mahnquote) : null} good="down" i={4} />
        <KpiCard dk={dk} label="Aktive Pläne" value={a.aktivePlaene} fmt="num" i={5} onClick={() => setPopup("plaene")} clickable />
        <KpiCard dk={dk} label={"Offene Forderungen"} value={a.offenePosten} fmt="eur" d={v ? delta(a.offenePosten, v.offenePosten) : null} good="down" i={6} accent sub={`${postenList.length} überfällige Raten`} />
        <KpiCard dk={dk} label="Bezahlte Raten" value={a.bezahltCount} fmt="num" i={7} sub={`von ${a.faelligCount} fällig`} />
      </div>

      {/* Forderungsalter */}
      {a.forderungsalter && (
        <motion.div {...anim(0.1)} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "< 30 Tage überfällig", ...a.forderungsalter.unter30, color: ylw },
            { label: "30\u201360 Tage überfällig", ...a.forderungsalter.bis60, color: orn },
            { label: "> 60 Tage überfällig", ...a.forderungsalter.ueber60, color: red },
          ].map((b, i) => (
            <div key={i} style={{ background: cardBg, borderRadius: 14, border: `1px solid ${border}`, padding: "14px 18px", backdropFilter: dk ? "blur(20px)" : undefined }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: b.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{b.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: txtH, fontFamily: "'Fraunces', serif" }}>{fmtEur(b.betrag)}</div>
              <div style={{ fontSize: 12, color: muted }}>{b.count} offene Raten</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <motion.div {...anim(0.12)} style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, gridColumn: "span 2", backdropFilter: dk ? "blur(20px)" : undefined }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: txtH }}>Einnahmen-Verlauf</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs><linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={grn} stopOpacity={0.3} /><stop offset="100%" stopColor={grn} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={soft} />
              <XAxis dataKey="monat" tick={{ fill: muted, fontSize: 11 }} tickFormatter={fmtMo} />
              <YAxis tick={{ fill: muted, fontSize: 11 }} tickFormatter={yv => yv >= 1000 ? `${Math.round(yv / 1000)}k` : String(yv)} domain={[0, 'auto']} />
              <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 10, fontSize: 13, color: dk ? "#f0f0f0" : "#333" }} formatter={(val: number) => [fmtEur(val)]} labelFormatter={m => { const [y, mo] = m.split("-"); return ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"][parseInt(mo)-1] + " " + y; }} />
              <Area type="monotone" dataKey="einnahmen" stroke={grn} fill="url(#gG)" strokeWidth={2.5} name="Einnahmen" />
              <Line type="monotone" dataKey="geplant" stroke={muted} strokeDasharray="6 4" strokeWidth={1.5} dot={false} name="Geplant" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div {...anim(0.16)} style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, backdropFilter: dk ? "blur(20px)" : undefined }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: txtH }}>Zahlungsstatus</h3>
          <div style={{ position: "relative" }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={[{ name: "Pünktlich", value: a.verteilung.puenktlich }, { name: "Verspätet", value: a.verteilung.verspaetet }, { name: "Überfällig", value: a.verteilung.ueberfaellig }, { name: "Offen", value: a.verteilung.offen }].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                  {[grn, ylw, red, gry].map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
                <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 10, fontSize: 13, color: dk ? "#f0f0f0" : "#333" }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: txtH, fontFamily: "'Fraunces', serif" }}>{a.zahlungsquote}%</div>
              <div style={{ fontSize: 11, color: muted }}>Quote</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
            {[{ l: "Pünktlich", c: grn, v: a.verteilung.puenktlich }, { l: "Verspätet", c: ylw, v: a.verteilung.verspaetet }, { l: "Überfällig", c: red, v: a.verteilung.ueberfaellig }, { l: "Offen", c: gry, v: a.verteilung.offen }].map(x => (
              <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: muted }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: x.c }} />{x.l}: {x.v}</div>
            ))}
          </div>
        </motion.div>

        <motion.div {...anim(0.2)} style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, backdropFilter: dk ? "blur(20px)" : undefined }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: txtH }}>Mahnstufen</h3>
          <p style={{ fontSize: 12, color: muted, marginBottom: 12 }}>Klick auf eine Stufe f{"ü"}r Details</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[{ name: "Stufe 1", count: a.mahnstufen.stufe1, stufe: 1 }, { name: "Stufe 2", count: a.mahnstufen.stufe2, stufe: 2 }, { name: "Stufe 3", count: a.mahnstufen.stufe3, stufe: 3 }]} onClick={(e: any) => { if (e?.activePayload?.[0]?.payload?.stufe) setPopup(`mahn-${e.activePayload[0].payload.stufe}`); }}>
              <CartesianGrid strokeDasharray="3 3" stroke={soft} />
              <XAxis dataKey="name" tick={{ fill: muted, fontSize: 12 }} />
              <YAxis tick={{ fill: muted, fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 10, fontSize: 13, color: dk ? "#f0f0f0" : "#333" }} formatter={(val: number) => [`${val} Raten`]} labelStyle={{ color: dk ? "#f0f0f0" : "#333" }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Raten" cursor="pointer">{[ylw, orn, red].map((c, i) => <Cell key={i} fill={c} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Prognose + Offene Posten */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <motion.div {...anim(0.24)} style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, backdropFilter: dk ? "blur(20px)" : undefined }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: txtH }}>3-Monats-Prognose</h3>
          <p style={{ fontSize: 12, color: muted, marginBottom: 16 }}>Erwarteter Eingang basierend auf fälligen Raten</p>
          {(data?.prognose || []).length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={data?.prognose || []}>
                  <defs><linearGradient id="bG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={blu} stopOpacity={0.25} /><stop offset="100%" stopColor={blu} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={soft} />
                  <XAxis dataKey="monat" tick={{ fill: muted, fontSize: 11 }} tickFormatter={fmtMo} />
                  <YAxis tick={{ fill: muted, fontSize: 11 }} tickFormatter={yv => yv >= 1000 ? `${Math.round(yv / 1000)}k` : String(yv)} />
                  <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: `1px solid ${border}`, borderRadius: 10, fontSize: 13, color: dk ? "#f0f0f0" : "#333" }} formatter={(val: number) => [fmtEur(val)]} />
                  <Area type="monotone" dataKey="erwartet" stroke={blu} fill="url(#bG)" strokeWidth={2.5} name="Erwartet" />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                {(data?.prognose || []).map((p: any) => (
                  <div key={p.monat} style={{ flex: 1, textAlign: "center", padding: 8, borderRadius: 10, background: dk ? "rgba(96,165,250,0.06)" : "rgba(59,130,246,0.04)" }}>
                    <div style={{ fontSize: 11, color: muted }}>{fmtMo(p.monat)}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: blu }}>{fmtEur(p.erwartet)}</div>
                    <div style={{ fontSize: 10, color: muted }}>{p.raten} Raten</div>
                  </div>
                ))}
              </div>
            </>
          ) : <p style={{ fontSize: 14, color: muted, textAlign: "center", padding: "40px 0" }}>Keine offenen Raten in den nächsten 3 Monaten</p>}
        </motion.div>

        <motion.div {...anim(0.28)} style={{ background: cardBg, borderRadius: 16, border: `1px solid ${border}`, padding: 20, backdropFilter: dk ? "blur(20px)" : undefined }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: txtH, margin: 0 }}>Offene Forderungen</h3>
            <span style={{ fontSize: 12, fontWeight: 600, color: red }}>{postenList.length} überfällige Raten — {fmtEur(a.offenePosten)}</span>
          </div>
          {postenList.length === 0 ? (
            <p style={{ fontSize: 14, color: muted, textAlign: "center", padding: "40px 0" }}>Keine überfälligen Forderungen</p>
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
                  {showAllPosten ? <><ChevronUp size={14} />Weniger</> : <><ChevronDown size={14} />Alle {postenList.length} anzeigen</>}
                </button>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* Detail Popup */}
      <AnimatePresence>
        {popup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPopup(null)} style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} style={{ background: dk ? "#1a1d2b" : "#fff", borderRadius: 20, border: `1px solid ${border}`, padding: 24, maxWidth: 500, width: "100%", maxHeight: "70vh", overflowY: "auto" }}>
              {popup.startsWith("mahn-") && (() => {
                const stufe = parseInt(popup.split("-")[1]);
                const stufeColor = stufe === 1 ? ylw : stufe === 2 ? orn : red;
                const details = (a.mahnDetails || []).filter((m: any) => m.stufe === stufe);
                return (<>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: txtH, margin: 0 }}>Mahnstufe {stufe}</h3>
                    <button onClick={() => setPopup(null)} style={{ background: "none", border: "none", cursor: "pointer", color: muted, fontSize: 18 }}>{"✕"}</button>
                  </div>
                  <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>{details.length} Raten auf Mahnstufe {stufe}</div>
                  {details.length === 0 ? <p style={{ color: muted, fontSize: 14 }}>Keine Eintr{"ä"}ge</p> : details.map((m: any, i: number) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: i > 0 ? `1px solid ${dk ? "rgba(255,255,255,0.04)" : "#f0f0f0"}` : "none" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: txtH }}>{m.patient_name}</div>
                        <div style={{ fontSize: 11, color: muted }}>F{"ä"}llig: {new Date(m.faellig_am).toLocaleDateString("de-DE")}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {m.betrag > 0 && <span style={{ fontSize: 15, fontWeight: 700, color: stufeColor }}>{fmtEur(m.betrag)}</span>}
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: `${stufeColor}20`, color: stufeColor }}>Stufe {stufe}</span>
                      </div>
                    </div>
                  ))}
                </>);
              })()}
              {popup === "plaene" && (<>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: txtH, margin: 0 }}>Aktive Ratenpl{"ä"}ne</h3>
                  <button onClick={() => setPopup(null)} style={{ background: "none", border: "none", cursor: "pointer", color: muted, fontSize: 18 }}>{"✕"}</button>
                </div>
                <div style={{ fontSize: 14, color: muted, textAlign: "center", padding: "30px 0" }}>{a.aktivePlaene} aktive Pl{"ä"}ne</div>
              </>)}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes skeletonPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
    </div>
  );
}

function KpiCard({ dk, label, value, fmt, d, good, i, accent, sub, onClick, clickable }: {
  dk: boolean; label: string; value: number; fmt: "eur" | "pct" | "num" | "tage";
  d?: { pct: number; dir: string } | null; good?: "up" | "down"; i: number; accent?: boolean; sub?: string;
  onClick?: () => void; clickable?: boolean;
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
      onClick={onClick}
      style={{ background: dk ? "rgba(16,18,28,0.75)" : "#fff", borderRadius: 14, border: `1px solid ${accent ? "rgba(239,68,68,0.2)" : border}`, padding: "16px 18px", cursor: clickable ? "pointer" : "default", backdropFilter: dk ? "blur(20px)" : undefined }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}{clickable && " ↗"}</div>
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
