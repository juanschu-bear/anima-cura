"use client";

import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowRight, Trash2, Download, Info } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { createBrowserClient } from "@/lib/db/supabase";

interface ParsedRow {
  patientName: string;
  patientNr?: string;
  gesamtbetrag?: number;
  rateBetrag?: number;
  anzahlRaten?: number;
  faelligAm?: string;
  status?: string;
  verwendungszweck?: string;
  betrag?: number;
  datum?: string;
  raw: Record<string, string>;
}

interface ImportResult {
  total: number;
  matched: number;
  created: number;
  errors: string[];
}

type ImportMode = "ratenpläne" | "zahlungen" | "auto";

export default function ImportPage() {
  const { locale, theme } = useAppStore();
  const isDark = theme === "dark";
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<string[][] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "done">("upload");
  const [mode, setMode] = useState<ImportMode>("auto");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<string>("");

  const KNOWN_HEADERS: Record<string, string[]> = {
    patientName: ["Patient", "Name", "Patientenname", "Nachname", "patient_name", "Lastname", "Empfänger", "Empfaenger"],
    patientNr: ["Pat.-Nr.", "Patientennummer", "Pat.Nr.", "PatNr", "patient_nr", "HumanReadableId", "IVORIS-Nr"],
    gesamtbetrag: ["Gesamtbetrag", "Gesamtsumme", "Total", "Gesamt", "Rechnungsbetrag", "Betrag gesamt"],
    rateBetrag: ["Rate", "Ratenbetrag", "Monatsrate", "Rate/Monat", "Ratenhöhe", "rate_betrag"],
    anzahlRaten: ["Anzahl", "Raten", "Anzahl Raten", "Laufzeit", "anzahl_raten"],
    faelligAm: ["Fällig", "Fällig am", "Fälligkeit", "Datum", "Fälligkeitsdatum", "faellig_am", "Belegdatum"],
    status: ["Status", "Zahlungsstatus", "Bezahlt", "status"],
    verwendungszweck: ["Verwendungszweck", "Buchungstext", "Text", "Beschreibung", "Zweck"],
    betrag: ["Betrag", "Betrag in EUR", "Umsatz", "Soll/Haben", "amount"],
    datum: ["Datum", "Buchungsdatum", "Valuta", "Wertstellung", "date"],
  };

  function detectFormat(headerRow: string[]): string {
    const h = headerRow.join(",").toLowerCase();
    if (h.includes("belegfeld") || h.includes("sollkonto") || h.includes("habenkonto") || h.includes("bu-schlüssel")) return "DATEV";
    if (h.includes("humanreadableid") || h.includes("orthodontiststage")) return "IVORIS";
    if (h.includes("patient") && (h.includes("rate") || h.includes("gesamtbetrag"))) return "Ratenliste";
    if (h.includes("betrag") && h.includes("datum")) return "Zahlungsliste";
    return "CSV";
  }

  function autoMap(headerRow: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [field, candidates] of Object.entries(KNOWN_HEADERS)) {
      for (const h of headerRow) {
        if (candidates.some((c) => c.toLowerCase() === h.toLowerCase().trim())) {
          result[field] = h;
          break;
        }
      }
    }
    return result;
  }

  function parseCSV(text: string): string[][] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    return lines.map((line) => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if ((char === "," || char === ";") && !inQuotes) { result.push(current.trim()); current = ""; continue; }
        current += char;
      }
      result.push(current.trim());
      return result;
    });
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  }, []);

  function processFile(f: File) {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) return;
      const headerRow = rows[0];
      const dataRows = rows.slice(1);
      setRawData(dataRows);
      setHeaders(headerRow);
      const detected = detectFormat(headerRow);
      setDetectedFormat(detected);
      const autoMapping = autoMap(headerRow);
      setMapping(autoMapping);
      if (detected === "DATEV") setMode("zahlungen");
      else if (detected === "Ratenliste") setMode("ratenpläne");
      setStep("mapping");
    };
    reader.readAsText(f, "utf-8");
  }

  function applyMapping() {
    if (!rawData || !headers) return;
    const rows = rawData.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ""; });

      const parsed: ParsedRow = { patientName: "", raw: obj };
      for (const [field, headerName] of Object.entries(mapping)) {
        const val = obj[headerName] || "";
        if (field === "patientName") parsed.patientName = val;
        if (field === "patientNr") parsed.patientNr = val;
        if (field === "gesamtbetrag") parsed.gesamtbetrag = parseFloat(val.replace(",", ".")) || undefined;
        if (field === "rateBetrag") parsed.rateBetrag = parseFloat(val.replace(",", ".")) || undefined;
        if (field === "anzahlRaten") parsed.anzahlRaten = parseInt(val) || undefined;
        if (field === "faelligAm") parsed.faelligAm = val;
        if (field === "status") parsed.status = val;
        if (field === "verwendungszweck") parsed.verwendungszweck = val;
        if (field === "betrag") parsed.betrag = parseFloat(val.replace(",", ".")) || undefined;
        if (field === "datum") parsed.datum = val;
      }
      return parsed;
    }).filter((r) => r.patientName || r.patientNr || r.betrag);

    setParsedRows(rows);
    setStep("preview");
  }

  async function runImport() {
    setImporting(true);
    const supabase = createBrowserClient();
    const importResult: ImportResult = { total: parsedRows.length, matched: 0, created: 0, errors: [] };

    for (const row of parsedRows) {
      try {
        // Try to match patient by name or number
        let patientId: string | null = null;

        if (row.patientNr) {
          const { data } = await supabase
            .from("patients")
            .select("id")
            .eq("ivoris_nummer", row.patientNr)
            .maybeSingle();
          if (data) patientId = data.id;
        }

        if (!patientId && row.patientName) {
          const parts = row.patientName.split(/[,\s]+/).filter(Boolean);
          if (parts.length >= 2) {
            const { data } = await supabase
              .from("patients")
              .select("id")
              .ilike("nachname", `%${parts[0]}%`)
              .ilike("vorname", `%${parts[parts.length - 1]}%`)
              .maybeSingle();
            if (data) patientId = data.id;
          }
        }

        if (!patientId) {
          importResult.errors.push(`${row.patientName || row.patientNr}: Patient nicht gefunden`);
          continue;
        }

        importResult.matched++;

        // Create rate plan if we have the data
        if (mode === "ratenpläne" && row.gesamtbetrag && row.rateBetrag) {
          const anzahl = row.anzahlRaten || Math.round(row.gesamtbetrag / row.rateBetrag);
          const { error } = await supabase.from("ratenplaene").insert({
            patient_id: patientId,
            gesamtbetrag: row.gesamtbetrag,
            rate_betrag: row.rateBetrag,
            anzahl_raten: anzahl,
            start_datum: row.faelligAm || new Date().toISOString().slice(0, 10),
            rhythmus: "monatlich",
          });
          if (error) {
            importResult.errors.push(`${row.patientName}: ${error.message}`);
          } else {
            importResult.created++;
          }
        }

        // Create transaction if we have payment data
        if (mode === "zahlungen" && row.betrag) {
          const { error } = await supabase.from("transaktionen").insert({
            absender_name: row.patientName,
            betrag: row.betrag,
            datum: row.datum || new Date().toISOString().slice(0, 10),
            verwendungszweck: row.verwendungszweck || "",
            matching_status: patientId ? "auto" : "unklar",
            matched_patient_id: patientId,
          });
          if (error) {
            importResult.errors.push(`${row.patientName}: ${error.message}`);
          } else {
            importResult.created++;
          }
        }
      } catch (e: any) {
        importResult.errors.push(`${row.patientName}: ${e.message}`);
      }
    }

    setResult(importResult);
    setImporting(false);
    setStep("done");
  }

  function reset() {
    setFile(null);
    setRawData(null);
    setHeaders([]);
    setParsedRows([]);
    setMapping({});
    setStep("upload");
    setMode("auto");
    setResult(null);
    setDetectedFormat("");
  }

  const isDE = locale === "de";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ac-page-title">{isDE ? "Datenimport" : "Data Import"}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ac-text-soft)" }}>
          {isDE
            ? "CSV- und DATEV-Dateien importieren — Ratenpläne, Zahlungen und Abrechnungsdaten aus IVORIS oder anderen Systemen."
            : "Import CSV and DATEV files — rate plans, payments and billing data from IVORIS or other systems."}
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-3 text-sm" style={{ color: "var(--ac-text-mute)" }}>
        {["upload", "mapping", "preview", "done"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step === s ? "text-white" : ""
              }`}
              style={{
                background: step === s ? "var(--ac-primary)" : "var(--ac-surface-muted)",
                color: step === s ? "white" : "var(--ac-text-mute)",
              }}
            >
              {i + 1}
            </span>
            <span className={step === s ? "font-semibold" : ""} style={{ color: step === s ? "var(--ac-text)" : undefined }}>
              {s === "upload" ? (isDE ? "Datei" : "File")
                : s === "mapping" ? (isDE ? "Zuordnung" : "Mapping")
                : s === "preview" ? (isDE ? "Vorschau" : "Preview")
                : (isDE ? "Fertig" : "Done")}
            </span>
            {i < 3 && <ArrowRight size={14} />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div
          className="stat-card"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: "var(--ac-surface-muted)" }}
            >
              <Upload size={28} style={{ color: "var(--ac-primary)" }} />
            </div>
            <h3 className="text-lg font-bold" style={{ color: "var(--ac-text)" }}>
              {isDE ? "CSV oder DATEV-Datei hochladen" : "Upload CSV or DATEV file"}
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--ac-text-soft)" }}>
              {isDE ? "Datei hierher ziehen oder klicken zum Auswählen" : "Drag file here or click to select"}
            </p>
            <label className="btn-primary mt-4 cursor-pointer gap-2">
              <FileSpreadsheet size={16} />
              {isDE ? "Datei auswählen" : "Select file"}
              <input type="file" accept=".csv,.txt,.datev" onChange={handleFileSelect} className="hidden" />
            </label>
            <p className="mt-3 text-xs" style={{ color: "var(--ac-text-mute)" }}>
              {isDE ? "Unterstützt: CSV, DATEV-Export, IVORIS-Listen (UTF-8, Semikolon oder Komma-getrennt)" : "Supported: CSV, DATEV export, IVORIS lists (UTF-8, semicolon or comma separated)"}
            </p>
          </div>

          <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface-muted)" }}>
            <div className="flex items-start gap-3">
              <Info size={16} className="mt-0.5 shrink-0" style={{ color: "var(--ac-primary)" }} />
              <div className="text-sm" style={{ color: "var(--ac-text-soft)" }}>
                <p className="font-semibold" style={{ color: "var(--ac-text)" }}>
                  {isDE ? "So exportierst du aus IVORIS:" : "How to export from IVORIS:"}
                </p>
                <p className="mt-1">
                  {isDE
                    ? "Öffne die gewünschte Liste in IVORIS → Rechtsklick auf die Liste → CSV-Export wählen. Bei Fragen hilft die IVORIS-Hotline."
                    : "Open the desired list in IVORIS → Right-click the list → Select CSV export. For questions, contact the IVORIS hotline."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === "mapping" && (
        <div className="stat-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold" style={{ color: "var(--ac-text)" }}>
                {isDE ? "Spalten zuordnen" : "Map columns"}
              </h3>
              <p className="text-sm" style={{ color: "var(--ac-text-soft)" }}>
                {file?.name} — {detectedFormat} {isDE ? "erkannt" : "detected"} — {rawData?.length} {isDE ? "Zeilen" : "rows"}
              </p>
            </div>
            <div className="flex gap-2">
              {(["ratenpläne", "zahlungen"] as ImportMode[]).map((m) => (
                <button
                  key={m}
                  className={`ac-chip ${mode === m ? "ac-chip-active" : ""}`}
                  onClick={() => setMode(m)}
                >
                  {m === "ratenpläne" ? (isDE ? "Ratenpläne" : "Rate plans") : (isDE ? "Zahlungen" : "Payments")}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--ac-surface-muted)" }}>
                  <th className="table-header">{isDE ? "Feld" : "Field"}</th>
                  <th className="table-header">{isDE ? "Spalte in Datei" : "Column in file"}</th>
                  <th className="table-header">{isDE ? "Beispielwert" : "Example value"}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(KNOWN_HEADERS).map(([field]) => {
                  const label = field === "patientName" ? (isDE ? "Patientenname" : "Patient name")
                    : field === "patientNr" ? (isDE ? "Patientennummer" : "Patient number")
                    : field === "gesamtbetrag" ? (isDE ? "Gesamtbetrag" : "Total amount")
                    : field === "rateBetrag" ? (isDE ? "Ratenbetrag" : "Installment amount")
                    : field === "anzahlRaten" ? (isDE ? "Anzahl Raten" : "Number of installments")
                    : field === "faelligAm" ? (isDE ? "Fälligkeitsdatum" : "Due date")
                    : field === "status" ? "Status"
                    : field === "verwendungszweck" ? (isDE ? "Verwendungszweck" : "Purpose")
                    : field === "betrag" ? (isDE ? "Betrag" : "Amount")
                    : field === "datum" ? (isDE ? "Datum" : "Date")
                    : field;

                  const selectedHeader = mapping[field] || "";
                  const exampleValue = selectedHeader && rawData?.[0]
                    ? rawData[0][headers.indexOf(selectedHeader)] || "—"
                    : "—";

                  return (
                    <tr key={field}>
                      <td className="table-cell text-sm font-semibold" style={{ color: "var(--ac-text)" }}>{label}</td>
                      <td className="table-cell">
                        <select
                          className="input text-sm"
                          value={selectedHeader}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value }))}
                        >
                          <option value="">— {isDE ? "nicht zuordnen" : "skip"} —</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </td>
                      <td className="table-cell text-sm" style={{ color: "var(--ac-text-soft)" }}>{exampleValue}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-2">
            <button className="btn-secondary" onClick={reset}>{isDE ? "Abbrechen" : "Cancel"}</button>
            <button className="btn-primary gap-2" onClick={applyMapping}>
              {isDE ? "Vorschau anzeigen" : "Show preview"} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === "preview" && (
        <div className="stat-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold" style={{ color: "var(--ac-text)" }}>
                {isDE ? "Vorschau" : "Preview"} — {parsedRows.length} {isDE ? "Einträge" : "entries"}
              </h3>
              <p className="text-sm" style={{ color: "var(--ac-text-soft)" }}>
                {mode === "ratenpläne"
                  ? (isDE ? "Ratenpläne werden erstellt und Patienten zugeordnet" : "Rate plans will be created and assigned to patients")
                  : (isDE ? "Zahlungen werden importiert und Patienten zugeordnet" : "Payments will be imported and assigned to patients")}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0" style={{ background: "var(--ac-surface)" }}>
                <tr style={{ background: "var(--ac-surface-muted)" }}>
                  <th className="table-header">#</th>
                  <th className="table-header">{isDE ? "Patient" : "Patient"}</th>
                  <th className="table-header">Nr.</th>
                  {mode === "ratenpläne" && <th className="table-header text-right">{isDE ? "Gesamt" : "Total"}</th>}
                  {mode === "ratenpläne" && <th className="table-header text-right">{isDE ? "Rate" : "Rate"}</th>}
                  {mode === "zahlungen" && <th className="table-header text-right">{isDE ? "Betrag" : "Amount"}</th>}
                  {mode === "zahlungen" && <th className="table-header">{isDE ? "Datum" : "Date"}</th>}
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    <td className="table-cell text-xs" style={{ color: "var(--ac-text-mute)" }}>{i + 1}</td>
                    <td className="table-cell text-sm font-semibold" style={{ color: "var(--ac-text)" }}>{row.patientName}</td>
                    <td className="table-cell text-sm" style={{ color: "var(--ac-text-soft)" }}>{row.patientNr || "—"}</td>
                    {mode === "ratenpläne" && <td className="table-cell text-right text-sm">{row.gesamtbetrag?.toLocaleString("de-DE") || "—"}€</td>}
                    {mode === "ratenpläne" && <td className="table-cell text-right text-sm">{row.rateBetrag?.toLocaleString("de-DE") || "—"}€</td>}
                    {mode === "zahlungen" && <td className="table-cell text-right text-sm">{row.betrag?.toLocaleString("de-DE") || "—"}€</td>}
                    {mode === "zahlungen" && <td className="table-cell text-sm">{row.datum || "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedRows.length > 50 && (
            <p className="text-xs" style={{ color: "var(--ac-text-mute)" }}>
              {isDE ? `${parsedRows.length - 50} weitere Einträge nicht angezeigt` : `${parsedRows.length - 50} more entries not shown`}
            </p>
          )}

          <div className="flex justify-between pt-2">
            <button className="btn-secondary" onClick={() => setStep("mapping")}>{isDE ? "Zurück" : "Back"}</button>
            <button className="btn-primary gap-2" onClick={runImport} disabled={importing}>
              {importing
                ? (isDE ? "Importiere..." : "Importing...")
                : (isDE ? `${parsedRows.length} Einträge importieren` : `Import ${parsedRows.length} entries`)}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && result && (
        <div className="stat-card space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: result.errors.length === 0 ? "#edf8ed" : "#fff5e6" }}>
              {result.errors.length === 0
                ? <CheckCircle size={28} style={{ color: "#3d9c46" }} />
                : <AlertCircle size={28} style={{ color: "#c79a3b" }} />}
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: "var(--ac-text)" }}>
                {isDE ? "Import abgeschlossen" : "Import complete"}
              </h3>
              <p className="text-sm" style={{ color: "var(--ac-text-soft)" }}>
                {result.matched} {isDE ? "Patienten zugeordnet" : "patients matched"} · {result.created} {isDE ? "Einträge erstellt" : "entries created"} · {result.errors.length} {isDE ? "Fehler" : "errors"}
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-xl border p-4 max-h-[200px] overflow-y-auto" style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface-muted)" }}>
              <p className="mb-2 text-xs font-semibold" style={{ color: "var(--ac-text-mute)" }}>{isDE ? "Fehler:" : "Errors:"}</p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs" style={{ color: "var(--ac-danger)" }}>• {err}</p>
              ))}
            </div>
          )}

          <button className="btn-primary gap-2" onClick={reset}>
            {isDE ? "Weiteren Import starten" : "Start another import"}
          </button>
        </div>
      )}
    </div>
  );
}
