export const DEMO_TREATMENT_TYPES = [
  "Linguale KFO",
  "Aligner-Therapie",
  "Multibracket",
  "Retainer + Nachsorge",
  "Funktionskieferorthopädie",
  "Frühbehandlung",
];

export const demoPatients = [
  {
    id: "p-mueller-steffi",
    vorname: "Steffi",
    nachname: "Müller",
    geburtsdatum: "1994-03-15",
    kasse: "privat",
    behandlung: "Linguale KFO",
    behandlung_start: "2024-01-01",
    behandlung_status: "aktiv",
    email: "steffi.mueller@example.de",
    telefon: "+49 151 1111111",
    plz: "04109",
    ort: "Leipzig",
  },
  {
    id: "p-schmidt-thomas",
    vorname: "Thomas",
    nachname: "Schmidt",
    geburtsdatum: "1988-10-08",
    kasse: "privat",
    behandlung: "Aligner-Therapie",
    behandlung_start: "2024-05-01",
    behandlung_status: "aktiv",
    email: "thomas.schmidt@example.de",
    telefon: "+49 151 2222222",
    plz: "04155",
    ort: "Leipzig",
  },
  {
    id: "p-weber-anna",
    vorname: "Anna",
    nachname: "Weber",
    geburtsdatum: "1999-06-20",
    kasse: "gesetzlich",
    behandlung: "Multibracket",
    behandlung_start: "2025-01-01",
    behandlung_status: "aktiv",
    email: "anna.weber@example.de",
    telefon: "+49 151 3333333",
    plz: "04416",
    ort: "Markkleeberg",
  },
  {
    id: "p-fischer-klaus",
    vorname: "Klaus",
    nachname: "Fischer",
    geburtsdatum: "1984-12-09",
    kasse: "privat",
    behandlung: "Retainer + Nachsorge",
    behandlung_start: "2023-01-01",
    behandlung_status: "aktiv",
    email: "klaus.fischer@example.de",
    telefon: "+49 151 4444444",
    plz: "04315",
    ort: "Leipzig",
  },
  {
    id: "p-becker-lisa",
    vorname: "Lisa",
    nachname: "Becker",
    geburtsdatum: "1995-07-11",
    kasse: "privat",
    behandlung: "Funktionskieferorthopädie",
    behandlung_start: "2024-03-01",
    behandlung_status: "aktiv",
    email: "lisa.becker@example.de",
    telefon: "+49 151 5555555",
    plz: "04275",
    ort: "Leipzig",
  },
];

const planSeeds = [
  { id: "rp-1", patient_id: "p-mueller-steffi", gesamtbetrag: 9000, anzahl_raten: 36, rate_betrag: 250, start_datum: "2024-01-01", status: "aktiv", paid: 24, warningAt: -1 },
  { id: "rp-2", patient_id: "p-schmidt-thomas", gesamtbetrag: 4320, anzahl_raten: 24, rate_betrag: 180, start_datum: "2024-05-01", status: "aktiv", paid: 12, warningAt: 13 },
  { id: "rp-3", patient_id: "p-weber-anna", gesamtbetrag: 5760, anzahl_raten: 18, rate_betrag: 320, start_datum: "2025-01-01", status: "aktiv", paid: 7, warningAt: -1 },
  { id: "rp-4", patient_id: "p-fischer-klaus", gesamtbetrag: 5400, anzahl_raten: 36, rate_betrag: 150, start_datum: "2023-01-01", status: "aktiv", paid: 31, warningAt: -1 },
  { id: "rp-5", patient_id: "p-becker-lisa", gesamtbetrag: 7200, anzahl_raten: 30, rate_betrag: 240, start_datum: "2024-03-01", status: "aktiv", paid: 17, warningAt: 18 },
];

export const demoPlaene = planSeeds.map((p) => ({
  ...p,
  patients: {
    vorname: demoPatients.find((x) => x.id === p.patient_id)?.vorname || "",
    nachname: demoPatients.find((x) => x.id === p.patient_id)?.nachname || "",
    behandlung: demoPatients.find((x) => x.id === p.patient_id)?.behandlung || "",
  },
}));

export const demoRaten = planSeeds.flatMap((plan) =>
  Array.from({ length: plan.anzahl_raten }).map((_, index) => {
    const due = new Date(plan.start_datum);
    due.setMonth(due.getMonth() + index);
    const paid = index < plan.paid;
    const isWarning = plan.warningAt === index + 1;
    return {
      id: `rate-${plan.id}-${index + 1}`,
      ratenplan_id: plan.id,
      patient_id: plan.patient_id,
      rate_nummer: index + 1,
      betrag: plan.rate_betrag,
      faellig_am: due.toISOString().slice(0, 10),
      status: paid ? "bezahlt" : isWarning ? "überfällig" : "offen",
      bezahlt_betrag: paid ? plan.rate_betrag : null,
      mahnstufe: paid ? 0 : isWarning ? 1 : 0,
    };
  })
);

