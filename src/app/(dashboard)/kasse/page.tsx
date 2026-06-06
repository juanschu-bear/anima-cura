"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, Check, CreditCard, Info, QrCode, Search, X } from "lucide-react";
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
  const [seite, setSeite] = useState(1);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailQr, setDetailQr] = useState<string | null>(null);
  const [loeschBestaetigung, setLoeschBestaetigung] = useState(false);

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
  useEffect(() => { setSeite(1); }, [kassenTag, filterArt]);

  const tagesSummen = useMemo(() => {
    const s: Record<string, number> = {};
    for (const z of tagesListe) s[z.zahlart] = (s[z.zahlart] || 0) + Number(z.betrag);
    return s;
  }, [tagesListe]);

  // Verknuepft wartende QR-Zahlungen mit bereits abgeholten
  // Ueberweisungen (Zeichen im Zweck + exakter Betrag). Loest bewusst
  // KEINEN Bank-Abruf aus (PSD2-Tagesbudget); frische Daten bringen
  // Morgen-Cron und Sync-Knopf.
  async function oeffneDetail(z: any) {
    setDetail(z);
    setLoeschBestaetigung(false);
    setDetailQr(null);
    if (z.zahlart === "qr_ueberweisung") {
      const zweck = z.zweck || `Behandlung ${z.zeichen || ""} ${z.patients?.nachname || ""}`.trim();
      const url = await QRCode.toDataURL(epcPayload(Number(z.betrag), zweck), { width: 240, margin: 1 });
      setDetailQr(url);
    }
  }

  async function loescheEintrag() {
    if (!detail) return;
    await supabase.from("kassen_zahlungen").delete().eq("id", detail.id);
    setDetail(null);
    setHinweis("Eintrag gelöscht.");
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
    if (!patient) { setHinweis("Bitte zuerst einen Patienten wählen."); return; }
    if (!b) { setHinweis("Bitte einen gültigen Betrag eingeben, z. B. 36,23."); return; }

    setSaving(true);
    const zeichen = patient.ivoris_nummer || null;
    const zweckFinal = zahlart === "qr_ueberweisung"
      ? (zweckManuell ?? `${leistung} ${zeichen || ""} ${patient.nachname || ""}`).trim()
      : null;
    const { data: kz, error } = await supabase.from("kassen_zahlungen").insert({
      patient_id: patient.id,
      betrag: b,
      zahlart,
      zeichen,
      zweck: zweckFinal,
      notiz: notiz || null,
    }).select().single();
    if (error) {
      setHinweis(`Speichern fehlgeschlagen: ${error.message}`);
      setSaving(false);
      return;
    }

    if (zahlart === "qr_ueberweisung" && zweckFinal) {
      const url = await QRCode.toDataURL(epcPayload(b, zweckFinal), { width: 280, margin: 1 });
      setQrDataUrl(url);
      setQrInfo({ kzId: kz.id, name: `${patient.vorname} ${patient.nachname}`, betrag: b, zweck: zweckFinal, eingegangen: false });
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
                    Wichtig: Die Nummer {patient.ivoris_nummer} muss im Text bleiben. Ohne sie kann das Programm die Zahlung später nicht von selbst zuordnen, dann muss jemand von Hand suchen.
                  </p>
                ) : null}
              </div>
            );
          })() : null}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-praxis-500">Notiz (optional, nur für die Praxis sichtbar, steht nicht im QR-Code)</span>
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
            {(() => {
              const gefiltert = tagesListe.filter(z => filterArt === "alle" || z.zahlart === filterArt);
              const proSeite = 10;
              const seiten = Math.max(1, Math.ceil(gefiltert.length / proSeite));
              const sichtbar = gefiltert.slice((seite - 1) * proSeite, seite * proSeite);
              if (gefiltert.length === 0) {
                return <p className="text-sm text-praxis-400">Keine Zahlungen an diesem Tag{filterArt !== "alle" ? " mit dieser Zahlart" : ""}.</p>;
              }
              return (
                <>
              <div className="space-y-1">
                {sichtbar.map((z: any) => (
                  <button key={z.id} onClick={() => oeffneDetail(z)} className="flex w-full items-center justify-between border-b border-surface-100 py-1.5 text-left text-sm transition-colors last:border-0 hover:bg-surface-100/50">
                    <span>{z.patients?.nachname}, {z.patients?.vorname}</span>
                    <span className="text-xs text-praxis-400">
                      {ZAHLARTEN.find(a => a.key === z.zahlart)?.label}
                      {z.zahlart === "qr_ueberweisung" ? (
                        z.transaktion_id
                          ? <span className="ml-1 font-semibold text-[#5f9339]">· eingegangen{z.eingang_typ === "echtzeit" ? " (Echtzeit)" : z.eingang_typ === "standard" ? " (Standard)" : ""}</span>
                          : <span className="ml-1" title="Standard-Überweisungen brauchen 1 Banktag">· wartet auf Geldeingang</span>
                      ) : null}
                    </span>
                    <span className="font-semibold">{Number(z.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
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
              <li>Barzahlungen werden genauso eingetragen, dann ist der Tag komplett.</li>
              <li>Die <strong>Notiz</strong> ist nur für die Praxis sichtbar, sie steht nirgends auf dem QR-Code oder der Überweisung.</li>
            </ul>
          </div>
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Kassen-Eintrag" size="sm">
        {detail ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-praxis-400">Patient</span>
              <span className="font-semibold">{detail.patients?.nachname}, {detail.patients?.vorname}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-praxis-400">Betrag</span>
              <span className="font-semibold">{Number(detail.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-praxis-400">Zahlart</span>
              <span>{ZAHLARTEN.find(a => a.key === detail.zahlart)?.label}</span>
            </div>
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
            {detail.zahlart === "qr_ueberweisung" ? (
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
            {!detail.transaktion_id ? (
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
    </div>
  );
}
