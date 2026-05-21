"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { Modal, StatusBadge } from "@/components/ui";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

export default function RatenplanPage() {
  const { locale } = useAppStore();
  const [plaene, setPlaene] = useState<any[]>([]);
  const [patienten, setPatienten] = useState<any[]>([]);
  const [ratenByPlan, setRatenByPlan] = useState<Record<string, any[]>>({});
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
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
      const [{ data: plans }, { data: pats }, { data: rates }] = await Promise.all([
        supabase
          .from("ratenplaene")
          .select("*, patients:patient_id(vorname, nachname, behandlung)")
          .order("start_datum", { ascending: true }),
        supabase.from("patients").select("id, vorname, nachname").order("nachname", { ascending: true }),
        supabase.from("raten").select("*").order("rate_nummer", { ascending: true }),
      ]);

      const finalPlans = plans || [];
      const finalPatients = pats || [];
      const finalRates = rates || [];

      const grouped: Record<string, any[]> = {};
      finalRates.forEach((rate: any) => {
        if (!grouped[rate.ratenplan_id]) grouped[rate.ratenplan_id] = [];
        grouped[rate.ratenplan_id].push(rate);
      });

      setPlaene(finalPlans);
      setPatienten(finalPatients);
      setRatenByPlan(grouped);
      if (finalPlans.length > 0) {
        setSelectedPlanId((prev) => prev || finalPlans[0].id);
      }
    } catch {
      setPlaene([]);
      setPatienten([]);
      setRatenByPlan({});
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function createRatenplan() {
    if (!form.patient_id || form.gesamtbetrag <= 0 || form.anzahl_raten <= 0) {
      setHint(t("rateplans.fillRequired", locale));
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
      setHint(planError?.message || t("rateplans.createError", locale));
      return;
    }

    const start = new Date(form.start_datum);
    const rates = Array.from({ length: form.anzahl_raten }).map((_, index) => {
      const due = new Date(start);
      due.setMonth(due.getMonth() + (form.rhythmus === "monatlich" ? index : index * 3));
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
      setHint(ratesError.message || t("rateplans.ratesError", locale));
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
    setHint(t("rateplans.created", locale));
    fetchData();
  }

  const selectedPlan = plaene.find((p) => p.id === selectedPlanId);
  const selectedRates = (ratenByPlan[selectedPlanId] || []).sort((a: any, b: any) => a.rate_nummer - b.rate_nummer);

  const done = selectedRates.filter((r: any) => r.status === "bezahlt").length;
  const rest = selectedRates.filter((r: any) => r.status !== "bezahlt").reduce((sum: number, r: any) => sum + (r.betrag || 0), 0);

  const status = useMemo(() => {
    if (!selectedRates.length) return "pünktlich";
    const maxMahn = selectedRates.reduce((m: number, r: any) => Math.max(m, r.mahnstufe || 0), 0);
    if (maxMahn >= 3) return "eskalation";
    if (maxMahn === 2) return "verzug";
    if (maxMahn === 1) return "stufe1";
    if (selectedRates.some((r: any) => r.status === "überfällig")) return "abweichung";
    return "pünktlich";
  }, [selectedRates]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[34px] font-extrabold tracking-tight text-praxis-800">{t("rateplans.title", locale)}</h1>
          <p className="mt-1 text-sm text-praxis-400">{plaene.length} {t("rateplans.activePlans", locale)}</p>
        </div>
        <button className="btn-primary gap-2" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> {t("rateplans.newPlan", locale)}
        </button>
      </div>

      {hint && <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm text-praxis-600">{hint}</div>}

      <div className="flex flex-wrap gap-2">
        {plaene.map((plan) => (
          <button
            key={plan.id}
            onClick={() => setSelectedPlanId(plan.id)}
            className={`ac-chip ${selectedPlanId === plan.id ? "ac-chip-active" : ""}`}
          >
            {plan.patients?.nachname}, {plan.patients?.vorname}
          </button>
        ))}
      </div>

      {selectedPlan && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Metric label={t("rateplans.monthlyRate", locale)} value={`${Number(selectedPlan.rate_betrag || 0).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€`} />
            <Metric
              label={t("rateplans.paid", locale)}
              value={`${done} / ${Math.max(selectedPlan.anzahl_raten || 0, 1)}`}
              sub={`${Math.round((done / Math.max(selectedPlan.anzahl_raten || 1, 1)) * 100)}% ${t("rateplans.completed", locale)}`}
            />
            <Metric label={t("rateplans.remainingDebt", locale)} value={`${rest.toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€`} accent />
            <Metric label={t("rateplans.status", locale)} value={<StatusBadge status={status} />} />
          </div>

          <div className="stat-card">
            <h3 className="mb-4 text-[28px] font-extrabold tracking-tight text-praxis-700">{t("rateplans.allRates", locale)}</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9">
              {selectedRates.map((rate: any) => (
                <div
                  key={rate.id}
                  className={`rounded-xl border p-3 ${
                    rate.status === "bezahlt"
                      ? "border-[#93d58f] bg-[#eaf7e8]"
                      : rate.status === "überfällig"
                      ? "border-accent-coral/40 bg-accent-coral/10"
                      : "border-surface-200 bg-white"
                  }`}
                >
                  <p className="text-sm font-semibold text-praxis-700">{t("rateplans.rate", locale)} {rate.rate_nummer}</p>
                  <p className="mt-1 text-2xl font-extrabold leading-none tracking-tight text-praxis-800">
                    {Number(rate.betrag || 0).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€
                  </p>
                  <p className="mt-2 text-xs text-praxis-400">
                    {new Date(rate.faellig_am).toLocaleDateString(locale === "en" ? "en-GB" : "de-DE", { month: "short", year: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("rateplans.createTitle", locale)}>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.patient", locale)} *</span>
            <select className="input" value={form.patient_id} onChange={(e) => setForm((prev) => ({ ...prev, patient_id: e.target.value }))}>
              <option value="">{t("rateplans.selectPatient", locale)}</option>
              {patienten.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nachname}, {p.vorname}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.totalAmount", locale)} *</span>
              <input type="number" className="input" value={form.gesamtbetrag} onChange={(e) => setForm((prev) => ({ ...prev, gesamtbetrag: Number(e.target.value) }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.numberOfRates", locale)} *</span>
              <input type="number" className="input" value={form.anzahl_raten} onChange={(e) => setForm((prev) => ({ ...prev, anzahl_raten: Number(e.target.value) }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.startDate", locale)} *</span>
              <input type="date" className="input" value={form.start_datum} onChange={(e) => setForm((prev) => ({ ...prev, start_datum: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.rhythm", locale)}</span>
              <select className="input" value={form.rhythmus} onChange={(e) => setForm((prev) => ({ ...prev, rhythmus: e.target.value }))}>
                <option value="monatlich">{t("rateplans.monthly", locale)}</option>
                <option value="quartalsweise">{t("rateplans.quarterly", locale)}</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-medium text-praxis-500">{t("rateplans.treatmentType", locale)}</span>
              <select className="input" disabled>
                {["Kassenbehandlung", "Privatbehandlung", "Zusatzleistung"].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
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

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="stat-card">
      <p className="text-sm font-medium text-praxis-400">{label}</p>
      <p className={`mt-1 text-[42px] font-extrabold leading-none tracking-tight ${accent ? "text-accent-coral" : "text-praxis-800"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-praxis-400">{sub}</p> : null}
    </div>
  );
}
