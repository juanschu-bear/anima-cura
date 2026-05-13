"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Users } from "lucide-react";
import { usePatienten } from "@/hooks/useData";
import { EmptyState, Modal, StatusBadge } from "@/components/ui";
import { createBrowserClient } from "@/lib/db/supabase";
import { DEMO_TREATMENT_TYPES } from "@/lib/mock-data";

function progressBlocks(total: number, paid: number, hasOverdue: boolean) {
  const max = Math.min(Math.max(total, 1), 36);
  return Array.from({ length: max }).map((_, idx) => {
    const isDone = idx < paid;
    const isLateMarker = idx === paid && hasOverdue;
    return (
      <span
        key={`pb-${idx}`}
        className={`h-4 w-4 rounded-[4px] border ${
          isDone
            ? "border-[#4ca43f] bg-[#4ca43f]"
            : isLateMarker
            ? "border-accent-coral bg-accent-coral"
            : "border-surface-200 bg-white"
        }`}
      />
    );
  });
}

export default function PatientenPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { patienten, loading, refetch } = usePatienten(search);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({
    vorname: "",
    nachname: "",
    geburtsdatum: "",
    kasse: "privat",
    behandlung: "",
    behandlung_start: new Date().toISOString().slice(0, 10),
    email: "",
    telefon: "",
  });

  async function handleCreatePatient() {
    if (!form.vorname || !form.nachname || !form.geburtsdatum || !form.behandlung) {
      setErrorMsg("Bitte alle Pflichtfelder ausfuellen.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const supabase = createBrowserClient();
    const { error } = await supabase.from("patients").insert({
      vorname: form.vorname.trim(),
      nachname: form.nachname.trim(),
      geburtsdatum: form.geburtsdatum,
      kasse: form.kasse,
      behandlung: form.behandlung.trim(),
      behandlung_start: form.behandlung_start,
      email: form.email.trim() || null,
      telefon: form.telefon.trim() || null,
    });

    setSaving(false);
    if (error) {
      setErrorMsg(error.message || "Patient konnte nicht erstellt werden.");
      return;
    }

    setCreateOpen(false);
    setForm({
      vorname: "",
      nachname: "",
      geburtsdatum: "",
      kasse: "privat",
      behandlung: "",
      behandlung_start: new Date().toISOString().slice(0, 10),
      email: "",
      telefon: "",
    });
    refetch();
  }

  const totalActive = useMemo(() => patienten.filter((p) => (p.raten || []).length > 0).length, [patienten]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-praxis-800">Patienten</h1>
          <p className="mt-1 text-sm text-praxis-400">Patienten mit aktiven Ratenplänen ({totalActive})</p>
        </div>
        <button className="btn-primary gap-2" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> Neuer Patient
        </button>
      </div>

      <div className="relative max-w-[420px]">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
        <input
          type="text"
          placeholder="Patient suchen (Name)..."
          className="input pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-card border border-surface-200 bg-white shadow-card">
        <div className="overflow-x-auto">
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
            {patienten.map((p) => {
              const raten = p.raten || [];
              const total = Math.max(raten.length, 1);
              const bezahlt = raten.filter((r: any) => r.status === "bezahlt").length;
              const hasOverdue = raten.some((r: any) => r.status === "überfällig");
              const maxMahn = raten.reduce((m: number, r: any) => Math.max(m, r.mahnstufe || 0), 0);
              const offene = raten.filter((r: any) => r.status !== "bezahlt");
              const rest = offene.reduce((s: number, r: any) => s + (r.betrag || 0), 0);
              const rateMonat = raten[0]?.betrag || 0;

              let status: string = "pünktlich";
              if (maxMahn >= 3) status = "eskalation";
              else if (maxMahn === 2) status = "verzug";
              else if (maxMahn === 1) status = "stufe1";
              else if (hasOverdue) status = "abweichung";

              return (
                <tr
                  key={p.id}
                  className="cursor-pointer transition-colors hover:bg-surface-50/80"
                  onClick={() => router.push(`/patienten/${p.id}`)}
                >
                  <td className="table-cell">
                    <Link href={`/patienten/${p.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-praxis-100 text-sm font-bold text-praxis-600">
                        {p.vorname?.[0]}
                        {p.nachname?.[0]}
                      </div>
                      <span className="text-[16px] leading-tight font-bold text-praxis-800">
                        {p.nachname}, {p.vorname}
                      </span>
                    </Link>
                  </td>
                  <td className="table-cell text-base text-praxis-600">{p.behandlung || "KFO"}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="flex max-w-[360px] flex-wrap gap-1">{progressBlocks(total, bezahlt, hasOverdue)}</div>
                      <span className="text-sm font-medium text-praxis-400">{bezahlt}/{total}</span>
                    </div>
                  </td>
                  <td className="table-cell text-right text-[20px] font-bold text-praxis-800">{rateMonat.toLocaleString("de-DE")}€</td>
                  <td className="table-cell text-right text-[20px] font-bold text-accent-coral">{rest.toLocaleString("de-DE")}€</td>
                  <td className="table-cell">
                    {renderStatusBadge({
                      status,
                      patientId: p.id,
                      restschuld: rest,
                      raten,
                      router,
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {patienten.length === 0 && !loading && (
          <EmptyState
            icon={<Users size={24} />}
            title="Keine Patienten gefunden"
            description={search ? "Versuche einen anderen Suchbegriff." : "Noch keine Patienten angelegt."}
            action={<button className="btn-primary" onClick={() => setCreateOpen(true)}>Ersten Patienten anlegen</button>}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setErrorMsg("");
        }}
        title="Neuen Patienten anlegen"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label="Vorname *" value={form.vorname} onChange={(value) => setForm((prev) => ({ ...prev, vorname: value }))} />
            <FormField label="Nachname *" value={form.nachname} onChange={(value) => setForm((prev) => ({ ...prev, nachname: value }))} />
            <DateField label="Geburtsdatum *" value={form.geburtsdatum} onChange={(value) => setForm((prev) => ({ ...prev, geburtsdatum: value }))} />

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-praxis-500">Kasse *</span>
              <select className="input" value={form.kasse} onChange={(e) => setForm((prev) => ({ ...prev, kasse: e.target.value }))}>
                <option value="privat">Privat</option>
                <option value="gesetzlich">Gesetzlich</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-praxis-500">Behandlung *</span>
              <select className="input" value={form.behandlung} onChange={(e) => setForm((prev) => ({ ...prev, behandlung: e.target.value }))}>
                <option value="">Bitte wählen</option>
                {DEMO_TREATMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <DateField label="Behandlung Start *" value={form.behandlung_start} onChange={(value) => setForm((prev) => ({ ...prev, behandlung_start: value }))} />
            <FormField label="E-Mail" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} />
            <FormField label="Telefon" value={form.telefon} onChange={(value) => setForm((prev) => ({ ...prev, telefon: value }))} />
          </div>

          {errorMsg && <p className="text-sm text-accent-coral">{errorMsg}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Abbrechen</button>
            <button className="btn-primary" onClick={handleCreatePatient} disabled={saving}>{saving ? "Speichere..." : "Patient anlegen"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function renderStatusBadge({
  status,
  patientId,
  restschuld,
  raten,
  router,
}: {
  status: string;
  patientId: string;
  restschuld: number;
  raten: any[];
  router: ReturnType<typeof useRouter>;
}) {
  const mahnrelevant = ["stufe1", "verzug", "eskalation", "abweichung"].includes(status);
  if (!mahnrelevant) return <StatusBadge status={status} />;

  const ueberfaellig = raten
    .filter((r) => r.status === "überfällig")
    .sort((a, b) => new Date(a.faellig_am).getTime() - new Date(b.faellig_am).getTime());
  const first = ueberfaellig[0];
  const dueDate = first?.faellig_am ? new Date(first.faellig_am) : null;
  const daysLate = dueDate ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24))) : 0;
  const dueLabel = dueDate ? dueDate.toLocaleDateString("de-DE") : "—";

  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        className="cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/mahnwesen?patient=${patientId}`);
        }}
      >
        <StatusBadge status={status} />
      </button>
      <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden min-w-[220px] -translate-x-1/2 rounded-lg border border-surface-200 bg-white p-2 text-left text-xs text-praxis-600 shadow-elevated group-hover:block">
        <p><span className="font-semibold text-praxis-700">Restschuld:</span> {restschuld.toLocaleString("de-DE")}€</p>
        <p><span className="font-semibold text-praxis-700">Fällig seit:</span> {dueLabel}</p>
        <p><span className="font-semibold text-praxis-700">Verzugstage:</span> {daysLate}</p>
        <p className="mt-1 text-praxis-400">Klick: Mahnwesen öffnen</p>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-praxis-500">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-praxis-500">{label}</span>
      <input type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
