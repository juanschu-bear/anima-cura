-- ============================================================
-- ANIMA CURA – Migration 018: raten-Typ & Einmal-Forderungen
-- ============================================================
-- Additiv. Damit auch Einmal-Forderungen (AD, Labor, Quartalsanteil)
-- durch denselben Strom laufen wie die Raten, sodass Mahnwesen und
-- Bankabgleich sie automatisch erfassen. Verknuepft Phasen mit dem
-- Fall und stellt die Phasen-Vorlage von 'anfang' auf 'ad' um
-- (so bezeichnet es die Praxis). Bestehende Daten bleiben unveraendert.
-- ============================================================

-- 1. raten: Typ + Einmal-Forderungen ermoeglichen ------------
ALTER TABLE raten ADD COLUMN IF NOT EXISTS typ TEXT NOT NULL DEFAULT 'rate';
ALTER TABLE raten DROP CONSTRAINT IF EXISTS raten_typ_check;
ALTER TABLE raten ADD CONSTRAINT raten_typ_check CHECK (typ IN ('rate', 'ad', 'labor', 'quartal', 'retention'));

-- Einmal-Forderungen haengen an keinem Ratenplan und haben keine Ratennummer
ALTER TABLE raten ALTER COLUMN ratenplan_id DROP NOT NULL;
ALTER TABLE raten ALTER COLUMN rate_nummer DROP NOT NULL;

-- Direkter Bezug zum Fall (Raten haengen sonst nur ueber den Ratenplan dran)
ALTER TABLE raten ADD COLUMN IF NOT EXISTS behandlungsfall_id UUID REFERENCES behandlungsfall(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_raten_typ ON raten (typ);
CREATE INDEX IF NOT EXISTS idx_raten_behandlungsfall ON raten (behandlungsfall_id);


-- 2. Phasen an den Fall haengen ------------------------------
-- behandlungsphasen kannte bisher nur patient_id. Mit dem Fallbezug
-- bleiben die Phasen sauber pro Behandlungsfall getrennt.
ALTER TABLE behandlungsphasen ADD COLUMN IF NOT EXISTS behandlungsfall_id UUID REFERENCES behandlungsfall(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_behandlungsphasen_fall ON behandlungsphasen (behandlungsfall_id);


-- 3. Phasen-Vorlage: 'anfang' -> 'ad' ------------------------
ALTER TABLE phasen_vorlage DROP CONSTRAINT IF EXISTS phasen_vorlage_zahlungstyp_check;
UPDATE phasen_vorlage SET zahlungstyp = 'ad' WHERE zahlungstyp = 'anfang';
ALTER TABLE phasen_vorlage ADD CONSTRAINT phasen_vorlage_zahlungstyp_check CHECK (zahlungstyp IN ('ad', 'labor', 'quartal', 'rate', 'retention'));
