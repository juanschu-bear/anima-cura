-- ============================================================
-- Migration 009: Komplette offene Posten + Matching Stufe 2.5
-- Stand: 04.06.2026 (bereits live in Supabase ausgefuehrt)
--
-- Inhalt:
--   1. offene_posten: Mahnstufe und Mahnschutz
--   2. Tippfehler-Erweiterung (fuzzystrmatch)
--   3. ac_match_referenz(): Rechnungszeichen-Abgleich, set-basiert,
--      inkl. Vorrang vor schwaecheren Namens-Vorschlaegen
--   4. ac_match_names_v2(): Namensbausteine + Geschwister per Ratenhoehe
--   5. ac_match_typos(): Tippfehler-Toleranz mit Stoppliste
--   6. ac_import_ivoris_plaene(): IVORIS-Ratenvereinbarungen -> ratenplaene
--   7. View patient_geldstatus: Posten vs. Bankbeweis pro Patient
--
-- Einmalige Daten-Importe vom 04.06.2026 (Staging-Tabellen, nicht Teil
-- dieser Migration): ivoris_raten_import (331 Vereinbarungen),
-- offene_posten_import (5.035 Posten), iban_patient_import (434 Paare).
-- Einmalige Regel-Laeufe: KZV -> ignoriert (31), eigene Konten ->
-- ignoriert (92). Beide Regeln laufen kuenftig in der Engine
-- (matching-engine.ts, Kategorisierer).
-- ============================================================

-- 1. Mahn-Infos aus den IVORIS-Listen
ALTER TABLE offene_posten ADD COLUMN IF NOT EXISTS mahnstufe integer DEFAULT 0;
ALTER TABLE offene_posten ADD COLUMN IF NOT EXISTS nicht_mahnen boolean DEFAULT false;

-- 2. Levenshtein fuer Tippfehler-Toleranz
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- 3. Rechnungszeichen-Abgleich, set-basiert.
--    Teil 1: unklare Eingaenge mit eindeutigem Zeichen im Zweck zuordnen.
--    Teil 2: schwaechere Namens-Vorschlaege (< 95) korrigieren, wenn das
--    Zeichen auf einen anderen Patienten zeigt (Kirsten-statt-Elea-Fall).
CREATE OR REPLACE FUNCTION ac_match_referenz()
RETURNS TABLE (neu integer, korrigiert integer)
LANGUAGE plpgsql AS $$
DECLARE
  n_neu integer;
  n_korr integer;
BEGIN
  WITH treffer AS (
    SELECT t.id AS tx_id, op.patient_id
    FROM transaktionen t
    JOIN offene_posten op ON position(op.unser_zeichen IN t.verwendungszweck) > 0
    WHERE t.matching_status = 'unklar'
      AND t.betrag > 0
      AND op.patient_id IS NOT NULL
  ),
  e AS (
    SELECT tx_id, MIN(patient_id::text)::uuid AS patient_id
    FROM treffer GROUP BY tx_id HAVING COUNT(DISTINCT patient_id) = 1
  )
  UPDATE transaktionen t
  SET matched_patient_id = e.patient_id,
      matching_status    = 'abweichung',
      matching_score     = 95,
      matching_details   = jsonb_build_object('methode', 'referenz', 'name_score', 0, 'betrag_match', false, 'zweck_score', 100),
      geprueft_am        = now()
  FROM e WHERE t.id = e.tx_id;
  GET DIAGNOSTICS n_neu = ROW_COUNT;

  WITH treffer AS (
    SELECT t.id AS tx_id, op.patient_id
    FROM transaktionen t
    JOIN offene_posten op ON position(op.unser_zeichen IN t.verwendungszweck) > 0
    WHERE t.matching_status = 'abweichung'
      AND t.matching_score < 95
      AND op.patient_id IS NOT NULL
  ),
  e AS (
    SELECT tx_id, MIN(patient_id::text)::uuid AS patient_id
    FROM treffer GROUP BY tx_id HAVING COUNT(DISTINCT patient_id) = 1
  )
  UPDATE transaktionen t
  SET matched_patient_id = e.patient_id,
      matching_score     = 95,
      matching_details   = jsonb_build_object('methode', 'referenz', 'name_score', 0, 'betrag_match', false, 'zweck_score', 100),
      geprueft_am        = now()
  FROM e
  WHERE t.id = e.tx_id
    AND t.matched_patient_id IS DISTINCT FROM e.patient_id;
  GET DIAGNOSTICS n_korr = ROW_COUNT;

  RETURN QUERY SELECT n_neu, n_korr;
