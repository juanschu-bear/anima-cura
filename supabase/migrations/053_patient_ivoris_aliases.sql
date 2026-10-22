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

-- Payment ledger rows are append-only. A verified patient merge may change
-- only their patient reference; all financial identity and amount fields stay
-- immutable. The transaction-local flag is set exclusively by the secured
-- merge functions below.
CREATE OR REPLACE FUNCTION protect_patient_payment_allocation_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'patient payment allocations are append-only; reject or reverse instead';
  END IF;

  IF current_setting('app.patient_merge', true) = 'on'
     AND OLD.patient_id IS DISTINCT FROM NEW.patient_id
     AND OLD.transaction_id IS NOT DISTINCT FROM NEW.transaction_id
     AND OLD.amount_cents IS NOT DISTINCT FROM NEW.amount_cents
     AND OLD.state IS NOT DISTINCT FROM NEW.state
     AND OLD.confidence_score IS NOT DISTINCT FROM NEW.confidence_score
     AND OLD.evidence IS NOT DISTINCT FROM NEW.evidence
     AND OLD.decision_reason IS NOT DISTINCT FROM NEW.decision_reason
     AND OLD.confirmed_at IS NOT DISTINCT FROM NEW.confirmed_at
     AND OLD.confirmed_by IS NOT DISTINCT FROM NEW.confirmed_by
     AND OLD.reversal_of_allocation_id IS NOT DISTINCT FROM NEW.reversal_of_allocation_id
     AND OLD.created_at IS NOT DISTINCT FROM NEW.created_at THEN
    RETURN NEW;
  END IF;

  IF OLD.transaction_id <> NEW.transaction_id
     OR OLD.patient_id <> NEW.patient_id
     OR OLD.amount_cents <> NEW.amount_cents
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'patient allocation identity and amount are immutable';
  END IF;
  IF OLD.state <> 'candidate' THEN
    RAISE EXCEPTION 'decided patient allocations are immutable; create a reversal instead';
  END IF;
  IF NEW.state NOT IN ('candidate', 'confirmed_auto', 'confirmed_manual', 'rejected') THEN
    RAISE EXCEPTION 'candidate can only remain candidate, be confirmed, or be rejected';
  END IF;
  RETURN NEW;
END;
$$;

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
  IF translate(
       lower(trim(source_row.nachname)),
       'áàâäãåéèêëíìîïóòôöõúùûüýÿñçß',
       'aaaaaaeeeeiiiiooooouuuuyyncs'
     ) IS DISTINCT FROM translate(
       lower(trim(target_row.nachname)),
       'áàâäãåéèêëíìîïóòôöõúùûüýÿñçß',
       'aaaaaaeeeeiiiiooooouuuuyyncs'
     ) THEN
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

  UPDATE kassen_zahlungen
  SET patient_id = p_target_patient_id
  WHERE patient_id = p_source_patient_id;

  PERFORM set_config('app.patient_merge', 'on', true);
  UPDATE payment_patient_allocations
  SET patient_id = p_target_patient_id
  WHERE patient_id = p_source_patient_id
    AND reversal_of_allocation_id IS NULL;
  UPDATE payment_patient_allocations
  SET patient_id = p_target_patient_id
  WHERE patient_id = p_source_patient_id
    AND reversal_of_allocation_id IS NOT NULL;

  -- The existing audited merge only accepts an unlinked source and compares
  -- the surname with German-only accent folding. Both changes are local to the
  -- transaction; any failure rolls the complete operation back.
  UPDATE patients
  SET ivoris_id = NULL,
      nachname = target_row.nachname
  WHERE id = p_source_patient_id;
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

CREATE OR REPLACE FUNCTION merge_local_patient_duplicate(
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
  normalized_source_first text;
  normalized_target_first text;
BEGIN
  SELECT * INTO source_row FROM patients WHERE id = p_source_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source patient not found'; END IF;
  SELECT * INTO target_row FROM patients WHERE id = p_target_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target patient not found'; END IF;

  IF source_row.ivoris_id IS NOT NULL OR target_row.ivoris_id IS NULL THEN
    RAISE EXCEPTION 'source must be local and target must be canonical IVORIS patient';
  END IF;
  IF source_row.geburtsdatum IS DISTINCT FROM target_row.geburtsdatum THEN
    RAISE EXCEPTION 'patient birthdays do not match';
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

  -- The audited base function compares the last name literally after German
  -- umlaut folding. A verified accent-only spelling difference is normalized
  -- transaction-locally before the audited merge.
  UPDATE patients
  SET nachname = target_row.nachname
  WHERE id = p_source_patient_id;

  UPDATE kassen_zahlungen
  SET patient_id = p_target_patient_id
  WHERE patient_id = p_source_patient_id;

  PERFORM set_config('app.patient_merge', 'on', true);
  UPDATE payment_patient_allocations
  SET patient_id = p_target_patient_id
  WHERE patient_id = p_source_patient_id
    AND reversal_of_allocation_id IS NULL;
  UPDATE payment_patient_allocations
  SET patient_id = p_target_patient_id
  WHERE patient_id = p_source_patient_id
    AND reversal_of_allocation_id IS NOT NULL;

  RETURN merge_patient_into_canonical(
    p_source_patient_id,
    p_target_patient_id,
    p_reason || ' (lokale Dublette)'
  );
END;
$$;

REVOKE ALL ON FUNCTION merge_local_patient_duplicate(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION merge_local_patient_duplicate(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION merge_local_patient_duplicate(uuid, uuid, text) TO service_role;
