-- 102_close_open_table_access.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
-- Offene Tabellen schließen (17.11.2026, Juan: ok).
-- Befund in Produktion, bestätigt am 17.11.2026 und unverändert am 22.11.2026 (dieselben 43 Regeln, 5 Sichten, 8 Tabellen):
--  1. OHNE Anmeldung lesbar (Regeln „Anon read access“ für die Rolle anon): patients, raten, ratenplaene, transaktionen,
--     mahnungen, ki_analysen, alerts (auch änderbar) und einstellungen (lesen und schreiben). Dazu 5 Sichten, die die
--     Zeilenregeln ihrer Tabellen umgehen (u. a. patient_geldstatus, patient_finance_ledger_shadow).
--  2. Für JEDEN angemeldeten Nutzer offen, also auch für Patienten mit App-Zugang: 23 Tabellen mit Regeln „USING (true)“
--     (u. a. anamnese_submissions, doku_eintraege, bank_transactions_raw, offene_posten, kassen_zahlungen) und 4 Tabellen
--     mit „auth.role() = 'authenticated'“ (tagesplan_termine, animahost_*).
-- In den Zugriffsprotokollen der letzten 7 Tage (weiter reichen sie nicht) gab es keinen Zugriff ohne Anmeldung und keinen
-- Zugriff von Patienten auf diese Tabellen. Patienten nutzen direkt nur user_profiles und die Rechnungsfunktionen.
--
-- Was diese Anweisung tut:
--  - Alle Regeln für anon entfernen und anon die Rechte an diesen Tabellen und Sichten nehmen.
--  - Die offenen Regeln durch Praxis-Regeln ersetzen, nach dem Muster der bestehenden „Praxis full access“-Regeln:
--    lesen dürfen admin, verwaltung und lesezugriff, schreiben admin und verwaltung. Der Umfang je Tabelle bleibt wie bisher
--    (nur lesen bleibt nur lesen).
--  - Patienten behalten, was sie brauchen: eigene Mitteilungen (bestehende Regeln) und die eigenen Termine für den Check-in.
--  - Die 5 Sichten beachten ab jetzt die Zeilenregeln ihrer Tabellen (security_invoker).
-- Der Server (service_role) ist nicht betroffen. Keine Daten werden geändert. Am Ende prüft die Anweisung sich selbst und
-- nimmt alles zurück, wenn noch irgendeine offene Regel übrig ist.
BEGIN;
SET LOCAL lock_timeout = '10s';

-- 0. Nur im richtigen Projekt laufen: Anima Cura hat patients und user_profiles, aber keine Tabelle der WhatsApp-Kopplung.
DO $target$
BEGIN
  IF to_regclass('public.patients') IS NULL OR to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.animaline_connections') IS NOT NULL THEN
    RAISE EXCEPTION 'Falsches Projekt: 102_close_open_table_access.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
  END IF;
END $target$;

