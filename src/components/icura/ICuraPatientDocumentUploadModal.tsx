"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Upload, X } from "lucide-react";
import {
  patientDocumentTypeOptions,
  type PatientDocumentTypeOption,
} from "@/lib/patient-document-types";

type PatientSearchResult = {
  id: string;
  name: string;
  email?: string;
  ivoris_nummer?: string | null;
  geburtsdatum?: string | null;
};

type UploadModalPrefill = {
  patientId?: string | null;
  patientName?: string | null;
  patientQuery?: string | null;
};

export default function ICuraPatientDocumentUploadModal({
  open,
  onClose,
  prefill,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: UploadModalPrefill | null;
  onUploaded?: (payload: { patientName: string; documentName: string; type: PatientDocumentTypeOption }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [documentType, setDocumentType] = useState(patientDocumentTypeOptions[0]?.value ?? "sonstiges");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  const selectedType = useMemo(
    () =>
      patientDocumentTypeOptions.find((option) => option.value === documentType) ??
      patientDocumentTypeOptions[0],
    [documentType],
  );

  const displayFileName = file?.name ?? "";
  const resolvedDocumentName = useMemo(() => {
    const trimmed = documentName.trim();
    if (trimmed) return trimmed;
    return displayFileName.replace(/\.[^.]+$/, "").trim();
  }, [displayFileName, documentName]);

  const closeAndReset = useCallback(() => {
    setResults([]);
    setSearching(false);
    setSubmitting(false);
    setErrorText(null);
    setSuccessText(null);
    setDocumentName("");
    setDocumentType(patientDocumentTypeOptions[0]?.value ?? "sonstiges");
    setFile(null);
    setSelectedPatient(null);
    setQuery("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      return;
    }

    const initialQuery = prefill?.patientName?.trim() || prefill?.patientQuery?.trim() || "";
    setQuery(initialQuery);
    setErrorText(null);
    setSuccessText(null);
    setFile(null);
    setDocumentName("");
    setDocumentType(patientDocumentTypeOptions[0]?.value ?? "sonstiges");

    if (prefill?.patientId && prefill.patientName) {
      setSelectedPatient({
        id: prefill.patientId,
        name: prefill.patientName,
      });
    } else {
      setSelectedPatient(null);
    }
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return;

    if (query.trim().length < 2) {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      setResults([]);
      setSearching(false);
      if (!prefill?.patientId || query.trim() !== prefill?.patientName?.trim()) {
        setSelectedPatient(null);
      }
      return;
    }

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(async () => {
      activeRequestRef.current?.abort();
      const controller = new AbortController();
      activeRequestRef.current = controller;
      setSearching(true);
      setErrorText(null);

      try {
        const response = await fetch(`/api/praxis/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Patientensuche konnte nicht geladen werden.");
        }
        const payload = await response.json();
        const nextResults = Array.isArray(payload.results) ? payload.results : [];
        setResults(nextResults);

        if (selectedPatient && !nextResults.some((entry: PatientSearchResult) => entry.id === selectedPatient.id)) {
          setSelectedPatient(null);
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setErrorText(error instanceof Error ? error.message : "Patientensuche ist fehlgeschlagen.");
        setResults([]);
      } finally {
        if (activeRequestRef.current === controller) {
          activeRequestRef.current = null;
        }
        setSearching(false);
      }
    }, 220);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [open, prefill?.patientId, prefill?.patientName, query, selectedPatient]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeAndReset();
      }
    }

    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKeyDown);
    }

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeAndReset, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPatient) {
      setErrorText("Bitte zuerst den passenden Patienten auswählen.");
      return;
    }
    if (!file) {
      setErrorText("Bitte eine Datei auswählen.");
      return;
    }
    if (!resolvedDocumentName) {
      setErrorText("Bitte einen Dokumentnamen angeben oder eine Datei mit Namen wählen.");
      return;
    }

    setSubmitting(true);
    setErrorText(null);
    setSuccessText(null);

    try {
      const formData = new FormData();
      formData.append("patient_id", selectedPatient.id);
      formData.append("name", resolvedDocumentName);
      formData.append("typ", documentType);
      formData.append("file", file);

      const response = await fetch("/api/patient/admin/dokumente", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Dokument konnte nicht gespeichert werden.");
      }

      setSuccessText(`Dokument wurde bei ${selectedPatient.name} gespeichert.`);
      onUploaded?.({
        patientName: selectedPatient.name,
        documentName: resolvedDocumentName,
        type: selectedType,
      });
      window.setTimeout(() => {
        closeAndReset();
      }, 900);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Dokument konnte nicht gespeichert werden.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="wf-modal-backdrop" onClick={closeAndReset}>
      <div
        className="wf-modal wf-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="icura-document-upload-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="wf-modal-head flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-text-soft)]">
              iCura Assist
            </div>
            <h2 id="icura-document-upload-title" className="mt-2 text-2xl font-semibold text-[var(--ac-text)]">
              Dokument einem Patienten zuordnen
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ac-text-soft)]">
              Tipp: Den Patientennamen am besten eintippen, damit iCura keine Diktierfehler übernimmt.
              Danach Dokumenttyp wählen, Datei anhängen und direkt in die Patienten-App übertragen.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ac-border)] bg-transparent text-[var(--ac-text-soft)] transition hover:border-[var(--ac-primary)] hover:text-[var(--ac-text)]"
            onClick={closeAndReset}
            aria-label="Dialog schließen"
          >
            <X size={18} />
          </button>
        </div>

        <form className="space-y-6 p-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-elevated)] p-5">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ac-text-soft)]">
                Patient suchen
              </label>
              <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-[var(--ac-border)] bg-[var(--ac-surface)] px-4 py-3">
                <Search size={18} className="text-[var(--ac-text-soft)]" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSuccessText(null);
                  }}
                  placeholder="Patientenname oder IVORIS-Nummer"
                  className="w-full bg-transparent text-base text-[var(--ac-text)] outline-none placeholder:text-[var(--ac-text-soft)]"
                />
                {searching ? <Loader2 size={16} className="animate-spin text-[var(--ac-primary)]" /> : null}
              </div>

              <div className="mt-3 rounded-[18px] border border-[var(--ac-border)] bg-[var(--ac-surface)] p-2">
                {results.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-[var(--ac-text-soft)]">
                    {query.trim().length < 2
                      ? "Mindestens 2 Zeichen eingeben."
                      : searching
                        ? "iCura sucht passende Patienten ..."
                        : "Noch kein Treffer. Namen am besten vollständig eintippen."}
                  </div>
                ) : (
                  <div className="max-h-[19rem] space-y-2 overflow-y-auto pr-1">
                    {results.map((patient) => {
                      const isActive = selectedPatient?.id === patient.id;
                      return (
                        <button
                          key={patient.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(patient);
                            setQuery(patient.name);
                            setErrorText(null);
                          }}
                          className={`w-full rounded-[16px] border px-4 py-3 text-left transition ${
                            isActive
                              ? "border-[var(--ac-primary)] bg-[color:rgba(96,118,255,0.12)]"
                              : "border-[var(--ac-border)] bg-transparent hover:border-[var(--ac-primary)]/60 hover:bg-[var(--ac-surface-elevated)]"
                          }`}
                        >
                          <div className="text-base font-semibold text-[var(--ac-text)]">{patient.name}</div>
                          <div className="mt-1 text-sm text-[var(--ac-text-soft)]">
                            {patient.ivoris_nummer ? `IVORIS ${patient.ivoris_nummer}` : "Keine IVORIS-Nummer"}
                            {patient.geburtsdatum ? ` · ${patient.geburtsdatum}` : ""}
                            {patient.email ? ` · ${patient.email}` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-elevated)] p-5">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ac-text-soft)]">
                Dokumentdetails
              </label>

              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 text-sm font-medium text-[var(--ac-text-soft)]">Dokumenttyp</div>
                  <select
                    value={documentType}
                    onChange={(event) => setDocumentType(event.target.value)}
                    className="w-full rounded-[16px] border border-[var(--ac-border)] bg-[var(--ac-surface)] px-4 py-3 text-base text-[var(--ac-text)] outline-none"
                  >
                    {patientDocumentTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 text-sm font-medium text-[var(--ac-text-soft)]">Dokumentname</div>
                  <input
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                    placeholder="z. B. Anfangsdiagnostik August 2026"
                    className="w-full rounded-[16px] border border-[var(--ac-border)] bg-[var(--ac-surface)] px-4 py-3 text-base text-[var(--ac-text)] outline-none placeholder:text-[var(--ac-text-soft)]"
                  />
                  <div className="mt-2 text-xs text-[var(--ac-text-soft)]">
                    Leer lassen ist okay. Dann übernimmt iCura den Dateinamen.
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-medium text-[var(--ac-text-soft)]">Datei</div>
                  <label className="flex min-h-[9rem] cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed border-[var(--ac-border)] bg-[var(--ac-surface)] px-4 py-5 text-center transition hover:border-[var(--ac-primary)]">
                    <Upload size={22} className="text-[var(--ac-primary)]" />
                    <div className="mt-3 text-base font-medium text-[var(--ac-text)]">
                      Datei auswählen
                    </div>
                    <div className="mt-1 text-sm text-[var(--ac-text-soft)]">
                      PDF, Bild oder anderes Dokument direkt an die Patientenakte und App hängen
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {displayFileName ? (
                    <div className="mt-3 rounded-[14px] border border-[var(--ac-border)] bg-[var(--ac-surface)] px-4 py-3 text-sm text-[var(--ac-text)]">
                      Gewählt: {displayFileName}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <div className="rounded-[20px] border border-[var(--ac-border)] bg-[var(--ac-surface-elevated)] px-5 py-4 text-sm text-[var(--ac-text-soft)]">
            <div className="font-medium text-[var(--ac-text)]">
              {selectedPatient ? `Ausgewählter Patient: ${selectedPatient.name}` : "Noch kein Patient ausgewählt"}
            </div>
            <div className="mt-1">
              {selectedPatient
                ? `${selectedType?.label ?? "Dokument"} wird nach dem Speichern direkt dem Patientenprofil zugeordnet.`
                : "Bitte zuerst links den richtigen Patienten auswählen."}
            </div>
          </div>

          {errorText ? (
            <div className="rounded-[16px] border border-[rgba(238,102,115,0.38)] bg-[rgba(238,102,115,0.12)] px-4 py-3 text-sm text-[var(--ac-danger,#ff8d98)]">
              {errorText}
            </div>
          ) : null}

          {successText ? (
            <div className="rounded-[16px] border border-[rgba(68,190,124,0.38)] bg-[rgba(68,190,124,0.12)] px-4 py-3 text-sm text-[var(--ac-success,#63d690)]">
              {successText}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--ac-text-soft)]">
              iCura Assistiert beim patientenbezogenen Dokument-Upload
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={closeAndReset}
                className="rounded-full border border-[var(--ac-border)] px-5 py-3 text-sm font-semibold text-[var(--ac-text-soft)] transition hover:text-[var(--ac-text)]"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={submitting || !selectedPatient || !file}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--ac-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Dokument hinzufügen
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
