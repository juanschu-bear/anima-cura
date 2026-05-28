"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, Legend,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp, Calendar, Download, RefreshCw } from "lucide-react";

interface ReportData {
  zeitraum: { von: string; bis: string };
  aktuell: Stats;
  vergleich: Stats | null;
  prognose: { monat: string; erwartet: number; raten: number; bestCase: number; worstCase: number }[];
}

interface Stats {
  einnahmen: number;
  zahlungsquote: number;
  avgVerzoegerung: number;
  mahnquote: number;
  aktivePlaene: number;
  offenePosten: number;
  bezahltCount: number;
  faelligCount: number;
  verteilung: { puenktlich: number; verspaetet: number; ueberfaellig: number; offen: number };
  monatlich: { monat: string; einnahmen: number; geplant: number }[];
  mahnstufen: { stufe1: number; stufe2: number; stufe3: number };
  topOffene: { id: string; betrag: number; faellig_am: string; patient_name: string; mahnstufe: number }[];
}

type Zeitraum = "monat" | "quartal" | "jahr" | "custom";

function getRange(z: Zeitraum): { von: string; bis: string; label: string } {
  const now = new Date();
  if (z === "monat") {
    const von = new Date(now.getFullYear(), now.getMonth(), 1);
    return { von: von.toISOString().slice(0, 10), bis: now.toISOString().slice(0, 10), label: von.toLocaleDateString("de-DE", { month: "long", year: "numeric" }) };
  }
  if (z === "quartal") {
    const q = Math.floor(now.getMonth() / 3);
    const von = new Date(now.getFullYear(), q * 3, 1);
    return { von: von.toISOString().slice(0, 10), bis: now.toISOString().slice(0, 10), label: `Q${q + 1} ${now.getFullYear()}` };
  }
  if (z === "jahr") {
    const von = new Date(now.getFullYear(), 0, 1);
    return { von: von.toISOString().slice(0, 10), bis: now.toISOString().slice(0, 10), label: String(now.getFullYear()) };
  }
  return { von: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), bis: now.toISOString().slice(0, 10), label: "Custom" };
}

function getPrevRange(z: Zeitraum): { von: string; bis: string } {
  const now = new Date();
  if (z === "monat") {
    const von = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const bis = new Date(now.getFullYear(), now.getMonth(), 0);
    return { von: von.toISOString().slice(0, 10), bis: bis.toISOString().slice(0, 10) };
  }
  if (z === "quartal") {
    const q = Math.floor(now.getMonth() / 3);
    const von = new Date(now.getFullYear(), (q - 1) * 3, 1);
    const bis = new Date(now.getFullYear(), q * 3, 0);
    return { von: von.toISOString().slice(0, 10), bis: bis.toISOString().slice(0, 10) };
  }
  const von = new Date(now.getFullYear() - 1, 0, 1);
  const bis = new Date(now.getFullYear() - 1, 11, 31);
  return { von: von.toISOString().slice(0, 10), bis: bis.toISOString().slice(0, 10) };
}

