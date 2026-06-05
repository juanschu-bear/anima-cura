-- ============================================================
-- 008: Matching Stufe 1+2
-- ============================================================
-- Stand: 04.06.2026, live in Supabase. Nachgereicht am 05.06.2026
-- (die Datei war zuvor nur ein Verweis-Stub). Hinweis zur
-- Nummerierung: 005 und 006 wurden nie vergeben, die Reihe
-- springt von 004 auf 007.
--
-- Inhalt:
--   1. geprueft_am: Pruef-Stempel gegen Endlos-Pruefung
--   2. ac_norm(): Normalisierung (Umlaute, Kleinschreibung)
--   3. ac_match_names(von, bis): Namens-Matching, set-basiert,
--      MATERIALIZED-Variante mit optionaler Datums-Stueckelung
--      (ersetzt die erste, zu langsame Fassung)
--
-- Einmalige Regel-Laeufe vom 04.06.2026 (nicht Teil der
-- Migration, laufen heute im Kategorisierer der Engine):
--   PAYONE/Kartenumsaetze/Rueckueberweisung -> ignoriert.
-- ============================================================

ALTER TABLE transaktionen ADD COLUMN IF NOT EXISTS geprueft_am timestamptz;

CREATE OR REPLACE FUNCTION ac_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(
    replace(replace(replace(replace(lower(coalesce(t, '')),
      'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION ac_match_names(von date DEFAULT NULL, bis date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  betroffen integer;
BEGIN
  WITH tx AS MATERIALIZED (
    SELECT id, ac_norm(verwendungszweck || ' ' || coalesce(absender_name, '')) AS hay
    FROM transaktionen
    WHERE matching_status = 'unklar'
      AND matched_patient_id IS NULL
      AND betrag > 0
      AND (von IS NULL OR datum >= von)
      AND (bis IS NULL OR datum < bis)
  ),
  pat AS MATERIALIZED (
    SELECT id, ac_norm(vorname) AS v, ac_norm(nachname) AS n
    FROM patients
    WHERE length(coalesce(vorname, '')) >= 3
      AND length(coalesce(nachname, '')) >= 3
  ),
  kandidaten AS (
    SELECT tx.id AS tx_id, pat.id AS patient_id
    FROM tx
    JOIN pat
      ON tx.hay LIKE '%' || pat.v || ' ' || pat.n || '%'
      OR tx.hay LIKE '%' || pat.n || ' ' || pat.v || '%'
  ),
  eindeutig AS (
    SELECT tx_id, min(patient_id::text)::uuid AS patient_id
    FROM kandidaten
    GROUP BY tx_id
    HAVING count(DISTINCT patient_id) = 1
  )
  UPDATE transaktionen t
  SET matched_patient_id = e.patient_id,
      matching_status    = 'abweichung',
      matching_score     = 80,
      matching_details   = jsonb_build_object(
        'methode', 'name',
        'name_score', 80,
        'betrag_match', false,
        'zweck_score', 0
      ),
      geprueft_am        = now()
  FROM eindeutig e
  WHERE t.id = e.tx_id;

  GET DIAGNOSTICS betroffen = ROW_COUNT;
  RETURN betroffen;
END;
$$;