export const demoTransaktionen = [
  { id: "tx-1", datum: "2026-05-10", betrag: 250, absender_name: "Müller Steffi", verwendungszweck: "Rate 25 Linguale KFO", matching_status: "abweichung", matching_score: 82, matched_patient_id: "p-mueller-steffi" },
  { id: "tx-2", datum: "2026-05-09", betrag: 180, absender_name: "Schmidt Thomas", verwendungszweck: "Aligner Rate", matching_status: "auto", matching_score: 97, matched_patient_id: "p-schmidt-thomas" },
  { id: "tx-3", datum: "2026-05-08", betrag: 320, absender_name: "Weber Anna", verwendungszweck: "Multibracket", matching_status: "unklar", matching_score: 55, matched_patient_id: null },
  { id: "tx-4", datum: "2026-05-07", betrag: 240, absender_name: "Becker Lisa", verwendungszweck: "KFO", matching_status: "unklar", matching_score: 63, matched_patient_id: null },
].map((tx) => ({
  ...tx,
  patients: tx.matched_patient_id
    ? {
        vorname: demoPatients.find((p) => p.id === tx.matched_patient_id)?.vorname || "",
        nachname: demoPatients.find((p) => p.id === tx.matched_patient_id)?.nachname || "",
      }
    : null,
}));

export const demoAlerts = [
  { id: "a-1", titel: "2 ungeklärte Zahlungseingänge", beschreibung: "Bitte manuelle Zuordnung prüfen.", schweregrad: "warnung", gelesen: false, created_at: "2026-05-13T08:00:00Z" },
  { id: "a-2", titel: "Mahnstufe 1 erforderlich", beschreibung: "Patient Becker, Rate 18 ist überfällig.", schweregrad: "kritisch", gelesen: false, created_at: "2026-05-12T14:00:00Z" },
  { id: "a-3", titel: "Bank-Sync erfolgreich", beschreibung: "4 neue Buchungen importiert.", schweregrad: "info", gelesen: true, created_at: "2026-05-12T06:02:00Z" },
];

export const demoSettings = {
  mahnfristen: { karenz_tage: 5, stufe1_ab_tag: 6, stufe2_ab_tag: 21, eskalation_ab_tag: 42 },
  benachrichtigungen: { auto_email: true, auto_brief: true, sabine_briefing: true, maria_eskalation: true },
  matching: { min_score: 70, auto_approve_score: 90, fuzzy_threshold: 0.7 },
};

export const demoDashboardStats = {
  offene_forderungen: demoRaten
    .filter((r) => r.status === "offen" || r.status === "überfällig")
    .reduce((sum, r) => sum + r.betrag, 0),
  eingang_monat: 16840,
  puenktlichkeit: 86,
  im_mahnverfahren: demoRaten.filter((r) => r.mahnstufe > 0).length,
};

export function demoPatientenForList(search?: string) {
  const byPatient = new Map<string, any[]>();
  for (const rate of demoRaten) {
    if (!byPatient.has(rate.patient_id)) byPatient.set(rate.patient_id, []);
    byPatient.get(rate.patient_id)?.push(rate);
  }

  const rows = demoPatients.map((p) => ({
    ...p,
    raten: byPatient.get(p.id) || [],
  }));

  if (!search) return rows;
  const needle = search.toLowerCase();
  return rows.filter(
    (p) =>
      p.vorname.toLowerCase().includes(needle) ||
      p.nachname.toLowerCase().includes(needle)
  );
}

export function demoPatientDetail(id: string) {
  const patient = demoPatients.find((p) => p.id === id);
  if (!patient) return null;
  const ratenplaene = demoPlaene.filter((rp) => rp.patient_id === id);
  const raten = demoRaten.filter((r) => r.patient_id === id);
  const mahnungen = raten
    .filter((r) => r.mahnstufe > 0)
    .map((r) => ({
      id: `m-${r.id}`,
      rate_id: r.id,
      patient_id: id,
      stufe: r.mahnstufe,
      typ: "email",
      status: "geplant",
      geplant_am: r.faellig_am,
      versendet_am: null,
      text: "Automatisch generierte Mahnung.",
    }));
  return { ...patient, ratenplaene, raten, mahnungen };
}