-- 1. Bisherige offene Regeln entfernen (genaue Namen aus Produktion, 17.11.2026).
DROP POLICY IF EXISTS "Anon read access" ON public.alerts;
DROP POLICY IF EXISTS "Anon update alerts" ON public.alerts;
DROP POLICY IF EXISTS "anamnese_authenticated" ON public.anamnese_submissions;
DROP POLICY IF EXISTS "balance_all" ON public.anima_balance_buchungen;
DROP POLICY IF EXISTS "docs_all" ON public.anima_docs;
DROP POLICY IF EXISTS "auth_read_apm" ON public.animahost_patient_memory;
DROP POLICY IF EXISTS "auth_read_app" ON public.animahost_patient_preferences;
DROP POLICY IF EXISTS "auth_read_api" ON public.animahost_praxis_insights;
DROP POLICY IF EXISTS "animasign_sync_log_authenticated" ON public.animasign_sync_log;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.bank_connections;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.bank_sync_runs;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.bank_transactions_raw;
DROP POLICY IF EXISTS "Authenticated full access" ON public.doku_baustein_nutzung;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.doku_eintraege;
DROP POLICY IF EXISTS "Authenticated insert versions" ON public.doku_eintrag_versionen;
DROP POLICY IF EXISTS "Authenticated read versions" ON public.doku_eintrag_versionen;
DROP POLICY IF EXISTS "Authenticated full access" ON public.doku_vorlagen_optionen;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.doku_vorlagen;
DROP POLICY IF EXISTS "Anon write einstellungen" ON public.einstellungen;
DROP POLICY IF EXISTS "auth_read_kategorien" ON public.finanz_kategorien;
DROP POLICY IF EXISTS "auth_write_kategorien" ON public.finanz_kategorien;
DROP POLICY IF EXISTS "auth_read_tx_kat" ON public.finanz_tx_kategorien;
DROP POLICY IF EXISTS "auth_write_tx_kat" ON public.finanz_tx_kategorien;
DROP POLICY IF EXISTS "integration_manual_resolutions_authenticated_read" ON public.integration_manual_resolutions;
DROP POLICY IF EXISTS "integration_outbox_events_authenticated_read" ON public.integration_outbox_events;
DROP POLICY IF EXISTS "integration_outbox_authenticated_read" ON public.integration_outbox_jobs;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.kassen_zahlungen;
DROP POLICY IF EXISTS "kassen_zahlungen_delete" ON public.kassen_zahlungen;
DROP POLICY IF EXISTS "Anon read access" ON public.ki_analysen;
DROP POLICY IF EXISTS "Anon read access" ON public.mahnungen;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.offene_posten;
DROP POLICY IF EXISTS "engage_all" ON public.patient_engagement;
DROP POLICY IF EXISTS "notif_all" ON public.patient_notifications;
DROP POLICY IF EXISTS "Anon read access" ON public.patients;
DROP POLICY IF EXISTS "Service can manage push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_all" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anon read access" ON public.ratenplaene;
DROP POLICY IF EXISTS "Anon read access" ON public.raten;
DROP POLICY IF EXISTS "stability_observations_authenticated_read" ON public.stability_observations;
DROP POLICY IF EXISTS "authenticated_insert" ON public.tagesplan_termine;
DROP POLICY IF EXISTS "authenticated_read" ON public.tagesplan_termine;
DROP POLICY IF EXISTS "authenticated_update" ON public.tagesplan_termine;
DROP POLICY IF EXISTS "Anon read access" ON public.transaktionen;

