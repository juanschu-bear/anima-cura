-- ============================================================
-- ANIMA CURA – Migration 017: Behandlungsstruktur
-- ============================================================
-- Additiv. Legt nur neue Tabellen an (CREATE TABLE IF NOT EXISTS),
-- erweitert ratenplaene um eine nullable Spalte und seedet die
-- Phasen-Vorlagen. Kein DROP, keine Aenderung an bestehenden Daten.
--
-- Neu:
--   zahler                    Wer zahlt (getrennt vom Patienten)
--   behandlungsfall           Ein Fall pro Behandlung, haengt an patients
--   behandlungsfall_aligner   Detailfelder nur fuer Aligner
--   behandlungsfall_removable Detailfelder nur fuer herausnehmbare Spange
--   behandlungsfall_multiband Detailfelder nur fuer Multiband
--   phasen_vorlage            Phasen je Typ + Kopplung an Zahlung (Lookup)
--
-- Bewusst NICHT hier (kommt im naechsten Schritt, sobald die
-- Quartalsbetraege von der Praxis da sind): die Erzeugung der
-- konkreten Forderungen (Anfang, Labor, Quartal, Raten) in
-- ratenplaene/raten und die Einmal-Forderungen.
-- ============================================================


-- 1. Zahler ---------------------------------------------------
-- Bei Erwachsenen, die selbst zahlen, bleibt behandlungsfall.zahler_id NULL.
-- Ein Zahler (z.B. ein Elternteil) kann an mehreren Faellen haengen,
-- daran erkennt das System spaeter das zweite Kind (Eigenanteil 10 statt 20 %).
CREATE TABLE IF NOT EXISTS zahler (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  beziehung   TEXT,                       -- z.B. 'Erziehungsberechtigter'
  email       TEXT,
  telefon     TEXT,
  strasse     TEXT,
  plz         TEXT,
  ort         TEXT,
  ivoris_id   TEXT,                        -- optional, falls aus ivoris (Rechnungsempfaenger)
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);