END;
$$;

-- 4. Namensbausteine + Geschwister-Aufloesung per Ratenhoehe.
--    Pass 1: Nachname + erster Vorname-Baustein, genau ein Kandidat (75).
--    Pass 2: mehrere Kandidaten -> Ratenhoehe aus offiziellen Plaenen (70).
CREATE OR REPLACE FUNCTION ac_match_names_v2()
RETURNS TABLE (stufe text, zugeordnet integer)
LANGUAGE plpgsql AS $$
DECLARE
  n1 integer; n2 integer;
BEGIN
  DROP TABLE IF EXISTS tmp_tx;
  DROP TABLE IF EXISTS tmp_pat;

  CREATE TEMP TABLE tmp_tx ON COMMIT DROP AS
    SELECT id, betrag,
           ac_norm(verwendungszweck || ' ' || coalesce(absender_name, '')) AS hay
    FROM transaktionen
    WHERE matching_status = 'unklar' AND matched_patient_id IS NULL AND betrag > 0;

  CREATE TEMP TABLE tmp_pat ON COMMIT DROP AS
    SELECT id, ac_norm(nachname) AS n, split_part(ac_norm(vorname), ' ', 1) AS v
    FROM patients
    WHERE length(ac_norm(nachname)) >= 3
      AND length(split_part(ac_norm(vorname), ' ', 1)) >= 3;

  WITH kand AS (
    SELECT t.id AS tx_id, p.id AS patient_id
    FROM tmp_tx t
    JOIN tmp_pat p ON t.hay LIKE '%' || p.n || '%' AND t.hay LIKE '%' || p.v || '%'
  ),
  e AS (
    SELECT tx_id, MIN(patient_id::text)::uuid AS patient_id
    FROM kand GROUP BY tx_id HAVING COUNT(DISTINCT patient_id) = 1
  )
  UPDATE transaktionen t
  SET matched_patient_id = e.patient_id, matching_status = 'abweichung',
      matching_score = 75,
      matching_details = jsonb_build_object('methode', 'name', 'name_score', 75, 'betrag_match', false, 'zweck_score', 0),
      geprueft_am = now()
  FROM e WHERE t.id = e.tx_id;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  DELETE FROM tmp_tx t USING transaktionen x
  WHERE x.id = t.id AND x.matched_patient_id IS NOT NULL;

  WITH kand AS (
    SELECT t.id AS tx_id, t.betrag, p.id AS patient_id
    FROM tmp_tx t
    JOIN tmp_pat p ON t.hay LIKE '%' || p.n || '%' AND t.hay LIKE '%' || p.v || '%'
  ),
  mehr AS (
    SELECT tx_id FROM kand GROUP BY tx_id HAVING COUNT(DISTINCT patient_id) > 1
  ),
  mit_rate AS (
    SELECT k.tx_id, k.patient_id
    FROM kand k
    JOIN mehr m ON m.tx_id = k.tx_id
    JOIN ratenplaene rp ON rp.patient_id = k.patient_id AND rp.rate_betrag = k.betrag
  ),
  e AS (
    SELECT tx_id, MIN(patient_id::text)::uuid AS patient_id
    FROM mit_rate GROUP BY tx_id HAVING COUNT(DISTINCT patient_id) = 1
  )
  UPDATE transaktionen t
  SET matched_patient_id = e.patient_id, matching_status = 'abweichung',
      matching_score = 70,
      matching_details = jsonb_build_object('methode', 'name', 'name_score', 70, 'betrag_match', true, 'zweck_score', 0),
      geprueft_am = now()
  FROM e WHERE t.id = e.tx_id;
  GET DIAGNOSTICS n2 = ROW_COUNT;

  RETURN QUERY VALUES ('namensbausteine', n1), ('geschwister_per_rate', n2);
END;
$$;

