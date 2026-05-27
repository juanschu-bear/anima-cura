-- ============================================================
-- ANIMA CURA – Patient Portal Schema (Migration 004)
-- ============================================================

-- 1. Extend user_profiles: add 'patient' role + patient_id link
-- ============================================================

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('admin', 'verwaltung', 'lesezugriff', 'patient'));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_patient
  ON user_profiles (patient_id)
  WHERE patient_id IS NOT NULL;

-- 2. Behandlungsphasen
-- ============================================================

CREATE TABLE IF NOT EXISTS behandlungsphasen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  beschreibung TEXT,
  status TEXT NOT NULL CHECK (status IN ('abgeschlossen', 'aktiv', 'ausstehend')) DEFAULT 'ausstehend',
  reihenfolge INTEGER NOT NULL DEFAULT 1,
  start_datum DATE,
  end_datum DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_behandlungsphasen_patient ON behandlungsphasen (patient_id, reihenfolge);

CREATE TRIGGER behandlungsphasen_updated_at
  BEFORE UPDATE ON behandlungsphasen
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Patienten-Dokumente
-- ============================================================

CREATE TABLE IF NOT EXISTS patient_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  typ TEXT NOT NULL CHECK (typ IN ('kostenplan', 'vertrag', 'ratenzahlung', 'datenschutz', 'sonstiges')) DEFAULT 'sonstiges',
  file_url TEXT,
  hochgeladen_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patient_documents_patient ON patient_documents (patient_id);

-- 4. Patienten-Nachrichten (Chat)
-- ============================================================

CREATE TABLE IF NOT EXISTS patient_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('patient', 'praxis')),
  sender_name TEXT,
  text TEXT NOT NULL,
  gelesen BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patient_messages_patient ON patient_messages (patient_id, created_at DESC);
CREATE INDEX idx_patient_messages_unread ON patient_messages (patient_id, gelesen) WHERE gelesen = FALSE;

-- 5. Patienten-Benachrichtigungen
-- ============================================================

CREATE TABLE IF NOT EXISTS patient_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN ('erinnerung', 'eingang', 'hinweis', 'warnung', 'tipp')),
  titel TEXT NOT NULL,
  text TEXT NOT NULL,
  gelesen BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patient_notifications_patient ON patient_notifications (patient_id, created_at DESC);
CREATE INDEX idx_patient_notifications_unread ON patient_notifications (patient_id, gelesen) WHERE gelesen = FALSE;

-- 6. Pflegetipps
-- ============================================================

CREATE TABLE IF NOT EXISTS pflegetipps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  behandlungsphase TEXT NOT NULL,
  titel TEXT NOT NULL,
  text TEXT NOT NULL,
  reihenfolge INTEGER NOT NULL DEFAULT 1,
  aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pflegetipps_phase ON pflegetipps (behandlungsphase, reihenfolge) WHERE aktiv = TRUE;

CREATE TRIGGER pflegetipps_updated_at
  BEFORE UPDATE ON pflegetipps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Default-Tipps einfügen
INSERT INTO pflegetipps (behandlungsphase, titel, text, reihenfolge) VALUES
  ('Nivellierung', 'Weiche Kost in den ersten Tagen', 'Nach dem Einsetzen der Brackets können die Zähne empfindlich sein. Weiche Nahrung wie Suppen und Joghurt helfen in den ersten Tagen.', 1),
  ('Nivellierung', 'Wachs bei Druckstellen', 'Wenn Brackets oder Drähte an der Wangenschleimhaut reiben, hilft ein kleines Stück Kieferwachs auf der betreffenden Stelle.', 2),
  ('Nivellierung', 'Regelmäßig putzen', 'Mit Brackets ist gründliches Zähneputzen nach jeder Mahlzeit besonders wichtig. Eine elektrische Zahnbürste kann helfen.', 3),
  ('Lückenschluss', 'Interdentalbürsten nutzen', 'In der Lückenschluss-Phase sammeln sich leicht Essensreste um die Brackets. Interdentalbürsten helfen bei schwer erreichbaren Stellen.', 1),
  ('Lückenschluss', 'Harte Sachen meiden', 'Nüsse, harte Bonbons und ganze Äpfel können Brackets lösen. Obst lieber in Stücke schneiden.', 2),
  ('Lückenschluss', 'Wachs bei Druckstellen', 'Wenn der Draht drückt, hilft ein kleines Stück Kieferwachs. Bekommst du jederzeit in der Praxis.', 3),
  ('Feineinstellung', 'Gummis tragen', 'Falls du Gummis tragen musst, bitte konsequent nach Anweisung tragen. Sie sind entscheidend für das Endergebnis.', 1),
  ('Feineinstellung', 'Kontrolltermine einhalten', 'In der Feineinstellungsphase sind regelmäßige Kontrollen besonders wichtig für Anpassungen.', 2),
  ('Retainer', 'Retainer konsequent tragen', 'In den ersten Monaten nach dem Entfernen der Brackets ist das konsequente Tragen des Retainers entscheidend.', 1),
  ('Retainer', 'Retainer reinigen', 'Den Retainer täglich mit einer weichen Zahnbürste und etwas Zahnpasta reinigen. Keine heißen Flüssigkeiten verwenden.', 2);