-- 2. Behandlungsfall -----------------------------------------
CREATE TABLE IF NOT EXISTS behandlungsfall (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  zahler_id             UUID REFERENCES zahler(id) ON DELETE SET NULL,  -- NULL = Patient zahlt selbst
  treatment_type        TEXT NOT NULL CHECK (treatment_type IN ('aligner_adult', 'aligner_kid', 'removable', 'multiband')),
  kig_grad              SMALLINT CHECK (kig_grad BETWEEN 1 AND 5),       -- NULL bei rein privat
  abrechnungsweg        TEXT NOT NULL CHECK (abrechnungsweg IN ('kasse', 'privat')) DEFAULT 'privat',
  eigenanteil_prozent   SMALLINT CHECK (eigenanteil_prozent IN (10, 20)), -- NULL bei privat
  status                TEXT NOT NULL CHECK (status IN ('geplant', 'aktiv', 'pausiert', 'abgeschlossen', 'abgebrochen')) DEFAULT 'geplant',
  start_datum           DATE,
  voraussichtliches_ende DATE,
  notizen               TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_behandlungsfall_patient ON behandlungsfall (patient_id);
CREATE INDEX IF NOT EXISTS idx_behandlungsfall_zahler  ON behandlungsfall (zahler_id);
CREATE INDEX IF NOT EXISTS idx_behandlungsfall_typ     ON behandlungsfall (treatment_type);
CREATE INDEX IF NOT EXISTS idx_behandlungsfall_status  ON behandlungsfall (status);


-- 3. Detailtabellen pro Typ ----------------------------------
-- Je genau ein Detail-Datensatz pro Fall (UNIQUE), passend zu treatment_type.

CREATE TABLE IF NOT EXISTS behandlungsfall_aligner (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  behandlungsfall_id  UUID NOT NULL UNIQUE REFERENCES behandlungsfall(id) ON DELETE CASCADE,
  select_type         TEXT CHECK (select_type IN ('select_10', 'select_20', 'select_30', 'select_unlimited', 'kid_1', 'kid_2')),
  anfangskosten       NUMERIC(10,2) DEFAULT 450.00,   -- fix, sofort
  laborpauschale      NUMERIC(10,2),                  -- 800 / 1000 / 1250 / 1500, patientenabhaengig
  gesamtkosten        NUMERIC(10,2),
  ratenblock          NUMERIC(10,2),                  -- = gesamtkosten - anfangskosten - laborpauschale
  ratenanzahl         INTEGER DEFAULT 24,
  retention_bezahlt   BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS behandlungsfall_removable (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  behandlungsfall_id        UUID NOT NULL UNIQUE REFERENCES behandlungsfall(id) ON DELETE CASCADE,
  anfangsunterlagen_anteil  NUMERIC(10,2) DEFAULT 60.00,  -- 20 % der Unterlagen
  quartalsanzahl            INTEGER DEFAULT 6,            -- fixe 6 Behandlungsquartale
  zusatzspange              BOOLEAN DEFAULT FALSE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS behandlungsfall_multiband (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  behandlungsfall_id        UUID NOT NULL UNIQUE REFERENCES behandlungsfall(id) ON DELETE CASCADE,
  anfangsunterlagen_anteil  NUMERIC(10,2) DEFAULT 80.00,  -- 20 % der Unterlagen
  quartalsanzahl            INTEGER DEFAULT 12,           -- Standard 12, Bereich 6-20
  zusatzkosten_gesamt       NUMERIC(10,2),               -- private Mehrleistung
  zusatzkosten_raten        INTEGER DEFAULT 24,          -- 24 Monatsraten, parallel zum Quartalsstrom
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);


-- 4. Phasen-Vorlage (Lookup) ---------------------------------
-- Phasen je Behandlungstyp. loest_zahlung markiert den Trigger-Punkt,
-- zahlungstyp sagt, welche Art Forderung an der Phase entsteht.
-- Hinweis Multiband: an Phase 4 startet zusaetzlich der parallele
-- Zusatzkosten-Ratenstrom (24 Monate), das uebernimmt die spaetere
-- Erzeugungslogik anhand von behandlungsfall_multiband.
CREATE TABLE IF NOT EXISTS phasen_vorlage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_type  TEXT NOT NULL CHECK (treatment_type IN ('aligner_adult', 'aligner_kid', 'removable', 'multiband')),
  phase_nr        INTEGER NOT NULL,
  name            TEXT NOT NULL,
  beschreibung    TEXT,
  loest_zahlung   BOOLEAN NOT NULL DEFAULT FALSE,
  zahlungstyp     TEXT CHECK (zahlungstyp IN ('anfang', 'labor', 'quartal', 'rate', 'retention')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (treatment_type, phase_nr)
);

-- Seed: Aligner (adult und kid teilen sich die Phasen P1-P9)
INSERT INTO phasen_vorlage (treatment_type, phase_nr, name, loest_zahlung, zahlungstyp) VALUES
  ('aligner_adult', 1, 'Anfangsunterlagen',        TRUE,  'anfang'),
  ('aligner_adult', 2, 'Simulation & Planung',     FALSE, NULL),
  ('aligner_adult', 3, 'Entscheidung / Genehmigung', FALSE, NULL),
  ('aligner_adult', 4, 'Laborkosten',              TRUE,  'labor'),
  ('aligner_adult', 5, 'Behandlungsbeginn',        TRUE,  'rate'),
  ('aligner_adult', 6, 'Aktive Behandlung',        TRUE,  'rate'),
  ('aligner_adult', 7, 'Refinements',              TRUE,  'rate'),
  ('aligner_adult', 8, 'Endphase',                 TRUE,  'retention'),
  ('aligner_adult', 9, 'Behandlungsschluss',       FALSE, NULL),
  ('aligner_kid',   1, 'Anfangsunterlagen',        TRUE,  'anfang'),
  ('aligner_kid',   2, 'Simulation & Planung',     FALSE, NULL),
  ('aligner_kid',   3, 'Entscheidung / Genehmigung', FALSE, NULL),
  ('aligner_kid',   4, 'Laborkosten',              TRUE,  'labor'),
  ('aligner_kid',   5, 'Behandlungsbeginn',        TRUE,  'rate'),
  ('aligner_kid',   6, 'Aktive Behandlung',        TRUE,  'rate'),
  ('aligner_kid',   7, 'Refinements',              TRUE,  'rate'),
  ('aligner_kid',   8, 'Endphase',                 TRUE,  'retention'),
  ('aligner_kid',   9, 'Behandlungsschluss',       FALSE, NULL)
ON CONFLICT (treatment_type, phase_nr) DO NOTHING;

-- Seed: Herausnehmbare Spange (Phasen 1-5)
INSERT INTO phasen_vorlage (treatment_type, phase_nr, name, loest_zahlung, zahlungstyp) VALUES
  ('removable', 1, 'Anfang & Unterlagen',      TRUE,  'anfang'),
  ('removable', 2, 'Plan genehmigt, Abdruck',  FALSE, NULL),
  ('removable', 3, 'Geraet einsetzen',         FALSE, NULL),
  ('removable', 4, 'Quartalskontrollen',       TRUE,  'quartal'),
  ('removable', 5, 'Behandlungsende',          FALSE, NULL)
ON CONFLICT (treatment_type, phase_nr) DO NOTHING;

-- Seed: Multiband (Phasen 1-6)
INSERT INTO phasen_vorlage (treatment_type, phase_nr, name, loest_zahlung, zahlungstyp) VALUES
  ('multiband', 1, 'Beratung & KIG-Pruefung',     FALSE, NULL),
  ('multiband', 2, 'Anfangsunterlagen',           TRUE,  'anfang'),
  ('multiband', 3, 'Genehmigung & Besprechung',   FALSE, NULL),
  ('multiband', 4, 'Spange einsetzen, Start',     TRUE,  'quartal'),
  ('multiband', 5, 'Aktive Behandlung',           TRUE,  'quartal'),
  ('multiband', 6, 'Behandlungsende',             FALSE, NULL)
ON CONFLICT (treatment_type, phase_nr) DO NOTHING;


-- 5. ratenplaene an den Fall haengen -------------------------
-- Damit erzeugte Ratenplaene (z.B. die zwei Stroeme beim Multiband)
-- eindeutig zu einem Behandlungsfall gehoeren. Nullable, additiv.
ALTER TABLE ratenplaene
  ADD COLUMN IF NOT EXISTS behandlungsfall_id UUID REFERENCES behandlungsfall(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ratenplaene_behandlungsfall ON ratenplaene (behandlungsfall_id);


-- 6. updated_at-Trigger (Funktion update_updated_at existiert seit 001) --
CREATE TRIGGER zahler_updated_at                  BEFORE UPDATE ON zahler                  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER behandlungsfall_updated_at         BEFORE UPDATE ON behandlungsfall         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER behandlungsfall_aligner_updated_at BEFORE UPDATE ON behandlungsfall_aligner FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER behandlungsfall_removable_updated_at BEFORE UPDATE ON behandlungsfall_removable FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER behandlungsfall_multiband_updated_at BEFORE UPDATE ON behandlungsfall_multiband FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- 7. Row Level Security --------------------------------------
-- Behandlungs- und Zahlerdaten sind Praxis-intern. Lesen: admin/verwaltung/lesezugriff.
-- Schreiben: admin/verwaltung. Muster wie in 004.
ALTER TABLE zahler                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE behandlungsfall           ENABLE ROW LEVEL SECURITY;
ALTER TABLE behandlungsfall_aligner   ENABLE ROW LEVEL SECURITY;
ALTER TABLE behandlungsfall_removable ENABLE ROW LEVEL SECURITY;
ALTER TABLE behandlungsfall_multiband ENABLE ROW LEVEL SECURITY;
ALTER TABLE phasen_vorlage            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Praxis full access zahler" ON zahler FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung')));

CREATE POLICY "Praxis full access behandlungsfall" ON behandlungsfall FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung')));

CREATE POLICY "Praxis full access behandlungsfall_aligner" ON behandlungsfall_aligner FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung')));

CREATE POLICY "Praxis full access behandlungsfall_removable" ON behandlungsfall_removable FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung')));

CREATE POLICY "Praxis full access behandlungsfall_multiband" ON behandlungsfall_multiband FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung')));

-- phasen_vorlage: Lookup, alle Praxisrollen lesen, admin/verwaltung pflegen
CREATE POLICY "Praxis reads phasen_vorlage" ON phasen_vorlage FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff')));

CREATE POLICY "Praxis manages phasen_vorlage" ON phasen_vorlage FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung')));