-- 5. Tippfehler-Toleranz, ein Buchstabe Abstand auf Wortebene.
--    Gehaertet nach dem Rate/Rabe-Vorfall: Stoppliste fuer
--    Allerwelts-Woerter, Mindestlaenge 5 (Nachname) bzw. 4 (Vorname).
CREATE OR REPLACE FUNCTION ac_match_typos()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  DROP TABLE IF EXISTS tmp_tx;
  DROP TABLE IF EXISTS tmp_pat;

  CREATE TEMP TABLE tmp_tx ON COMMIT DROP AS
    SELECT id, ac_norm(verwendungszweck || ' ' || coalesce(absender_name, '')) AS hay
    FROM transaktionen
    WHERE matching_status = 'unklar' AND matched_patient_id IS NULL AND betrag > 0;

  CREATE TEMP TABLE tmp_pat ON COMMIT DROP AS
    SELECT id, ac_norm(nachname) AS n, split_part(ac_norm(vorname), ' ', 1) AS v
    FROM patients
    WHERE length(ac_norm(nachname)) >= 5
      AND length(split_part(ac_norm(vorname), ' ', 1)) >= 4;

  WITH stop(w) AS (
    VALUES ('rate'),('raten'),('datum'),('rechnung'),('rechnungen'),('behandlung'),
           ('zahnspange'),('kieferorthopaedie'),('kieferorthopaedische'),('monatsrate'),
           ('kassenanteil'),('honorar'),('honorare'),('zahnarzt'),('praxis'),
           ('ueberweisung'),('dauerauftrag'),('zahlung'),('monat'),('quartal')
  ),
  woerter AS (
    SELECT t.id AS tx_id, t.hay, w AS wort
    FROM tmp_tx t, unnest(string_to_array(t.hay, ' ')) AS w
    WHERE length(w) >= 5 AND w NOT IN (SELECT w FROM stop)
  ),
  kand AS (
    SELECT DISTINCT wo.tx_id, p.id AS patient_id
    FROM woerter wo
    JOIN tmp_pat p
      ON substr(wo.wort, 1, 1) = substr(p.n, 1, 1)
     AND abs(length(wo.wort) - length(p.n)) <= 1
     AND levenshtein_less_equal(wo.wort, p.n, 1) <= 1
    WHERE EXISTS (
      SELECT 1 FROM unnest(string_to_array(wo.hay, ' ')) AS w2
      WHERE length(w2) >= 4
        AND w2 NOT IN (SELECT w FROM stop)
        AND abs(length(w2) - length(p.v)) <= 1
        AND levenshtein_less_equal(w2, p.v, 1) <= 1
    )
  ),
  e AS (
    SELECT tx_id, MIN(patient_id::text)::uuid AS patient_id
    FROM kand GROUP BY tx_id HAVING COUNT(DISTINCT patient_id) = 1
  )
  UPDATE transaktionen t
  SET matched_patient_id = e.patient_id, matching_status = 'abweichung',
      matching_score = 65,
      matching_details = jsonb_build_object('methode', 'name', 'name_score', 65, 'betrag_match', false, 'zweck_score', 0),
      geprueft_am = now()
  FROM e WHERE t.id = e.tx_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- 6. IVORIS-Ratenvereinbarungen in echte Plaene ueberfuehren.
--    Idempotent; verschmilzt passende Bank-Entwuerfe (Raten umhaengen,
--    Entwurfshuelle loeschen). Erwartet ivoris_raten_import (Staging).
CREATE OR REPLACE FUNCTION ac_import_ivoris_plaene()
RETURNS TABLE (neue_plaene integer, entwuerfe_verschmolzen integer, ohne_patient integer)
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  draft RECORD;
  p_id uuid;
  plan_id uuid;
  monate numeric;
  anzahl integer;
  rhythm text;
  n_neu integer := 0;
  n_merge integer := 0;
  n_skip integer := 0;
