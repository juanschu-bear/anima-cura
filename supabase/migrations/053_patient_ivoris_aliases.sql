CREATE TABLE IF NOT EXISTS patient_ivoris_aliases (
  alias_ivoris_id text PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  canonical_ivoris_id text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_ivoris_aliases_patient
  ON patient_ivoris_aliases(patient_id);

ALTER TABLE patient_ivoris_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_ivoris_aliases_service_all ON patient_ivoris_aliases;
CREATE POLICY patient_ivoris_aliases_service_all ON patient_ivoris_aliases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON patient_ivoris_aliases FROM PUBLIC, anon, authenticated;
GRANT ALL ON patient_ivoris_aliases TO service_role;

CREATE OR REPLACE FUNCTION merge_duplicate_patient_with_ivoris_alias(
  p_source_patient_id uuid,
  p_target_patient_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_row patients%ROWTYPE;
  target_row patients%ROWTYPE;
  merge_result jsonb;
  normalized_source_first text;
  normalized_target_first text;
BEGIN
  IF p_source_patient_id = p_target_patient_id THEN
    RAISE EXCEPTION 'source and target patient must differ';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'merge reason is required';
  END IF;

  SELECT * INTO source_row FROM patients WHERE id = p_source_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source patient not found'; END IF;
  SELECT * INTO target_row FROM patients WHERE id = p_target_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target patient not found'; END IF;

  IF source_row.ivoris_id IS NULL OR target_row.ivoris_id IS NULL THEN
    RAISE EXCEPTION 'both duplicate records need an IVORIS id';
  END IF;
  IF source_row.geburtsdatum IS DISTINCT FROM target_row.geburtsdatum THEN
    RAISE EXCEPTION 'patient birthdays do not match';
  END IF;
  IF translate(lower(trim(source_row.nachname)), 'äöüß', 'aous')
     IS DISTINCT FROM translate(lower(trim(target_row.nachname)), 'äöüß', 'aous') THEN
    RAISE EXCEPTION 'patient last names do not match';
  END IF;

  normalized_source_first := translate(lower(trim(source_row.vorname)), 'äöüß', 'aous');
  normalized_target_first := translate(lower(trim(target_row.vorname)), 'äöüß', 'aous');
  IF normalized_source_first <> normalized_target_first
     AND position(normalized_source_first in normalized_target_first) = 0
     AND position(normalized_target_first in normalized_source_first) = 0 THEN
    RAISE EXCEPTION 'patient first names are not compatible';
  END IF;

  IF NOT (
    nullif(lower(trim(source_row.email)), '') IS NOT NULL
    AND lower(trim(source_row.email)) = lower(trim(target_row.email))
  ) AND NOT (
    nullif(regexp_replace(coalesce(source_row.telefon, ''), '\D', '', 'g'), '') IS NOT NULL
    AND regexp_replace(coalesce(source_row.telefon, ''), '\D', '', 'g') IN (
      regexp_replace(coalesce(target_row.telefon, ''), '\D', '', 'g'),
      regexp_replace(coalesce(target_row.mobiltelefon, ''), '\D', '', 'g')
    )
  ) AND NOT (
    nullif(regexp_replace(coalesce(source_row.mobiltelefon, ''), '\D', '', 'g'), '') IS NOT NULL
    AND regexp_replace(coalesce(source_row.mobiltelefon, ''), '\D', '', 'g') IN (
      regexp_replace(coalesce(target_row.telefon, ''), '\D', '', 'g'),
      regexp_replace(coalesce(target_row.mobiltelefon, ''), '\D', '', 'g')
    )
  ) THEN
    RAISE EXCEPTION 'duplicate records need a matching email address or phone number';
  END IF;

  INSERT INTO patient_ivoris_aliases (
    alias_ivoris_id,
    patient_id,
    canonical_ivoris_id,
    reason
  ) VALUES (
    source_row.ivoris_id,
    p_target_patient_id,
    target_row.ivoris_id,
    trim(p_reason)
  )
  ON CONFLICT (alias_ivoris_id) DO UPDATE SET
    patient_id = EXCLUDED.patient_id,
    canonical_ivoris_id = EXCLUDED.canonical_ivoris_id,
    reason = EXCLUDED.reason;

  -- The existing audited merge only accepts an unlinked source. Clearing the
  -- source id is transaction-local; any failure rolls the whole operation back.
  UPDATE patients SET ivoris_id = NULL WHERE id = p_source_patient_id;
  merge_result := merge_patient_into_canonical(
    p_source_patient_id,
    p_target_patient_id,
    p_reason || ' (IVORIS alias ' || source_row.ivoris_id || ')'
  );

  RETURN merge_result || jsonb_build_object(
    'aliasIvorisId', source_row.ivoris_id,
    'canonicalIvorisId', target_row.ivoris_id
  );
END;
$$;

REVOKE ALL ON FUNCTION merge_duplicate_patient_with_ivoris_alias(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION merge_duplicate_patient_with_ivoris_alias(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION merge_duplicate_patient_with_ivoris_alias(uuid, uuid, text) TO service_role;