-- 2. Praxis-Regeln. Lesen: admin, verwaltung, lesezugriff. Schreiben: admin, verwaltung.
DROP POLICY IF EXISTS "Praxis read access" ON public.anamnese_submissions;
CREATE POLICY "Praxis read access" ON public.anamnese_submissions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.anamnese_submissions;
CREATE POLICY "Praxis write access" ON public.anamnese_submissions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.anima_balance_buchungen;
CREATE POLICY "Praxis read access" ON public.anima_balance_buchungen FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.anima_balance_buchungen;
CREATE POLICY "Praxis write access" ON public.anima_balance_buchungen FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.anima_docs;
CREATE POLICY "Praxis read access" ON public.anima_docs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.anima_docs;
CREATE POLICY "Praxis write access" ON public.anima_docs FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.animasign_sync_log;
CREATE POLICY "Praxis read access" ON public.animasign_sync_log FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.animasign_sync_log;
CREATE POLICY "Praxis write access" ON public.animasign_sync_log FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.bank_connections;
CREATE POLICY "Praxis read access" ON public.bank_connections FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.bank_connections;
CREATE POLICY "Praxis write access" ON public.bank_connections FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.bank_sync_runs;
CREATE POLICY "Praxis read access" ON public.bank_sync_runs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.bank_sync_runs;
CREATE POLICY "Praxis write access" ON public.bank_sync_runs FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.bank_transactions_raw;
CREATE POLICY "Praxis read access" ON public.bank_transactions_raw FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.bank_transactions_raw;
CREATE POLICY "Praxis write access" ON public.bank_transactions_raw FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.doku_baustein_nutzung;
CREATE POLICY "Praxis read access" ON public.doku_baustein_nutzung FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.doku_baustein_nutzung;
CREATE POLICY "Praxis write access" ON public.doku_baustein_nutzung FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.doku_eintraege;
CREATE POLICY "Praxis read access" ON public.doku_eintraege FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.doku_eintraege;
CREATE POLICY "Praxis write access" ON public.doku_eintraege FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.doku_vorlagen;
CREATE POLICY "Praxis read access" ON public.doku_vorlagen FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.doku_vorlagen;
CREATE POLICY "Praxis write access" ON public.doku_vorlagen FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.doku_vorlagen_optionen;
CREATE POLICY "Praxis read access" ON public.doku_vorlagen_optionen FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.doku_vorlagen_optionen;
CREATE POLICY "Praxis write access" ON public.doku_vorlagen_optionen FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.einstellungen;
CREATE POLICY "Praxis read access" ON public.einstellungen FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.einstellungen;
CREATE POLICY "Praxis write access" ON public.einstellungen FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.finanz_kategorien;
CREATE POLICY "Praxis read access" ON public.finanz_kategorien FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.finanz_kategorien;
CREATE POLICY "Praxis write access" ON public.finanz_kategorien FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.finanz_tx_kategorien;
CREATE POLICY "Praxis read access" ON public.finanz_tx_kategorien FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.finanz_tx_kategorien;
CREATE POLICY "Praxis write access" ON public.finanz_tx_kategorien FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.kassen_zahlungen;
CREATE POLICY "Praxis read access" ON public.kassen_zahlungen FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.kassen_zahlungen;
CREATE POLICY "Praxis write access" ON public.kassen_zahlungen FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.offene_posten;
CREATE POLICY "Praxis read access" ON public.offene_posten FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.offene_posten;
CREATE POLICY "Praxis write access" ON public.offene_posten FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.patient_engagement;
CREATE POLICY "Praxis read access" ON public.patient_engagement FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.patient_engagement;
CREATE POLICY "Praxis write access" ON public.patient_engagement FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.patient_notifications;
CREATE POLICY "Praxis read access" ON public.patient_notifications FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.patient_notifications;
CREATE POLICY "Praxis write access" ON public.patient_notifications FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.push_subscriptions;
CREATE POLICY "Praxis read access" ON public.push_subscriptions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis write access" ON public.push_subscriptions;
CREATE POLICY "Praxis write access" ON public.push_subscriptions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.integration_manual_resolutions;
CREATE POLICY "Praxis read access" ON public.integration_manual_resolutions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.integration_outbox_events;
CREATE POLICY "Praxis read access" ON public.integration_outbox_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.integration_outbox_jobs;
CREATE POLICY "Praxis read access" ON public.integration_outbox_jobs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.stability_observations;
CREATE POLICY "Praxis read access" ON public.stability_observations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.animahost_patient_memory;
CREATE POLICY "Praxis read access" ON public.animahost_patient_memory FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.animahost_patient_preferences;
CREATE POLICY "Praxis read access" ON public.animahost_patient_preferences FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.animahost_praxis_insights;
CREATE POLICY "Praxis read access" ON public.animahost_praxis_insights FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.doku_eintrag_versionen;
CREATE POLICY "Praxis read access" ON public.doku_eintrag_versionen FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis insert access" ON public.doku_eintrag_versionen;
CREATE POLICY "Praxis insert access" ON public.doku_eintrag_versionen FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis read access" ON public.tagesplan_termine;
CREATE POLICY "Praxis read access" ON public.tagesplan_termine FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text, 'lesezugriff'::text])));
DROP POLICY IF EXISTS "Praxis insert access" ON public.tagesplan_termine;
CREATE POLICY "Praxis insert access" ON public.tagesplan_termine FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));
DROP POLICY IF EXISTS "Praxis update access" ON public.tagesplan_termine;
CREATE POLICY "Praxis update access" ON public.tagesplan_termine FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'verwaltung'::text])));

-- 3. Check-in in der Patienten-App: Patienten lesen nur ihre eigenen Termine (gleiches Muster wie „Patient reads own raten“).
DROP POLICY IF EXISTS "Patient reads own tagesplan_termine" ON public.tagesplan_termine;
CREATE POLICY "Patient reads own tagesplan_termine" ON public.tagesplan_termine FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'patient'::text AND p.patient_id = tagesplan_termine.patient_id));

