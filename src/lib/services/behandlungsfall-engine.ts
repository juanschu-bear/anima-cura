// ============================================================
// BEHANDLUNGSFALL ENGINE – Phasen & Forderungen erzeugen
// ============================================================
// Nimmt einen angelegten Behandlungsfall und erzeugt daraus:
//  1. die Phasen des Patienten aus der phasen_vorlage
//  2. die feststehenden Forderungen in raten (AD, Labor, Raten)
// Quartalsanteile bei removable/multiband fehlen noch (die Praxis
// muss die Betraege liefern) und werden hier uebersprungen.
// ============================================================

import { createServerClient } from "../db/supabase";

type Db = ReturnType<typeof createServerClient>;

export interface EngineResult {
  fall_id: string;
  treatment_type: string | null;
  phasen_erzeugt: number;
  forderungen_erzeugt: number;
  ratenplaene_erzeugt: number;
  uebersprungen: string[];
  errors: string[];
}

interface FallRow {
  id: string;
  patient_id: string;
  treatment_type: string;
  start_datum: string | null;
}

// Detailzeilen. Supabase liefert hier untypisierte Daten, deshalb
// werden die select-Ergebnisse gezielt auf diese Interfaces gecastet.
interface AlignerDetail {
  anfangskosten: number | null;
  laborpauschale: number | null;
  gesamtkosten: number | null;
  ratenanzahl: number | null;
}

interface MultibandDetail {
  anfangsunterlagen_anteil: number | null;
  zusatzkosten_gesamt: number | null;
  zusatzkosten_raten: number | null;
}

interface RemovableDetail {
  anfangsunterlagen_anteil: number | null;
}

