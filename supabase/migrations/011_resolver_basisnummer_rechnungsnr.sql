-- ============================================================
-- Migration 011: Resolver-Erweiterung + abgleich_status
-- ============================================================
-- ac_match_referenz() lernt zwei neue Zungen, beide aus den
-- Hand-Laeufen vom 05.06.2026 (zusammen >900 Aufloesungen):
--
--   Pass 3 (Basisnummer): 8-stellige Patientennummer im
--     Verwendungszweck = patients.ivoris_nummer. Funktioniert
--     auch fuer bezahlte Rechnungen und brandneue Posten, die
--     der letzte IVORIS-Export noch nicht kennt (Fall Mirbeth).
--   Pass 4 (Rechnungsnummer): Muster 00xxxxxx im Zweck =
--     offene_posten.rechnung_nr (Fall Krekel, Jaspert u.a.).
--
-- Beide Paesse schreiben Score 95 als Vorschlag ('abweichung')
-- und heben bestehende schwaechere Vorschlaege (<95) an bzw.
-- korrigieren sie, analog zum Zeichen-Pass.
--
-- Ausserdem (idempotent): abgleich_status fuer Terminal-Buendel.
-- ============================================================

ALTER TABLE transaktionen ADD COLUMN IF NOT EXISTS abgleich_status text;

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

  RETURN QUERY SELECT n_neu, n_korr;
END;
$$;
