"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import { StatusBadge, EmptyState, Modal } from "@/components/ui";
import { MonatseinnahmenChart } from "@/components/charts";
import { CalendarRange, Plus } from "lucide-react";
import Link from "next/link";
import { DEMO_TREATMENT_TYPES, demoPlaene, demoPatients } from "@/lib/mock-data";

export default function RatenplanPage() {
  const [plaene, setPlaene] = useState<any[]>([]);
  const [patienten, setPatienten] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState("");
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
      const [{ data: plans }, { data: pats }] = await Promise.all([
        supabase
          .from("ratenplaene")
          .select("*, patients:patient_id(vorname, nachname, behandlung), raten(id, status, betrag, bezahlt_betrag)")
          .order("start_datum", { ascending: false }),
        supabase
          .from("patients")
          .select("id, vorname, nachname")
          .order("nachname", { ascending: true }),
      ]);
      const fallbackPlans = plans && plans.length > 0 ? plans : demoPlaene;
      const fallbackPatients = pats && pats.length > 0 ? pats : demoPatients;
      setPlaene(fallbackPlans || []);
      setPatienten(fallbackPatients || []);
    } catch {
      setPlaene(demoPlaene);
      setPatienten(demoPatients);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function createRatenplan() {
    if (!form.patient_id || form.gesamtbetrag <= 0 || form.anzahl_raten <= 0) {
      setHint("Bitte Patient, Gesamtbetrag und Anzahl Raten korrekt ausfuellen.");
      return;
    }
    setSaving(true);
    setHint("");
    const supabase = createBrowserClient();
    const rateBetrag = Number((form.gesamtbetrag / form.anzahl_raten).toFixed(2));

    const { data: plan, error: planError } = await supabase
      .from("ratenplaene")
      .insert({
        patient_id: form.patient_id,
        gesamtbetrag: form.gesamtbetrag,
        anzahl_raten: form.anzahl_raten,
        rate_betrag: rateBetrag,
        start_datum: form.start_datum,
        rhythmus: form.rhythmus,
      })
      .select("id")
      .single();

    if (planError || !plan?.id) {
      setSaving(false);
      setHint(planError?.message || "Ratenplan konnte nicht erstellt werden.");
      return;
    }

    const start = new Date(form.start_datum);
    const rates = Array.from({ length: form.anzahl_raten }).map((_, index) => {
      const due = new Date(start);
      if (form.rhythmus === "monatlich") {
        due.setMonth(due.getMonth() + index);
      } else {
        due.setMonth(due.getMonth() + index * 3);
      }
      return {
        ratenplan_id: plan.id,
        patient_id: form.patient_id,
        rate_nummer: index + 1,
        betrag: rateBetrag,
        faellig_am: due.toISOString().slice(0, 10),
      };
    });

    const { error: ratesError } = await supabase.from("raten").insert(rates);
    setSaving(false);
    if (ratesError) {
      setHint(ratesError.message || "Raten konnten nicht erstellt werden.");
      return;
    }

    setCreateOpen(false);
    setForm({
      patient_id: "",
      gesamtbetrag: 0,
      anzahl_raten: 12,
      start_datum: new Date().toISOString().slice(0, 10),
      rhythmus: "monatlich",
    });
    setHint("Ratenplan erstellt.");
    fetchData();
  }

  // Demo-Daten für Monatseinnahmen-Chart
  const einnahmen = [
    { monat: "Jan", privat: 14200, kasse: 4300 },
    { monat: "Feb", privat: 16800, kasse: 4500 },
    { monat: "Mär", privat: 15100, kasse: 4700 },
    { monat: "Apr", privat: 18200, kasse: 5200 },
    { monat: "Mai", privat: 17400, kasse: 4700 },
    { monat: "Jun", privat: 19800, kasse: 5000 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-praxis-800">Ratenpläne</h1>
          <p className="text-sm text-praxis-400 mt-1">
            {plaene.length} Ratenpläne · {plaene.filter((p) => p.status === "aktiv").length} aktiv
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> Neuer Ratenplan
        </button>
      </div>

      {hint && (
        <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm text-praxis-600">
          {hint}
        </div>
      )}

      {/* Einnahmen-Chart */}
      <div className="stat-card">
        <h3 className="text-sm font-semibold text-praxis-700 mb-4">Monatliche Einnahmen nach Kassenart</h3>
        <MonatseinnahmenChart data={einnahmen} />
      </div>

      {/* Ratenpläne-Tabelle */}
      <div className="bg-white rounded-card shadow-card border border-surface-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50">
              <th className="table-header">Patient</th>
              <th className="table-header">Behandlung</th>
              <th className="table-header">Fortschritt</th>
              <th className="table-header text-right">Rate/Monat</th>
              <th className="table-header text-right">Restschuld</th>
              <th className="table-header">Status</th>
            </tr>
          </thead>
          <tbody>
            {plaene.map((plan) => {
              const raten = plan.raten || [];
              const bezahlt = raten.filter((r: any) => r.status === "bezahlt").length;
              const restschuld = Math.max(plan.gesamtbetrag - bezahlt * plan.rate_betrag, 0);
              const hasOverdue = raten.some((r: any) => r.status === "überfällig");
              const hasWarning = raten.some((r: any) => r.status === "offen");
              const statusLabel = hasOverdue ? "überfällig" : hasWarning ? "abweichung" : "bezahlt";

              return (
                <tr key={plan.id} className="hover:bg-surface-50/50 transition-colors">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-praxis-100 text-praxis-600 flex items-center justify-center text-xs font-semibold">
                        {plan.patients?.vorname?.[0]}
                        {plan.patients?.nachname?.[0]}
                      </div>
                      <Link
                        href={`/patienten/${plan.patient_id}`}
                        className="text-sm font-medium text-praxis-700 hover:text-praxis-500 transition-colors"
                      >
                        {plan.patients?.nachname}, {plan.patients?.vorname}
                      </Link>
                    </div>
                  </td>
                  <td className="table-cell text-sm text-praxis-600">
                    {plan.patients?.behandlung || "KFO-Plan"}
                  </td>
                  <td className="table-cell">
                    <div className="space-y-1">
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: plan.anzahl_raten }).map((_, idx) => {
                          const isDone = idx < bezahlt;
                          const isCritical = idx === bezahlt && hasOverdue;
                          const isWarn = idx === bezahlt && !hasOverdue && hasWarning;
                          return (
                            <span
                              key={`${plan.id}-cell-${idx}`}
                              className={`inline-block w-3 h-3 rounded-[4px] border ${
                                isDone
                                  ? "bg-accent-emerald border-accent-emerald"
                                  : isCritical
                                  ? "bg-accent-coral border-accent-coral"
                                  : isWarn
                                  ? "bg-accent-amber border-accent-amber"
                                  : "bg-transparent border-surface-200"
                              }`}
                            />
                          );
                        })}
                      </div>
                      <p className="text-xs text-praxis-500">
                        {bezahlt}/{plan.anzahl_raten}
                      </p>
                    </div>
                  </td>
                  <td className="table-cell text-sm text-right text-praxis-600">
                    {plan.rate_betrag?.toLocaleString("de-DE")} €
                  </td>
                  <td className="table-cell text-right text-sm font-semibold text-accent-coral">
                    {restschuld.toLocaleString("de-DE")} €
                  </td>
                  <td className="table-cell">
                    <StatusBadge status={statusLabel} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {plaene.length === 0 && !loading && (
          <EmptyState
            icon={<CalendarRange size={24} />}
            title="Keine Ratenpläne"
            description="Erstelle den ersten Ratenplan für einen Patienten."
          />
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Neuen Ratenplan anlegen"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-praxis-500 mb-1">Patient *</span>
            <select
              className="input"
              value={form.patient_id}
              onChange={(e) => setForm((prev) => ({ ...prev, patient_id: e.target.value }))}
            >
              <option value="">Bitte wählen</option>
              {patienten.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nachname}, {p.vorname}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-praxis-500 mb-1">Gesamtbetrag (€) *</span>
              <input
                type="number"
                className="input"
                value={form.gesamtbetrag}
                onChange={(e) => setForm((prev) => ({ ...prev, gesamtbetrag: Number(e.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-praxis-500 mb-1">Anzahl Raten *</span>
              <input
                type="number"
                className="input"
                value={form.anzahl_raten}
                onChange={(e) => setForm((prev) => ({ ...prev, anzahl_raten: Number(e.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-praxis-500 mb-1">Startdatum *</span>
              <input
                type="date"
                className="input"
                value={form.start_datum}
                onChange={(e) => setForm((prev) => ({ ...prev, start_datum: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-praxis-500 mb-1">Rhythmus</span>
              <select
                className="input"
                value={form.rhythmus}
                onChange={(e) => setForm((prev) => ({ ...prev, rhythmus: e.target.value }))}
              >
                <option value="monatlich">Monatlich</option>
                <option value="quartalsweise">Quartalsweise</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="block text-xs font-medium text-praxis-500 mb-1">Behandlungstyp (Info)</span>
              <select className="input" disabled>
                {DEMO_TREATMENT_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-praxis-400">
            Geplante Rate: {form.anzahl_raten > 0 ? (form.gesamtbetrag / form.anzahl_raten).toFixed(2) : "0.00"} €
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Abbrechen
            </button>
            <button className="btn-primary" onClick={createRatenplan} disabled={saving}>
              {saving ? "Speichere..." : "Ratenplan erstellen"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
