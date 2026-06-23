"use client";

import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

const BEHANDLUNGSARTEN = [
  "Aligner",
  "Multiband",
  "Herausnehmbare Spange",
  "Funktionskieferorthop.",
  "Retention",
  "Noch in Beratung",
  "Kein Patient mehr",
] as const;

type Patient = {
  id: string;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  behandlungsart: string | null;
};

export default function BehandlungenPage() {
  const { locale, theme } = useAppStore();
  const isDark = theme === "dark";
  const supabase = createBrowserClient();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [openCount, setOpenCount] = useState(0);

  const fetchPatients = useCallback(async () => {
    setLoading(true);

    // Counts
    const { count: total } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true });
    setTotalCount(total || 0);

    const { count: open } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .is("behandlungsart", null);
    setOpenCount(open || 0);

    // Fetch patients
    let query = supabase
      .from("patients")
      .select("id, vorname, nachname, geburtsdatum, behandlungsart")
      .order("nachname", { ascending: true })
      .limit(200);

    if (filterOpen) {
      query = query.is("behandlungsart", null);
    }

    if (search.trim().length >= 2) {
      query = query.or(
        `nachname.ilike.%${search.trim()}%,vorname.ilike.%${search.trim()}%`
      );
    }

    const { data } = await query;
    setPatients(data || []);
    setLoading(false);
  }, [supabase, search, filterOpen]);

  useEffect(() => {
    void fetchPatients();
  }, [fetchPatients]);

  const updateBehandlungsart = async (patientId: string, value: string) => {
    const { error } = await supabase
      .from("patients")
      .update({
        behandlungsart: value || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", patientId);

    if (!error) {
      setSavedId(patientId);
      setTimeout(() => setSavedId(null), 2000);
      setPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? { ...p, behandlungsart: value || null } : p
        )
      );
      // Update counts
      if (value) setOpenCount((c) => Math.max(0, c - 1));
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  const assignedCount = totalCount - openCount;

  return (
    <div className="mx-auto max-w-[960px] px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1
            className={`text-2xl font-bold ${
              isDark ? "text-white" : "text-praxis-800"
            }`}
          >
            {locale === "de" ? "Behandlungen" : "Treatments"}
          </h1>
          <p
            className={`mt-1 text-sm ${
              isDark ? "text-white/50" : "text-praxis-400"
            }`}
          >
            {locale === "de"
              ? "Behandlungsart pro Patient zuordnen"
              : "Assign treatment type per patient"}
          </p>
        </div>
        {openCount > 0 && (
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: "rgba(230,179,71,0.12)",
              color: "#e6b347",
            }}
          >
            {openCount} {locale === "de" ? "offen" : "open"}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          {
            num: totalCount,
            label: locale === "de" ? "Patienten gesamt" : "Total patients",
            color: isDark ? "#5fd0a8" : "#23b08f",
          },
          {
            num: openCount,
            label: locale === "de" ? "Ohne Behandlungsart" : "Unassigned",
            color: "#e6b347",
          },
          {
            num: assignedCount,
            label: locale === "de" ? "Zugeordnet" : "Assigned",
            color: "#23b08f",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-xl border p-4 ${
              isDark
                ? "border-white/8 bg-white/5"
                : "border-surface-200 bg-white"
            }`}
          >
            <div className="text-2xl font-bold" style={{ color: s.color }}>
              {s.num.toLocaleString("de-DE")}
            </div>
            <div
              className={`mt-0.5 text-xs ${
                isDark ? "text-white/40" : "text-praxis-400"
              }`}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search
            size={15}
            className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${
              isDark ? "text-white/30" : "text-praxis-400"
            }`}
          />
          <input
            className={`w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm ${
              isDark
                ? "border-white/10 bg-white/5 text-white placeholder:text-white/25"
                : "border-surface-200 bg-white text-praxis-800 placeholder:text-praxis-300"
            }`}
            placeholder={
              locale === "de"
                ? "Patient suchen (Name)..."
                : "Search patient (name)..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className={`rounded-lg border px-4 text-xs font-semibold transition ${
            filterOpen
              ? isDark
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-emerald-500/30 bg-emerald-50 text-emerald-600"
              : isDark
              ? "border-white/10 bg-white/5 text-white/50 hover:text-white/70"
              : "border-surface-200 bg-white text-praxis-400 hover:text-praxis-600"
          }`}
          onClick={() => setFilterOpen(!filterOpen)}
        >
          {locale === "de" ? "Nur offene" : "Open only"}
        </button>
        <button
          className={`rounded-lg border px-4 text-xs font-semibold transition ${
            !filterOpen
              ? isDark
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-emerald-500/30 bg-emerald-50 text-emerald-600"
              : isDark
              ? "border-white/10 bg-white/5 text-white/50 hover:text-white/70"
              : "border-surface-200 bg-white text-praxis-400 hover:text-praxis-600"
          }`}
          onClick={() => setFilterOpen(false)}
        >
          {locale === "de" ? "Alle" : "All"}
        </button>
      </div>

      {/* Table */}
      <div
        className={`overflow-hidden rounded-xl border ${
          isDark ? "border-white/8 bg-white/[0.03]" : "border-surface-200 bg-white"
        }`}
      >
        {/* Header */}
        <div
          className={`grid grid-cols-[2fr_1fr_2fr_80px] gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider max-sm:hidden ${
            isDark ? "bg-white/5 text-white/35" : "bg-surface-50 text-praxis-400"
          }`}
        >
          <span>Patient</span>
          <span>Status</span>
          <span>{locale === "de" ? "Behandlungsart" : "Treatment"}</span>
          <span />
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div
              className={`text-sm ${
                isDark ? "text-white/30" : "text-praxis-400"
              }`}
            >
              {locale === "de" ? "Wird geladen..." : "Loading..."}
            </div>
          </div>
        ) : patients.length === 0 ? (
          <div className="py-16 text-center">
            <div
              className={`text-sm ${
                isDark ? "text-white/30" : "text-praxis-400"
              }`}
            >
              {locale === "de"
                ? "Keine Patienten gefunden"
                : "No patients found"}
            </div>
          </div>
        ) : (
          patients.map((p) => {
            const isOpen = !p.behandlungsart;
            return (
              <div
                key={p.id}
                className={`grid grid-cols-1 gap-2 border-b px-4 py-3 transition sm:grid-cols-[2fr_1fr_2fr_80px] sm:items-center sm:gap-3 ${
                  isDark
                    ? "border-white/5 hover:bg-white/[0.03]"
                    : "border-surface-100 hover:bg-surface-50"
                } last:border-b-0`}
              >
                {/* Name */}
                <div>
                  <div
                    className={`text-sm font-semibold ${
                      isDark ? "text-white" : "text-praxis-800"
                    }`}
                  >
                    {p.nachname || "?"}, {p.vorname || "?"}
                  </div>
                  <div
                    className={`text-xs ${
                      isDark ? "text-white/30" : "text-praxis-400"
                    }`}
                  >
                    {p.geburtsdatum ? `geb. ${formatDate(p.geburtsdatum)}` : ""}
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      background: isOpen ? "#e6b347" : "#23b08f",
                      boxShadow: isOpen
                        ? "0 0 6px rgba(230,179,71,0.3)"
                        : "0 0 6px rgba(35,176,143,0.3)",
                    }}
                  />
                  <span className={isDark ? "text-white/50" : "text-praxis-400"}>
                    {isOpen
                      ? locale === "de"
                        ? "Offen"
                        : "Open"
                      : locale === "de"
                      ? "Zugeordnet"
                      : "Assigned"}
                  </span>
                </div>

                {/* Dropdown */}
                <div>
                  <select
                    className={`w-full appearance-none rounded-lg border px-3 py-2 text-[13px] transition ${
                      p.behandlungsart
                        ? isDark
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-emerald-500/30 bg-emerald-50 text-emerald-700"
                        : isDark
                        ? "border-white/10 bg-white/5 text-white/60"
                        : "border-surface-200 bg-white text-praxis-600"
                    }`}
                    value={p.behandlungsart || ""}
                    onChange={(e) =>
                      void updateBehandlungsart(p.id, e.target.value)
                    }
                  >
                    <option value="">
                      {locale === "de"
                        ? "Bitte zuordnen..."
                        : "Please assign..."}
                    </option>
                    {BEHANDLUNGSARTEN.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Saved indicator */}
                <div className="text-right">
                  {savedId === p.id && (
                    <span className="text-[11px] font-semibold text-emerald-400">
                      {locale === "de" ? "Gespeichert" : "Saved"}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
