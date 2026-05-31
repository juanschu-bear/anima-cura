"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { Modal, StatusBadge } from "@/components/ui";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function RatenplanPage() {
  const { locale, theme } = useAppStore();
  const router = useRouter();
  const dk = theme === "dark";
  const [plaene, setPlaene] = useState<any[]>([]);
  const [patienten, setPatienten] = useState<any[]>([]);
  const [ratenByPlan, setRatenByPlan] = useState<Record<string, any[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"alle" | "aktiv" | "verzug" | "abgeschlossen">("alle");
  const [form, setForm] = useState({
    patient_id: "",
    gesamtbetrag: 0,
    anzahl_raten: 12,
    start_datum: new Date().toISOString().slice(0, 10),
    rhythmus: "monatlich",
  });

  async function fetchData() {
    const supabase = createBrowserClient();
    try {
      const [{ data: plans }, { data: pats }, { data: rates }] = await Promise.all([
        supabase.from("ratenplaene").select("*, patients:patient_id(vorname, nachname, behandlung)").order("start_datum", { ascending: true }),
        supabase.from("patients").select("id, vorname, nachname").order("nachname", { ascending: true }),
        supabase.from("raten").select("*").order("rate_nummer", { ascending: true }),
      ]);
      const grouped: Record<string, any[]> = {};
      (rates || []).forEach((rate: any) => {
        if (!grouped[rate.ratenplan_id]) grouped[rate.ratenplan_id] = [];
        grouped[rate.ratenplan_id].push(rate);
      });
      setPlaene(plans || []);
      setPatienten(pats || []);
      setRatenByPlan(grouped);
    } catch {
      setPlaene([]); setPatienten([]); setRatenByPlan({});
    }
  }

  useEffect(() => { fetchData(); }, []);

  async function createRatenplan() {
    if (!form.patient_id || form.gesamtbetrag <= 0 || form.anzahl_raten <= 0) { setHint(t("rateplans.fillRequired", locale)); return; }
    setSaving(true); setHint("");
    const supabase = createBrowserClient();
    const rateBetrag = Number((form.gesamtbetrag / form.anzahl_raten).toFixed(2));
    const { data: plan, error: planError } = await supabase.from("ratenplaene").insert({
      patient_id: form.patient_id, gesamtbetrag: form.gesamtbetrag, anzahl_raten: form.anzahl_raten,
      rate_betrag: rateBetrag, start_datum: form.start_datum, rhythmus: form.rhythmus,
    }).select().single();
    if (planError || !plan) { setSaving(false); setHint(planError?.message || "Fehler"); return; }
    const rates = Array.from({ length: form.anzahl_raten }).map((_, i) => {
      const d = new Date(form.start_datum); d.setMonth(d.getMonth() + i);
      return { ratenplan_id: plan.id, patient_id: form.patient_id, rate_nummer: i + 1, betrag: rateBetrag, faellig_am: d.toISOString().slice(0, 10), status: "offen", mahnstufe: 0 };
    });
    await supabase.from("raten").insert(rates);
    setSaving(false); setCreateOpen(false);
    setForm({ patient_id: "", gesamtbetrag: 0, anzahl_raten: 12, start_datum: new Date().toISOString().slice(0, 10), rhythmus: "monatlich" });
    setHint(t("rateplans.created", locale)); fetchData();
  }

  // Compute per-plan stats
  const planStats = useMemo(() => plaene.map(plan => {
    const rates = ratenByPlan[plan.id] || [];
    const bezahlt = rates.filter((r: any) => r.status === "bezahlt").length;
    const total = rates.length || plan.anzahl_raten || 1;
    const rest = rates.filter((r: any) => r.status !== "bezahlt").reduce((s: number, r: any) => s + (r.betrag || 0), 0);
    const hasOverdue = rates.some((r: any) => r.status === "überfällig");
    const hasLate = rates.some((r: any) => r.status === "bezahlt" && r.bezahlt_am && r.faellig_am && new Date(r.bezahlt_am) > new Date(r.faellig_am));
    const allPaid = bezahlt === total && total > 0;
    const nextRate = rates.find((r: any) => r.status === "offen");
    const nextDue = nextRate?.faellig_am ? new Date(nextRate.faellig_am) : null;
    const daysUntilDue = nextDue ? Math.ceil((nextDue.getTime() - Date.now()) / 864e5) : null;
    const status: "aktiv" | "verzug" | "verspaetet" | "abgeschlossen" = allPaid ? "abgeschlossen" : hasOverdue ? "verzug" : hasLate ? "verspaetet" : "aktiv";
    const name = `${plan.patients?.nachname || "?"}, ${plan.patients?.vorname || "?"}`;
    const behandlung = plan.patients?.behandlung || "";
    return { ...plan, name, behandlung, bezahlt, total, rest, status, nextDue, daysUntilDue, pct: Math.round((bezahlt / total) * 100) };
  }), [plaene, ratenByPlan]);

  // KPIs
  const totalPlans = planStats.length;
  const monthlyVolume = planStats.reduce((s, p) => s + (p.rate_betrag || 0), 0);
  const imVerzug = planStats.filter(p => p.status === "verzug").length;
  const puenktlichRate = totalPlans > 0 ? Math.round((planStats.filter(p => p.status === "aktiv" || p.status === "abgeschlossen").length / totalPlans) * 100) : 0;

  // Filter + Search
  const filtered = planStats.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "aktiv" && p.status !== "aktiv" && p.status !== "verspaetet") return false;
    if (filter === "verzug" && p.status !== "verzug") return false;
    if (filter === "abgeschlossen" && p.status !== "abgeschlossen") return false;
    return true;
  });

  const statusColor = (s: string) => s === "aktiv" ? "#4ade80" : s === "verzug" ? "#f87171" : s === "verspaetet" ? "#fbbf24" : "#60a5fa";
  const statusLabel = (s: string) => s === "aktiv" ? "Aktiv" : s === "verzug" ? "Verzug" : s === "verspaetet" ? "Verspätet" : "Fertig";
  const fE = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 0 });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ac-page-title">{t("rateplans.title", locale)}</h1>
          <p className="mt-1 text-sm text-praxis-400">{totalPlans} {t("rateplans.activePlans", locale)} · {fE(monthlyVolume)} € monatliches Volumen</p>
        </div>
        <button className="btn-primary gap-2" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> {t("rateplans.newPlan", locale)}
        </button>
      </div>

      {hint && <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm text-praxis-600">{hint}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="stat-card"><p className="text-sm font-medium text-praxis-400">Aktive Pläne</p><p className="mt-1 text-3xl font-extrabold tracking-tight text-praxis-800">{totalPlans}</p></div>
        <div className="stat-card"><p className="text-sm font-medium text-praxis-400">Monatliches Volumen</p><p className="mt-1 text-3xl font-extrabold tracking-tight" style={{ color: "#4ade80" }}>{fE(monthlyVolume)} €</p></div>
        <div className="stat-card"><p className="text-sm font-medium text-praxis-400">Im Verzug</p><p className="mt-1 text-3xl font-extrabold tracking-tight" style={{ color: imVerzug > 0 ? "#f87171" : "#4ade80" }}>{imVerzug}</p></div>
        <div className="stat-card"><p className="text-sm font-medium text-praxis-400">Pünktlichkeitsquote</p><p className="mt-1 text-3xl font-extrabold tracking-tight" style={{ color: puenktlichRate >= 80 ? "#4ade80" : "#fbbf24" }}>{puenktlichRate}%</p></div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1" style={{ maxWidth: 360 }}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Patient suchen..." className="input w-full pl-10" />
        </div>
        <div className="flex gap-1">
          {(["alle", "aktiv", "verzug", "abgeschlossen"] as const).map(f => {
            const count = f === "alle" ? totalPlans : planStats.filter(p => f === "aktiv" ? (p.status === "aktiv" || p.status === "verspaetet") : p.status === f).length;
            return (
              <button key={f} onClick={() => setFilter(f)} className={`ac-chip ${filter === f ? "ac-chip-active" : ""}`}>
                {f === "alle" ? "Alle" : f === "aktiv" ? "Aktiv" : f === "verzug" ? "Verzug" : "Fertig"}
                <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Patient Table */}
      <div className="stat-card overflow-x-auto" style={{ padding: 0 }}>
        <div>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 200px 100px 90px 80px", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${dk ? "rgba(255,255,255,0.05)" : "#e8eaef"}` }}>
            {["Patient", "Rate/Monat", "Fortschritt", "Restschuld", "Nächste Rate", "Status"].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: dk ? "#4a5568" : "#8797ac", textAlign: h === "Restschuld" || h === "Rate/Monat" ? "right" : "left" }}>{h}</div>
            ))}
          </div>
          <div>
            {filtered.map((plan, idx) => {
              const rates = ratenByPlan[plan.id] || [];
              return (
                <motion.div key={plan.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}>
                  <div style={{ padding: 0 }}>
                    {/* Row */}
                    <div onClick={() => setExpandedId(expandedId === plan.id ? null : plan.id)} style={{ display: "grid", gridTemplateColumns: "1fr 90px 200px 100px 90px 80px", alignItems: "center", padding: "14px 16px", cursor: "pointer", transition: "background 0.15s", borderBottom: expandedId === plan.id ? "none" : `1px solid ${dk ? "rgba(255,255,255,0.03)" : "#f0f1f5"}`, borderRadius: expandedId === plan.id ? "10px 10px 0 0" : 0 }} onMouseEnter={e => (e.currentTarget.style.background = dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{plan.name}</div>
                        <div style={{ fontSize: 10, color: dk ? "#4a5568" : "#8797ac", marginTop: 2 }}>{plan.behandlung} · Seit {new Date(plan.start_datum).toLocaleDateString("de-DE", { month: "short", year: "numeric" })}</div>
                      </div>
                      <div style={{ textAlign: "right", fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 14 }}>{fE(plan.rate_betrag || 0)} €</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: dk ? "#1a2030" : "#e5e7eb", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, width: `${plan.pct}%`, background: statusColor(plan.status), transition: "width 0.3s" }} />
                        </div>
                        <span style={{ fontSize: 11, color: dk ? "#4a5568" : "#8797ac", fontWeight: 600, minWidth: 50, textAlign: "right" }}>{plan.bezahlt} / {plan.total}</span>
                      </div>
                      <div style={{ textAlign: "right", fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 14, color: plan.rest > 1000 ? "#f87171" : undefined }}>{fE(plan.rest)} €</div>
                      <div style={{ fontSize: 12, color: plan.daysUntilDue !== null && plan.daysUntilDue < 0 ? "#f87171" : plan.daysUntilDue !== null && plan.daysUntilDue <= 3 ? "#fbbf24" : (dk ? "#4a5568" : "#8797ac"), fontWeight: plan.daysUntilDue !== null && plan.daysUntilDue <= 3 ? 600 : 400 }}>
                        {plan.status === "abgeschlossen" ? "Fertig" : plan.daysUntilDue !== null && plan.daysUntilDue < 0 ? "Überfällig" : plan.daysUntilDue !== null && plan.daysUntilDue === 0 ? "Heute" : plan.daysUntilDue !== null && plan.daysUntilDue <= 3 ? `In ${plan.daysUntilDue}d` : plan.nextDue ? new Date(plan.nextDue).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "–"}
                      </div>
                      <div><span style={{ fontSize: 10, padding: "4px 10px", borderRadius: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, background: `${statusColor(plan.status)}15`, color: statusColor(plan.status) }}>{statusLabel(plan.status)}</span></div>
                    </div>

                    {/* Expanded rates */}
                    {expandedId === plan.id && rates.length > 0 && (
                      <div style={{ padding: "16px 20px 20px", borderTop: `1px solid ${dk ? "rgba(74,222,128,0.15)" : "rgba(34,197,94,0.15)"}`, borderBottom: `1px solid ${dk ? "rgba(255,255,255,0.03)" : "#f0f1f5"}`, background: dk ? "rgba(8,12,20,0.5)" : "rgba(245,246,250,0.5)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(95px, 1fr))", gap: 6 }}>
                          {rates.sort((a: any, b: any) => a.rate_nummer - b.rate_nummer).map((rate: any) => {
                            const isLate = rate.status === "bezahlt" && rate.bezahlt_am && rate.faellig_am && new Date(rate.bezahlt_am) > new Date(rate.faellig_am);
                            const lateDays = isLate ? Math.ceil((new Date(rate.bezahlt_am).getTime() - new Date(rate.faellig_am).getTime()) / 864e5) : 0;
                            const bg = rate.status === "bezahlt" ? (isLate ? "rgba(251,191,36,0.06)" : "rgba(74,222,128,0.06)") : rate.status === "überfällig" ? "rgba(248,113,113,0.06)" : dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)";
                            const bc = rate.status === "bezahlt" ? (isLate ? "rgba(251,191,36,0.2)" : "rgba(74,222,128,0.2)") : rate.status === "überfällig" ? "rgba(248,113,113,0.2)" : (dk ? "rgba(255,255,255,0.05)" : "#e8eaef");
                            return (
                              <div key={rate.id} style={{ padding: "10px", borderRadius: 8, border: `1px solid ${bc}`, background: bg, textAlign: "center", opacity: rate.status === "offen" ? 0.5 : 1 }}>
                                <div style={{ fontSize: 10, color: dk ? "#4a5568" : "#8797ac", fontWeight: 600 }}>Rate {rate.rate_nummer}</div>
                                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Fraunces', serif", marginTop: 2 }}>{fE(rate.betrag)}€</div>
                                <div style={{ fontSize: 9, color: dk ? "#4a5568" : "#8797ac", marginTop: 3 }}>{new Date(rate.faellig_am).toLocaleDateString("de-DE", { month: "short", year: "2-digit" })}</div>
                                {rate.status === "bezahlt" && !isLate && <div style={{ fontSize: 9, fontWeight: 700, color: "#4ade80", marginTop: 3 }}>✓ Pünktlich</div>}
                                {isLate && <div style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", marginTop: 3 }}>+{lateDays} Tage</div>}
                                {rate.status === "überfällig" && <div style={{ fontSize: 9, fontWeight: 700, color: "#f87171", marginTop: 3 }}>Überfällig</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: dk ? "#4a5568" : "#8797ac", fontSize: 13 }}>Keine Ratenpläne gefunden.</div>}
      </div>

      {/* Create Modal (unchanged) */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("rateplans.createTitle", locale)}>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.patient", locale)} *</span>
            <select className="input" value={form.patient_id} onChange={e => setForm(prev => ({ ...prev, patient_id: e.target.value }))}>
              <option value="">{t("rateplans.selectPatient", locale)}</option>
              {patienten.map(p => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.totalAmount", locale)} *</span><input type="number" className="input" value={form.gesamtbetrag} onChange={e => setForm(prev => ({ ...prev, gesamtbetrag: Number(e.target.value) }))} /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.numberOfRates", locale)} *</span><input type="number" className="input" value={form.anzahl_raten} onChange={e => setForm(prev => ({ ...prev, anzahl_raten: Number(e.target.value) }))} /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.startDate", locale)} *</span><input type="date" className="input" value={form.start_datum} onChange={e => setForm(prev => ({ ...prev, start_datum: e.target.value }))} /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.rhythm", locale)}</span><select className="input" value={form.rhythmus} onChange={e => setForm(prev => ({ ...prev, rhythmus: e.target.value }))}><option value="monatlich">{t("rateplans.monthly", locale)}</option><option value="quartalsweise">{t("rateplans.quarterly", locale)}</option></select></label>
          </div>
          <p className="text-xs text-praxis-400">{t("rateplans.plannedRate", locale)}: {form.anzahl_raten > 0 ? (form.gesamtbetrag / form.anzahl_raten).toFixed(2) : "0.00"} €</p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>{t("common.cancel", locale)}</button>
            <button className="btn-primary" onClick={createRatenplan} disabled={saving}>{saving ? t("rateplans.creating", locale) : t("rateplans.create", locale)}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
