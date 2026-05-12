-- ============================================================
-- ANIMA CURO – Database Schema
-- ============================================================

-- Patienten
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ivoris_id TEXT UNIQUE,
  vorname TEXT NOT NULL,
  nachname TEXT NOT NULL,
  geburtsdatum DATE NOT NULL,
  geschlecht TEXT CHECK (geschlecht IN ('m', 'w', 'd')) DEFAULT 'm',
  kasse TEXT CHECK (kasse IN ('privat', 'gesetzlich')) NOT NULL,
  versichertennummer TEXT,
  telefon TEXT,
  email TEXT,
  strasse TEXT,
  plz TEXT,
  ort TEXT,
  land TEXT DEFAULT 'DE',
  behandlung TEXT NOT NULL,
  behandlung_start DATE NOT NULL,
  behandlung_status TEXT CHECK (behandlung_status IN ('aktiv', 'abgeschlossen', 'pausiert')) DEFAULT 'aktiv',
  notizen TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patients_name ON patients (nachname, vorname);
CREATE INDEX idx_patients_status ON patients (behandlung_status);
CREATE INDEX idx_patients_kasse ON patients (kasse);
CREATE INDEX idx_patients_ivoris ON patients (ivoris_id);

-- Ratenpläne
CREATE TABLE ratenplaene (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  gesamtbetrag DECIMAL(10,2) NOT NULL,
  anzahl_raten INTEGER NOT NULL,
  rate_betrag DECIMAL(10,2) NOT NULL,
  start_datum DATE NOT NULL,
  rhythmus TEXT CHECK (rhythmus IN ('monatlich', 'quartalsweise')) DEFAULT 'monatlich',
  status TEXT CHECK (status IN ('aktiv', 'abgeschlossen', 'pausiert', 'gekündigt')) DEFAULT 'aktiv',
  sepa_mandat BOOLEAN DEFAULT FALSE,
  sepa_mandat_ref TEXT,
  notizen TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ratenplaene_patient ON ratenplaene (patient_id);
CREATE INDEX idx_ratenplaene_status ON ratenplaene (status);

-- Einzelne Raten (Rate 1, 2, 3... genau wie Maria es will)
CREATE TABLE raten (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ratenplan_id UUID REFERENCES ratenplaene(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  rate_nummer INTEGER NOT NULL,
  betrag DECIMAL(10,2) NOT NULL,
  faellig_am DATE NOT NULL,
  status TEXT CHECK (status IN ('offen', 'bezahlt', 'überfällig', 'teilbezahlt', 'storniert')) DEFAULT 'offen',
  bezahlt_am DATE,
  bezahlt_betrag DECIMAL(10,2),
  transaktion_id UUID,
  mahnstufe INTEGER DEFAULT 0 CHECK (mahnstufe BETWEEN 0 AND 3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ratenplan_id, rate_nummer)
);

CREATE INDEX idx_raten_patient ON raten (patient_id);
CREATE INDEX idx_raten_status ON raten (status);
CREATE INDEX idx_raten_faellig ON raten (faellig_am);
CREATE INDEX idx_raten_plan ON raten (ratenplan_id, rate_nummer);

-- Bankverbindungen
CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finapi_connection_id BIGINT UNIQUE,
  bank_name TEXT NOT NULL,
  iban TEXT NOT NULL,
  bic TEXT,
  status TEXT CHECK (status IN ('connected', 'disconnected', 'update_required')) DEFAULT 'connected',
  last_sync TIMESTAMPTZ,
  tan_renewal_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transaktionen (Bankbuchungen)
CREATE TABLE transaktionen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finapi_id BIGINT UNIQUE,
  bank_connection_id UUID REFERENCES bank_connections(id),
  datum DATE NOT NULL,
  betrag DECIMAL(10,2) NOT NULL,
  absender_name TEXT,
  absender_iban TEXT,
  verwendungszweck TEXT,
  kategorie TEXT,
  -- Matching
  matching_status TEXT CHECK (matching_status IN ('auto', 'manuell', 'abweichung', 'unklar', 'ignoriert')) DEFAULT 'unklar',
  matched_patient_id UUID REFERENCES patients(id),
  matched_rate_id UUID REFERENCES raten(id),
  matching_score INTEGER CHECK (matching_score BETWEEN 0 AND 100),
  matching_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transaktionen_datum ON transaktionen (datum DESC);
CREATE INDEX idx_transaktionen_matching ON transaktionen (matching_status);
CREATE INDEX idx_transaktionen_patient ON transaktionen (matched_patient_id);
CREATE INDEX idx_transaktionen_finapi ON transaktionen (finapi_id);

-- Mahnungen
CREATE TABLE mahnungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_id UUID REFERENCES raten(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  stufe INTEGER CHECK (stufe BETWEEN 1 AND 3) NOT NULL,
  typ TEXT CHECK (typ IN ('email', 'brief', 'einschreiben')) NOT NULL,
  status TEXT CHECK (status IN ('geplant', 'versendet', 'zugestellt', 'beantwortet', 'storniert')) DEFAULT 'geplant',
  geplant_am DATE NOT NULL,
  versendet_am TIMESTAMPTZ,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mahnungen_patient ON mahnungen (patient_id);
CREATE INDEX idx_mahnungen_status ON mahnungen (status);

-- KI-Analysen
CREATE TABLE ki_analysen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ TEXT CHECK (typ IN ('anomalie', 'zusammenfassung', 'prognose')) NOT NULL,
  titel TEXT NOT NULL,
  beschreibung TEXT NOT NULL,
  schweregrad TEXT CHECK (schweregrad IN ('info', 'warnung', 'kritisch')) DEFAULT 'info',
  patient_id UUID REFERENCES patients(id),
  daten JSONB DEFAULT '{}',
  gelesen BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts / Benachrichtigungen
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ TEXT CHECK (typ IN ('matching', 'mahnung', 'anomalie', 'system')) NOT NULL,
  titel TEXT NOT NULL,
  beschreibung TEXT NOT NULL,
  schweregrad TEXT CHECK (schweregrad IN ('info', 'warnung', 'kritisch')) DEFAULT 'info',
  empfaenger TEXT CHECK (empfaenger IN ('maria', 'sabine', 'alle')) DEFAULT 'alle',
  gelesen BOOLEAN DEFAULT FALSE,
  aktion_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_gelesen ON alerts (gelesen, created_at DESC);
CREATE INDEX idx_alerts_empfaenger ON alerts (empfaenger);

-- Einstellungen
CREATE TABLE einstellungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default-Einstellungen einfügen
INSERT INTO einstellungen (key, value) VALUES
  ('mahnfristen', '{"karenz_tage": 5, "stufe1_ab_tag": 6, "stufe2_ab_tag": 21, "eskalation_ab_tag": 42}'),
  ('benachrichtigungen', '{"auto_email": true, "auto_brief": true, "sabine_briefing": true, "maria_eskalation": true}'),
  ('matching', '{"min_score": 70, "auto_approve_score": 90, "fuzzy_threshold": 0.7}');

-- Audit-Log (rechtssicher)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabelle TEXT NOT NULL,
  datensatz_id UUID NOT NULL,
  aktion TEXT CHECK (aktion IN ('INSERT', 'UPDATE', 'DELETE')) NOT NULL,
  alte_werte JSONB,
  neue_werte JSONB,
  benutzer_id UUID,
  ip_adresse TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_datensatz ON audit_log (tabelle, datensatz_id);
CREATE INDEX idx_audit_zeit ON audit_log (created_at DESC);

-- ============================================================
-- Hilfsfunktionen
-- ============================================================

-- Automatisch updated_at setzen
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER ratenplaene_updated_at BEFORE UPDATE ON ratenplaene FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER raten_updated_at BEFORE UPDATE ON raten FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Überfällige Raten automatisch markieren (als Cron aufrufbar)
CREATE OR REPLACE FUNCTION mark_overdue_rates()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE raten
  SET status = 'überfällig', updated_at = NOW()
  WHERE status = 'offen'
    AND faellig_am < CURRENT_DATE
    AND faellig_am < CURRENT_DATE - INTERVAL '5 days'; -- Karenzzeit
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Dashboard-Statistiken (als View)
CREATE VIEW dashboard_stats AS
SELECT
  (SELECT SUM(betrag) FROM raten WHERE status IN ('offen', 'überfällig', 'teilbezahlt')) AS offene_forderungen,
  (SELECT COUNT(DISTINCT patient_id) FROM raten WHERE status IN ('offen', 'überfällig')) AS patienten_mit_offenen_raten,
  (SELECT SUM(bezahlt_betrag) FROM raten WHERE bezahlt_am >= DATE_TRUNC('month', CURRENT_DATE)) AS eingang_monat,
  (SELECT COUNT(*) FROM raten WHERE status = 'bezahlt' AND bezahlt_am >= DATE_TRUNC('quarter', CURRENT_DATE))::DECIMAL /
    NULLIF((SELECT COUNT(*) FROM raten WHERE faellig_am <= CURRENT_DATE AND faellig_am >= DATE_TRUNC('quarter', CURRENT_DATE)), 0) * 100 AS puenktlichkeit,
  (SELECT COUNT(DISTINCT patient_id) FROM raten WHERE mahnstufe > 0) AS im_mahnverfahren;

-- Row Level Security
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratenplaene ENABLE ROW LEVEL SECURITY;
ALTER TABLE raten ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaktionen ENABLE ROW LEVEL SECURITY;
ALTER TABLE mahnungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_analysen ENABLE ROW LEVEL SECURITY;

-- Policies (authenticated users können alles lesen/schreiben)
CREATE POLICY "Authenticated users full access" ON patients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON ratenplaene FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON raten FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON transaktionen FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON mahnungen FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON ki_analysen FOR ALL TO authenticated USING (true) WITH CHECK (true);