-- ============================================================
-- 7. Row Level Security für Patienten
-- ============================================================

-- Behandlungsphasen
ALTER TABLE behandlungsphasen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Praxis full access behandlungsphasen"
  ON behandlungsphasen FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );

CREATE POLICY "Patient reads own behandlungsphasen"
  ON behandlungsphasen FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'patient' AND patient_id = behandlungsphasen.patient_id)
  );

-- Patient Documents
ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Praxis full access patient_documents"
  ON patient_documents FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );

CREATE POLICY "Patient reads own documents"
  ON patient_documents FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'patient' AND patient_id = patient_documents.patient_id)
  );

-- Patient Messages
ALTER TABLE patient_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Praxis full access patient_messages"
  ON patient_messages FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );

CREATE POLICY "Patient reads own messages"
  ON patient_messages FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'patient' AND patient_id = patient_messages.patient_id)
  );

CREATE POLICY "Patient sends own messages"
  ON patient_messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'patient' AND patient_id = patient_messages.patient_id)
    AND sender_type = 'patient'
  );

-- Patient Notifications
ALTER TABLE patient_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Praxis full access patient_notifications"
  ON patient_notifications FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );

CREATE POLICY "Patient reads own notifications"
  ON patient_notifications FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'patient' AND patient_id = patient_notifications.patient_id)
  );

CREATE POLICY "Patient marks own notifications read"
  ON patient_notifications FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'patient' AND patient_id = patient_notifications.patient_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'patient' AND patient_id = patient_notifications.patient_id)
  );

-- Pflegetipps: readable by everyone authenticated
ALTER TABLE pflegetipps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone reads pflegetipps"
  ON pflegetipps FOR SELECT TO authenticated
  USING (aktiv = TRUE);

CREATE POLICY "Praxis manages pflegetipps"
  ON pflegetipps FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );

-- Restrict existing tables for patients (they currently allow all authenticated)
-- We need to replace the blanket policies with role-aware ones

-- Patients table: patient sees only their own record
DROP POLICY IF EXISTS "Authenticated users full access" ON patients;

CREATE POLICY "Praxis full access patients"
  ON patients FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );

CREATE POLICY "Patient reads own record"
  ON patients FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'patient' AND patient_id = patients.id)
  );

-- Ratenplaene: patient sees only their own
DROP POLICY IF EXISTS "Authenticated users full access" ON ratenplaene;

CREATE POLICY "Praxis full access ratenplaene"
  ON ratenplaene FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );

CREATE POLICY "Patient reads own ratenplaene"
  ON ratenplaene FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'patient' AND patient_id = ratenplaene.patient_id)
  );

-- Raten: patient sees only their own
DROP POLICY IF EXISTS "Authenticated users full access" ON raten;

CREATE POLICY "Praxis full access raten"
  ON raten FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );

CREATE POLICY "Patient reads own raten"
  ON raten FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'patient' AND patient_id = raten.patient_id)
  );

-- Transaktionen: patients should NOT see raw bank data
DROP POLICY IF EXISTS "Authenticated users full access" ON transaktionen;

CREATE POLICY "Praxis full access transaktionen"
  ON transaktionen FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );
-- No patient policy for transaktionen - they see payment status via raten table only

-- Mahnungen: patients should NOT see internal dunning data
DROP POLICY IF EXISTS "Authenticated users full access" ON mahnungen;

CREATE POLICY "Praxis full access mahnungen"
  ON mahnungen FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );
-- No patient policy for mahnungen - internal only

-- Alerts: praxis only
DROP POLICY IF EXISTS "Authenticated users full access" ON alerts;

CREATE POLICY "Praxis full access alerts"
  ON alerts FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );
-- No patient policy for alerts - they use patient_notifications instead

-- KI-Analysen: praxis only
DROP POLICY IF EXISTS "Authenticated users full access" ON ki_analysen;

CREATE POLICY "Praxis full access ki_analysen"
  ON ki_analysen FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung', 'lesezugriff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );
