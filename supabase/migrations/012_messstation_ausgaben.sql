-- ============================================================
-- Migration 012: Messstation um Ausgaben-Block erweitert
-- ============================================================
-- ac_finanz_messwerte() liefert zusaetzlich 'ausgaben' mit den
-- kuratierten Dauerposten aus dem Roh-Archiv (Fahndung 05.06.):
-- Buik (Terminal-Service), Meta-Werbung, Kontofuehrung,
-- Align Technology, Mittwald-Hosting. Bewusst kuratiert statt
-- Top-Liste, damit keine Gehaelter o.ae. auf der Seite landen.
-- ============================================================

ALTER TABLE transaktionen ADD COLUMN IF NOT EXISTS abgleich_status text;

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
                   AND aeltester_posten >= '2024-06-14'),
      'summe',  (SELECT COALESCE(SUM(posten_offen), 0) FROM gs
                 WHERE einstufung = 'keine bankzahlung gefunden'
                   AND nicht_mahnen = false
                   AND aeltester_posten >= '2024-06-14')
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
