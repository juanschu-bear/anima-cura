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
  {
    id: "p-braun-michael",
    vorname: "Michael",
    nachname: "Braun",
    geburtsdatum: "1989-11-02",
    kasse: "gesetzlich",
    behandlung: "Invisalign",
    behandlung_start: "2024-09-01",
    behandlung_status: "aktiv",
    email: "michael.braun@example.de",
    telefon: "+49 151 6666666",
    plz: "04177",
    ort: "Leipzig",
  },
  {
    id: "p-hoffmann-jan",
    vorname: "Jan",
    nachname: "Hoffmann",
    geburtsdatum: "1992-05-17",
    kasse: "privat",
    behandlung: "Aligner",
    behandlung_start: "2024-10-01",
    behandlung_status: "aktiv",
    email: "jan.hoffmann@example.de",
    telefon: "+49 151 7777777",
    plz: "04229",
    ort: "Leipzig",
  },
  {
    id: "p-vogel-petra",
    vorname: "Petra",
    nachname: "Vogel",
    geburtsdatum: "1986-09-30",
    kasse: "privat",
    behandlung: "FKO",
    behandlung_start: "2024-02-01",
    behandlung_status: "aktiv",
    email: "petra.vogel@example.de",
    telefon: "+49 151 8888888",
    plz: "04347",
    ort: "Leipzig",
  },
  {
    id: "p-wolf-sandra",
    vorname: "Sandra",
    nachname: "Wolf",
    geburtsdatum: "1991-02-14",
    kasse: "gesetzlich",
    behandlung: "Linguale Technik",
    behandlung_start: "2025-01-01",
    behandlung_status: "aktiv",
    email: "sandra.wolf@example.de",
    telefon: "+49 151 9999999",
    plz: "04420",
    ort: "Markranstaedt",
  },
];

const planSeeds = [
  { id: "rp-1", patient_id: "p-mueller-steffi", gesamtbetrag: 9000, anzahl_raten: 36, rate_betrag: 250, start_datum: "2024-01-01", status: "aktiv", paid: 24, warningAt: -1, warningStage: 0 },
  { id: "rp-2", patient_id: "p-schmidt-thomas", gesamtbetrag: 4320, anzahl_raten: 24, rate_betrag: 180, start_datum: "2024-05-01", status: "aktiv", paid: 13, warningAt: 14, warningStage: 1 },
  { id: "rp-3", patient_id: "p-weber-anna", gesamtbetrag: 5760, anzahl_raten: 18, rate_betrag: 320, start_datum: "2025-01-01", status: "aktiv", paid: 7, warningAt: -1, warningStage: 0 },
  { id: "rp-4", patient_id: "p-fischer-klaus", gesamtbetrag: 5400, anzahl_raten: 36, rate_betrag: 150, start_datum: "2023-01-01", status: "aktiv", paid: 31, warningAt: -1, warningStage: 0 },
  { id: "rp-5", patient_id: "p-becker-lisa", gesamtbetrag: 8400, anzahl_raten: 30, rate_betrag: 280, start_datum: "2024-03-01", status: "aktiv", paid: 17, warningAt: 18, warningStage: 2 },
  { id: "rp-6", patient_id: "p-braun-michael", gesamtbetrag: 4800, anzahl_raten: 24, rate_betrag: 200, start_datum: "2024-09-01", status: "aktiv", paid: 8, warningAt: -1, warningStage: 0 },
  { id: "rp-7", patient_id: "p-hoffmann-jan", gesamtbetrag: 6720, anzahl_raten: 24, rate_betrag: 280, start_datum: "2024-10-01", status: "aktiv", paid: 8, warningAt: 9, warningStage: 0 },
  { id: "rp-8", patient_id: "p-vogel-petra", gesamtbetrag: 7920, anzahl_raten: 36, rate_betrag: 220, start_datum: "2024-02-01", status: "aktiv", paid: 14, warningAt: 15, warningStage: 1 },
  { id: "rp-9", patient_id: "p-wolf-sandra", gesamtbetrag: 8400, anzahl_raten: 24, rate_betrag: 350, start_datum: "2025-01-01", status: "aktiv", paid: 5, warningAt: 6, warningStage: 3 },
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
      mahnstufe: paid ? 0 : isWarning ? plan.warningStage || 1 : 0,
    };
  })
);

