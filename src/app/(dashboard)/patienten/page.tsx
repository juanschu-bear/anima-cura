"use client";

import { useMemo, useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Search, Users } from "lucide-react";
import { usePatienten } from "@/hooks/useData";
import { EmptyState, Modal, StatusBadge } from "@/components/ui";
import { createBrowserClient } from "@/lib/db/supabase";
import { isReadOnlyRole } from "@/lib/auth";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

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
  const { authUser, locale, theme } = useAppStore();
  const isDark = theme === "dark";
  const readOnly = isReadOnlyRole(authUser?.role ?? "lesezugriff");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const stored = window.sessionStorage.getItem("ac-patient-search");
    if (stored) {
      setSearch(stored);
      window.sessionStorage.removeItem("ac-patient-search");
    }
  }, []);

  const [statusPopoverFor, setStatusPopoverFor] = useState<string | null>(null);
  const [statusPopoverPos, setStatusPopoverPos] = useState<{ left: number; top: number } | null>(null);
  const { patienten, totalCount, loading, refetch } = usePatienten(search || undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncHint, setSyncHint] = useState("");
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
    if (readOnly) return;
    if (!form.vorname || !form.nachname || !form.geburtsdatum || !form.behandlung) {
      setErrorMsg(t("patients.fillRequired", locale));
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
      setErrorMsg(error.message || t("patients.createError", locale));
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

  async function handleIvorisSync() {
    if (readOnly) return;
    setSyncing(true);
    setSyncHint(t("patients.syncMsg", locale));
    try {
      const res = await fetch("/api/ivoris/patients/batch-sync");
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setSyncHint(payload.error || t("patients.syncFailed", locale));
      } else {
        const r = payload.results || {};
        setSyncHint(
          t("patients.syncDone", locale, { fetched: r.fetched ?? 0, updated: r.updated ?? 0, inserted: r.inserted ?? 0 })
        );
        refetch();
      }
    } catch {
      setSyncHint(t("patients.syncRetry", locale));
    } finally {
      setSyncing(false);
    }
  }

  const totalActive = useMemo(() => patienten.filter((p) => (p.raten || []).length > 0).length, [patienten]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-praxis-800">{t("patients.title", locale)}</h1>
          <p className="mt-1 text-sm text-praxis-400">{totalCount} {t("patients.total", locale)} · {totalActive} {t("patients.withRatePlans", locale)}</p>
          {readOnly ? (
            <p className="mt-2 text-xs text-praxis-500">{t("auth.readOnlyMode", locale)}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary gap-2" onClick={handleIvorisSync} disabled={syncing || readOnly}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? t("patients.syncing", locale) : t("patients.ivorisSync", locale)}
          </button>
          <button className="btn-primary gap-2" onClick={() => setCreateOpen(true)} disabled={readOnly}>
            <Plus size={16} /> {t("patients.newPatient", locale)}
          </button>
        </div>
      </div>

      {syncHint && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${isDark ? "border-white/6 bg-white/3 text-white/70" : "border-surface-200 bg-white text-praxis-600"}`}>
          {syncHint}
        </div>
      )}

      <div className="relative max-w-[420px]">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
        <input
          type="text"
          placeholder={t("patients.searchPlaceholder", locale)}
          className="input pl-9 pr-20"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className={`text-xs font-semibold ${isDark ? "text-white/40" : "text-praxis-400"}`}>{patienten.length}</span>
            <button onClick={() => setSearch("")} className={`text-xs font-bold ${isDark ? "text-white/50 hover:text-white" : "text-praxis-400 hover:text-praxis-700"}`}>✕</button>
          </div>
        )}
      </div>

      <div className={`rounded-card border shadow-card ${isDark ? "border-white/6 bg-[rgba(16,18,28,0.75)]" : "border-surface-200 bg-white"}`}>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={isDark ? "bg-white/3" : "bg-surface-50"}>
              <th className="table-header">{t("patients.patientHeader", locale)}</th>
              <th className="table-header">{t("patients.age", locale)}</th>
              <th className="table-header">{t("patients.insurance", locale)}</th>
              <th className="table-header">{t("patients.treatment", locale)}</th>
              <th className="table-header">{t("patients.progress", locale)}</th>
              <th className="table-header text-right">{t("patients.monthlyRate", locale)}</th>
              <th className="table-header text-right">{t("patients.remainingDebt", locale)}</th>
              <th className="table-header">{t("patients.statusHeader", locale)}</th>
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
                  className={`cursor-pointer transition-colors ${isDark ? "hover:bg-white/3" : "hover:bg-surface-50/80"}`}
                  onClick={() => router.push(`/patienten/${p.id}`)}
                >
                  <td className="table-cell">
                    <Link href={`/patienten/${p.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-praxis-100 text-sm font-bold text-praxis-600">
                        {p.vorname?.[0]}
                        {p.nachname?.[0]}
                      </div>
                      <div>
                        <span className="text-[15px] leading-tight font-semibold text-praxis-800">
                          {p.nachname}, {p.vorname}
                        </span>
                        {(() => {
                          if (!p.geburtsdatum) return null;
                          const age = Math.floor((Date.now() - new Date(p.geburtsdatum).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                          const isChild = age < 18;
                          return (
                            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${isChild ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"}`}>
                              {isChild ? t("common.child", locale) : t("common.adult", locale)}
                            </span>
                          );
                        })()}
                      </div>
                    </Link>
                  </td>
                  <td className="table-cell text-sm text-praxis-600">
                    {p.geburtsdatum ? Math.floor((Date.now() - new Date(p.geburtsdatum).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "—"}
                  </td>
                  <td className="table-cell text-sm text-praxis-600">
                    {p.versicherung_status === "Family" ? t("insurance.family", locale)
                      : p.versicherung_status === "Statutory" ? t("insurance.gkv", locale)
                      : p.versicherung_status === "Private" ? t("insurance.pkv", locale)
                      : p.versicherung_status === "Retired" ? t("insurance.retired", locale)
                      : p.kasse === "gesetzlich" ? t("insurance.gkv", locale) : t("insurance.pkv", locale)}
                  </td>
                  <td className="table-cell text-sm text-praxis-600">{p.behandlung || "—"}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="flex max-w-[360px] flex-wrap gap-1">{progressBlocks(total, bezahlt, hasOverdue)}</div>
                      <span className="text-sm font-medium text-praxis-400">{bezahlt}/{total}</span>
                    </div>
                  </td>
                  <td className="table-cell text-right text-[18px] font-semibold text-praxis-800">{rateMonat.toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€</td>
                  <td className="table-cell text-right text-[18px] font-semibold text-accent-coral">{rest.toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€</td>
                  <td className="table-cell relative overflow-visible">
                    {renderStatusBadge({
                      status,
                      patientId: p.id,
                      restschuld: rest,
                      raten,
                      router,
                      statusPopoverFor,
                      statusPopoverPos,
                      setStatusPopoverFor,
                      setStatusPopoverPos,
                      locale,
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
            title={t("patients.emptyFound", locale)}
            description={search ? t("patients.tryOtherSearch", locale) : t("patients.noneCreated", locale)}
            action={<button className="btn-primary" onClick={() => setCreateOpen(true)}>{t("patients.createFirst", locale)}</button>}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setErrorMsg("");
        }}
        title={t("patients.newModalTitle", locale)}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label={t("patients.firstName", locale)} value={form.vorname} onChange={(value) => setForm((prev) => ({ ...prev, vorname: value }))} />
            <FormField label={t("patients.lastName", locale)} value={form.nachname} onChange={(value) => setForm((prev) => ({ ...prev, nachname: value }))} />
            <DateField label={t("patients.birthdateReq", locale)} value={form.geburtsdatum} onChange={(value) => setForm((prev) => ({ ...prev, geburtsdatum: value }))} />

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-praxis-500">{t("patients.insuranceReq", locale)}</span>
              <select className="input" value={form.kasse} onChange={(e) => setForm((prev) => ({ ...prev, kasse: e.target.value }))}>
                <option value="privat">{t("patients.private", locale)}</option>
                <option value="gesetzlich">{t("patients.statutory", locale)}</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-praxis-500">{t("patients.treatmentReq", locale)}</span>
              <select className="input" value={form.behandlung} onChange={(e) => setForm((prev) => ({ ...prev, behandlung: e.target.value }))}>
                <option value="">{t("patients.pleaseSelect", locale)}</option>
                {["Beratung", "KFO", "Plan", "Nachkontrolle", "Retention", "Abgeschlossen"].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <DateField label={t("patients.treatmentStart", locale)} value={form.behandlung_start} onChange={(value) => setForm((prev) => ({ ...prev, behandlung_start: value }))} />
            <FormField label={t("patients.email", locale)} value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} />
            <FormField label={t("patients.phone", locale)} value={form.telefon} onChange={(value) => setForm((prev) => ({ ...prev, telefon: value }))} />
          </div>

          {errorMsg && <p className="text-sm text-accent-coral">{errorMsg}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>{t("common.cancel", locale)}</button>
            <button className="btn-primary" onClick={handleCreatePatient} disabled={saving}>{saving ? t("patients.creating", locale) : t("patients.createBtn", locale)}</button>
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
  statusPopoverFor,
  statusPopoverPos,
  setStatusPopoverFor,
  setStatusPopoverPos,
  locale,
}: {
  status: string;
  patientId: string;
  restschuld: number;
  raten: any[];
  router: ReturnType<typeof useRouter>;
  statusPopoverFor: string | null;
  statusPopoverPos: { left: number; top: number } | null;
  setStatusPopoverFor: Dispatch<SetStateAction<string | null>>;
  setStatusPopoverPos: Dispatch<SetStateAction<{ left: number; top: number } | null>>;
  locale: string;
}) {
  const mahnrelevant = ["stufe1", "verzug", "eskalation", "abweichung"].includes(status);

  const ueberfaellig = raten
    .filter((r) => r.status === "überfällig")
    .sort((a, b) => new Date(a.faellig_am).getTime() - new Date(b.faellig_am).getTime());
  const first = ueberfaellig[0];
  const dueDate = first?.faellig_am ? new Date(first.faellig_am) : null;
  const daysLate = dueDate ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24))) : 0;
  const dueLabel = dueDate ? dueDate.toLocaleDateString(locale === "en" ? "en-GB" : "de-DE") : "—";
  const isOpen = statusPopoverFor === patientId;
  const setPopoverPosition = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const width = 300;
    const margin = 12;
    const left = Math.min(rect.left, window.innerWidth - width - margin);
    const top = rect.bottom + 8;
    setStatusPopoverPos({ left: Math.max(margin, left), top });
  };

  return (
    <div
      className="relative inline-flex flex-col items-start gap-1"
      onMouseEnter={(e) => {
        setPopoverPosition(e.currentTarget);
        setStatusPopoverFor(patientId);
      }}
      onMouseLeave={() => setStatusPopoverFor((curr) => (curr === patientId ? null : curr))}
    >
      <button
        type="button"
        className="cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          if (mahnrelevant) router.push(`/mahnwesen?patient=${patientId}`);
          else {
            setPopoverPosition(e.currentTarget);
            setStatusPopoverFor((curr) => (curr === patientId ? null : patientId));
          }
        }}
      >
        <StatusBadge status={status} />
      </button>
      <button
        type="button"
        className="text-[11px] font-semibold text-[#4b42d6] hover:text-[#392fb8]"
        onClick={(e) => {
          e.stopPropagation();
          setPopoverPosition(e.currentTarget);
          setStatusPopoverFor((curr) => (curr === patientId ? null : patientId));
        }}
      >
        {t("patients.details", locale)}
      </button>
      {isOpen && statusPopoverPos && (
        <div
          className="fixed z-[100] w-[300px] rounded-lg border border-surface-200 bg-white p-3 text-left text-sm text-praxis-600 shadow-elevated"
          style={{ left: statusPopoverPos.left, top: statusPopoverPos.top }}
          onMouseEnter={() => setStatusPopoverFor(patientId)}
          onMouseLeave={() => setStatusPopoverFor((curr) => (curr === patientId ? null : curr))}
        >
          {mahnrelevant ? (
            <>
              <p><span className="font-semibold text-praxis-700">{t("patients.popover.remainingDebt", locale)}</span> {restschuld.toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€</p>
              <p><span className="font-semibold text-praxis-700">{t("patients.popover.dueSince", locale)}</span> {dueLabel}</p>
              <p><span className="font-semibold text-praxis-700">{t("patients.popover.delayDays", locale)}</span> {daysLate}</p>
              <p className="mt-2 text-xs text-praxis-500">{t("patients.popover.clickDunning", locale)}</p>
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-[#4b42d6] hover:text-[#392fb8]"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/mahnwesen?patient=${patientId}`);
                }}
              >
                {t("patients.popover.toDunning", locale)}
              </button>
            </>
          ) : (
            <>
              <p className="font-semibold text-praxis-700">{t("patients.popover.noActiveCase", locale)}</p>
              <p className="mt-1 text-praxis-500">{t("patients.popover.notOverdue", locale)}</p>
            </>
          )}
        </div>
      )}
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
