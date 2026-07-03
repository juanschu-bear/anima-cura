"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, Check, CreditCard, Info, QrCode, Search, Wallet, X } from "lucide-react";
import QRCode from "qrcode";
import { createBrowserClient } from "@/lib/db/supabase";
import { usePatienten } from "@/hooks/useData";
import { Modal } from "@/components/ui";

// Empfangskonto der Praxis (Patientenkonto, steht auf jeder Rechnung).
const PRAXIS_NAME = "Dr. Maria Elena Schubert";
const PRAXIS_IBAN = "DE03860555921090118941";

// Was an der Kasse typischerweise berechnet wird. Baut den
// Verwendungszweck mit; spaeter ueber Einstellungen pflegbar.
const LEISTUNGEN = [
  "Behandlung",
  "Anfangsdiagnostik",
  "Retainer",
  "Prophylaxe",
  "Rate",
  "Eigenanteil",
  "Material",
] as const;

const ZAHLARTEN = [
  { key: "qr_ueberweisung", label: "QR-Überweisung", icon: QrCode },
  { key: "girocard", label: "Girocard", icon: CreditCard },
  { key: "kreditkarte", label: "Kreditkarte", icon: CreditCard },
  { key: "bar", label: "Bar", icon: Banknote },
  { key: "guthaben", label: "Guthaben", icon: Wallet },
] as const;

const AUSGABEN_ARTEN = [
  "Praxismaterial",
  "Buerobedarf",
  "Labor",
  "Erstattung",
  "Fahrtkosten",
  "Sonstiges",
] as const;

function istMinderjaehrig(geburtsdatum?: string | null): boolean | null {
  if (!geburtsdatum) return null;
  const geb = new Date(geburtsdatum);
  if (isNaN(geb.getTime())) return null;
  const heute = new Date();
  let alter = heute.getFullYear() - geb.getFullYear();
  const m = heute.getMonth() - geb.getMonth();
  if (m < 0 || (m === 0 && heute.getDate() < geb.getDate())) alter--;
  return alter < 18;
}

