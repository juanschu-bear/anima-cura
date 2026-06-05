"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { Modal } from "@/components/ui";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { motion } from "framer-motion";

export default function RatenplanPage() {
  const { locale, theme } = useAppStore();
  const dk = theme === "dark";
  const [plaene, setPlaene] = useState<any[]>([]);
  const [patienten, setPatienten] = useState<any[]>([]);
  const [ratenByPlan, setRatenByPlan] = useState<Record<string, any[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Nur-Lese-Sollplan: bestaetigte Bankzahlungen je Patient, lazy bei Aufklappen.
  const [sollZahlungen, setSollZahlungen] = useState<Record<string, any[] | "laedt">>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("alle");
  const [form, setForm] = useState({ patient_id: "", gesamtbetrag: 0, anzahl_raten: 12, start_datum: new Date().toISOString().slice(0, 10), rhythmus: "monatlich" });

  async function fetchData() {
    const supabase = createBrowserClient();
    const [{ data: plans }, { data: pats }, { data: rates }] = await Promise.all([
      supabase.from("ratenplaene").select("*, patients:patient_id(vorname, nachname, behandlung)").order("start_datum", { ascending: true }),
      supabase.from("patients").select("id, vorname, nachname").order("nachname", { ascending: true }),
      supabase.from("raten").select("*").order("rate_nummer", { ascending: true }),
    ]);
    const grouped: Record<string, any[]> = {};
    (rates || []).forEach((r: any) => { if (!grouped[r.ratenplan_id]) grouped[r.ratenplan_id] = []; grouped[r.ratenplan_id].push(r); });
    setPlaene(plans || []); setPatienten(pats || []); setRatenByPlan(grouped);
  }

  useEffect(() => { fetchData(); }, []);

  async function createRatenplan() {
    if (!form.patient_id || form.gesamtbetrag <= 0 || form.anzahl_raten <= 0) { setHint(t("rateplans.fillRequired", locale)); return; }
    setSaving(true); setHint("");
    const supabase = createBrowserClient();
    const rateBetrag = Number((form.gesamtbetrag / form.anzahl_raten).toFixed(2));
    const { data: plan, error } = await supabase.from("ratenplaene").insert({ patient_id: form.patient_id, gesamtbetrag: form.gesamtbetrag, anzahl_raten: form.anzahl_raten, rate_betrag: rateBetrag, start_datum: form.start_datum, rhythmus: form.rhythmus }).select().single();
    if (error || !plan) { setSaving(false); setHint(error?.message || "Fehler"); return; }
    const rates = Array.from({ length: form.anzahl_raten }).map((_, i) => { const d = new Date(form.start_datum); d.setMonth(d.getMonth() + i); return { ratenplan_id: plan.id, patient_id: form.patient_id, rate_nummer: i + 1, betrag: rateBetrag, faellig_am: d.toISOString().slice(0, 10), status: "offen", mahnstufe: 0 }; });
    await supabase.from("raten").insert(rates);
    setSaving(false); setCreateOpen(false); setForm({ patient_id: "", gesamtbetrag: 0, anzahl_raten: 12, start_datum: new Date().toISOString().slice(0, 10), rhythmus: "monatlich" }); fetchData();
  }

  async function loadSollZahlungen(plan: any) {
    if (!plan?.patient_id || sollZahlungen[plan.id]) return;
    setSollZahlungen(prev => ({ ...prev, [plan.id]: "laedt" }));
    const seit = new Date(plan.start_datum);
    seit.setDate(seit.getDate() - 31); // Puffer: Erstzahlung kurz vor Planstart
    const { data } = await supabase
      .from("transaktionen")
      .select("datum, betrag")
      .eq("matched_patient_id", plan.patient_id)
      .in("matching_status", ["auto", "manuell"])
      .gt("betrag", 0)
      .gte("datum", seit.toISOString().slice(0, 10))
      .order("datum", { ascending: true });
    setSollZahlungen(prev => ({ ...prev, [plan.id]: data || [] }));
  }

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
    const status = allPaid ? "abgeschlossen" : hasOverdue ? "verzug" : hasLate ? "verspaetet" : "aktiv";
    return { ...plan, name: `${plan.patients?.nachname || "?"}, ${plan.patients?.vorname || "?"}`, behandlung: plan.patients?.behandlung || "", bezahlt, total, rest, status, nextDue, daysUntilDue, pct: Math.round((bezahlt / total) * 100) };
  }), [plaene, ratenByPlan]);

  const monthlyVolume = planStats.reduce((s, p) => s + (p.rate_betrag || 0), 0);
  const imVerzug = planStats.filter(p => p.status === "verzug").length;
  const puenktlichRate = planStats.length > 0 ? Math.round((planStats.filter(p => p.status === "aktiv" || p.status === "abgeschlossen").length / planStats.length) * 100) : 0;
  const fE = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 0 });

  const filtered = planStats.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "aktiv" && p.status !== "aktiv" && p.status !== "verspaetet") return false;
    if (filter === "verzug" && p.status !== "verzug") return false;
    if (filter === "abgeschlossen" && p.status !== "abgeschlossen") return false;
    return true;
  });

  const sColor = (s: string) => s === "aktiv" ? "#4ade80" : s === "verzug" ? "#f87171" : s === "verspaetet" ? "#fbbf24" : "#60a5fa";
  const sLabel = (s: string) => s === "aktiv" ? "AKTIV" : s === "verzug" ? "VERZUG" : s === "verspaetet" ? "VERSPÄTET" : "FERTIG";
  const muted = dk ? "#4a5568" : "#8797ac";
  const border = dk ? "rgba(255,255,255,0.05)" : "#e8eaef";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ac-page-title">{t("rateplans.title", locale)}</h1>
          <p className="mt-1 text-sm text-praxis-400">{planStats.length} {t("rateplans.activePlans", locale)} · {fE(monthlyVolume)} € monatliches Volumen</p>
        </div>
        <button className="btn-primary gap-2" onClick={() => setCreateOpen(true)}><Plus size={16} /> {t("rateplans.newPlan", locale)}</button>
      </div>

      {hint && <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm text-praxis-600">{hint}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div style={{ padding: "18px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(12,15,24,0.9)" }}><p style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Fraunces', serif" }}>{planStats.length}</p><p style={{ fontSize: 11, color: "#4a5568", marginTop: 4 }}>Aktive Pläne</p></div>
        <div style={{ padding: "18px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(12,15,24,0.9)" }}><p style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Fraunces', serif", color: "#4ade80" }}>{fE(monthlyVolume)} €</p><p style={{ fontSize: 11, color: "#4a5568", marginTop: 4 }}>Monatliches Volumen</p></div>
        <div style={{ padding: "18px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(12,15,24,0.9)" }}><p style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Fraunces', serif", color: imVerzug > 0 ? "#f87171" : "#4ade80" }}>{imVerzug}</p><p style={{ fontSize: 11, color: "#4a5568", marginTop: 4 }}>Im Verzug</p></div>
        <div style={{ padding: "18px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(12,15,24,0.9)" }}><p style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Fraunces', serif", color: puenktlichRate >= 80 ? "#4ade80" : "#fbbf24" }}>{puenktlichRate}%</p><p style={{ fontSize: 11, color: "#4a5568", marginTop: 4 }}>Pünktlichkeitsquote</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1" style={{ maxWidth: 360 }}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Patient suchen..." className="input w-full pl-10" />
        </div>
        <div className="flex gap-1">
          {["alle", "aktiv", "verzug", "abgeschlossen"].map(f => {
            const count = f === "alle" ? planStats.length : planStats.filter(p => f === "aktiv" ? (p.status === "aktiv" || p.status === "verspaetet") : p.status === f).length;
            return <button key={f} onClick={() => setFilter(f)} className={`ac-chip ${filter === f ? "ac-chip-active" : ""}`}>{f === "alle" ? "Alle" : f === "aktiv" ? "Aktiv" : f === "verzug" ? "Verzug" : "Fertig"}<span className="ml-1 opacity-60">{count}</span></button>;
          })}
        </div>
      </div>

      <div className="stat-card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ width: "25%", textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: muted, borderBottom: `1px solid ${border}` }}>Patient</th>
              <th style={{ width: "11%", textAlign: "right", padding: "12px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: muted, borderBottom: `1px solid ${border}` }}>Rate/Monat</th>
              <th style={{ width: "24%", textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: muted, borderBottom: `1px solid ${border}` }}>Fortschritt</th>
              <th style={{ width: "13%", textAlign: "right", padding: "12px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: muted, borderBottom: `1px solid ${border}` }}>Restschuld</th>
              <th style={{ width: "13%", textAlign: "left", padding: "12px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: muted, borderBottom: `1px solid ${border}` }}>Nächste Rate</th>
              <th style={{ width: "10%", textAlign: "center", padding: "12px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: muted, borderBottom: `1px solid ${border}` }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((plan, idx) => {
              const rates = (ratenByPlan[plan.id] || []).sort((a: any, b: any) => a.rate_nummer - b.rate_nummer);
              const isExp = expandedId === plan.id;
              return (
                <motion.tr key={plan.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.015 }} style={{ cursor: "pointer" }} onClick={() => { const next = isExp ? null : plan.id; setExpandedId(next); if (next && rates.length === 0) loadSollZahlungen(plan); }}>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        <tr className="hover:bg-white/[0.02]" style={{ borderBottom: isExp ? "none" : `1px solid ${border}` }}>
                          <td style={{ width: "25%", padding: "14px" }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{plan.name}</div>
                            <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{plan.behandlung || "Behandlung"} · Seit {new Date(plan.start_datum).toLocaleDateString("de-DE", { month: "short", year: "numeric" })}</div>
                          </td>
                          <td style={{ width: "11%", textAlign: "right", padding: "14px", fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 14 }}>{fE(plan.rate_betrag || 0)} €</td>
                          <td style={{ width: "24%", padding: "14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 6, borderRadius: 3, background: dk ? "#1a2030" : "#e5e7eb", overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 3, width: `${plan.pct}%`, background: sColor(plan.status), transition: "width 0.3s" }} />
                              </div>
                              <span style={{ fontSize: 11, color: muted, fontWeight: 600, minWidth: 50 }}>{plan.bezahlt} / {plan.total}</span>
                            </div>
                          </td>
                          <td style={{ width: "13%", textAlign: "right", padding: "14px", fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 14, color: plan.rest > 1000 ? "#f87171" : undefined }}>{fE(plan.rest)} €</td>
                          <td style={{ width: "13%", padding: "14px", fontSize: 12, color: plan.daysUntilDue !== null && plan.daysUntilDue < 0 ? "#f87171" : plan.daysUntilDue !== null && plan.daysUntilDue <= 3 ? "#fbbf24" : muted, fontWeight: plan.daysUntilDue !== null && plan.daysUntilDue <= 3 ? 600 : 400 }}>
                            {plan.status === "abgeschlossen" ? "Fertig" : plan.daysUntilDue !== null && plan.daysUntilDue < 0 ? "Überfällig" : plan.daysUntilDue === 0 ? "Heute" : plan.daysUntilDue !== null && plan.daysUntilDue <= 3 ? `In ${plan.daysUntilDue}d` : plan.nextDue ? new Date(plan.nextDue).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–"}
                          </td>
                          <td style={{ width: "10%", textAlign: "center", padding: "14px" }}>
                            <span style={{ fontSize: 10, padding: "4px 10px", borderRadius: 6, fontWeight: 700, background: `${sColor(plan.status)}15`, color: sColor(plan.status) }}>{sLabel(plan.status)}</span>
                          </td>
                        </tr>
                        {isExp && rates.length > 0 && (
                          <tr>
                            <td colSpan={6} style={{ padding: "16px 20px 20px", borderBottom: `1px solid ${border}`, background: dk ? "rgba(8,12,20,0.5)" : "rgba(245,246,250,0.5)" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(95px, 1fr))", gap: 6 }}>
                                {rates.map((rate: any) => {
                                  const isLate = rate.status === "bezahlt" && rate.bezahlt_am && rate.faellig_am && new Date(rate.bezahlt_am) > new Date(rate.faellig_am);
                                  const lateDays = isLate ? Math.ceil((new Date(rate.bezahlt_am).getTime() - new Date(rate.faellig_am).getTime()) / 864e5) : 0;
                                  const bg = rate.status === "bezahlt" ? (isLate ? "rgba(251,191,36,0.06)" : "rgba(74,222,128,0.06)") : rate.status === "überfällig" ? "rgba(248,113,113,0.06)" : dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)";
                                  const bc = rate.status === "bezahlt" ? (isLate ? "rgba(251,191,36,0.2)" : "rgba(74,222,128,0.2)") : rate.status === "überfällig" ? "rgba(248,113,113,0.2)" : (dk ? "rgba(255,255,255,0.05)" : "#e8eaef");
                                  return (
                                    <div key={rate.id} style={{ padding: 10, borderRadius: 8, border: `1px solid ${bc}`, background: bg, textAlign: "center", opacity: rate.status === "offen" ? 0.5 : 1 }}>
                                      <div style={{ fontSize: 10, color: muted, fontWeight: 600 }}>Rate {rate.rate_nummer}</div>
                                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Fraunces', serif", marginTop: 2 }}>{fE(rate.betrag)}€</div>
                                      <div style={{ fontSize: 9, color: muted, marginTop: 3 }}>{new Date(rate.faellig_am).toLocaleDateString("de-DE", { month: "short", year: "2-digit" })}</div>
                                      {rate.status === "bezahlt" && !isLate && <div style={{ fontSize: 9, fontWeight: 700, color: "#4ade80", marginTop: 3 }}>✓ Pünktlich</div>}
                                      {isLate && <div style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", marginTop: 3 }}>+{lateDays} Tage</div>}
                                      {rate.status === "überfällig" && <div style={{ fontSize: 9, fontWeight: 700, color: "#f87171", marginTop: 3 }}>Überfällig</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                        {isExp && rates.length === 0 && (() => {
                          const z = sollZahlungen[plan.id];
                          if (!z || z === "laedt") {
                            return (
                              <tr><td colSpan={6} style={{ padding: "16px 20px", borderBottom: `1px solid ${border}`, color: muted, fontSize: 12 }}>
                                Sollplan wird berechnet …
                              </td></tr>
                            );
                          }
                          const sp = buildSollplan(plan, z as any[]);
                          return (
                            <tr>
                              <td colSpan={6} style={{ padding: "16px 20px 20px", borderBottom: `1px solid ${border}`, background: dk ? "rgba(8,12,20,0.5)" : "rgba(245,246,250,0.5)" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(95px, 1fr))", gap: 6 }}>
                                  {sp.kacheln.map((r: any) => {
                                    const bg = r.zustand === "bezahlt" ? "rgba(74,222,128,0.06)" : r.zustand === "ueberfaellig" ? "rgba(248,113,113,0.06)" : dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)";
                                    const bc = r.zustand === "bezahlt" ? "rgba(74,222,128,0.2)" : r.zustand === "ueberfaellig" ? "rgba(248,113,113,0.2)" : (dk ? "rgba(255,255,255,0.05)" : "#e8eaef");
                                    return (
                                      <div key={r.nummer} style={{ padding: 10, borderRadius: 8, border: `1px solid ${bc}`, background: bg, textAlign: "center", opacity: r.zustand === "offen" ? 0.5 : 1 }}>
                                        <div style={{ fontSize: 10, color: muted, fontWeight: 600 }}>Rate {r.nummer}</div>
                                        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Fraunces', serif", marginTop: 2 }}>{fE(r.betrag)}€</div>
                                        <div style={{ fontSize: 9, color: muted, marginTop: 3 }}>{r.faellig.toLocaleDateString("de-DE", { month: "short", year: "2-digit" })}</div>
                                        {r.zustand === "bezahlt" && <div style={{ fontSize: 9, fontWeight: 700, color: "#4ade80", marginTop: 3 }}>✓ {r.bezahltAm ? r.bezahltAm.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "Gedeckt"}</div>}
                                        {r.zustand === "ueberfaellig" && <div style={{ fontSize: 9, fontWeight: 700, color: "#f87171", marginTop: 3 }}>Überfällig</div>}
                                      </div>
                                    );
                                  })}
                                </div>
                                <div style={{ marginTop: 12, fontSize: 11, color: muted }}>
                                  Nur-Lese-Sollplan, berechnet aus bestätigten Bankzahlungen · Gedeckt: {sp.gedeckt} von {sp.anzahl} Raten
                                  {sp.guthaben > 0 ? ` · Rechnerisches Guthaben: ${fE(sp.guthaben)} €` : ""}
                                  {sp.sonstigeAnzahl > 0 ? ` · Weitere bestätigte Zahlungen (nicht ratengroß): ${sp.sonstigeAnzahl} über ${fE(sp.sonstigeSumme)} €` : ""}
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: muted, fontSize: 13 }}>Keine Ratenpläne gefunden.</div>}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("rateplans.createTitle", locale)}>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.patient", locale)} *</span><select className="input" value={form.patient_id} onChange={e => setForm(prev => ({ ...prev, patient_id: e.target.value }))}><option value="">{t("rateplans.selectPatient", locale)}</option>{patienten.map(p => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>)}</select></label>
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

// ── Nur-Lese-Sollplan (Variante A) ──────────────────────────────
// Berechnet aus Plan + bestaetigten Zahlungen, schreibt NICHTS.
// Eine Zahlung deckt k Raten, wenn sie ~k * Ratenhoehe entspricht
// (Toleranz 10% bzw. 5 Euro); Quartalszahler zahlen z.B. 3 Raten
// in einer Buchung. Nicht ratengrosse Zahlungen laufen separat.
function buildSollplan(plan: any, zahlungen: any[]) {
  const rate = Number(plan.rate_betrag) || 0;
  const anzahl = Number(plan.anzahl_raten) || 0;
  const start = new Date(plan.start_datum);
  const schrittMonate = plan.rhythmus === "quartalsweise" ? 3 : 1;
  const heute = new Date();

  const soll = Array.from({ length: anzahl }).map((_, i) => {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i * schrittMonate);
    return { nummer: i + 1, betrag: rate, faellig: d, bezahltAm: null as Date | null, gedeckt: false };
  });

  const tol = Math.max(5, rate * 0.1);
  let sonstigeSumme = 0;
  let sonstigeAnzahl = 0;
  let guthaben = 0;
  let idx = 0;

  for (const z of zahlungen) {
    const betrag = Number(z.betrag) || 0;
    const k = rate > 0 ? Math.round(betrag / rate) : 0;
    if (k >= 1 && Math.abs(betrag - k * rate) <= tol) {
      let rest = k;
      while (rest > 0 && idx < soll.length) {
        soll[idx].gedeckt = true;
        soll[idx].bezahltAm = new Date(z.datum);
        idx++;
        rest--;
      }
      if (rest > 0) guthaben += rest * rate; // Plan voll, Ueberschuss
    } else {
      sonstigeSumme += betrag;
      sonstigeAnzahl++;
    }
  }

  const kacheln = soll.map(r => {
    const ueberfaellig = !r.gedeckt && r.faellig < heute;
    const zukunft = !r.gedeckt && r.faellig >= heute;
    return { ...r, zustand: r.gedeckt ? "bezahlt" : ueberfaellig ? "ueberfaellig" : zukunft ? "offen" : "offen" };
  });

  return {
    kacheln,
    gedeckt: idx,
    anzahl,
    guthaben,
    sonstigeSumme,
    sonstigeAnzahl,
  };
}