const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export default function BerichtePage() {
  const { theme, locale } = useAppStore();
  const dk = theme === "dark";
  const [zeitraum, setZeitraum] = useState<Zeitraum>("quartal");
  const [vergleich, setVergleich] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const range = getRange(zeitraum);
    const prev = vergleich ? getPrevRange(zeitraum) : null;
    const params = new URLSearchParams({ von: range.von, bis: range.bis });
    if (prev) { params.set("vergleich_von", prev.von); params.set("vergleich_bis", prev.bis); }
    const res = await fetch(`/api/reporting?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [zeitraum, vergleich]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const a = data?.aktuell;
  const v = data?.vergleich;
  const range = getRange(zeitraum);

  function delta(curr: number, prev: number | undefined): { pct: number; abs: number; dir: "up" | "down" | "flat" } {
    if (prev === undefined || prev === 0) return { pct: 0, abs: 0, dir: "flat" };
    const abs = curr - prev;
    const pct = Math.round((abs / prev) * 100);
    return { pct, abs, dir: pct > 1 ? "up" : pct < -1 ? "down" : "flat" };
  }

  // Chart colors
  const grn = "#4ade80";
  const ylw = "#fbbf24";
  const red = "#ef4444";
  const gry = dk ? "#333" : "#e5e7eb";
  const blu = "#60a5fa";
  const prp = "#a78bfa";
  const softLine = dk ? "#2a2a2a" : "#f0f0f0";
  const txtMuted = dk ? "#777" : "#999";
  const cardBg = dk ? "rgba(16,18,28,0.75)" : "#fff";
  const cardBorder = dk ? "rgba(255,255,255,0.06)" : "#e5e8ef";

  const card = (delay: number = 0) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay },
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="ac-page-title" style={{ marginBottom: 4 }}>Berichte</h1>
          <p style={{ fontSize: 14, color: txtMuted }}>{range.label} — Echtzeit-Daten aus Anima Cura</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {(["monat", "quartal", "jahr"] as Zeitraum[]).map(z => (
            <button key={z} onClick={() => setZeitraum(z)} style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "1px solid " + (zeitraum === z ? grn : cardBorder), background: zeitraum === z ? (dk ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)") : "transparent", color: zeitraum === z ? grn : txtMuted, cursor: "pointer", fontFamily: "inherit" }}>
              {z === "monat" ? "Monat" : z === "quartal" ? "Quartal" : "Jahr"}
            </button>
          ))}
          <div style={{ width: 1, height: 24, background: cardBorder, margin: "0 4px" }} />
          <button onClick={() => setVergleich(!vergleich)} style={{ padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "1px solid " + (vergleich ? prp : cardBorder), background: vergleich ? (dk ? "rgba(167,139,250,0.1)" : "rgba(139,92,246,0.06)") : "transparent", color: vergleich ? prp : txtMuted, cursor: "pointer", fontFamily: "inherit" }}>
            <TrendingUp size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Vergleich
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {[0,1,2,3,4,5].map(i => <div key={i} style={{ height: 100, borderRadius: 16, background: dk ? "rgba(255,255,255,0.03)" : "#f5f5f5", animation: "skeletonPulse 1.5s infinite" }} />)}
        </div>
      ) : a && (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
            <KpiCard dk={dk} label="Einnahmen" value={a.einnahmen} format="eur" delta={v ? delta(a.einnahmen, v.einnahmen) : undefined} positive="up" delay={0} />
            <KpiCard dk={dk} label="Zahlungsquote" value={a.zahlungsquote} format="pct" delta={v ? delta(a.zahlungsquote, v.zahlungsquote) : undefined} positive="up" delay={0.05} />
            <KpiCard dk={dk} label="Ø Verzögerung" value={a.avgVerzoegerung} format="tage" delta={v ? delta(a.avgVerzoegerung, v.avgVerzoegerung) : undefined} positive="down" delay={0.1} />
            <KpiCard dk={dk} label="Mahnquote" value={a.mahnquote} format="pct" delta={v ? delta(a.mahnquote, v.mahnquote) : undefined} positive="down" delay={0.15} />
            <KpiCard dk={dk} label="Aktive Pläne" value={a.aktivePlaene} format="num" delay={0.2} />
            <KpiCard dk={dk} label="Offene Posten" value={a.offenePosten} format="eur" delta={v ? delta(a.offenePosten, v.offenePosten) : undefined} positive="down" delay={0.25} accent />
          </div>

          {/* Charts Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {/* Einnahmen-Verlauf */}
            <motion.div {...card(0.1)} style={{ background: cardBg, borderRadius: 16, border: "1px solid " + cardBorder, padding: 20, gridColumn: "span 2" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: dk ? "#f0f0f0" : "#1c3044" }}>Einnahmen-Verlauf</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={a.monatlich}>
                  <defs>
                    <linearGradient id="grnGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={grn} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={grn} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={softLine} />
                  <XAxis dataKey="monat" tick={{ fill: txtMuted, fontSize: 11 }} tickFormatter={m => { const [y, mo] = m.split("-"); return ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][parseInt(mo)-1]; }} />
                  <YAxis tick={{ fill: txtMuted, fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: "1px solid " + cardBorder, borderRadius: 10, fontSize: 13 }} formatter={(val: number) => [fmtEur(val)]} labelFormatter={m => { const [y, mo] = m.split("-"); return ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"][parseInt(mo)-1] + " " + y; }} />
                  <Area type="monotone" dataKey="einnahmen" stroke={grn} fill="url(#grnGrad)" strokeWidth={2.5} name="Einnahmen" />
                  <Line type="monotone" dataKey="geplant" stroke={txtMuted} strokeDasharray="6 4" strokeWidth={1.5} dot={false} name="Geplant" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Zahlungsstatus Donut */}
            <motion.div {...card(0.15)} style={{ background: cardBg, borderRadius: 16, border: "1px solid " + cardBorder, padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: dk ? "#f0f0f0" : "#1c3044" }}>Zahlungsstatus</h3>
              <div style={{ position: "relative" }}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Pünktlich", value: a.verteilung.puenktlich, color: grn },
                        { name: "Verspätet", value: a.verteilung.verspaetet, color: ylw },
                        { name: "Überfällig", value: a.verteilung.ueberfaellig, color: red },
                        { name: "Offen", value: a.verteilung.offen, color: gry },
                      ].filter(d => d.value > 0)}
                      cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value"
                    >
                      {[grn, ylw, red, gry].map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: "1px solid " + cardBorder, borderRadius: 10, fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: dk ? "#f0f0f0" : "#1c3044" }}>{a.zahlungsquote}%</div>
                  <div style={{ fontSize: 11, color: txtMuted }}>Quote</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
                {[{l:"Pünktlich",c:grn,v:a.verteilung.puenktlich},{l:"Verspätet",c:ylw,v:a.verteilung.verspaetet},{l:"Überfällig",c:red,v:a.verteilung.ueberfaellig}].map(i => (
                  <div key={i.l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: txtMuted }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: i.c }} />{i.l}: {i.v}
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Mahnverlauf */}
            <motion.div {...card(0.2)} style={{ background: cardBg, borderRadius: 16, border: "1px solid " + cardBorder, padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: dk ? "#f0f0f0" : "#1c3044" }}>Mahnstufen</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[{ name: "Stufe 1", count: a.mahnstufen.stufe1, fill: ylw }, { name: "Stufe 2", count: a.mahnstufen.stufe2, fill: "#f97316" }, { name: "Stufe 3", count: a.mahnstufen.stufe3, fill: red }]}>
                  <CartesianGrid strokeDasharray="3 3" stroke={softLine} />
                  <XAxis dataKey="name" tick={{ fill: txtMuted, fontSize: 12 }} />
                  <YAxis tick={{ fill: txtMuted, fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: "1px solid " + cardBorder, borderRadius: 10, fontSize: 13 }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Anzahl">
                    {[ylw, "#f97316", red].map((c, i) => <Cell key={i} fill={c} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Prognose + Top Offene */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {/* Prognose */}
            <motion.div {...card(0.25)} style={{ background: cardBg, borderRadius: 16, border: "1px solid " + cardBorder, padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: dk ? "#f0f0f0" : "#1c3044" }}>3-Monats-Prognose</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data?.prognose || []}>
                  <defs>
                    <linearGradient id="bluGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={blu} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={blu} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={softLine} />
                  <XAxis dataKey="monat" tick={{ fill: txtMuted, fontSize: 11 }} tickFormatter={m => { const [y, mo] = m.split("-"); return ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][parseInt(mo)-1]; }} />
                  <YAxis tick={{ fill: txtMuted, fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={{ background: dk ? "#1a1d2b" : "#fff", border: "1px solid " + cardBorder, borderRadius: 10, fontSize: 13 }} formatter={(val: number) => [fmtEur(val)]} />
                  <Area type="monotone" dataKey="erwartet" stroke={blu} fill="url(#bluGrad)" strokeWidth={2.5} name="Erwartet" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Top Offene Posten */}
            <motion.div {...card(0.3)} style={{ background: cardBg, borderRadius: 16, border: "1px solid " + cardBorder, padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: dk ? "#f0f0f0" : "#1c3044" }}>Top offene Posten</h3>
              {a.topOffene.length === 0 ? (
                <p style={{ fontSize: 14, color: txtMuted, textAlign: "center", padding: "40px 0" }}>Keine überfälligen Posten</p>
              ) : (
                <div>
                  {a.topOffene.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: i > 0 ? "1px solid " + (dk ? "rgba(255,255,255,0.04)" : "#f0f0f0") : "none" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: dk ? "#f0f0f0" : "#1c3044" }}>{p.patient_name}</div>
                        <div style={{ fontSize: 11, color: txtMuted }}>Fällig: {new Date(p.faellig_am).toLocaleDateString("de-DE")} · Mahnstufe {p.mahnstufe}</div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: red }}>{fmtEur(p.betrag)}</div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          <style>{`@keyframes skeletonPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
        </>
      )}
    </div>
  );
}