function parseBetrag(s: string): number | null {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function localDateFromIso(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function isoFromLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getExportRange(dateString: string, mode: "tag" | "woche" | "monat") {
  const base = localDateFromIso(dateString);
  const start = new Date(base);
  const end = new Date(base);

  if (mode === "woche") {
    const weekday = (base.getDay() + 6) % 7;
    start.setDate(base.getDate() - weekday);
    end.setDate(start.getDate() + 6);
  } else if (mode === "monat") {
    start.setDate(1);
    end.setMonth(base.getMonth() + 1, 0);
  }

  const startIso = isoFromLocalDate(start);
  const endIso = isoFromLocalDate(end);
  const label =
    mode === "tag"
      ? startIso
      : mode === "woche"
      ? `${startIso} bis ${endIso}`
      : `${start.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}`;

  return { startIso, endIso, label };
}

function euro(value: number) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signedEuro(value: number, buchungstyp: "einnahme" | "ausgabe") {
  const sign = buchungstyp === "ausgabe" ? "-" : "+";
  return `${sign}${euro(Math.abs(value))}`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// GiroCode nach EPC069-12: Banking-App scannt, Felder sind vorausgefüllt.
function epcPayload(betrag: number, zweck: string): string {
  return [
    "BCD", "002", "1", "SCT", "",
    PRAXIS_NAME, PRAXIS_IBAN,
    `EUR${betrag.toFixed(2)}`,
    "", "", zweck.slice(0, 140), "",
  ].join("\n");
}

const supabase = createBrowserClient();

export default function KassePage() {
  const [buchungstyp, setBuchungstyp] = useState<"einnahme" | "ausgabe">("einnahme");
  const [patSearch, setPatSearch] = useState("");
  const { patienten } = usePatienten(patSearch.length >= 2 ? patSearch : undefined);
  const [patient, setPatient] = useState<any | null>(null);
  const [betrag, setBetrag] = useState("");
  const [zahlart, setZahlart] = useState<(typeof ZAHLARTEN)[number]["key"]>("qr_ueberweisung");
  const [guthaben, setGuthaben] = useState<number | null>(null);
  const [bestaetigung, setBestaetigung] = useState<{ kzId: string; name: string; betrag: number; zahlart: string; rest: number | null; buchungstyp: "einnahme" | "ausgabe" } | null>(null);
  const [notiz, setNotiz] = useState("");
  const [leistung, setLeistung] = useState<string>(LEISTUNGEN[0]);
  const [zweckManuell, setZweckManuell] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hinweis, setHinweis] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrInfo, setQrInfo] = useState<{ kzId: string; name: string; betrag: number; zweck: string; eingegangen: boolean } | null>(null);
  const [pruefe, setPruefe] = useState(false);
  const [tagesListe, setTagesListe] = useState<any[]>([]);
  const [kassenTag, setKassenTag] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterArt, setFilterArt] = useState<string>("alle");
  const [seite, setSeite] = useState(1);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailQr, setDetailQr] = useState<string | null>(null);
  const [loeschBestaetigung, setLoeschBestaetigung] = useState(false);
  const [exportZeitraum, setExportZeitraum] = useState<"tag" | "woche" | "monat">("tag");
  const [exporting, setExporting] = useState<null | "csv" | "pdf">(null);
  const [quartalAktiv, setQuartalAktiv] = useState(false);
  const [quartalJahr, setQuartalJahr] = useState(new Date().getFullYear());
  const [quartalNummer, setQuartalNummer] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [filterBuchungstyp, setFilterBuchungstyp] = useState<"alle" | "einnahme" | "ausgabe">("alle");

  const treffer = useMemo(
    () => (patSearch.length >= 2 && !patient ? patienten.slice(0, 8) : []),
    [patienten, patSearch, patient]
  );
  const exportRange = useMemo(() => getExportRange(kassenTag, exportZeitraum), [kassenTag, exportZeitraum]);
  const quartalOptionen = useMemo(() => {
    const year = new Date().getFullYear();
    return [year - 1, year, year + 1];
  }, []);
  const verfuegbareZahlarten = useMemo(() => {
    if (buchungstyp === "ausgabe") {
      return ZAHLARTEN.filter((item) => item.key !== "qr_ueberweisung" && item.key !== "guthaben");
    }
    return ZAHLARTEN;
  }, [buchungstyp]);
  const gefilterteKassenListe = useMemo(
    () => tagesListe.filter((z) => {
      const artOk = filterArt === "alle" || z.zahlart === filterArt;
      const typOk = filterBuchungstyp === "alle" || z.buchungstyp === filterBuchungstyp;
      return artOk && typOk;
    }),
    [tagesListe, filterArt, filterBuchungstyp]
  );
  const methodenSummen = useMemo(
    () =>
      ZAHLARTEN.map(({ key, label }) => ({
        key,
        label,
        summe: tagesListe
          .filter((z) => z.zahlart === key)
          .reduce((sum, z) => sum + Number(z.betrag || 0), 0),
      })),
    [tagesListe]
  );

  async function ladeTagesliste() {
    const { data } = await supabase
      .from("kassen_zahlungen")
      .select("*, patients:patient_id(vorname, nachname, ivoris_nummer)")
      .eq("kassen_datum", kassenTag)
      .order("created_at", { ascending: false });
    setTagesListe(data || []);
  }
  useEffect(() => { ladeTagesliste(); }, [kassenTag]);
  useEffect(() => { setSeite(1); }, [kassenTag, filterArt, filterBuchungstyp]);
  useEffect(() => {
    if (buchungstyp === "ausgabe") {
      setPatient(null);
      setPatSearch("");
      if (zahlart === "qr_ueberweisung" || zahlart === "guthaben") {
        setZahlart("bar");
      }
      if ((LEISTUNGEN as readonly string[]).includes(leistung)) {
        setLeistung(AUSGABEN_ARTEN[0]);
      }
      setZweckManuell(null);
      setQrDataUrl(null);
      setQrInfo(null);
    } else if ((AUSGABEN_ARTEN as readonly string[]).includes(leistung)) {
      setLeistung(LEISTUNGEN[0]);
    }
  }, [buchungstyp, leistung, zahlart]);
  // Anima-Balance-Saldo des gewaehlten Patienten laden
  useEffect(() => {
    if (!patient) { setGuthaben(null); return; }
    let aktiv = true;
    supabase.from("anima_balance_salden").select("saldo").eq("patient_id", patient.id).maybeSingle()
      .then(({ data }) => { if (aktiv) setGuthaben(Number(data?.saldo ?? 0)); });
    return () => { aktiv = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient]);

  const tagesSummen = useMemo(() => {
    const s: Record<string, number> = {};
    for (const z of tagesListe) s[z.zahlart] = (s[z.zahlart] || 0) + Number(z.betrag);
    return s;
  }, [tagesListe]);
  const kassenUebersicht = useMemo(() => {
    let einnahmen = 0;
    let ausgaben = 0;
    for (const z of tagesListe) {
      const wert = Number(z.betrag || 0);
      if (z.buchungstyp === "ausgabe") ausgaben += wert;
      else einnahmen += wert;
    }
    return { einnahmen, ausgaben, saldo: einnahmen - ausgaben };
  }, [tagesListe]);

  async function ladeExportListe() {
    const { data, error } = await supabase
      .from("kassen_zahlungen")
      .select("*, patients:patient_id(vorname, nachname, ivoris_nummer)")
      .gte("kassen_datum", exportRange.startIso)
      .lte("kassen_datum", exportRange.endIso)
      .order("kassen_datum", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function exportiereCsv() {
    setExporting("csv");
    try {
      const rows = await ladeExportListe();
      const header = ["Datum", "Typ", "Patient", "Patientennummer", "Zahlart", "Betrag_EUR", "Quartal", "Zweck", "Notiz", "Status"];
      const lines = rows.map((row: any) => {
        const status = row.buchungstyp === "ausgabe"
          ? "Praxis-Ausgabe"
          : row.zahlart === "qr_ueberweisung"
          ? row.transaktion_id ? "Geldeingang da" : "Wartet auf Geldeingang"
          : row.zahlart === "guthaben"
          ? "Vom Guthaben verrechnet"
          : row.zahlart === "bar"
          ? "Bar erhalten"
          : "Terminalumsatz erfasst";
        const quartal = row.quartal_jahr && row.quartal_nummer ? `Q${row.quartal_nummer} ${row.quartal_jahr}` : "";
        return [
          row.kassen_datum,
          row.buchungstyp === "ausgabe" ? "Ausgabe" : "Einnahme",
          `${row.patients?.nachname || ""}, ${row.patients?.vorname || ""}`.trim().replace(/^,\s*/, ""),
          row.patients?.ivoris_nummer || "",
          ZAHLARTEN.find((item) => item.key === row.zahlart)?.label || row.zahlart,
          euro(Number(row.betrag || 0)),
          quartal,
          row.zweck || "",
          row.notiz || "",
          status,
        ].map(csvCell).join(";");
      });

      const csv = [header.map(csvCell).join(";"), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `anima-kasse-${exportZeitraum}-${exportRange.startIso}-${exportRange.endIso}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setHinweis(`CSV-Export erstellt fuer ${exportRange.label}.`);
    } catch (error: any) {
      setHinweis(`CSV-Export fehlgeschlagen: ${error?.message || "unbekannter Fehler"}`);
    } finally {
      setExporting(null);
    }
  }

  async function exportierePdf() {
    setExporting("pdf");
    try {
      const rows = await ladeExportListe();
      const totals = rows.reduce((acc: Record<string, number>, row: any) => {
        acc[row.zahlart] = (acc[row.zahlart] || 0) + Number(row.betrag || 0);
        return acc;
      }, {});
      const summary = rows.reduce((acc: { einnahmen: number; ausgaben: number }, row: any) => {
        const wert = Number(row.betrag || 0);
        if (row.buchungstyp === "ausgabe") acc.ausgaben += wert;
        else acc.einnahmen += wert;
        return acc;
      }, { einnahmen: 0, ausgaben: 0 });
      const htmlRows = rows.map((row: any) => `
        <tr>
          <td>${htmlEscape(row.kassen_datum)}</td>
          <td>${htmlEscape(row.buchungstyp === "ausgabe" ? "Ausgabe" : "Einnahme")}</td>
          <td>${htmlEscape(`${row.patients?.nachname || ""}, ${row.patients?.vorname || ""}`.replace(/^,\s*/, ""))}</td>
          <td>${htmlEscape(row.patients?.ivoris_nummer || "")}</td>
          <td>${htmlEscape(ZAHLARTEN.find((item) => item.key === row.zahlart)?.label || row.zahlart)}</td>
          <td style="text-align:right;">${euro(Number(row.betrag || 0))} EUR</td>
          <td>${htmlEscape(row.quartal_jahr && row.quartal_nummer ? `Q${row.quartal_nummer} ${row.quartal_jahr}` : "")}</td>
          <td>${htmlEscape(row.zweck || "")}</td>
        </tr>
      `).join("");
      const htmlTotals = ZAHLARTEN.map((item) => `
        <tr>
          <td>${htmlEscape(item.label)}</td>
          <td style="text-align:right;">${euro(totals[item.key] || 0)} EUR</td>
        </tr>
      `).join("");

      const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
      if (!printWindow) {
        throw new Error("Druckfenster wurde blockiert");
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="de">
          <head>
            <meta charset="utf-8" />
            <title>Kassenexport ${exportRange.label}</title>
            <style>
              body { font-family: Arial, sans-serif; color: #172033; margin: 32px; }
              h1 { margin: 0 0 8px; font-size: 24px; }
              p { margin: 0 0 16px; color: #53627a; }
              .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-bottom: 24px; }
              .card { border: 1px solid #d8e0ec; border-radius: 12px; padding: 16px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border-bottom: 1px solid #e5ebf3; padding: 8px 10px; font-size: 12px; text-align: left; vertical-align: top; }
              th { background: #f6f8fb; }
              .meta { font-size: 28px; font-weight: 700; margin-top: 8px; }
              @media print {
                body { margin: 16px; }
              }
            </style>
          </head>
          <body>
            <h1>AnimaPay Kasse</h1>
            <p>Exportzeitraum: ${htmlEscape(exportRange.label)}</p>
            <div class="summary">
              <div class="card">
                <div>Gesamtbuchungen</div>
                <div class="meta">${rows.length}</div>
              </div>
              <div class="card">
                <div>Kassensaldo</div>
                <div class="meta">${euro(summary.einnahmen - summary.ausgaben)} EUR</div>
              </div>
            </div>
            <div class="summary" style="margin-top: -8px;">
              <div class="card">
                <div>Einnahmen</div>
                <div class="meta">${euro(summary.einnahmen)} EUR</div>
              </div>
              <div class="card">
                <div>Ausgaben</div>
                <div class="meta">${euro(summary.ausgaben)} EUR</div>
              </div>
            </div>
            <div class="card" style="margin-bottom: 24px;">
              <h2 style="margin: 0 0 12px; font-size: 16px;">Summen nach Zahlart</h2>
              <table>
                <thead><tr><th>Zahlart</th><th style="text-align:right;">Summe</th></tr></thead>
                <tbody>${htmlTotals}</tbody>
              </table>
            </div>
            <div class="card">
              <h2 style="margin: 0 0 12px; font-size: 16px;">Einzelposten</h2>
              <table>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Typ</th>
                    <th>Patient</th>
                    <th>Patientennummer</th>
                    <th>Zahlart</th>
                    <th style="text-align:right;">Betrag</th>
                    <th>Quartal</th>
                    <th>Zweck</th>
                  </tr>
                </thead>
                <tbody>${htmlRows || '<tr><td colspan="8">Keine Eintraege im gewaehlten Zeitraum.</td></tr>'}</tbody>
              </table>
            </div>
            <script>
              window.onload = () => {
                window.print();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      setHinweis(`Druckansicht fuer ${exportRange.label} geoeffnet. Im Browser kannst du direkt als PDF speichern.`);
    } catch (error: any) {
      setHinweis(`PDF-Export fehlgeschlagen: ${error?.message || "unbekannter Fehler"}`);
    } finally {
      setExporting(null);
    }
  }

  // Verknuepft wartende QR-Zahlungen mit bereits abgeholten
  // Ueberweisungen (Zeichen im Zweck + exakter Betrag). Loest bewusst
  // KEINEN Bank-Abruf aus (PSD2-Tagesbudget); frische Daten bringen
  // Morgen-Cron und Sync-Knopf.
  async function oeffneDetail(z: any) {
    setDetail(z);
    setLoeschBestaetigung(false);
    setDetailQr(null);
    if (z.buchungstyp !== "ausgabe" && z.zahlart === "qr_ueberweisung") {
      const zweck = z.zweck || `Behandlung ${z.zeichen || ""} ${z.patients?.nachname || ""}`.trim();
      const url = await QRCode.toDataURL(epcPayload(Number(z.betrag), zweck), { width: 240, margin: 1 });
      setDetailQr(url);
    }
  }

  async function loescheEintrag() {
    if (!detail) return;
    const { data, error } = await supabase
      .from("kassen_zahlungen")
      .delete()
      .eq("id", detail.id)
      .select("id");
    setDetail(null);
    if (error || !data?.length) {
      setHinweis("Löschen fehlgeschlagen, der Eintrag ist noch da. Bitte Juan Bescheid geben (Datenbank-Rechte).");
    } else {
      setHinweis("Eintrag gelöscht.");
    }
    ladeTagesliste();
  }

  async function pruefeEingaenge() {
    setPruefe(true);
    const { data: offene } = await supabase
      .from("kassen_zahlungen")
      .select("id, betrag, zeichen, kassen_datum, patient_id")
      .eq("zahlart", "qr_ueberweisung")
      .is("transaktion_id", null);
    for (const kz of offene || []) {
      if (!kz.zeichen) continue;
      const { data: tx } = await supabase
        .from("transaktionen")
        .select("id, datum, verwendungszweck")
        .gt("finapi_id", 0)
        .gte("datum", kz.kassen_datum)
        .eq("betrag", kz.betrag)
        .ilike("verwendungszweck", `%${kz.zeichen}%`)
        .limit(1);
      if (tx?.length) {
        // Echtzeit = am selben Banktag eingetroffen oder ausdruecklich
        // so im Buchungstext; Standard braucht 1-2 Banktage.
        const echtzeit = tx[0].datum === kz.kassen_datum
          || /echtzeit|instant/i.test(tx[0].verwendungszweck || "");
        await supabase.from("kassen_zahlungen")
          .update({
            transaktion_id: tx[0].id,
            abgleich_status: "eingegangen",
            eingang_am: new Date().toISOString(),
            eingang_typ: echtzeit ? "echtzeit" : "standard",
          })
          .eq("id", kz.id);
        // Beweisklasse 100: diesen QR-Code haben wir selbst erzeugt,
        // die Zahlung ist keine Vermutung, sondern unsere Handschrift.
        await supabase.from("transaktionen")
          .update({
            matched_patient_id: kz.patient_id,
            matching_status: "auto",
            matching_score: 100,
            matching_details: { methode: "animapay_kasse", quelle: "kasse" },
            geprueft_am: new Date().toISOString(),
          })
          .eq("id", tx[0].id);
        if (qrInfo && qrInfo.kzId === kz.id) setQrInfo({ ...qrInfo, eingegangen: true });
      }
    }
    setPruefe(false);
    ladeTagesliste();
  }

  async function speichern() {
    setHinweis("");
    const b = parseBetrag(betrag);
    if (!b) { setHinweis("Bitte einen gültigen Betrag eingeben, z. B. 36,23."); return; }
    if (buchungstyp === "einnahme" && !patient) { setHinweis("Bitte zuerst einen Patienten wählen."); return; }
    if (buchungstyp === "ausgabe" && (zahlart === "qr_ueberweisung" || zahlart === "guthaben")) {
      setHinweis("Ausgaben koennen nur als Bar-, Girocard- oder Kreditkartenbuchung erfasst werden.");
      return;
    }
    if (buchungstyp === "einnahme" && zahlart === "guthaben") {
      const verf = guthaben ?? 0;
      if (verf <= 0) { setHinweis("Kein Guthaben vorhanden."); return; }
      if (b > verf + 0.001) { setHinweis(`Guthaben reicht nicht: verfügbar ${verf.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €.`); return; }
    }

    setSaving(true);
    const zeichen = buchungstyp === "einnahme" ? (patient?.ivoris_nummer || null) : null;
    const zweckFinal = buchungstyp === "einnahme" && zahlart === "qr_ueberweisung"
      ? (zweckManuell ?? `${leistung} ${zeichen || ""} ${patient?.nachname || ""}`).trim()
      : leistung;
    const { data: kz, error } = await supabase.from("kassen_zahlungen").insert({
      patient_id: buchungstyp === "einnahme" ? patient?.id ?? null : null,
      betrag: b,
      buchungstyp,
      zahlart,
      zeichen,
      zweck: zweckFinal,
      notiz: notiz || null,
      quartal_jahr: quartalAktiv ? quartalJahr : null,
      quartal_nummer: quartalAktiv ? quartalNummer : null,
    }).select().single();
    if (error) {
      setHinweis(`Speichern fehlgeschlagen: ${error.message}`);
      setSaving(false);
      return;
    }

    if (buchungstyp === "einnahme" && zahlart === "guthaben") {
      const { error: balFehler } = await supabase.from("anima_balance_buchungen").insert({
        patient_id: patient!.id,
        betrag: -b,
        typ: "verrechnung",
        beschreibung: `An der Praxis-Kasse: ${leistung}`,
        referenz_kassen_zahlung_id: kz.id,
      });
      if (balFehler) {
        await supabase.from("kassen_zahlungen").delete().eq("id", kz.id);
        setHinweis(`Guthaben-Verrechnung fehlgeschlagen, Zahlung NICHT erfasst: ${balFehler.message}`);
        setSaving(false);
        return;
      }
      setGuthaben(g => Math.max(0, (g ?? 0) - b));
      // Patient informieren (Glocke + Push), darf die Zahlung nie blockieren
      fetch("/api/praxis/balance-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patient!.id, betrag: b, leistung, rest: Math.max(0, (guthaben ?? 0) - b) }),
      }).catch(() => {});
    }

    if (buchungstyp === "einnahme" && zahlart === "qr_ueberweisung" && zweckFinal) {
      const url = await QRCode.toDataURL(epcPayload(b, zweckFinal), { width: 280, margin: 1 });
      setQrDataUrl(url);
      setQrInfo({ kzId: kz.id, name: `${patient!.vorname} ${patient!.nachname}`, betrag: b, zweck: zweckFinal, eingegangen: false });
    } else {
      setQrDataUrl(null);
      setQrInfo(null);
      setBestaetigung({
        kzId: kz.id,
        name: buchungstyp === "einnahme" && patient ? `${patient.nachname}, ${patient.vorname}` : "Praxis-Ausgabe",
        betrag: b,
        zahlart: ZAHLARTEN.find(a => a.key === zahlart)?.label || zahlart,
        rest: buchungstyp === "einnahme" && zahlart === "guthaben" ? Math.max(0, (guthaben ?? 0) - b) : null,
        buchungstyp,
      });
    }

    setHinweis(
      buchungstyp === "ausgabe"
        ? `Ausgabe erfasst: ${b.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € · ${leistung}${quartalAktiv ? ` · Q${quartalNummer} ${quartalJahr}` : ""}`
        : `Erfasst: ${patient!.nachname}, ${patient!.vorname} · ${b.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €${zahlart === "guthaben" ? ` · vom Guthaben verrechnet, Rest ${Math.max(0, (guthaben ?? 0) - b).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : ""}${quartalAktiv ? ` · Q${quartalNummer} ${quartalJahr}` : ""}`
    );
    setPatient(null);
    setPatSearch("");
    setBetrag("");
    setNotiz("");
    setZweckManuell(null);
    setLeistung(buchungstyp === "ausgabe" ? AUSGABEN_ARTEN[0] : LEISTUNGEN[0]);
    setQuartalAktiv(false);
    setSaving(false);
    ladeTagesliste();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="ac-page-title">Kasse · AnimaPay Live</h1>
        <p className="mt-1 text-sm text-praxis-400">
          Einnahmen und Ausgaben direkt an der Rezeption erfassen. Bei QR-Überweisung erscheint sofort der GiroCode mit Zeichen, die Zuordnung läuft dann von allein.
        </p>
      </div>

      {hinweis && (
        <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm text-praxis-600 flex items-center gap-2">
          <Check size={16} className="text-[#5f9339]" /> {hinweis}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Erfassung */}
        <div className="stat-card space-y-4">
          <div>
            <span className="mb-1 block text-xs font-medium text-praxis-500">Buchungstyp</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "einnahme", label: "Einnahme" },
                { key: "ausgabe", label: "Ausgabe" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setBuchungstyp(item.key as "einnahme" | "ausgabe")}
                  className={`ac-chip justify-center py-3 ${buchungstyp === item.key ? "ac-chip-active" : ""}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {buchungstyp === "einnahme" ? (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
              <input
                className="input w-full pl-9"
                placeholder="Patient suchen (Name) …"
                value={patient ? `${patient.nachname}, ${patient.vorname}` : patSearch}
                onChange={(e) => { setPatient(null); setPatSearch(e.target.value); }}
              />
              {patient ? (
                <button
                  onClick={() => { setPatient(null); setPatSearch(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-praxis-400 hover:text-praxis-600"
                  aria-label="Patient abwählen"
                >
                  <X size={16} />
                </button>
              ) : null}
              {treffer.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-surface-200 bg-white shadow-lg">
                  {treffer.map((p: any) => (
                    <button
                      key={p.id}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-100"
                      onClick={() => { setPatient(p); setPatSearch(""); }}
                    >
                      {p.nachname}, {p.vorname}
                      <span className="ml-2 text-xs text-praxis-400">{p.ivoris_nummer}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-praxis-500">
              Diese Buchung wird als Praxis-Ausgabe erfasst und ist nicht an einen Patienten gebunden.
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-praxis-500">Betrag (€)</span>
            <input
              className="input w-full text-lg"
              inputMode="decimal"
              placeholder="z. B. 36,23"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-praxis-500">Zahlart</span>
            {buchungstyp === "einnahme" && patient && guthaben !== null && (
              <span className="mb-1 block text-xs" style={{ color: "#b88a2e" }}>Anima-Balance-Guthaben: {guthaben.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
            )}
            <select
              className="input w-full"
              value={zahlart}
              onChange={(e) => setZahlart(e.target.value as (typeof ZAHLARTEN)[number]["key"])}
            >
              {verfuegbareZahlarten.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-praxis-500">{buchungstyp === "ausgabe" ? "Kategorie / Zweck der Ausgabe" : "Leistung (wofür wird gezahlt)"}</span>
            <select
              className="input w-full"
              value={leistung}
              onChange={(e) => { setLeistung(e.target.value); setZweckManuell(null); }}
            >
              {(buchungstyp === "ausgabe" ? AUSGABEN_ARTEN : LEISTUNGEN).map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>

          {buchungstyp === "einnahme" && zahlart === "qr_ueberweisung" && patient ? (() => {
            const standard = `${leistung} ${patient.ivoris_nummer || ""} ${patient.nachname || ""}`.trim();
            const zweck = zweckManuell ?? standard;
            const ohneZeichen = patient.ivoris_nummer && !zweck.includes(patient.ivoris_nummer);
            return (
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-praxis-500">Verwendungszweck im QR (anpassbar)</span>
                  <input
                    className="input w-full"
                    value={zweck}
                    onChange={(e) => setZweckManuell(e.target.value)}
                  />
                </label>
                {ohneZeichen ? (
                  <p className="text-xs font-semibold text-amber-500">
                    Wichtig: Die Nummer {patient.ivoris_nummer} muss im Text bleiben. Ohne sie kann das Programm die Zahlung später nicht von selbst zuordnen, dann muss jemand von Hand suchen.
                  </p>
                ) : null}
              </div>
            );
          })() : null}

          <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-praxis-500">Quartalsbezug</p>
                <p className="mt-1 text-xs text-praxis-400">Optional fuer Quartalskontrollen, Sammelbuchungen oder Praxis-Ausgaben.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-praxis-500">
                <input
                  type="checkbox"
                  checked={quartalAktiv}
                  onChange={() => setQuartalAktiv((current) => !current)}
                />
                Quartal aktiv
              </label>
            </div>
            {quartalAktiv && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <select className="input w-full" value={quartalNummer} onChange={(e) => setQuartalNummer(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{`Q${q}`}</option>)}
                </select>
                <select className="input w-full" value={quartalJahr} onChange={(e) => setQuartalJahr(Number(e.target.value))}>
                  {quartalOptionen.map((jahr) => <option key={jahr} value={jahr}>{jahr}</option>)}
                </select>
              </div>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-praxis-500">Notiz (optional, nur für die Praxis sichtbar, steht nicht im QR-Code)</span>
            <input className="input w-full" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Anzahlung Retainer" />
          </label>

          <button className="btn-primary w-full py-3" onClick={speichern} disabled={saving}>
            {saving ? "Speichert …" : buchungstyp === "ausgabe" ? "Ausgabe erfassen" : "Zahlung erfassen"}
          </button>

        </div>

        {/* QR / Tagesübersicht */}
        <div className="space-y-5">
          {qrDataUrl && qrInfo && (
            <div className="stat-card relative text-center space-y-2">
              <button
                onClick={() => { setQrDataUrl(null); setQrInfo(null); }}
                className="absolute right-3 top-3 text-praxis-400 hover:text-praxis-600"
                aria-label="QR-Code schließen"
              >
                <X size={18} />
              </button>
              <p className="text-sm font-semibold">GiroCode für {qrInfo.name}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="GiroCode" className="mx-auto rounded-lg" />
              <p className="text-lg font-bold">{qrInfo.betrag.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</p>
              <p className="text-xs text-praxis-400">Verwendungszweck: {qrInfo.zweck}</p>
              <p className="text-xs text-praxis-400">Patient scannt mit der Banking-App, alle Felder sind vorausgefüllt.</p>
              {qrInfo.eingegangen ? (
                <p className="flex items-center justify-center gap-1 text-sm font-semibold text-[#5f9339]">
                  <Check size={16} /> Zahlung eingegangen
                </p>
              ) : (
                <button className="btn-secondary" onClick={pruefeEingaenge} disabled={pruefe}>
                  {pruefe ? "Prüft …" : "Eingang prüfen"}
                </button>
              )}
            </div>
          )}

          <div className="stat-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Kassenbuch</p>
                <p className="mt-1 text-xs text-praxis-400">Export fuer Tag, Woche oder Monat direkt aus dem aktuellen Kassenstand.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="input text-xs"
                  value={kassenTag}
                  onChange={(e) => setKassenTag(e.target.value)}
                />
                <button className="btn-secondary text-xs" onClick={pruefeEingaenge} disabled={pruefe}>
                  {pruefe ? "Prüft …" : "Eingang prüfen"}
                </button>
              </div>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-praxis-400">Export</span>
                <select className="input w-full text-sm" value={exportZeitraum} onChange={(e) => setExportZeitraum(e.target.value as "tag" | "woche" | "monat")}>
                  <option value="tag">Tag</option>
                  <option value="woche">Woche</option>
                  <option value="monat">Monat</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-praxis-400">Buchungstyp</span>
                <select className="input w-full text-sm" value={filterBuchungstyp} onChange={(e) => setFilterBuchungstyp(e.target.value as "alle" | "einnahme" | "ausgabe")}>
                  <option value="alle">Alle Buchungen</option>
                  <option value="einnahme">Nur Einnahmen</option>
                  <option value="ausgabe">Nur Ausgaben</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-praxis-400">Zahlart</span>
                <select className="input w-full text-sm" value={filterArt} onChange={(e) => setFilterArt(e.target.value)}>
                  <option value="alle">Alle Zahlarten</option>
                  {ZAHLARTEN.map(({ key, label }) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2 self-end">
                <button className="btn-secondary text-xs" onClick={exportiereCsv} disabled={exporting !== null}>
                  {exporting === "csv" ? "CSV …" : "CSV"}
                </button>
                <button className="btn-secondary text-xs" onClick={exportierePdf} disabled={exporting !== null}>
                  {exporting === "pdf" ? "PDF …" : "PDF"}
                </button>
              </div>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-praxis-400">Saldo</p>
                <p className="mt-1 text-xl font-bold text-praxis-800">{euro(kassenUebersicht.saldo)} €</p>
                <p className="mt-1 text-xs text-praxis-400">{tagesListe.length} {tagesListe.length === 1 ? "Buchung" : "Buchungen"}</p>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-praxis-400">Einnahmen</p>
                <p className="mt-1 text-xl font-bold text-[#4ca43f]">{euro(kassenUebersicht.einnahmen)} €</p>
                <p className="mt-1 text-xs text-praxis-400">Zeitraum: {exportRange.label}</p>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-praxis-400">Ausgaben</p>
                <p className="mt-1 text-xl font-bold text-accent-coral">{euro(kassenUebersicht.ausgaben)} €</p>
                <p className="mt-1 text-xs text-praxis-400">Zeitraum: {exportRange.label}</p>
              </div>
            </div>
            <details className="mb-4 rounded-xl border border-surface-200 bg-surface-50">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-praxis-700">Aufschlüsselung nach Zahlart</summary>
              <div className="grid grid-cols-1 gap-2 border-t border-surface-200 px-4 py-3 sm:grid-cols-2">
                {methodenSummen.map((item) => (
                  <div key={item.key} className="flex items-center justify-between text-sm">
                    <span className="text-praxis-500">{item.label}</span>
                    <span className="font-semibold text-praxis-800">{euro(item.summe)} €</span>
                  </div>
                ))}
              </div>
            </details>
            {(() => {
              const gefiltert = gefilterteKassenListe;
              const proSeite = 10;
              const seiten = Math.max(1, Math.ceil(gefiltert.length / proSeite));
              const sichtbar = gefiltert.slice((seite - 1) * proSeite, seite * proSeite);
              if (gefiltert.length === 0) {
                return <p className="text-sm text-praxis-400">Keine Buchungen an diesem Tag{filterArt !== "alle" ? " mit dieser Zahlart" : ""}.</p>;
              }
              return (
                <>
              <div className="space-y-1">
                {sichtbar.map((z: any) => (
                  <button key={z.id} onClick={() => oeffneDetail(z)} className="flex w-full items-center justify-between border-b border-surface-100 px-2 py-1.5 text-left text-sm transition-colors last:border-0 hover:bg-[rgba(127,148,180,0.12)] rounded">
                    <span>
                      {z.buchungstyp === "ausgabe" ? "Praxis-Ausgabe" : `${z.patients?.nachname}, ${z.patients?.vorname}`}
                      {z.quartal_jahr && z.quartal_nummer ? <span className="ml-2 text-[11px] text-praxis-400">{`Q${z.quartal_nummer} ${z.quartal_jahr}`}</span> : null}
                    </span>
                    <span className="text-xs text-praxis-400">
                      {z.buchungstyp === "ausgabe" ? "Ausgabe · " : "Einnahme · "}
                      {ZAHLARTEN.find(a => a.key === z.zahlart)?.label}
                      {z.buchungstyp === "einnahme" && z.zahlart === "qr_ueberweisung" ? (
                        z.transaktion_id
                          ? <span className="ml-1 font-semibold text-[#5f9339]">· eingegangen{z.eingang_typ === "echtzeit" ? " (Echtzeit)" : z.eingang_typ === "standard" ? " (Standard)" : ""}</span>
                          : <span className="ml-1" title="Standard-Überweisungen brauchen 1 Banktag">· wartet auf Geldeingang</span>
                      ) : null}
                    </span>
                    <span className={`font-semibold ${z.buchungstyp === "ausgabe" ? "text-accent-coral" : ""}`}>
                      {signedEuro(Number(z.betrag || 0), z.buchungstyp || "einnahme")} €
                    </span>
                  </button>
                ))}
              </div>
              {seiten > 1 && (
                <div className="mt-3 flex items-center justify-between text-xs text-praxis-400">
                  <button className="btn-secondary text-xs" disabled={seite <= 1} onClick={() => setSeite(seite - 1)}>Zurück</button>
                  <span>Seite {seite} von {seiten}</span>
                  <button className="btn-secondary text-xs" disabled={seite >= seiten} onClick={() => setSeite(seite + 1)}>Weiter</button>
                </div>
              )}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="stat-card">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Info size={15} /> So funktioniert die Kasse
        </p>
        <div className="grid grid-cols-1 gap-4 text-xs leading-relaxed text-praxis-400 md:grid-cols-2">
          <div>
            <p className="mb-1 font-semibold text-praxis-600">QR-Überweisung</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Der Patient scannt den Code mit seiner Banking-App. Betrag, Empfänger und Verwendungszweck sind schon ausgefüllt, er bestätigt nur noch.</li>
              <li>Im Verwendungszweck stehen immer Patientennummer und Nachname. Die <strong>Nummer</strong> ist der wichtige Teil: Daran erkennt das Programm die Zahlung, wenn sie auf dem Praxiskonto ankommt, und bucht sie von selbst beim richtigen Patienten.</li>
              <li>Es ist egal, wer überweist, bei Kindern z.&nbsp;B. die Eltern: Es zählt die Nummer im Text, nicht der Name des Überweisenden.</li>
              <li><strong>„wartet auf Geldeingang"</strong> heißt: Das Geld ist noch nicht auf dem Konto gesehen worden. Echtzeitüberweisungen kommen in Sekunden, normale brauchen einen Banktag. Spätestens der Morgen-Abruf holt sie und der Status springt auf „eingegangen".</li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold text-praxis-600">Girocard, Kreditkarte und Bar</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Girocard und Kreditkarte laufen weiter ganz normal über das Kartengerät. Hier wird die Zahlung nur <strong>eingetragen</strong>, damit das Kassenbuch stimmt.</li>
              <li>Dieser Eintrag ersetzt die Papier-Liste: Das Programm vergleicht die Tagessummen später mit den Sammel-Gutschriften des Kartengeräts.</li>
              <li>Barzahlungen und Praxis-Ausgaben werden genauso eingetragen, dann ist der Tag komplett.</li>
              <li>Die <strong>Notiz</strong> ist nur für die Praxis sichtbar, sie steht nirgends auf dem QR-Code oder der Überweisung.</li>
            </ul>
          </div>
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Kassen-Eintrag" size="sm">
        {detail ? (
          <div className="space-y-3 text-sm">
            {detail.beleg_nr ? (
              <div className="flex items-center justify-between">
                <span className="text-praxis-400">Beleg-Nr.</span>
                <span className="font-semibold">{detail.beleg_nr}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-praxis-400">Typ</span>
              <span className="font-semibold">{detail.buchungstyp === "ausgabe" ? "Praxis-Ausgabe" : "Patienten-Einnahme"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-praxis-400">Patient</span>
              <span className="font-semibold">{detail.patient_id ? `${detail.patients?.nachname}, ${detail.patients?.vorname}` : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-praxis-400">Betrag</span>
              <span className={`font-semibold ${detail.buchungstyp === "ausgabe" ? "text-accent-coral" : ""}`}>{signedEuro(Number(detail.betrag || 0), detail.buchungstyp || "einnahme")} €</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-praxis-400">Zahlart</span>
              <span>{ZAHLARTEN.find(a => a.key === detail.zahlart)?.label}</span>
            </div>
            {(detail.quartal_jahr && detail.quartal_nummer) ? (
              <div className="flex items-center justify-between">
                <span className="text-praxis-400">Quartal</span>
                <span>{`Q${detail.quartal_nummer} ${detail.quartal_jahr}`}</span>
              </div>
            ) : null}
            {detail.zweck ? (
              <div className="flex items-center justify-between gap-3">
                <span className="shrink-0 text-praxis-400">Verwendungszweck</span>
                <span className="text-right text-xs">{detail.zweck}</span>
              </div>
            ) : null}
            {detail.notiz ? (
              <div className="flex items-center justify-between gap-3">
                <span className="shrink-0 text-praxis-400">Notiz</span>
                <span className="text-right text-xs">{detail.notiz}</span>
              </div>
            ) : null}
            {detail.buchungstyp !== "ausgabe" && detail.zahlart === "qr_ueberweisung" ? (
              <div className="flex items-center justify-between">
                <span className="text-praxis-400">Status</span>
                {detail.transaktion_id
                  ? <span className="font-semibold text-[#5f9339]">eingegangen{detail.eingang_typ === "echtzeit" ? " (Echtzeit)" : detail.eingang_typ === "standard" ? " (Standard)" : ""}</span>
                  : <span>wartet auf Geldeingang</span>}
              </div>
            ) : null}
            {detailQr && !detail.transaktion_id ? (
              <div className="rounded-lg border border-surface-200 p-3 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detailQr} alt="GiroCode" className="mx-auto rounded" />
                <p className="mt-1 text-xs text-praxis-400">GiroCode, kann jederzeit erneut gescannt werden.</p>
              </div>
            ) : null}
            <a
              href={`/kasse/beleg?id=${detail.id}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary block w-full text-center text-xs"
            >
              Beleg anzeigen / drucken
            </a>
            {(!detail.transaktion_id || detail.buchungstyp === "ausgabe") ? (
              loeschBestaetigung ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-red-400/40 p-3">
                  <span className="text-xs text-red-400">Wirklich löschen? Das lässt sich nicht rückgängig machen.</span>
                  <button className="btn-secondary text-xs" onClick={loescheEintrag}>Ja, löschen</button>
                </div>
              ) : (
                <button className="btn-secondary w-full text-xs" onClick={() => setLoeschBestaetigung(true)}>
                  Eintrag löschen (z.&nbsp;B. Demo oder Irrtum)
                </button>
              )
            ) : (
              <p className="text-xs text-praxis-400">Dieser Eintrag ist mit einer eingegangenen Zahlung verknüpft und kann nicht gelöscht werden.</p>
            )}
          </div>
        ) : null}
      </Modal>
      <Modal open={!!bestaetigung} onClose={() => setBestaetigung(null)} title={bestaetigung?.buchungstyp === "ausgabe" ? "Ausgabe erfasst" : "Zahlung erfasst"}>
        {bestaetigung && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={20} /></span>
              <div>
                <div className="text-sm font-semibold">{bestaetigung.name}</div>
                <div className="text-xs text-praxis-500">{bestaetigung.zahlart}</div>
              </div>
            </div>
            <div className={`text-2xl font-bold ${bestaetigung.buchungstyp === "ausgabe" ? "text-accent-coral" : ""}`}>{signedEuro(bestaetigung.betrag, bestaetigung.buchungstyp)} €</div>
            {bestaetigung.rest !== null && (
              <div className="text-sm" style={{ color: "#b88a2e" }}>Verbleibendes Anima-Balance-Guthaben: {bestaetigung.rest.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</div>
            )}
            <div className="flex gap-2 pt-1">
              <a className="ac-btn-primary" href={`/kasse/beleg?id=${bestaetigung.kzId}`} target="_blank" rel="noreferrer">Beleg öffnen</a>
              <button className="ac-chip" onClick={() => setBestaetigung(null)}>Schließen</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
