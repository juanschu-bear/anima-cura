-- ============================================================
-- Migration 013: Kombibeweis-Zunge, Sonderverkehr, Stichtag 2023
-- ============================================================
-- 1) ac_match_referenz erhaelt Pass 5a/5b (Kombibeweis):
--    Namens-Vorschlag + exakte Ratenhoehe bzw. exakter offener
--    Postenrest desselben Patienten -> Score 90. Laeuft damit
--    jede Nacht automatisch mit (Engine ruft ac_match_referenz).
-- 2) ac_finanz_messwerte: Stichtag der harten Kandidaten von
--    2024-06-14 auf 2023-01-01 (PDF-Archiv-Import 05.06.2026).
-- Der Sonderverkehr-Kategorisierer liegt im Engine-Code
-- (matching-engine.ts), gleicher Commit.
-- ============================================================

CREATE OR REPLACE FUNCTION ac_match_referenz()
RETURNS TABLE (neu integer, korrigiert integer)
LANGUAGE plpgsql AS $$
DECLARE
  n_neu integer;
  n_korr integer;
  n_tmp integer;
BEGIN
  n_neu := 0;
  n_korr := 0;

  -- ── Pass 1: Rechnungszeichen, unklare Eingaenge ──
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
  GET DIAGNOSTICS n_tmp = ROW_COUNT;
  n_neu := n_neu + n_tmp;

  -- ── Pass 2: Rechnungszeichen, schwaechere Vorschlaege korrigieren ──
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
  WHERE t.id = e.tx_id;
  GET DIAGNOSTICS n_tmp = ROW_COUNT;
  n_korr := n_korr + n_tmp;

  -- ── Pass 3: Basisnummer (8-stellig) = patients.ivoris_nummer ──
  -- 3a: unklare Eingaenge
  WITH toks AS (
    SELECT t.id AS tx_id, m[1] AS nr
    FROM transaktionen t,
         LATERAL regexp_matches(t.verwendungszweck, '(?:^|[^0-9])([0-9]{8})(?:[^0-9]|$)', 'g') AS m
    WHERE t.matching_status = 'unklar' AND t.betrag > 0
  ),
  treffer AS (
    SELECT DISTINCT toks.tx_id, p.id AS patient_id
    FROM toks JOIN patients p ON p.ivoris_nummer = toks.nr
  ),
  e AS (
    SELECT tx_id, MIN(patient_id::text)::uuid AS patient_id
    FROM treffer GROUP BY tx_id HAVING COUNT(DISTINCT patient_id) = 1
  )
  UPDATE transaktionen t
  SET matched_patient_id = e.patient_id,
      matching_status    = 'abweichung',
      matching_score     = 95,
      matching_details   = jsonb_build_object('methode', 'basisnummer', 'name_score', 0, 'betrag_match', false, 'zweck_score', 95),
      geprueft_am        = now()
  FROM e WHERE t.id = e.tx_id;
  GET DIAGNOSTICS n_tmp = ROW_COUNT;
  n_neu := n_neu + n_tmp;

  -- 3b: schwaechere Vorschlaege anheben/korrigieren
  WITH toks AS (
    SELECT t.id AS tx_id, m[1] AS nr
    FROM transaktionen t,
         LATERAL regexp_matches(t.verwendungszweck, '(?:^|[^0-9])([0-9]{8})(?:[^0-9]|$)', 'g') AS m
    WHERE t.matching_status = 'abweichung' AND t.matching_score < 95 AND t.betrag > 0
  ),
  treffer AS (
    SELECT DISTINCT toks.tx_id, p.id AS patient_id
    FROM toks JOIN patients p ON p.ivoris_nummer = toks.nr
  ),
  e AS (
    SELECT tx_id, MIN(patient_id::text)::uuid AS patient_id
    FROM treffer GROUP BY tx_id HAVING COUNT(DISTINCT patient_id) = 1
  )
  UPDATE transaktionen t
  SET matched_patient_id = e.patient_id,
      matching_score     = 95,
      matching_details   = jsonb_build_object('methode', 'basisnummer', 'name_score', 0, 'betrag_match', false, 'zweck_score', 95),
      geprueft_am        = now()
  FROM e WHERE t.id = e.tx_id;
  GET DIAGNOSTICS n_tmp = ROW_COUNT;
  n_korr := n_korr + n_tmp;

  -- ── Pass 4: Rechnungsnummer (00xxxxxx) = offene_posten.rechnung_nr ──
  -- 4a: unklare Eingaenge
  WITH toks AS (
    SELECT t.id AS tx_id, m[1] AS nr
    FROM transaktionen t,
         LATERAL regexp_matches(t.verwendungszweck, '(?:^|[^0-9])(00[0-9]{6})(?:[^0-9]|$)', 'g') AS m
    WHERE t.matching_status = 'unklar' AND t.betrag > 0
  ),
  treffer AS (
    SELECT DISTINCT toks.tx_id, op.patient_id
    FROM toks
    JOIN offene_posten op ON op.rechnung_nr = toks.nr
    WHERE op.patient_id IS NOT NULL
  ),
  e AS (
    SELECT tx_id, MIN(patient_id::text)::uuid AS patient_id
    FROM treffer GROUP BY tx_id HAVING COUNT(DISTINCT patient_id) = 1
  )
  UPDATE transaktionen t
  SET matched_patient_id = e.patient_id,
      matching_status    = 'abweichung',
      matching_score     = 95,
      matching_details   = jsonb_build_object('methode', 'rechnungsnr', 'name_score', 0, 'betrag_match', false, 'zweck_score', 95),
      geprueft_am        = now()
  FROM e WHERE t.id = e.tx_id;
  GET DIAGNOSTICS n_tmp = ROW_COUNT;
  n_neu := n_neu + n_tmp;

  -- 4b: schwaechere Vorschlaege anheben/korrigieren
  WITH toks AS (
    SELECT t.id AS tx_id, m[1] AS nr
    FROM transaktionen t,
         LATERAL regexp_matches(t.verwendungszweck, '(?:^|[^0-9])(00[0-9]{6})(?:[^0-9]|$)', 'g') AS m
    WHERE t.matching_status = 'abweichung' AND t.matching_score < 95 AND t.betrag > 0
  ),
  treffer AS (
    SELECT DISTINCT toks.tx_id, op.patient_id
    FROM toks
    JOIN offene_posten op ON op.rechnung_nr = toks.nr
    WHERE op.patient_id IS NOT NULL
  ),
  e AS (
    SELECT tx_id, MIN(patient_id::text)::uuid AS patient_id
    FROM treffer GROUP BY tx_id HAVING COUNT(DISTINCT patient_id) = 1
  )
  UPDATE transaktionen t
  SET matched_patient_id = e.patient_id,
      matching_score     = 95,
      matching_details   = jsonb_build_object('methode', 'rechnungsnr', 'name_score', 0, 'betrag_match', false, 'zweck_score', 95),
      geprueft_am        = now()
  FROM e WHERE t.id = e.tx_id;
  GET DIAGNOSTICS n_tmp = ROW_COUNT;
  n_korr := n_korr + n_tmp;

  -- ───────────────────────────────────────────────────────────
  -- Pass 5a (Kombibeweis Rate): Namens-Vorschlag + Betrag entspricht
  -- exakt der Ratenhoehe (oder 2x/3x, Quartalszahler) des
  -- vorgeschlagenen Patienten -> zwei unabhaengige Beweise, Score 90.
  -- Bewusst 90 statt 95: Geschwister mit identischer Ratenhoehe kann
  -- der Kombibeweis nicht unterscheiden.
  -- ───────────────────────────────────────────────────────────
  UPDATE transaktionen t
  SET matching_score = 90,
      matching_details = COALESCE(t.matching_details, '{}'::jsonb)
        || '{"methode": "name_plus_rate"}'::jsonb
  WHERE t.matching_status = 'abweichung'
    AND t.matching_score < 90
    AND EXISTS (
      SELECT 1 FROM ratenplaene rp
      WHERE rp.patient_id = t.matched_patient_id
        AND (ABS(t.betrag -     rp.rate_betrag) <= 0.02
          OR ABS(t.betrag - 2 * rp.rate_betrag) <= 0.02
          OR ABS(t.betrag - 3 * rp.rate_betrag) <= 0.02)
    );

  -- Pass 5b (Kombibeweis Posten): Betrag entspricht exakt dem offenen
  -- Rest eines Postens desselben Patienten -> Score 90.
  UPDATE transaktionen t
  SET matching_score = 90,
      matching_details = COALESCE(t.matching_details, '{}'::jsonb)
        || '{"methode": "name_plus_posten"}'::jsonb
  WHERE t.matching_status = 'abweichung'
    AND t.matching_score < 90
    AND EXISTS (
      SELECT 1 FROM offene_posten op
      WHERE op.patient_id = t.matched_patient_id
        AND ABS(t.betrag - op.offen) <= 0.02
    );

  RETURN QUERY SELECT n_neu, n_korr;
