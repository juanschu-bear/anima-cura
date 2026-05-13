"use client";

import { useState } from "react";
import { usePatienten } from "@/hooks/useData";
import { StatusBadge, EmptyState, Modal } from "@/components/ui";
import { Users, Search, Plus } from "lucide-react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/db/supabase";

export default function PatientenPage() {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-praxis-800">Patienten</h1>
          <p className="text-sm text-praxis-400 mt-1">
            {patienten.length} Patienten
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={16} /> Neuer Patient
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
        <input
          type="text"
          placeholder="Patient suchen (Name)..."
          className="input pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Patienten Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {patienten.map((p) => {
          const offeneRaten = (p.raten || []).filter((r: any) => r.status === "offen" || r.status === "überfällig");
          const offenBetrag = offeneRaten.reduce((s: number, r: any) => s + r.betrag, 0);
          const hatMahnung = (p.raten || []).some((r: any) => r.mahnstufe > 0);

          return (
            <Link
              key={p.id}
              href={`/patienten/${p.id}`}
              className="stat-card hover:shadow-card-hover transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-praxis-100 flex items-center justify-center text-sm font-semibold text-praxis-600 group-hover:bg-praxis-200 transition-colors">
                  {p.vorname[0]}{p.nachname[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-praxis-800 group-hover:text-praxis-600 transition-colors">
                    {p.nachname}, {p.vorname}
                  </p>
                  <p className="text-xs text-praxis-400 mt-0.5">{p.behandlung}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <StatusBadge status={p.behandlung_status} />
                    {hatMahnung && <StatusBadge status="überfällig" />}
                  </div>
                </div>
              </div>

              {offeneRaten.length > 0 && (
                <div className="mt-3 pt-3 border-t border-surface-100 flex items-center justify-between">
                  <span className="text-xs text-praxis-400">
                    {offeneRaten.length} offene Rate{offeneRaten.length !== 1 ? "n" : ""}
                  </span>
                  <span className="text-sm font-semibold text-praxis-700">
                    {offenBetrag.toLocaleString("de-DE")} €
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {patienten.length === 0 && !loading && (
        <EmptyState
          icon={<Users size={24} />}
          title="Keine Patienten gefunden"
          description={search ? "Versuche einen anderen Suchbegriff." : "Noch keine Patienten angelegt."}
          action={
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              Ersten Patienten anlegen
            </button>
          }
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setErrorMsg("");
        }}
        title="Neuen Patienten anlegen"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField
              label="Vorname *"
              value={form.vorname}
              onChange={(value) => setForm((prev) => ({ ...prev, vorname: value }))}
            />
            <FormField
              label="Nachname *"
              value={form.nachname}
              onChange={(value) => setForm((prev) => ({ ...prev, nachname: value }))}
            />
            <DateField
              label="Geburtsdatum *"
              value={form.geburtsdatum}
              onChange={(value) => setForm((prev) => ({ ...prev, geburtsdatum: value }))}
            />
            <label className="block">
              <span className="block text-xs font-medium text-praxis-500 mb-1">Kasse *</span>
              <select
                className="input"
                value={form.kasse}
                onChange={(e) => setForm((prev) => ({ ...prev, kasse: e.target.value }))}
              >
                <option value="privat">Privat</option>
                <option value="gesetzlich">Gesetzlich</option>
              </select>
            </label>
            <FormField
              label="Behandlung *"
              value={form.behandlung}
              onChange={(value) => setForm((prev) => ({ ...prev, behandlung: value }))}
            />
            <DateField
              label="Behandlung Start *"
              value={form.behandlung_start}
              onChange={(value) => setForm((prev) => ({ ...prev, behandlung_start: value }))}
            />
            <FormField
              label="E-Mail"
              value={form.email}
              onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
            />
            <FormField
              label="Telefon"
              value={form.telefon}
              onChange={(value) => setForm((prev) => ({ ...prev, telefon: value }))}
            />
          </div>
          {errorMsg && (
            <p className="text-sm text-accent-coral">{errorMsg}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="btn-secondary"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              Abbrechen
            </button>
            <button
              className="btn-primary"
              onClick={handleCreatePatient}
              disabled={saving}
            >
              {saving ? "Speichere..." : "Patient anlegen"}
            </button>
          </div>
        </div>
      </Modal>
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
      <span className="block text-xs font-medium text-praxis-500 mb-1">{label}</span>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
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
      <span className="block text-xs font-medium text-praxis-500 mb-1">{label}</span>
      <input
        type="date"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