-- 4. Sichten: Zeilenregeln der Tabellen dahinter gelten auch hier. Ohne Anmeldung kein Zugriff, angemeldet nur lesen.
ALTER VIEW public.anima_balance_salden SET (security_invoker = true);
REVOKE ALL ON public.anima_balance_salden FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.anima_balance_salden TO authenticated;
ALTER VIEW public.dashboard_stats SET (security_invoker = true);
REVOKE ALL ON public.dashboard_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.dashboard_stats TO authenticated;
ALTER VIEW public.patient_finance_ledger_shadow SET (security_invoker = true);
REVOKE ALL ON public.patient_finance_ledger_shadow FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patient_finance_ledger_shadow TO authenticated;
ALTER VIEW public.patient_geldstatus SET (security_invoker = true);
REVOKE ALL ON public.patient_geldstatus FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patient_geldstatus TO authenticated;
ALTER VIEW public.tagesplan_heute SET (security_invoker = true);
REVOKE ALL ON public.tagesplan_heute FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tagesplan_heute TO authenticated;

-- 5. Ohne Anmeldung keine Rechte mehr an den Tabellen, die bisher für anon offen waren.
REVOKE ALL ON TABLE public.alerts, public.einstellungen, public.ki_analysen, public.mahnungen, public.patients, public.raten, public.ratenplaene, public.transaktionen FROM anon;

-- 6. Fail closed: Bleibt irgendetwas offen, wird alles zurückgenommen.
DO $verify$
DECLARE leftover text; item text;
BEGIN
  SELECT string_agg(tablename || ':' || policyname, ', ') INTO leftover FROM pg_policies
   WHERE schemaname = 'public' AND roles && ARRAY['anon','authenticated','public']::name[]
     AND ((coalesce(qual,'true') = 'true' AND coalesce(with_check,'true') = 'true')
       OR coalesce(qual,'') || coalesce(with_check,'') ~ 'auth\.role\(\) = ''authenticated''');
  IF leftover IS NOT NULL THEN RAISE EXCEPTION 'open_policies_left: %', leftover; END IF;
  SELECT string_agg(tablename || ':' || policyname, ', ') INTO leftover FROM pg_policies
   WHERE schemaname = 'public' AND 'anon' = ANY (roles);
  IF leftover IS NOT NULL THEN RAISE EXCEPTION 'anon_policies_left: %', leftover; END IF;
  SELECT string_agg(c.relname, ', ') INTO leftover FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
     AND (NOT coalesce(c.reloptions::text[] @> ARRAY['security_invoker=true'], false)
       OR has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE'));
  IF leftover IS NOT NULL THEN RAISE EXCEPTION 'views_not_protected: %', leftover; END IF;
  FOREACH item IN ARRAY ARRAY['alerts', 'einstellungen', 'ki_analysen', 'mahnungen', 'patients', 'raten', 'ratenplaene', 'transaktionen'] LOOP
    IF has_table_privilege('anon', ('public.' || item)::regclass, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'anon_privilege_left: %', item;
    END IF;
  END LOOP;
  FOREACH item IN ARRAY ARRAY['anamnese_submissions', 'anima_balance_buchungen', 'anima_docs', 'animasign_sync_log', 'bank_connections', 'bank_sync_runs', 'bank_transactions_raw', 'doku_baustein_nutzung', 'doku_eintraege', 'doku_vorlagen', 'doku_vorlagen_optionen', 'einstellungen', 'finanz_kategorien', 'finanz_tx_kategorien', 'kassen_zahlungen', 'offene_posten', 'patient_engagement', 'patient_notifications', 'push_subscriptions', 'integration_manual_resolutions', 'integration_outbox_events', 'integration_outbox_jobs', 'stability_observations', 'animahost_patient_memory', 'animahost_patient_preferences', 'animahost_praxis_insights', 'doku_eintrag_versionen', 'tagesplan_termine'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = item AND policyname = 'Praxis read access') THEN
      RAISE EXCEPTION 'praxis_policy_missing: %', item;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || item)::regclass) THEN
      RAISE EXCEPTION 'rls_disabled: %', item;
    END IF;
  END LOOP;
END $verify$;
NOTIFY pgrst, 'reload schema';
COMMIT;
