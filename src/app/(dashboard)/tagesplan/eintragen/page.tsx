"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/db/supabase";

/**
 * /app/dashboard/tagesplan/eintragen/page.tsx
 *
 * Sabine trägt hier die Tagestermine ein.
 * Vorerst manuelle Eingabe (Option B).
 * Später ersetzt durch Ivoris-Termin-API oder Doctolib-Schnittstelle.
 */

interface TerminFormData {
  datum: string;
  uhrzeit: string;
  dauer_minuten: number;
  patient_name: string;
  patient_geburtsdatum: string;
  behandler: string;
  behandlung_art: string;
  ist_neupatient: boolean;
  notizen: string;
}

const INITIAL_FORM: TerminFormData = {
  datum: new Date().toISOString().split("T")[0],
  uhrzeit: "",
  dauer_minuten: 30,
  patient_name: "",
  patient_geburtsdatum: "",
  behandler: "Dr. Schubert",
  behandlung_art: "",
  ist_neupatient: false,
  notizen: "",
};

const BEHANDLUNG_OPTIONEN = [
  "Kontrolltermin",
  "Erstberatung",
  "Bogen-Wechsel",
  "Abdrücke",
  "Brackets setzen",
  "Brackets entfernen",
  "Retainer",
  "Aligner-Kontrolle",
  "Röntgen",
  "Sonstiges",
];

