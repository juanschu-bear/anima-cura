-- ============================================================
-- 023 – Aligner-Kontrolle: "ausgegeben von/bis" wird optional.
-- Das neue Pflichtfeld ist die aktuell getragene Schiene, das
-- Cockpit erzwingt es. Hier nur: Gruppe 'ausgabe' auf optional
-- setzen und ihre Auto-Auswahl (on der ersten Option) abschalten,
-- damit der "ausgegeben"-Satz nicht mehr automatisch erscheint.
--
-- Run once in the shared Supabase (project zymqxzhjbcxzhzvjqvbv).
-- ============================================================

UPDATE doku_vorlagen
SET struktur = jsonb_set(
                 jsonb_set(struktur, '{groups,ausgabe,req}', 'false'::jsonb),
                 '{groups,ausgabe,opts,0,on}', 'false'::jsonb
               ),
    updated_at = NOW()
WHERE behandlungsart = 'aligner' AND termin_typ = 'kontrolle';

-- Check (erwartet: req=false, opt0_on=false):
SELECT behandlungsart, termin_typ,
       struktur->'groups'->'ausgabe'->>'req'              AS ausgabe_req,
       struktur->'groups'->'ausgabe'->'opts'->0->>'on'    AS opt0_on
FROM doku_vorlagen
WHERE behandlungsart = 'aligner' AND termin_typ = 'kontrolle';