interface RatenInsert {
  patient_id: string;
  behandlungsfall_id: string;
  ratenplan_id: string | null;
  typ: string;
  rate_nummer: number | null;
  betrag: number;
  faellig_am: string;
  status: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

// --- Phasen aus der Vorlage anlegen -------------------------
async function erzeugePhasen(db: Db, fall: FallRow, result: EngineResult): Promise<void> {
  const { data: vorlagen, error } = await db
    .from("phasen_vorlage")
    .select("phase_nr, name, beschreibung")
    .eq("treatment_type", fall.treatment_type)
    .order("phase_nr", { ascending: true });

  if (error) {
    result.errors.push(`phasen_vorlage: ${error.message}`);
    return;
  }
  if (!vorlagen || vorlagen.length === 0) {
    result.uebersprungen.push(`keine Phasen-Vorlage fuer ${fall.treatment_type}`);
    return;
  }

  const rows = vorlagen.map((v, i) => ({
    patient_id: fall.patient_id,
    behandlungsfall_id: fall.id,
    name: v.name as string,
    beschreibung: (v.beschreibung as string | null) ?? null,
    status: i === 0 ? "aktiv" : "ausstehend",
    reihenfolge: v.phase_nr as number,
    start_datum: i === 0 ? fall.start_datum : null,
  }));

  const { error: insErr } = await db.from("behandlungsphasen").insert(rows);
  if (insErr) {
    result.errors.push(`behandlungsphasen: ${insErr.message}`);
    return;
  }
  result.phasen_erzeugt = rows.length;
}

// --- Einzelne Einmal-Forderung (AD, Labor, ...) -------------
async function einmalForderung(
  db: Db,
  fall: FallRow,
  typ: string,
  betrag: number | null,
  faellig: string,
  result: EngineResult,
): Promise<void> {
  if (betrag == null) return;
  const { error } = await db.from("raten").insert({
    patient_id: fall.patient_id,
    behandlungsfall_id: fall.id,
    ratenplan_id: null,
    typ,
    rate_nummer: null,
    betrag,
    faellig_am: faellig,
    status: "offen",
  });
  if (error) result.errors.push(`${typ}: ${error.message}`);
  else result.forderungen_erzeugt += 1;
}

// --- Monatlicher Ratenstrom (Ratenplan + n Raten) -----------
async function erzeugeRatenStrom(
  db: Db,
  fall: FallRow,
  gesamt: number,
  anzahl: number,
  startISO: string,
  result: EngineResult,
): Promise<void> {
  const monatsrate = round2(gesamt / anzahl);
  const letzte = round2(gesamt - monatsrate * (anzahl - 1)); // letzte Rate nimmt den Rundungsrest auf

  const { data: plan, error: planErr } = await db
    .from("ratenplaene")
    .insert({
      patient_id: fall.patient_id,
      behandlungsfall_id: fall.id,
      gesamtbetrag: gesamt,
      anzahl_raten: anzahl,
      rate_betrag: monatsrate,
      start_datum: startISO,
      rhythmus: "monatlich",
      status: "aktiv",
    })
    .select("id")
    .single();

  if (planErr || !plan) {
    result.errors.push(`ratenplan: ${planErr?.message ?? "kein Plan erstellt"}`);
    return;
  }
  result.ratenplaene_erzeugt += 1;

  const rows: RatenInsert[] = [];
  for (let n = 1; n <= anzahl; n += 1) {
    rows.push({
      patient_id: fall.patient_id,
      behandlungsfall_id: fall.id,
      ratenplan_id: plan.id as string,
      typ: "rate",
      rate_nummer: n,
      betrag: n === anzahl ? letzte : monatsrate,
      faellig_am: addMonths(startISO, n - 1),
      status: "offen",
    });
  }

  const { error: rErr } = await db.from("raten").insert(rows);
  if (rErr) result.errors.push(`raten: ${rErr.message}`);
  else result.forderungen_erzeugt += rows.length;
}

// --- Forderungen je Behandlungstyp --------------------------
async function erzeugeForderungen(db: Db, fall: FallRow, result: EngineResult): Promise<void> {
  // Idempotenz: existieren schon Forderungen fuer den Fall, nichts doppeln
  const { count } = await db
    .from("raten")
    .select("id", { count: "exact", head: true })
    .eq("behandlungsfall_id", fall.id);
  if ((count ?? 0) > 0) {
    result.uebersprungen.push("Forderungen existieren bereits, nichts gedoppelt");
    return;
  }

  const start = fall.start_datum ?? new Date().toISOString().split("T")[0];

  if (fall.treatment_type === "aligner_adult" || fall.treatment_type === "aligner_kid") {
    const { data } = await db
      .from("behandlungsfall_aligner")
      .select("anfangskosten, laborpauschale, gesamtkosten, ratenanzahl")
      .eq("behandlungsfall_id", fall.id)
      .single();
    const d = data as AlignerDetail | null;
    if (!d) {
      result.uebersprungen.push("kein Aligner-Detaildatensatz");
      return;
    }
    await einmalForderung(db, fall, "ad", d.anfangskosten, start, result);
    await einmalForderung(db, fall, "labor", d.laborpauschale, start, result);
    if (d.gesamtkosten != null && d.laborpauschale != null) {
      const anfang = d.anfangskosten ?? 0;
      const ratenblock = round2(d.gesamtkosten - anfang - d.laborpauschale);
      const anzahl = d.ratenanzahl ?? 24;
      if (ratenblock > 0) await erzeugeRatenStrom(db, fall, ratenblock, anzahl, start, result);
    } else {
      result.uebersprungen.push("Aligner-Ratenstrom: gesamtkosten oder laborpauschale fehlt");
    }
  } else if (fall.treatment_type === "multiband") {
    const { data } = await db
      .from("behandlungsfall_multiband")
      .select("anfangsunterlagen_anteil, zusatzkosten_gesamt, zusatzkosten_raten")
      .eq("behandlungsfall_id", fall.id)
      .single();
    const d = data as MultibandDetail | null;
    if (!d) {
      result.uebersprungen.push("kein Multiband-Detaildatensatz");
      return;
    }
    await einmalForderung(db, fall, "ad", d.anfangsunterlagen_anteil, start, result);
    if (d.zusatzkosten_gesamt != null) {
      await erzeugeRatenStrom(db, fall, round2(d.zusatzkosten_gesamt), d.zusatzkosten_raten ?? 24, start, result);
    }
    result.uebersprungen.push("Multiband-Quartalsanteile (Kasse): Betraege fehlen noch (Praxis)");
  } else if (fall.treatment_type === "removable") {
    const { data } = await db
      .from("behandlungsfall_removable")
      .select("anfangsunterlagen_anteil")
      .eq("behandlungsfall_id", fall.id)
      .single();
    const d = data as RemovableDetail | null;
    if (!d) {
      result.uebersprungen.push("kein Removable-Detaildatensatz");
      return;
    }
    await einmalForderung(db, fall, "ad", d.anfangsunterlagen_anteil, start, result);
    result.uebersprungen.push("Removable-Quartalsanteile: Betraege fehlen noch (Praxis)");
  } else {
    result.uebersprungen.push(`unbekannter treatment_type: ${fall.treatment_type}`);
  }
}

// --- Orchestrator -------------------------------------------
export async function initialisiereBehandlungsfall(fallId: string): Promise<EngineResult> {
  const db = createServerClient();
  const result: EngineResult = {
    fall_id: fallId,
    treatment_type: null,
    phasen_erzeugt: 0,
    forderungen_erzeugt: 0,
    ratenplaene_erzeugt: 0,
    uebersprungen: [],
    errors: [],
  };

  const { data, error } = await db
    .from("behandlungsfall")
    .select("id, patient_id, treatment_type, start_datum")
    .eq("id", fallId)
    .single();

  const fall = data as FallRow | null;
  if (error || !fall) {
    result.errors.push(`behandlungsfall nicht gefunden: ${error?.message ?? fallId}`);
    return result;
  }

  result.treatment_type = fall.treatment_type;
  await erzeugePhasen(db, fall, result);
  await erzeugeForderungen(db, fall, result);
  return result;
}
