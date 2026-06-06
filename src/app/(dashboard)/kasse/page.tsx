"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, Check, CreditCard, QrCode, Search, X } from "lucide-react";
import QRCode from "qrcode";
import { createBrowserClient } from "@/lib/db/supabase";
import { usePatienten } from "@/hooks/useData";

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
] as const;

function parseBetrag(s: string): number | null {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
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
  const [patSearch, setPatSearch] = useState("");
  const { patienten } = usePatienten(patSearch.length >= 2 ? patSearch : undefined);
  const [patient, setPatient] = useState<any | null>(null);
  const [betrag, setBetrag] = useState("");
  const [zahlart, setZahlart] = useState<(typeof ZAHLARTEN)[number]["key"]>("qr_ueberweisung");
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

  const treffer = useMemo(
    () => (patSearch.length >= 2 && !patient ? patienten.slice(0, 8) : []),
    [patienten, patSearch, patient]
  );

  async function ladeTagesliste() {
    const { data } = await supabase
      .from("kassen_zahlungen")
      .select("*, patients:patient_id(vorname, nachname)")
      .eq("kassen_datum", kassenTag)
      .order("created_at", { ascending: false });
    setTagesListe(data || []);
  }
  useEffect(() => { ladeTagesliste(); }, [kassenTag]);

  const tagesSummen = useMemo(() => {
    const s: Record<string, number> = {};
    for (const z of tagesListe) s[z.zahlart] = (s[z.zahlart] || 0) + Number(z.betrag);
    return s;
  }, [tagesListe]);

  // Verknuepft wartende QR-Zahlungen mit bereits abgeholten
  // Ueberweisungen (Zeichen im Zweck + exakter Betrag). Loest bewusst
  // KEINEN Bank-Abruf aus (PSD2-Tagesbudget); frische Daten bringen
  // Morgen-Cron und Sync-Knopf.
  async function pruefeEingaenge() {
    setPruefe(true);
    const { data: offene } = await supabase
      .from("kassen_zahlungen")
      .select("id, betrag, zeichen, kassen_datum")
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
        if (qrInfo && qrInfo.kzId === kz.id) setQrInfo({ ...qrInfo, eingegangen: true });
      }
    }
    setPruefe(false);
    ladeTagesliste();
  }

  async function speichern() {
    setHinweis("");
    const b = parseBetrag(betrag);
    if (!patient) { setHinweis("Bitte zuerst einen Patienten wählen."); return; }
    if (!b) { setHinweis("Bitte einen gültigen Betrag eingeben, z. B. 36,23."); return; }

    setSaving(true);
    const zeichen = patient.ivoris_nummer || null;
    const { data: kz, error } = await supabase.from("kassen_zahlungen").insert({
      patient_id: patient.id,
      betrag: b,
      zahlart,
      zeichen,
      notiz: notiz || null,
    }).select().single();
    if (error) {
      setHinweis(`Speichern fehlgeschlagen: ${error.message}`);
      setSaving(false);
      return;
    }

    if (zahlart === "qr_ueberweisung") {
      const zweck = (zweckManuell ?? `${leistung} ${zeichen || ""} ${patient.nachname || ""}`).trim();
      const url = await QRCode.toDataURL(epcPayload(b, zweck), { width: 280, margin: 1 });
      setQrDataUrl(url);
      setQrInfo({ kzId: kz.id, name: `${patient.vorname} ${patient.nachname}`, betrag: b, zweck, eingegangen: false });
    } else {
      setQrDataUrl(null);
      setQrInfo(null);
    }

    setHinweis(`Erfasst: ${patient.nachname}, ${patient.vorname} · ${b.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`);
    setPatient(null);
    setPatSearch("");
    setBetrag("");
    setNotiz("");
    setZweckManuell(null);
    setLeistung(LEISTUNGEN[0]);
    setSaving(false);
    ladeTagesliste();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="ac-page-title">Kasse · AnimaPay Live</h1>
        <p className="mt-1 text-sm text-praxis-400">
          Zahlung am Tresen erfassen. Bei QR-Überweisung erscheint sofort der GiroCode mit Zeichen, die Zuordnung läuft dann von allein.
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
            <div className="grid grid-cols-2 gap-2">
              {ZAHLARTEN.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setZahlart(key)}
                  className={`ac-chip justify-center gap-2 py-3 ${zahlart === key ? "ac-chip-active" : ""}`}
                >
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          </div>

          {zahlart === "qr_ueberweisung" && patient ? (() => {
            const standard = `${leistung} ${patient.ivoris_nummer || ""} ${patient.nachname || ""}`.trim();
            const zweck = zweckManuell ?? standard;
            const ohneZeichen = patient.ivoris_nummer && !zweck.includes(patient.ivoris_nummer);
            return (
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-praxis-500">Leistung</span>
                  <select
                    className="input w-full"
                    value={leistung}
                    onChange={(e) => { setLeistung(e.target.value); setZweckManuell(null); }}
                  >
                    {LEISTUNGEN.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
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
                    Achtung: Ohne die Patientennummer {patient.ivoris_nummer} kann der Zahlungseingang nicht automatisch zugeordnet werden.
                  </p>
                ) : (
                  <p className="text-xs text-praxis-400">
                    Gutschrift geht auf {patient.vorname} {patient.nachname}, egal wer überweist (z.&nbsp;B. Eltern). Die Notiz bleibt intern.
                  </p>
                )}
              </div>
            );
          })() : null}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-praxis-500">Notiz (optional)</span>
            <input className="input w-full" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Anzahlung Retainer" />
          </label>

          <button className="btn-primary w-full py-3" onClick={speichern} disabled={saving}>
            {saving ? "Speichert …" : "Zahlung erfassen"}
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
              <p className="text-sm font-semibold">Kassenbuch</p>
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
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                onClick={() => setFilterArt("alle")}
                className={`ac-chip text-xs ${filterArt === "alle" ? "ac-chip-active" : ""}`}
              >
                Gesamt: {tagesListe.length} {tagesListe.length === 1 ? "Zahlung" : "Zahlungen"} · {tagesListe.reduce((s, z) => s + Number(z.betrag), 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </button>
              {ZAHLARTEN.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterArt(filterArt === key ? "alle" : key)}
                  className={`ac-chip text-xs ${filterArt === key ? "ac-chip-active" : ""}`}
                >
                  {label}: {(tagesSummen[key] || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                </button>
              ))}
            </div>
            {tagesListe.filter(z => filterArt === "alle" || z.zahlart === filterArt).length === 0 ? (
              <p className="text-sm text-praxis-400">Keine Zahlungen an diesem Tag{filterArt !== "alle" ? " mit dieser Zahlart" : ""}.</p>
            ) : (
              <div className="space-y-1">
                {tagesListe.filter(z => filterArt === "alle" || z.zahlart === filterArt).map((z: any) => (
                  <div key={z.id} className="flex items-center justify-between border-b border-surface-100 py-1.5 text-sm last:border-0">
                    <span>{z.patients?.nachname}, {z.patients?.vorname}</span>
                    <span className="text-xs text-praxis-400">
                      {ZAHLARTEN.find(a => a.key === z.zahlart)?.label}
                      {z.zahlart === "qr_ueberweisung" ? (
                        z.transaktion_id
                          ? <span className="ml-1 font-semibold text-[#5f9339]">· eingegangen{z.eingang_typ === "echtzeit" ? " (Echtzeit)" : z.eingang_typ === "standard" ? " (Standard)" : ""}</span>
                          : <span className="ml-1" title="Standard-Überweisungen brauchen 1 Banktag">· wartet</span>
                      ) : null}
                    </span>
                    <span className="font-semibold">{Number(z.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
