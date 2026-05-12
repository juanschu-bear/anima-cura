// ============================================================
// ANIMA CURO – Type Definitions
// ============================================================

// ─── Patient ────────────────────────────────────────────────
export interface Patient {
  id: string;
  ivoris_id: string | null; // ID aus ivoris für Sync
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  geschlecht: "m" | "w" | "d";
  kasse: "privat" | "gesetzlich";
  versichertennummer: string | null;
  telefon: string | null;
  email: string | null;
  adresse: Address | null;
  behandlung: string;
  behandlung_start: string;
  behandlung_status: "aktiv" | "abgeschlossen" | "pausiert";
  notizen: string | null;
  created_at: string;
  updated_at: string;
}

export interface Address {
  strasse: string;
  plz: string;
  ort: string;
  land: string;
}

// ─── Ratenplan ──────────────────────────────────────────────
export interface Ratenplan {
  id: string;
  patient_id: string;
  gesamtbetrag: number;
  anzahl_raten: number;
  rate_betrag: number;
  start_datum: string;
  rhythmus: "monatlich" | "quartalsweise";
  status: "aktiv" | "abgeschlossen" | "pausiert" | "gekündigt";
  sepa_mandat: boolean;
  sepa_mandat_ref: string | null;
  notizen: string | null;
  created_at: string;
  updated_at: string;
}

export interface Rate {
  id: string;
  ratenplan_id: string;
  patient_id: string;
  rate_nummer: number; // Rate 1, 2, 3... genau wie Maria es will
  betrag: number;
  faellig_am: string;
  status: "offen" | "bezahlt" | "überfällig" | "teilbezahlt" | "storniert";
  bezahlt_am: string | null;
  bezahlt_betrag: number | null;
  transaktion_id: string | null; // Verknüpfung zur Bankbuchung
  mahnstufe: number; // 0 = keine, 1-3
  created_at: string;
  updated_at: string;
}

// ─── Bankdaten ──────────────────────────────────────────────
export interface BankConnection {
  id: string;
  finapi_connection_id: number;
  bank_name: string;
  iban: string;
  bic: string | null;
  status: "connected" | "disconnected" | "update_required";
  last_sync: string | null;
  tan_renewal_date: string | null;
  created_at: string;
}

export interface Transaktion {
  id: string;
  finapi_id: number | null;
  bank_connection_id: string;
  datum: string;
  betrag: number;
  absender_name: string;
  absender_iban: string | null;
  verwendungszweck: string;
  kategorie: string | null;
  // Matching
  matching_status: "auto" | "manuell" | "abweichung" | "unklar" | "ignoriert";
  matched_patient_id: string | null;
  matched_rate_id: string | null;
  matching_score: number | null; // 0-100 Konfidenz
  matching_details: MatchingDetails | null;
  created_at: string;
}

export interface MatchingDetails {
  name_score: number;
  betrag_match: boolean;
  zweck_score: number;
  methode: "exakt" | "fuzzy" | "iban" | "manuell";
}

// ─── Mahnwesen ──────────────────────────────────────────────
export interface Mahnung {
  id: string;
  rate_id: string;
  patient_id: string;
  stufe: 1 | 2 | 3;
  typ: "email" | "brief" | "einschreiben";
  status: "geplant" | "versendet" | "zugestellt" | "beantwortet" | "storniert";
  geplant_am: string;
  versendet_am: string | null;
  text: string;
  created_at: string;
}

export interface MahnEinstellungen {
  karenz_tage: number;
  stufe1_ab_tag: number;
  stufe2_ab_tag: number;
  eskalation_ab_tag: number;
  auto_email: boolean;
  auto_brief: boolean;
  sabine_briefing: boolean;
  maria_eskalation: boolean;
}

// ─── Auswertung ─────────────────────────────────────────────
export interface QuartalReport {
  quartal: string; // "Q2 2026"
  zeitraum: { von: string; bis: string };
  umsatz_gesamt: number;
  umsatz_privat: number;
  umsatz_gesetzlich: number;
  patienten_aktiv: number;
  patienten_neu: number;
  patienten_abgeschlossen: number;
  zahlungsmoral: number; // Prozent pünktlich
  offene_forderungen: number;
  ausfallquote: number;
  top_behandlungen: { name: string; count: number; revenue: number }[];
}

// ─── KI-Analyse ─────────────────────────────────────────────
export interface KIAnalyse {
  id: string;
  typ: "anomalie" | "zusammenfassung" | "prognose";
  titel: string;
  beschreibung: string;
  schweregrad: "info" | "warnung" | "kritisch";
  patient_id: string | null;
  daten: Record<string, unknown>;
  gelesen: boolean;
  created_at: string;
}

// ─── Alerts & Benachrichtigungen ────────────────────────────
export interface Alert {
  id: string;
  typ: "matching" | "mahnung" | "anomalie" | "system";
  titel: string;
  beschreibung: string;
  schweregrad: "info" | "warnung" | "kritisch";
  empfaenger: "maria" | "sabine" | "alle";
  gelesen: boolean;
  aktion_url: string | null;
  created_at: string;
}

// ─── Auth / User ────────────────────────────────────────────
export interface AppUser {
  id: string;
  email: string;
  name: string;
  rolle: "admin" | "verwaltung" | "lesezugriff";
  berechtigungen: {
    zahlungen: boolean;
    mahnwesen: boolean;
    einstellungen: boolean;
    patienten_bearbeiten: boolean;
  };
}

// ─── finAPI Types ───────────────────────────────────────────
export interface FinAPIToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface FinAPITransaction {
  id: number;
  amount: number;
  counterpartName: string | null;
  counterpartIban: string | null;
  purpose: string | null;
  bookingDate: string;
  valueDate: string;
  bankBookingDate: string;
  category?: { id: number; name: string };
}

export interface FinAPIBankConnection {
  id: number;
  bankId: number;
  name: string;
  status: string;
  accountIds: number[];
  lastSuccessfulUpdate: string | null;
}
