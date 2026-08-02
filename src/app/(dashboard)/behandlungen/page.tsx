"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

const DEFAULT_BEHANDLUNGSARTEN = [
  "Aligner",
  "Multiband",
  "Herausnehmbare Spange",
  "Funktionskieferorthop.",
  "Retention",
  "Noch in Beratung",
  "Kein Patient mehr",
] as const;

const BEHANDLUNGSARTEN_KEY = "behandlungen_arten";

type TreatmentStatusFilter = "alle" | "aktiv" | "pausiert" | "abgeschlossen";
type AssignmentFilter = "offen" | "alle";

type Patient = {
  id: string;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  behandlungsart: string | null;
  behandlung_status: "aktiv" | "pausiert" | "abgeschlossen" | null;
};

function normalizeOption(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export default function BehandlungenPage() {
  const { locale, theme } = useAppStore();
  const isDark = theme === "dark";
  const supabase = createBrowserClient();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("offen");
  const [statusFilter, setStatusFilter] = useState<TreatmentStatusFilter>("alle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);
  const [treatmentOptions, setTreatmentOptions] = useState<string[]>([
    ...DEFAULT_BEHANDLUNGSARTEN,
  ]);
  const [newTreatmentOption, setNewTreatmentOption] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const sortOptions = useCallback((values: string[]) => {
    return Array.from(new Set(values.map(normalizeOption).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "de")
    );
  }, []);

  const loadTreatmentOptions = useCallback(async () => {
    const { data } = await supabase
      .from("einstellungen")
      .select("value")
      .eq("key", BEHANDLUNGSARTEN_KEY)
      .maybeSingle();

    const remoteValues = Array.isArray(data?.value)
      ? (data.value as unknown[])
          .map((entry) => normalizeOption(String(entry || "")))
          .filter(Boolean)
      : [];

    setTreatmentOptions(sortOptions([...DEFAULT_BEHANDLUNGSARTEN, ...remoteValues]));
  }, [sortOptions, supabase]);

  const persistTreatmentOptions = useCallback(
    async (nextValues: string[]) => {
      const normalized = sortOptions(nextValues);
      setTreatmentOptions(normalized);

      await supabase.from("einstellungen").upsert(
        {
          key: BEHANDLUNGSARTEN_KEY,
          value: normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    },
    [sortOptions, supabase]
  );

  const addTreatmentOption = useCallback(
    async (rawValue: string) => {
      const nextValue = normalizeOption(rawValue);
      if (!nextValue) return;
      if (treatmentOptions.some((entry) => entry.toLowerCase() === nextValue.toLowerCase())) {
        setNewTreatmentOption("");
        return;
      }

      await persistTreatmentOptions([...treatmentOptions, nextValue]);
      setNewTreatmentOption("");
    },
    [persistTreatmentOptions, treatmentOptions]
  );

  const removeTreatmentOption = useCallback(
    async (value: string) => {
      await persistTreatmentOptions(treatmentOptions.filter((entry) => entry !== value));
    },
    [persistTreatmentOptions, treatmentOptions]
  );

  const fetchPatients = useCallback(async () => {
    setLoading(true);

    const selectBase =
      "id, vorname, nachname, geburtsdatum, behandlungsart, behandlung_status";

    let countQuery = supabase.from("patients").select(selectBase, { count: "exact" });

    if (statusFilter !== "alle") {
      countQuery = countQuery.eq("behandlung_status", statusFilter);
    }

    if (search.trim().length >= 2) {
      countQuery = countQuery.or(
        `nachname.ilike.%${search.trim()}%,vorname.ilike.%${search.trim()}%`
      );
    }

    const { data: scopedPatients, count } = await countQuery.limit(5000);
    const scoped = (scopedPatients || []) as Patient[];
    const scopedOpenCount = scoped.filter((patient) => !patient.behandlungsart).length;

    setTotalCount(count ?? scoped.length);
    setOpenCount(scopedOpenCount);
    setAssignedCount(scoped.length - scopedOpenCount);

    let query = supabase
      .from("patients")
      .select(selectBase)
      .order("nachname", { ascending: true })
      .limit(500);

    if (assignmentFilter === "offen") {
      query = query.is("behandlungsart", null);
    }

    if (statusFilter !== "alle") {
      query = query.eq("behandlung_status", statusFilter);
    }

    if (search.trim().length >= 2) {
      query = query.or(
        `nachname.ilike.%${search.trim()}%,vorname.ilike.%${search.trim()}%`
      );
    }

    const { data } = await query;
    const nextPatients = (data || []) as Patient[];
    setPatients(nextPatients);
    setDrafts(
      Object.fromEntries(nextPatients.map((patient) => [patient.id, patient.behandlungsart || ""]))
    );
    setLoading(false);
  }, [assignmentFilter, search, statusFilter, supabase]);

  useEffect(() => {
    void fetchPatients();
  }, [fetchPatients]);

  useEffect(() => {
    void loadTreatmentOptions();
  }, [loadTreatmentOptions]);

  const updateBehandlungsart = async (patientId: string, value: string) => {
    const normalizedValue = normalizeOption(value);
    const existingPatient = patients.find((patient) => patient.id === patientId) || null;

    if (
      normalizedValue &&
      !treatmentOptions.some((entry) => entry.toLowerCase() === normalizedValue.toLowerCase())
    ) {
      await persistTreatmentOptions([...treatmentOptions, normalizedValue]);
    }

    const { error } = await supabase
      .from("patients")
      .update({
        behandlungsart: normalizedValue || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", patientId);

    if (error) return;

    setSavedId(patientId);
    setTimeout(() => setSavedId(null), 2000);
    setDrafts((prev) => ({ ...prev, [patientId]: normalizedValue }));

    const wasOpen = !existingPatient?.behandlungsart;
    const isOpenNow = !normalizedValue;

    setPatients((prev) =>
      prev.map((patient) =>
        patient.id === patientId
          ? { ...patient, behandlungsart: normalizedValue || null }
          : patient
      )
    );

    if (wasOpen && !isOpenNow) {
      setOpenCount((current) => Math.max(0, current - 1));
      setAssignedCount((current) => current + 1);
    } else if (!wasOpen && isOpenNow) {
      setOpenCount((current) => current + 1);
      setAssignedCount((current) => Math.max(0, current - 1));
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return "";
    try {
      return new Date(value).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return value;
    }
  };

  const statusFilterOptions = useMemo(
    () => [
      { key: "alle" as const, label: locale === "de" ? "Alle Status" : "All statuses" },
      { key: "aktiv" as const, label: t("common.active", locale) },
      { key: "pausiert" as const, label: locale === "de" ? "Pausiert" : "Paused" },
      { key: "abgeschlossen" as const, label: locale === "de" ? "Abgeschlossen" : "Completed" },
    ],
    [locale]
  );

  const assignmentFilterOptions = useMemo(
    () => [
      { key: "offen" as const, label: locale === "de" ? "Nur offene" : "Open only" },
      { key: "alle" as const, label: locale === "de" ? "Alle" : "All" },
    ],
    [locale]
  );

  const statusLabel = (status: Patient["behandlung_status"]) => {
    if (status === "aktiv") return t("common.active", locale);
    if (status === "pausiert") return locale === "de" ? "Pausiert" : "Paused";
    if (status === "abgeschlossen") return locale === "de" ? "Abgeschlossen" : "Completed";
    return "—";
  };

  return (
    <div className="mx-auto max-w-[960px] px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
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

      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          {
            num: totalCount,
            label: locale === "de" ? "Patienten im Filter" : "Patients in filter",
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
        ].map((stat) => (
          <div
            key={stat.label}
            className={`rounded-xl border p-4 ${
              isDark ? "border-white/8 bg-white/5" : "border-surface-200 bg-white"
            }`}
          >
            <div className="text-2xl font-bold" style={{ color: stat.color }}>
              {stat.num.toLocaleString("de-DE")}
            </div>
            <div
              className={`mt-0.5 text-xs ${
                isDark ? "text-white/40" : "text-praxis-400"
              }`}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {statusFilterOptions.map((option) => {
          const active = statusFilter === option.key;
          return (
            <button
              key={option.key}
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                active
                  ? isDark
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-emerald-500/30 bg-emerald-50 text-emerald-600"
                  : isDark
                  ? "border-white/10 bg-white/5 text-white/55 hover:text-white/80"
                  : "border-surface-200 bg-white text-praxis-400 hover:text-praxis-700"
              }`}
              onClick={() => setStatusFilter(option.key)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>

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
              locale === "de" ? "Patient suchen (Name)..." : "Search patient (name)..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {assignmentFilterOptions.map((option) => {
          const active = assignmentFilter === option.key;
          return (
            <button
              key={option.key}
              className={`rounded-lg border px-4 text-xs font-semibold transition ${
                active
                  ? isDark
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-emerald-500/30 bg-emerald-50 text-emerald-600"
                  : isDark
                  ? "border-white/10 bg-white/5 text-white/50 hover:text-white/70"
                  : "border-surface-200 bg-white text-praxis-400 hover:text-praxis-600"
              }`}
              onClick={() => setAssignmentFilter(option.key)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div
        className={`mb-4 rounded-xl border p-4 ${
          isDark ? "border-white/8 bg-white/[0.03]" : "border-surface-200 bg-white"
        }`}
      >
        <div className={`mb-3 text-sm font-semibold ${isDark ? "text-white" : "text-praxis-800"}`}>
          {locale === "de" ? "Behandlungsarten verwalten" : "Manage treatment types"}
        </div>
        <div className={`mb-3 text-xs ${isDark ? "text-white/35" : "text-praxis-400"}`}>
          {locale === "de"
            ? "Neue Arten können ergänzt und aus der Vorschlagsliste wieder entfernt werden."
            : "Add new types and remove them from the suggestion list."}
        </div>
        <div className="mb-3 flex gap-2">
          <input
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              isDark
                ? "border-white/10 bg-white/5 text-white placeholder:text-white/25"
                : "border-surface-200 bg-white text-praxis-800 placeholder:text-praxis-300"
            }`}
            placeholder={locale === "de" ? "Neue Behandlungsart hinzufügen..." : "Add treatment type..."}
            value={newTreatmentOption}
            onChange={(e) => setNewTreatmentOption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addTreatmentOption(newTreatmentOption);
              }
            }}
          />
          <button
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
              isDark
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-emerald-500/30 bg-emerald-50 text-emerald-700"
            }`}
            onClick={() => void addTreatmentOption(newTreatmentOption)}
            type="button"
          >
            <Plus size={14} />
            {locale === "de" ? "Hinzufügen" : "Add"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {treatmentOptions.map((option) => (
            <span
              key={option}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                isDark
                  ? "border-white/10 bg-white/5 text-white/75"
                  : "border-surface-200 bg-surface-50 text-praxis-700"
              }`}
            >
              {option}
              <button
                className={isDark ? "text-white/40 hover:text-white/80" : "text-praxis-300 hover:text-praxis-700"}
                onClick={() => void removeTreatmentOption(option)}
                type="button"
                aria-label={`${option} entfernen`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div
        className={`overflow-hidden rounded-xl border ${
          isDark ? "border-white/8 bg-white/[0.03]" : "border-surface-200 bg-white"
        }`}
      >
        <div
          className={`grid grid-cols-[2fr_1fr_1fr_2fr_80px] gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider max-sm:hidden ${
            isDark ? "bg-white/5 text-white/35" : "bg-surface-50 text-praxis-400"
          }`}
        >
          <span>Patient</span>
          <span>Status</span>
          <span>{locale === "de" ? "Behandlungsstatus" : "Treatment status"}</span>
          <span>{locale === "de" ? "Behandlungsart" : "Treatment"}</span>
          <span />
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className={`text-sm ${isDark ? "text-white/30" : "text-praxis-400"}`}>
              {locale === "de" ? "Wird geladen..." : "Loading..."}
            </div>
          </div>
        ) : patients.length === 0 ? (
          <div className="py-16 text-center">
            <div className={`text-sm ${isDark ? "text-white/30" : "text-praxis-400"}`}>
              {locale === "de" ? "Keine Patienten gefunden" : "No patients found"}
            </div>
          </div>
        ) : (
          patients.map((patient) => {
            const isOpen = !patient.behandlungsart;

            return (
              <div
                key={patient.id}
                className={`grid grid-cols-1 gap-2 border-b px-4 py-3 transition sm:grid-cols-[2fr_1fr_1fr_2fr_80px] sm:items-center sm:gap-3 ${
                  isDark
                    ? "border-white/5 hover:bg-white/[0.03]"
                    : "border-surface-100 hover:bg-surface-50"
                } last:border-b-0`}
              >
                <div>
                  <div className={`text-sm font-semibold ${isDark ? "text-white" : "text-praxis-800"}`}>
                    {patient.nachname || "?"}, {patient.vorname || "?"}
                  </div>
                  <div className={`text-xs ${isDark ? "text-white/30" : "text-praxis-400"}`}>
                    {patient.geburtsdatum ? `geb. ${formatDate(patient.geburtsdatum)}` : ""}
                  </div>
                </div>

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

                <div className={`text-xs ${isDark ? "text-white/50" : "text-praxis-500"}`}>
                  {statusLabel(patient.behandlung_status)}
                </div>

                <div>
                  <div className="flex gap-2">
                    <input
                      list={`behandlungsarten-${patient.id}`}
                      className={`w-full rounded-lg border px-3 py-2 text-[13px] transition ${
                        drafts[patient.id]
                          ? isDark
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-emerald-500/30 bg-emerald-50 text-emerald-700"
                          : isDark
                          ? "border-white/10 bg-white/5 text-white/60"
                          : "border-surface-200 bg-white text-praxis-600"
                      }`}
                      value={drafts[patient.id] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [patient.id]: e.target.value }))
                      }
                      onBlur={() =>
                        void updateBehandlungsart(patient.id, drafts[patient.id] ?? "")
                      }
                      placeholder={
                        locale === "de" ? "Bitte zuordnen..." : "Please assign..."
                      }
                    />
                    <datalist id={`behandlungsarten-${patient.id}`}>
                      {treatmentOptions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                    <button
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        isDark
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-emerald-500/30 bg-emerald-50 text-emerald-700"
                      }`}
                      onClick={() =>
                        void updateBehandlungsart(patient.id, drafts[patient.id] ?? "")
                      }
                      type="button"
                    >
                      {locale === "de" ? "Speichern" : "Save"}
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {treatmentOptions.slice(0, 6).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`rounded-full border px-2 py-1 text-[11px] ${
                          isDark
                            ? "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                            : "border-surface-200 bg-surface-50 text-praxis-500 hover:bg-surface-100 hover:text-praxis-800"
                        }`}
                        onClick={() => {
                          setDrafts((prev) => ({ ...prev, [patient.id]: option }));
                          void updateBehandlungsart(patient.id, option);
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-right">
                  {savedId === patient.id && (
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