BEGIN
  FOR r IN SELECT * FROM ivoris_raten_import ORDER BY id LOOP
    SELECT id INTO p_id FROM patients WHERE ivoris_nummer = r.ivoris_nummer LIMIT 1;
    IF p_id IS NULL THEN
      n_skip := n_skip + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM ratenplaene rp
      WHERE rp.patient_id = p_id
        AND rp.start_datum = r.beginn
        AND rp.rate_betrag = r.rate_betrag
        AND rp.notizen LIKE 'IVORIS-Import%'
    ) THEN
      CONTINUE;
    END IF;

    anzahl := GREATEST(1, round(r.gesamtbetrag / NULLIF(r.rate_betrag, 0)));
    monate := EXTRACT(year FROM age(r.ende, r.beginn)) * 12
            + EXTRACT(month FROM age(r.ende, r.beginn));
    IF monate > 0 AND anzahl::numeric <= monate / 2.2 THEN
      rhythm := 'quartalsweise';
    ELSE
      rhythm := 'monatlich';
    END IF;

    INSERT INTO ratenplaene
      (patient_id, gesamtbetrag, anzahl_raten, rate_betrag, start_datum, rhythmus, status, sepa_mandat, notizen)
    VALUES (
      p_id, r.gesamtbetrag, anzahl, r.rate_betrag, r.beginn, rhythm, 'aktiv',
      r.zahlart ILIKE '%last%',
      'IVORIS-Import 04.06.2026 | Behandlung: ' || COALESCE(NULLIF(r.behandlung, ''), '-')
        || ' | Zahlart: ' || COALESCE(r.zahlart, '-')
        || ' | Ende lt. IVORIS: ' || to_char(r.ende, 'DD.MM.YYYY')
        || ' | IVORIS-Bezahlt: ' || COALESCE(r.ivoris_bezahlt::text, '0')
        || ' | IVORIS-Offen: ' || COALESCE(r.ivoris_offen::text, '-')
    )
    RETURNING id INTO plan_id;
    n_neu := n_neu + 1;

    SELECT rp.id, rp.rate_betrag INTO draft
    FROM ratenplaene rp
    WHERE rp.patient_id = p_id
      AND rp.notizen LIKE 'ENTWURF aus Bankdaten%'
    ORDER BY abs(rp.rate_betrag - r.rate_betrag) ASC
    LIMIT 1;

    IF draft.id IS NOT NULL
       AND abs(draft.rate_betrag - r.rate_betrag) <= GREATEST(5, r.rate_betrag * 0.15) THEN
      UPDATE raten SET ratenplan_id = plan_id WHERE ratenplan_id = draft.id;
      DELETE FROM ratenplaene WHERE id = draft.id;
      n_merge := n_merge + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT n_neu, n_merge, n_skip;
END;
$$;

-- 7. Geldstatus pro Patient: IVORIS-Forderung vs. Bankbeweis.
--    Reine Auswertung, veraendert nichts. Einstufung bewusst grob,
--    bekannte Unschaerfe: Quartalszahler koennen als 'zahlte frueher'
--    erscheinen (45-Tage-Fenster).
CREATE OR REPLACE VIEW patient_geldstatus AS
WITH posten AS (
  SELECT patient_id,
         SUM(offen)            AS posten_offen,
         COUNT(*)              AS posten_anzahl,
         MIN(rechnung_datum)   AS aeltester_posten,
         BOOL_OR(nicht_mahnen) AS nicht_mahnen
  FROM offene_posten
  WHERE patient_id IS NOT NULL AND status IN ('offen', 'teilbezahlt')
  GROUP BY patient_id
),
bank AS (
  SELECT matched_patient_id AS patient_id,
         SUM(betrag) AS bank_belegt,
         COUNT(*)    AS zahlungen,
         MAX(datum)  AS letzte_zahlung
  FROM transaktionen
  WHERE matched_patient_id IS NOT NULL
    AND matching_status IN ('abweichung', 'auto', 'manuell')
  GROUP BY matched_patient_id
)
SELECT p.id AS patient_id, p.vorname, p.nachname,
       COALESCE(po.posten_offen, 0)  AS posten_offen,
       COALESCE(po.posten_anzahl, 0) AS posten_anzahl,
       po.aeltester_posten,
       COALESCE(b.bank_belegt, 0)    AS bank_belegt,
       COALESCE(b.zahlungen, 0)      AS zahlungen,
       b.letzte_zahlung,
       COALESCE(po.nicht_mahnen, false) AS nicht_mahnen,
       CASE
         WHEN COALESCE(po.posten_offen, 0) = 0       THEN 'nichts offen'
         WHEN COALESCE(b.bank_belegt, 0) = 0          THEN 'keine bankzahlung gefunden'
         WHEN b.letzte_zahlung >= CURRENT_DATE - 45   THEN 'zahlt aktiv'
         ELSE 'zahlte frueher'
       END AS einstufung
FROM patients p
LEFT JOIN posten po ON po.patient_id = p.id
LEFT JOIN bank b   ON b.patient_id = p.id
WHERE po.patient_id IS NOT NULL;