export default function TerminEintragen() {
  const supabase = createBrowserClient();
  const [form, setForm] = useState<TerminFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function updateField<K extends keyof TerminFormData>(
    key: K,
    value: TerminFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError("");
  }

  async function handleSave() {
    if (!form.patient_name.trim()) {
      setError("Patientenname fehlt");
      return;
    }
    if (!form.uhrzeit) {
      setError("Uhrzeit fehlt");
      return;
    }

    setSaving(true);
    setError("");

    // Versuche Patient in Supabase zu matchen
    let patientId: string | null = null;

    if (form.patient_name.trim()) {
      const nameParts = form.patient_name.trim().split(/\s+/);
      const nachname = nameParts[nameParts.length - 1];

      const { data: matches } = await supabase
        .from("patients")
        .select("id, vorname, nachname, geburtsdatum")
        .ilike("nachname", `%${nachname}%`)
        .limit(5);

      if (matches && matches.length === 1) {
        patientId = matches[0].id;
      } else if (matches && matches.length > 1 && form.patient_geburtsdatum) {
        const exactMatch = matches.find(
          (m) => m.geburtsdatum === form.patient_geburtsdatum
        );
        if (exactMatch) {
          patientId = exactMatch.id;
        }
      }
    }

    const { error: insertError } = await supabase
      .from("tagesplan_termine")
      .insert({
        datum: form.datum,
        uhrzeit: form.uhrzeit,
        dauer_minuten: form.dauer_minuten,
        patient_name: form.patient_name.trim(),
        patient_geburtsdatum: form.patient_geburtsdatum || null,
        patient_id: patientId,
        behandler: form.behandler,
        behandlung_art: form.behandlung_art || null,
        ist_neupatient: form.ist_neupatient,
        notizen: form.notizen || null,
        quelle: "manuell",
      });

    setSaving(false);

    if (insertError) {
      console.error("[eintragen] Insert error:", insertError);
      setError("Fehler beim Speichern: " + insertError.message);
      return;
    }

    setSaved(true);
    // Form zurücksetzen, Datum und Behandler behalten
    setForm((prev) => ({
      ...INITIAL_FORM,
      datum: prev.datum,
      behandler: prev.behandler,
    }));
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Termine eintragen</h1>

        {/* Datum */}
        <div style={styles.field}>
          <label style={styles.label}>Datum</label>
          <input
            type="date"
            value={form.datum}
            onChange={(e) => updateField("datum", e.target.value)}
            style={styles.input}
          />
        </div>

        {/* Uhrzeit + Dauer */}
        <div style={styles.row}>
          <div style={{ ...styles.field, flex: 1 }}>
            <label style={styles.label}>Uhrzeit</label>
            <input
              type="time"
              value={form.uhrzeit}
              onChange={(e) => updateField("uhrzeit", e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={{ ...styles.field, flex: 1 }}>
            <label style={styles.label}>Dauer (Min.)</label>
            <select
              value={form.dauer_minuten}
              onChange={(e) =>
                updateField("dauer_minuten", Number(e.target.value))
              }
              style={styles.input}
            >
              <option value={15}>15</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={45}>45</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
            </select>
          </div>
        </div>

        {/* Patient */}
        <div style={styles.field}>
          <label style={styles.label}>Patient</label>
          <input
            type="text"
            value={form.patient_name}
            onChange={(e) => updateField("patient_name", e.target.value)}
            placeholder="Nachname, Vorname"
            style={styles.input}
          />
        </div>

        {/* Geburtsdatum (optional, hilft beim Matching) */}
        <div style={styles.field}>
          <label style={styles.label}>
            Geburtsdatum{" "}
            <span style={styles.optional}>(hilft bei Zuordnung)</span>
          </label>
          <input
            type="date"
            value={form.patient_geburtsdatum}
            onChange={(e) =>
              updateField("patient_geburtsdatum", e.target.value)
            }
            style={styles.input}
          />
        </div>

        {/* Neupatient Toggle */}
        <div
          style={styles.toggleRow}
          onClick={() => updateField("ist_neupatient", !form.ist_neupatient)}
        >
          <div
            style={{
              ...styles.toggle,
              background: form.ist_neupatient ? "#2563eb" : "#d1d5db",
            }}
          >
            <div
              style={{
                ...styles.toggleKnob,
                transform: form.ist_neupatient
                  ? "translateX(20px)"
                  : "translateX(0)",
              }}
            />
          </div>
          <span style={styles.toggleLabel}>Neupatient</span>
        </div>

        {/* Behandler */}
        <div style={styles.field}>
          <label style={styles.label}>Behandler</label>
          <input
            type="text"
            value={form.behandler}
            onChange={(e) => updateField("behandler", e.target.value)}
            style={styles.input}
          />
        </div>

        {/* Behandlungsart */}
        <div style={styles.field}>
          <label style={styles.label}>Behandlungsart</label>
          <div style={styles.chipContainer}>
            {BEHANDLUNG_OPTIONEN.map((opt) => (
              <button
                key={opt}
                onClick={() => updateField("behandlung_art", opt)}
                style={{
                  ...styles.chip,
                  ...(form.behandlung_art === opt ? styles.chipActive : {}),
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Notizen */}
        <div style={styles.field}>
          <label style={styles.label}>
            Notizen <span style={styles.optional}>(optional)</span>
          </label>
          <textarea
            value={form.notizen}
            onChange={(e) => updateField("notizen", e.target.value)}
            placeholder="z.B. Mutter bringt Kind, Dolmetscher nötig..."
            rows={2}
            style={{ ...styles.input, resize: "vertical" as const }}
          />
        </div>

        {/* Error */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Success */}
        {saved && (
          <div style={styles.success}>
            Termin gespeichert. Nächsten Termin eingeben oder{" "}
            <a href="/tagesplan" style={styles.link}>
              zum Tagesplan
            </a>
            .
          </div>
        )}

        {/* Speichern */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...styles.saveButton,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Wird gespeichert..." : "Termin speichern"}
        </button>

        {/* Link zum Tagesplan */}
        <a href="/tagesplan" style={styles.backLink}>
          Zum Tagesplan
        </a>
      </div>
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: "560px",
    margin: "0 auto",
    padding: "24px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    background: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    padding: "28px",
  },
  title: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#1a1a2e",
    margin: "0 0 24px 0",
  },
  field: {
    marginBottom: "16px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 500,
    color: "#374151",
    marginBottom: "6px",
  },
  optional: {
    fontWeight: 400,
    color: "#9ca3af",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "15px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    outline: "none",
    color: "#1a1a2e",
    boxSizing: "border-box" as const,
  },
  row: {
    display: "flex",
    gap: "12px",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "16px",
    cursor: "pointer",
    userSelect: "none" as const,
  },
  toggle: {
    width: "44px",
    height: "24px",
    borderRadius: "12px",
    position: "relative" as const,
    transition: "background 0.2s",
  },
  toggleKnob: {
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: "#ffffff",
    position: "absolute" as const,
    top: "2px",
    left: "2px",
    transition: "transform 0.2s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
  },
  toggleLabel: {
    fontSize: "14px",
    color: "#374151",
  },
  chipContainer: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "6px",
  },
  chip: {
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: 500,
    color: "#374151",
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  chipActive: {
    color: "#ffffff",
    background: "#2563eb",
    borderColor: "#2563eb",
  },
  saveButton: {
    width: "100%",
    padding: "14px",
    fontSize: "16px",
    fontWeight: 600,
    color: "#ffffff",
    background: "#2563eb",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    marginTop: "8px",
    transition: "opacity 0.2s",
  },
  error: {
    padding: "10px 14px",
    fontSize: "14px",
    color: "#991b1b",
    background: "#fee2e2",
    borderRadius: "8px",
    marginBottom: "12px",
  },
  success: {
    padding: "10px 14px",
    fontSize: "14px",
    color: "#166534",
    background: "#dcfce7",
    borderRadius: "8px",
    marginBottom: "12px",
  },
  link: {
    color: "#2563eb",
    fontWeight: 500,
  },
  backLink: {
    display: "block",
    textAlign: "center" as const,
    marginTop: "16px",
    fontSize: "14px",
    color: "#6b7280",
    textDecoration: "none",
  },
};
