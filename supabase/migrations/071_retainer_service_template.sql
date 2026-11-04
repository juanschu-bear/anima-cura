-- Eigenstaendige Scribe-Vorlage fuer Retainer-Servicefaelle.
-- Der Fall setzt weder eine Vorbehandlung noch einen Behandlungsplan der Praxis voraus.
-- Bestehende bestaetigte Eintraege bleiben unveraendert; die geklonten Aligner-Vorlagen
-- werden nur fuer neue Eintraege deaktiviert.
BEGIN;

DO $migration$
DECLARE
  custom_types jsonb := '[]'::jsonb;
  retainer_type jsonb;
  retainer_id uuid;
  retainer_key text;
BEGIN
  SELECT COALESCE(value, '[]'::jsonb)
    INTO custom_types
  FROM public.einstellungen
  WHERE key = 'scribe_behandlungsarten';

  SELECT item
    INTO retainer_type
  FROM jsonb_array_elements(custom_types) AS item
  WHERE lower(trim(item->>'name')) = 'retainer'
  LIMIT 1;

  IF retainer_type IS NULL THEN
    retainer_id := gen_random_uuid();
    retainer_key := 'custom-' || retainer_id::text;
    retainer_type := jsonb_build_object(
      'id', retainer_id::text,
      'name', 'Retainer',
      'basis', 'aligner',
      'key', retainer_key
    );

    INSERT INTO public.einstellungen (key, value, updated_at)
    VALUES ('scribe_behandlungsarten', jsonb_build_array(retainer_type), now())
    ON CONFLICT (key) DO UPDATE
      SET value = COALESCE(public.einstellungen.value, '[]'::jsonb) || jsonb_build_array(retainer_type),
          updated_at = now();
  ELSE
    retainer_id := (retainer_type->>'id')::uuid;
    retainer_key := COALESCE(NULLIF(trim(retainer_type->>'key'), ''), 'custom-' || retainer_id::text);
  END IF;

  UPDATE public.doku_vorlagen
  SET aktiv = false,
      updated_at = now()
  WHERE behandlungsart = retainer_key
    AND aktiv = true
    AND termin_typ <> 'retainer-service';

  INSERT INTO public.doku_vorlagen (
    behandlungsart,
    termin_typ,
    name,
    sort_index,
    aktiv,
    struktur,
    positionen
  )
  SELECT
    retainer_key,
    'retainer-service',
    'Retainer reparieren oder erneuern',
    0,
    true,
    jsonb_build_object(
      'template', jsonb_build_array(
        'Retainer-Service. ',
        jsonb_build_object('g', 'herkunft'),
        jsonb_build_object('g', 'kiefer'),
        jsonb_build_object('g', 'befund'),
        jsonb_build_object('g', 'massnahme'),
        jsonb_build_object('g', 'weiter')
      ),
      'groups', jsonb_build_object(
        'herkunft', jsonb_build_object(
          'label', 'Wo wurde die bisherige Behandlung durchgeführt?',
          'req', true,
          'explizit', true,
          'type', 'single',
          'opts', jsonb_build_array(
            jsonb_build_object('t', 'KFO-Behandlung in dieser Praxis.'),
            jsonb_build_object('t', 'KFO-Behandlung in einer anderen Praxis.'),
            jsonb_build_object('t', 'Vorbehandlung nicht sicher bekannt.')
          )
        ),
        'kiefer', jsonb_build_object(
          'label', 'Welcher Kiefer ist betroffen?',
          'req', true,
          'explizit', true,
          'type', 'single',
          'opts', jsonb_build_array(
            jsonb_build_object('t', 'Retainer OK betroffen.'),
            jsonb_build_object('t', 'Retainer UK betroffen.'),
            jsonb_build_object('t', 'Retainer OK und UK betroffen.')
          )
        ),
        'befund', jsonb_build_object(
          'label', 'Was ist mit dem Retainer?',
          'req', true,
          'explizit', true,
          'type', 'multi',
          'opts', jsonb_build_array(
            jsonb_build_object('t', 'Retainer teilweise gelöst.'),
            jsonb_build_object('t', 'Retainer vollständig gelöst.'),
            jsonb_build_object('t', 'Retainer gebrochen.'),
            jsonb_build_object('t', 'Retainer verloren.'),
            jsonb_build_object('t', 'Retainer beschädigt oder nicht passend.'),
            jsonb_build_object('t', 'Neuer Retainer gewünscht.')
          )
        ),
        'massnahme', jsonb_build_object(
          'label', 'Was wurde heute gemacht?',
          'req', true,
          'explizit', true,
          'type', 'multi',
          'opts', jsonb_build_array(
            jsonb_build_object('t', 'Retainer wieder befestigt.'),
            jsonb_build_object('t', 'Retainer repariert.'),
            jsonb_build_object('t', 'Retainer entfernt.'),
            jsonb_build_object('t', 'Neuen Retainer beauftragt.'),
            jsonb_build_object('t', 'Scan angefertigt.'),
            jsonb_build_object('t', 'Abformung angefertigt.'),
            jsonb_build_object('t', 'Nur untersucht und beraten.')
          )
        ),
        'weiter', jsonb_build_object(
          'label', 'Wie geht es weiter?',
          'req', false,
          'type', 'multi',
          'opts', jsonb_build_array(
            jsonb_build_object('t', 'Labor beauftragt.'),
            jsonb_build_object('t', 'Kontrolltermin vereinbart.'),
            jsonb_build_object('t', 'Unterlagen der Vorpraxis liegen nicht vor.'),
            jsonb_build_object('t', 'Unterlagen der Vorpraxis liegen vor.')
          )
        )
      ),
      'vars', jsonb_build_array(),
      'kontext', 'Eigenständiger Retainer-Service für bekannte und neue Patienten, auch nach Vorbehandlung in einer anderen Praxis.',
      'praxis_muster', 'Retainer reparieren, wieder befestigen oder erneuern',
      'anima_kopplung', 'Retainer-Service dokumentiert · Abrechnung fachlich prüfen',
      'abrechnung_titel', 'Retainer-Service fachlich prüfen',
      'abrechnung_hinweis', 'Es wird bewusst keine automatische Gebührenposition vorgeschlagen. Die Abrechnung hängt von Befund, Maßnahme und Kostenträger ab.'
    ),
    '[]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.doku_vorlagen
    WHERE behandlungsart = retainer_key
      AND termin_typ = 'retainer-service'
  );

  UPDATE public.doku_vorlagen
  SET aktiv = (termin_typ = 'retainer-service'),
      updated_at = now()
  WHERE behandlungsart = retainer_key;
END
$migration$;

COMMIT;
