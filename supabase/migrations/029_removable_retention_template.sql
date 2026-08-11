-- ============================================================
-- 029 – Fehlende Scribe-Terminart fuer herausnehmbare Apparaturen:
--       Retentionskontrolle / Nachsorge
--
-- Hintergrund:
-- In der Praxis wurde benoetigt, dass auch fuer "Herausnehmbar"
-- eine eigene Retainer-/Nachsorge-Terminart oben in der Auswahl
-- erscheint. Die bisherigen produktiven Vorlagen enden bei
-- "Abschluss", eine Terminart "retention" fehlte komplett.
--
-- Diese Migration legt die Vorlage nur an, wenn sie noch nicht
-- existiert. Automatische Abrechnungspositionen werden bewusst
-- NICHT hinterlegt, damit nichts Fachliches falsch suggeriert wird.
-- ============================================================

INSERT INTO doku_vorlagen (
  behandlungsart,
  termin_typ,
  name,
  sort_index,
  aktiv,
  struktur,
  positionen
)
SELECT
  'removable',
  'retention',
  'Retentionskontrolle',
  7,
  true,
  jsonb_build_object(
    'template', jsonb_build_array(
      'Retentionskontrolle herausnehmbare Apparatur. ',
      jsonb_build_object('g', 'befund'),
      jsonb_build_object('g', 'hinweis')
    ),
    'groups', jsonb_build_object(
      'befund', jsonb_build_object(
        'label', 'Befund',
        'req', true,
        'type', 'single',
        'opts', jsonb_build_array(
          jsonb_build_object('t', 'Retentionsgerät in situ, Sitz und Stellung stabil.', 'on', true),
          jsonb_build_object('t', 'Retentionsgerät kontrolliert, Trageweise erneut besprochen.'),
          jsonb_build_object('t', 'Leichte Druckstelle am Retentionsgerät, entlastet.')
        )
      ),
      'hinweis', jsonb_build_object(
        'label', 'Hinweis',
        'req', false,
        'type', 'multi',
        'opts', jsonb_build_array(
          jsonb_build_object('t', 'Weiteres Tragen wie besprochen empfohlen.'),
          jsonb_build_object('t', 'Nächste Retentionskontrolle vereinbart.'),
          jsonb_build_object('t', 'Reinigung und Handhabung erneut erklärt.')
        )
      )
    ),
    'vars', jsonb_build_array(),
    'kontext', 'Retentions- und Nachsorgekontrolle bei herausnehmbarer Apparatur. Dokumentation separat sichtbar, Abrechnung bitte fachlich pruefen.',
    'praxis_muster', 'Retentionskontrolle',
    'anima_kopplung', 'Nachsorge dokumentiert · keine automatische Abrechnungsposition hinterlegt',
    'abrechnung_titel', 'Abrechnung fachlich pruefen',
    'abrechnung_hinweis', 'Fuer diese Nachsorge wird bewusst keine automatische Position vorgeschlagen. Bitte je Fall fachlich pruefen.'
  ),
  '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM doku_vorlagen
  WHERE behandlungsart = 'removable'
    AND termin_typ = 'retention'
);

-- Check
SELECT behandlungsart, termin_typ, name, sort_index, aktiv
FROM doku_vorlagen
WHERE behandlungsart = 'removable'
  AND termin_typ = 'retention';