export const demoTransaktionen = [
  { id: "tx-1", datum: "2026-05-11", betrag: 250, absender_name: "MUELLER STEFFI", verwendungszweck: "Rate KFO Mai", matching_status: "auto", matching_score: 98, matched_patient_id: "p-mueller-steffi" },
  { id: "tx-2", datum: "2026-05-11", betrag: 320, absender_name: "WEBER ANNA", verwendungszweck: "Kieferorthop.", matching_status: "auto", matching_score: 96, matched_patient_id: "p-weber-anna" },
  { id: "tx-3", datum: "2026-05-11", betrag: 150, absender_name: "FISCHER KLAUS", verwendungszweck: "Rate 31", matching_status: "auto", matching_score: 97, matched_patient_id: "p-fischer-klaus" },
  { id: "tx-4", datum: "2026-05-11", betrag: 160, absender_name: "SCHMIDT THOMAS", verwendungszweck: "Zahnarzt", matching_status: "abweichung", matching_score: 82, matched_patient_id: "p-schmidt-thomas" },
  { id: "tx-5", datum: "2026-05-10", betrag: 500, absender_name: "UNBEKANNT GMBH", verwendungszweck: "Rechnung 4711", matching_status: "unklar", matching_score: 41, matched_patient_id: null },
  { id: "tx-6", datum: "2026-05-10", betrag: 200, absender_name: "BRAUN MICHAEL", verwendungszweck: "KFO Rate Mai", matching_status: "auto", matching_score: 94, matched_patient_id: "p-braun-michael" },
  { id: "tx-7", datum: "2026-05-09", betrag: 280, absender_name: "HOFFMANN JAN", verwendungszweck: "Aligner Rate", matching_status: "auto", matching_score: 95, matched_patient_id: "p-hoffmann-jan" },
  { id: "tx-8", datum: "2026-05-08", betrag: 190, absender_name: "KRAUSE NINA", verwendungszweck: "KFO Rate", matching_status: "manuell", matching_score: 90, matched_patient_id: null },
  { id: "tx-9", datum: "2026-05-07", betrag: 275, absender_name: "MEIER HANS", verwendungszweck: "KFO Behandlung", matching_status: "unklar", matching_score: 60, matched_patient_id: null },
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
  {
    id: "a-1",
    titel: "3 Raten automatisch zugeordnet",
    beschreibung: "Müller S. (250€), Weber A. (320€), Fischer K. (150€) heute verbucht.",
    schweregrad: "info",
    typ: "matching",
    gelesen: false,
    action_url: "/zahlungen?status=auto",
    created_at: "2026-05-13T06:12:00Z",
  },
  {
    id: "a-2",
    titel: "Betragsabweichung: Schmidt, Thomas",
    beschreibung: "Erwartete Rate 180€ · eingegangen 160€ · Differenz -20€.",
    schweregrad: "warnung",
    typ: "matching",
    gelesen: false,
    action_url: "/patienten/p-schmidt-thomas",
    created_at: "2026-05-13T06:12:00Z",
  },
  {
    id: "a-3",
    titel: "Zahlungsverzug: Becker, Lisa (Stufe 2)",
    beschreibung: "Rate 18 seit 21 Tagen überfällig. 1. Mahnung ohne Reaktion.",
    schweregrad: "kritisch",
    typ: "mahnung",
    gelesen: false,
    action_url: "/mahnwesen",
    created_at: "2026-05-13T06:12:00Z",
  },
  {
    id: "a-4",
    titel: "Cashflow-Prognose aktualisiert",
    beschreibung: "90-Tage-Prognose 142.000€ erwartet · Risiko 4.200€ (3 Patienten).",
    schweregrad: "info",
    typ: "system",
    gelesen: false,
    action_url: "/quartal",
    created_at: "2026-05-13T05:30:00Z",
  },
];

export const demoSettings = {
  mahnfristen: { karenz_tage: 5, stufe1_ab_tag: 6, stufe2_ab_tag: 21, eskalation_ab_tag: 42 },
  benachrichtigungen: { auto_email: true, auto_brief: true, sabine_briefing: true, maria_eskalation: true },
  matching: { min_score: 70, auto_approve_score: 90, fuzzy_threshold: 0.7 },
};

export const demoBankConnections = [
  {
    id: "bc-1",
    bank_name: "Sparkasse Leipzig",
    iban: "DE89 3704 0044 0532 0130 00",
    bic: "COBADEFFXXX",
    status: "connected",
    last_sync: "2026-05-13T06:00:00Z",
    tan_renewal_date: "2026-08-09",
    provider: "finAPI Access",
  },
];

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