END;
$$;

CREATE OR REPLACE FUNCTION ac_finanz_messwerte()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH tx AS (
  SELECT betrag,
         matching_status,
         COALESCE(matching_details->>'kategorie', '') AS kategorie,
         abgleich_status
  FROM transaktionen
  WHERE betrag > 0
),
terminal AS (
  SELECT * FROM tx
  WHERE abgleich_status IS NOT NULL
     OR kategorie = 'kartenterminal'
),
patientengeld AS (
  SELECT * FROM tx WHERE matching_status <> 'ignoriert'
),
kk AS (
  -- Kreditkarten-Buendel: Brutto steht im Verwendungszweck,
  -- Differenz zur Gutschrift = einbehaltene Kommission.
  SELECT substring(purpose from 'ALL / ([0-9]+\.[0-9]{2})')::numeric AS brutto,
         amount
  FROM bank_transactions_raw
  WHERE purpose LIKE 'ALL /%'
    AND amount > 0
    AND substring(purpose from 'ALL / ([0-9]+\.[0-9]{2})') IS NOT NULL
),
gs AS (
  SELECT * FROM patient_geldstatus
),
ab AS (
  -- Abbuchungen (alle Konten) fuer kuratierte Dauerposten
  SELECT counterpart_name, purpose, amount
  FROM bank_transactions_raw
  WHERE amount < 0
)
SELECT jsonb_build_object(
  'stand', now(),
  'eingaenge', jsonb_build_object(
    'anzahl', (SELECT COUNT(*) FROM tx),
    'summe',  (SELECT COALESCE(SUM(betrag), 0) FROM tx)
  ),
  'kzv', jsonb_build_object(
    'anzahl', (SELECT COUNT(*) FROM tx WHERE kategorie = 'kzv'),
    'summe',  (SELECT COALESCE(SUM(betrag), 0) FROM tx WHERE kategorie = 'kzv')
  ),
  'umbuchungen', jsonb_build_object(
    'anzahl', (SELECT COUNT(*) FROM tx WHERE kategorie = 'umbuchung'),
    'summe',  (SELECT COALESCE(SUM(betrag), 0) FROM tx WHERE kategorie = 'umbuchung')
  ),
  'terminal', jsonb_build_object(
    'anzahl',              (SELECT COUNT(*) FROM terminal),
    'summe',               (SELECT COALESCE(SUM(betrag), 0) FROM terminal),
    'offen_anzahl',        (SELECT COUNT(*) FROM terminal WHERE abgleich_status = 'offen'),
    'offen_summe',         (SELECT COALESCE(SUM(betrag), 0) FROM terminal WHERE abgleich_status = 'offen'),
    'abgeglichen_anzahl',  (SELECT COUNT(*) FROM terminal WHERE abgleich_status = 'abgeglichen'),
    'abgeglichen_summe',   (SELECT COALESCE(SUM(betrag), 0) FROM terminal WHERE abgleich_status = 'abgeglichen'),
    'kreditkarte', jsonb_build_object(
      'brutto',      (SELECT COALESCE(ROUND(SUM(brutto), 2), 0) FROM kk),
      'einbehalten', (SELECT COALESCE(ROUND(SUM(brutto - amount), 2), 0) FROM kk),
      'prozent',     (SELECT COALESCE(ROUND(100 * SUM(brutto - amount) / NULLIF(SUM(brutto), 0), 2), 0) FROM kk)
    )
  ),
  'patientengeld', jsonb_build_object(
    'bestaetigt', jsonb_build_object(
      'anzahl', (SELECT COUNT(*) FROM patientengeld WHERE matching_status IN ('auto', 'manuell')),
      'summe',  (SELECT COALESCE(SUM(betrag), 0) FROM patientengeld WHERE matching_status IN ('auto', 'manuell'))
    ),
    'vorschlag', jsonb_build_object(
      'anzahl', (SELECT COUNT(*) FROM patientengeld WHERE matching_status = 'abweichung'),
      'summe',  (SELECT COALESCE(SUM(betrag), 0) FROM patientengeld WHERE matching_status = 'abweichung')
    ),
    'unklar', jsonb_build_object(
      'anzahl', (SELECT COUNT(*) FROM patientengeld WHERE matching_status = 'unklar'),
      'summe',  (SELECT COALESCE(SUM(betrag), 0) FROM patientengeld WHERE matching_status = 'unklar')
    )
  ),
  'posten', jsonb_build_object(
    'offen_anzahl',       (SELECT COUNT(*) FROM offene_posten WHERE status = 'offen'),
    'offen_summe',        (SELECT COALESCE(SUM(offen), 0) FROM offene_posten WHERE status = 'offen'),
    'teilbezahlt_anzahl', (SELECT COUNT(*) FROM offene_posten WHERE status = 'teilbezahlt'),
    'teilbezahlt_summe',  (SELECT COALESCE(SUM(offen), 0) FROM offene_posten WHERE status = 'teilbezahlt'),
    'mahnschutz_anzahl',  (SELECT COUNT(*) FROM offene_posten WHERE nicht_mahnen = true)
  ),
  'ausgaben', jsonb_build_object(
    'buik', (SELECT jsonb_build_object('anzahl', COUNT(*), 'summe', COALESCE(ROUND(SUM(-amount), 2), 0))
             FROM ab WHERE counterpart_name ILIKE '%buik%' OR purpose ILIKE '%buik%'),
    'meta', (SELECT jsonb_build_object('anzahl', COUNT(*), 'summe', COALESCE(ROUND(SUM(-amount), 2), 0))
             FROM ab WHERE counterpart_name ILIKE '%facebook%' OR counterpart_name ILIKE '%meta platforms%' OR purpose ILIKE '%facebk%'),
    'kontofuehrung', (SELECT jsonb_build_object('anzahl', COUNT(*), 'summe', COALESCE(ROUND(SUM(-amount), 2), 0))
             FROM ab WHERE purpose ILIKE '%entgeltabrechnung%' OR purpose ILIKE '%rechnungsabschluss%'),
    'align', (SELECT jsonb_build_object('anzahl', COUNT(*), 'summe', COALESCE(ROUND(SUM(-amount), 2), 0))
             FROM ab WHERE counterpart_name ILIKE '%align%'),
    'mittwald', (SELECT jsonb_build_object('anzahl', COUNT(*), 'summe', COALESCE(ROUND(SUM(-amount), 2), 0))
             FROM ab WHERE counterpart_name ILIKE '%mittwald%')
  ),
  'geldstatus', jsonb_build_object(
    'harte_kandidaten', jsonb_build_object(
      'anzahl', (SELECT COUNT(*) FROM gs
                 WHERE einstufung = 'keine bankzahlung gefunden'
                   AND nicht_mahnen = false
                   AND aeltester_posten >= '2023-01-01'),
      'summe',  (SELECT COALESCE(SUM(posten_offen), 0) FROM gs
                 WHERE einstufung = 'keine bankzahlung gefunden'
                   AND nicht_mahnen = false
                   AND aeltester_posten >= '2023-01-01')
    ),
    'einstufungen', (
      SELECT COALESCE(jsonb_object_agg(einstufung,
               jsonb_build_object('anzahl', anzahl, 'summe', summe)), '{}'::jsonb)
      FROM (
        SELECT einstufung, COUNT(*) AS anzahl,
               COALESCE(SUM(posten_offen), 0) AS summe
        FROM gs
        GROUP BY einstufung
      ) e
    )
  )
);
$$;

GRANT EXECUTE ON FUNCTION ac_finanz_messwerte() TO anon, authenticated, service_role;