function KpiCard({ dk, label, value, format, delta, positive, delay = 0, accent }: {
  dk: boolean; label: string; value: number; format: "eur" | "pct" | "num" | "tage";
  delta?: { pct: number; abs: number; dir: "up" | "down" | "flat" };
  positive?: "up" | "down"; delay?: number; accent?: boolean;
}) {
  const cardBg = dk ? "rgba(16,18,28,0.75)" : "#fff";
  const cardBorder = dk ? "rgba(255,255,255,0.06)" : "#e5e8ef";
  const txtMuted = dk ? "#777" : "#999";
  const grn = "#4ade80"; const red = "#ef4444";

  let isGood = true;
  if (delta && positive) {
    isGood = positive === "up" ? delta.dir === "up" : delta.dir === "down";
    if (delta.dir === "flat") isGood = true;
  }

  const fmtValue = (v: number) => {
    if (format === "eur") return v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
    if (format === "pct") return v + "%";
    if (format === "tage") return v + " Tage";
    return v.toLocaleString("de-DE");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}
      whileHover={{ scale: 1.02, y: -2 }}
      style={{ background: cardBg, borderRadius: 16, border: "1px solid " + (accent ? "rgba(239,68,68,0.2)" : cardBorder), padding: "18px 20px", cursor: "default", backdropFilter: dk ? "blur(20px)" : undefined }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: txtMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: accent ? red : (dk ? "#f0f0f0" : "#1c3044"), lineHeight: 1, marginBottom: delta ? 8 : 0, fontFamily: "'Fraunces', serif" }}>
        <AnimatedNumber value={value} formatFn={(n) => fmtValue(n)} />
      </div>
      {delta && delta.dir !== "flat" && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: isGood ? grn : red }}>
          {delta.dir === "up" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {delta.pct > 0 ? "+" : ""}{delta.pct}% vs. Vorperiode
        </div>
      )}
      {delta && delta.dir === "flat" && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: txtMuted }}>
          <Minus size={14} /> Stabil
        </div>
      )}
    </motion.div>
  );
}
