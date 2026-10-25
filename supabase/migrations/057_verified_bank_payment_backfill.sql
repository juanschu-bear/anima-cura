-- Additive shadow import only. Never changes invoices, bank matches or notifications.
CREATE OR REPLACE FUNCTION public.payment_backfill_catalog_fingerprint()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT md5(
    (SELECT coalesce(jsonb_agg(jsonb_build_array(id,ivoris_nummer,vorname,nachname) ORDER BY id),'[]'::jsonb)::text FROM patients)
    || ':' ||
    (SELECT coalesce(jsonb_agg(jsonb_build_array(id,patient_id,unser_zeichen,rechnung_nr) ORDER BY id),'[]'::jsonb)::text FROM offene_posten)
  );
$$;

CREATE OR REPLACE FUNCTION public.import_verified_bank_payment_batch(p_catalog text, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  item jsonb;
  tx transaktionen%ROWTYPE;
  patient patients%ROWTYPE;
  existing payment_patient_allocations%ROWTYPE;
  patient_number text;
  purpose text;
  number_tokens text[];
  imported_count integer := 0;
  existing_count integer := 0;
  skipped_count integer := 0;
  amount_total bigint := 0;
  reasons jsonb := '{}'::jsonb;
  reason text;
BEGIN
  IF p_catalog IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 100 THEN
    RAISE EXCEPTION 'invalid verified payment batch';
  END IF;
  -- Preserve the exact identity/reference catalogue used by the independent audit.
  -- Locks last only for this batch (at most 100 payments).
  LOCK TABLE patients, offene_posten IN SHARE MODE;
  IF payment_backfill_catalog_fingerprint() IS DISTINCT FROM p_catalog THEN
    RAISE EXCEPTION 'payment catalogue changed; repeat read-only audit';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'transaction_id' LOOP
    reason := NULL;
    SELECT * INTO tx FROM transaktionen WHERE id = (item->>'transaction_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      reason := 'missing_transaction';
    ELSIF jsonb_build_object('id',tx.id,'betrag',tx.betrag,'absender_name',tx.absender_name,
      'verwendungszweck',tx.verwendungszweck,'matching_status',tx.matching_status,
      'matched_patient_id',tx.matched_patient_id) IS DISTINCT FROM item->'expected_transaction' THEN
      reason := 'transaction_changed';
    ELSIF tx.betrag <= 0 OR tx.matching_status NOT IN ('auto','manuell') OR tx.matching_status IS NULL
      OR tx.matched_patient_id IS DISTINCT FROM (item->>'patient_id')::uuid
      OR round(tx.betrag*100)::bigint IS DISTINCT FROM (item->>'amount_cents')::bigint THEN
      reason := 'invalid_legacy_match';
    ELSE
      -- Every journal writer locks the same source row through the existing validator.
      -- Any prior decision (also a reversal/rejection) prevents another import.
      SELECT * INTO existing FROM payment_patient_allocations WHERE transaction_id = tx.id
        ORDER BY created_at,id LIMIT 1;
      IF FOUND THEN
        IF existing.source_key = 'verified-bank-v1:' || tx.id::text
          AND existing.patient_id = tx.matched_patient_id
          AND existing.amount_cents = round(tx.betrag*100)::bigint
          AND existing.state = 'confirmed_auto'
          AND NOT EXISTS (SELECT 1 FROM payment_patient_allocations a WHERE a.transaction_id=tx.id AND a.id<>existing.id) THEN
          existing_count := existing_count+1;
          CONTINUE;
        END IF;
        reason := 'prior_journal_decision';
      ELSE
        SELECT * INTO patient FROM patients WHERE id=tx.matched_patient_id;
        patient_number := lpad(regexp_replace(coalesce(patient.ivoris_nummer,''),'[^0-9]','','g'),8,'0');
        purpose := regexp_replace(coalesce(tx.verwendungszweck,''),'\s','','g');
        SELECT coalesce(array_agg(token[1]),ARRAY[]::text[]) INTO number_tokens
          FROM regexp_matches(purpose,'[0-9]+','g') AS token WHERE length(token[1])=8;
        -- This first import deliberately accepts patient-number evidence only.
        -- Name-only and invoice-only proposals stay outside automatic writes.
        IF patient.id IS NULL OR patient_number='00000000'
          OR length(regexp_replace(coalesce(patient.ivoris_nummer,''),'[^0-9]','','g'))>8
          OR NOT (patient_number=ANY(number_tokens))
          OR EXISTS (SELECT 1 FROM patients other WHERE other.id<>patient.id
            AND lpad(regexp_replace(coalesce(other.ivoris_nummer,''),'[^0-9]','','g'),8,'0')<>'00000000'
            AND lpad(regexp_replace(coalesce(other.ivoris_nummer,''),'[^0-9]','','g'),8,'0')=ANY(number_tokens)) THEN
          reason := 'patient_number_not_unique';
        ELSE
          INSERT INTO payment_patient_allocations(transaction_id,patient_id,amount_cents,state,
            confidence_score,evidence,decision_reason,confirmed_at,source_key)
          VALUES(tx.id,patient.id,round(tx.betrag*100)::bigint,'confirmed_auto',100,
            jsonb_build_array(jsonb_build_object('kind','patient_number','value',patient_number,'score',100),
              jsonb_build_object('kind','verified_legacy_snapshot','catalog',p_catalog,'transaction',item->'expected_transaction')),
            'Belegte Bankzuordnung aus Bestandsabgleich; keine Änderung an Forderungen oder Patientenmeldungen',now(),
            'verified-bank-v1:'||tx.id::text);
          imported_count := imported_count+1;
          amount_total := amount_total+round(tx.betrag*100)::bigint;
          CONTINUE;
        END IF;
      END IF;
    END IF;
    skipped_count := skipped_count+1;
    reasons := jsonb_set(reasons,ARRAY[reason],to_jsonb(coalesce((reasons->>reason)::integer,0)+1));
  END LOOP;
  RETURN jsonb_build_object('imported',imported_count,'already_imported',existing_count,
    'skipped',skipped_count,'imported_cents',amount_total,'skip_reasons',reasons);
END;
$$;

REVOKE ALL ON FUNCTION public.payment_backfill_catalog_fingerprint() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.import_verified_bank_payment_batch(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_backfill_catalog_fingerprint() TO service_role;
GRANT EXECUTE ON FUNCTION public.import_verified_bank_payment_batch(text,jsonb) TO service_role;
