BEGIN;
CREATE TABLE payment_invoice_reconciliations (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES offene_posten(id),
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payment_invoice_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_invoice_reconciliations_service_all ON payment_invoice_reconciliations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT,INSERT ON payment_invoice_reconciliations TO service_role;
REVOKE ALL ON payment_invoice_reconciliations FROM PUBLIC,anon,authenticated;
CREATE TRIGGER immutable_invoice_reconciliation BEFORE UPDATE OR DELETE ON payment_invoice_reconciliations
  FOR EACH ROW EXECUTE FUNCTION protect_invoice_payment_allocation_history();

CREATE OR REPLACE FUNCTION verified_invoice_reference_tokens(value text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(DISTINCT m[1]||'-'||coalesce(nullif(ltrim(m[2],'0'),''),'0')||'/'||m[3]
    ||CASE WHEN m[4] IS NULL THEN '' ELSE '-'||coalesce(nullif(ltrim(m[4],'0'),''),'0') END),ARRAY[]::text[])
  FROM regexp_matches(coalesce(value,''),'(?<![0-9])([0-9]{8})\s*-\s*([0-9]+)\s*[/.]\s*([0-9]{4})(?:\s*-\s*([0-9]+))?(?![0-9])','g') AS m;
$$;

CREATE OR REPLACE FUNCTION reconcile_verified_invoice_payments(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  invoice offene_posten%ROWTYPE;
  prior payment_invoice_reconciliations%ROWTYPE;
  parent payment_patient_allocations%ROWTYPE;
  tx transaktionen%ROWTYPE;
  row jsonb;
  ids uuid[] := ARRAY[]::uuid[];
  total bigint := 0;
  gross bigint;
  paid bigint;
  opened bigint;
  target_paid bigint;
  latest_date date;
  reference text;
  reference_tokens text[];
  result jsonb;
BEGIN
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR p_request->>'request_id' IS NULL
    OR jsonb_typeof(p_request->'payments') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_request->'payments') NOT BETWEEN 1 AND 100
    OR NOT (coalesce(p_request->'expected_invoice','{}'::jsonb) ?& ARRAY['id','patient_id','unser_zeichen','betrag','gezahlt','offen','status','rechnung_datum','bezahlt_am','nicht_mahnen']) THEN
    RAISE EXCEPTION 'invalid invoice reconciliation request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request->>'request_id',0));
  SELECT * INTO prior FROM payment_invoice_reconciliations WHERE id=(p_request->>'request_id')::uuid;
  IF FOUND THEN
    IF prior.request<>p_request THEN RAISE EXCEPTION 'invoice reconciliation request conflict'; END IF;
    RETURN prior.result || jsonb_build_object('already_applied',true);
  END IF;
  -- Serialize reference checks and invoice updates; never expose a half-applied group.
  LOCK TABLE offene_posten IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE patients IN SHARE MODE;
  IF payment_backfill_catalog_fingerprint() IS DISTINCT FROM p_request->>'catalog' THEN
    RAISE EXCEPTION 'invoice reference catalogue changed';
  END IF;
  SELECT * INTO invoice FROM offene_posten WHERE id=(p_request->>'invoice_id')::uuid FOR UPDATE;
  IF NOT FOUND OR NOT (to_jsonb(invoice) @> (p_request->'expected_invoice')) THEN
    RAISE EXCEPTION 'invoice source changed';
  END IF;
  IF invoice.nicht_mahnen IS TRUE OR coalesce(invoice.status,'') NOT IN ('offen','teilbezahlt','bezahlt','überfällig','ueberfaellig')
    OR invoice.patient_id IS NULL OR invoice.rechnung_datum IS NULL
    OR EXISTS (SELECT 1 FROM payment_invoice_allocations WHERE invoice_id=invoice.id) THEN
    RAISE EXCEPTION 'invoice not eligible for initial reconciliation';
  END IF;
  gross:=round(invoice.betrag*100)::bigint;
  paid:=round(invoice.gezahlt*100)::bigint;
  opened:=round(invoice.offen*100)::bigint;
  IF gross IS NULL OR paid IS NULL OR opened IS NULL OR gross<=0 OR paid<0 OR opened<0 OR paid+opened<>gross THEN
    RAISE EXCEPTION 'inconsistent invoice amounts';
  END IF;
  reference_tokens:=verified_invoice_reference_tokens(invoice.unser_zeichen);
  IF cardinality(reference_tokens)<>1 THEN RAISE EXCEPTION 'unsupported invoice reference'; END IF;
  reference:=reference_tokens[1];
  FOR row IN SELECT value FROM jsonb_array_elements(p_request->'payments') ORDER BY value->>'allocation_id' LOOP
    IF NOT (coalesce(row->'expected_bank','{}'::jsonb) ?& ARRAY['id','betrag','datum','verwendungszweck','matching_status','matched_patient_id']) THEN
      RAISE EXCEPTION 'missing bank snapshot';
    END IF;
    SELECT * INTO tx FROM transaktionen WHERE id=(row->'expected_bank'->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR NOT (to_jsonb(tx) @> (row->'expected_bank')) THEN RAISE EXCEPTION 'bank source changed'; END IF;
    SELECT * INTO parent FROM payment_patient_allocations WHERE id=(row->>'allocation_id')::uuid FOR UPDATE;
    IF NOT FOUND OR parent.id=ANY(ids) OR parent.transaction_id IS DISTINCT FROM tx.id
      OR parent.patient_id IS DISTINCT FROM invoice.patient_id OR parent.state<>'confirmed_auto'
      OR parent.source_key IS DISTINCT FROM 'verified-bank-v1:'||tx.id::text
      OR parent.amount_cents<>round(tx.betrag*100)::bigint
      OR tx.matched_patient_id IS DISTINCT FROM invoice.patient_id OR coalesce(tx.matching_status,'') NOT IN ('auto','manuell')
      OR tx.datum IS NULL OR tx.datum::date<invoice.rechnung_datum::date
      OR EXISTS (SELECT 1 FROM payment_patient_allocations WHERE reversal_of_allocation_id=parent.id)
      OR EXISTS (SELECT 1 FROM payment_invoice_allocations WHERE patient_allocation_id=parent.id) THEN
      RAISE EXCEPTION 'payment source not eligible';
    END IF;
    IF verified_invoice_reference_tokens(tx.verwendungszweck) IS DISTINCT FROM ARRAY[reference] THEN
      RAISE EXCEPTION 'invoice reference not unique in payment';
    END IF;
    ids:=array_append(ids,parent.id);
    total:=total+parent.amount_cents;
    latest_date:=greatest(latest_date,tx.datum::date);
  END LOOP;
  IF total>gross THEN RAISE EXCEPTION 'payments exceed invoice amount'; END IF;
  INSERT INTO payment_invoice_allocations(patient_allocation_id,invoice_id,amount_cents,state,allocation_rule,source_key)
    SELECT id,invoice.id,amount_cents,'allocated_auto','exact_reference','verified-invoice-v1:'||invoice.id::text||':'||id::text
    FROM payment_patient_allocations WHERE id=ANY(ids);
  -- These sources may already be included in the legacy paid amount. NEVER add them again.
  target_paid:=greatest(paid,total);
  IF target_paid>paid THEN
    UPDATE offene_posten SET gezahlt=target_paid::numeric/100,offen=(gross-target_paid)::numeric/100,
      status=CASE WHEN target_paid=gross THEN 'bezahlt' ELSE 'teilbezahlt' END,
      bezahlt_am=CASE WHEN target_paid=gross THEN latest_date ELSE bezahlt_am END WHERE id=invoice.id;
  END IF;
  result:=jsonb_build_object('invoice_id',invoice.id,'linked_payments',cardinality(ids),'linked_cents',total,
    'debt_reduction_cents',target_paid-paid,'remaining_cents',gross-target_paid,'already_applied',false);
  INSERT INTO payment_invoice_reconciliations(id,invoice_id,request,result)
    VALUES((p_request->>'request_id')::uuid,invoice.id,p_request,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION reconcile_verified_invoice_payments(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION verified_invoice_reference_tokens(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION reconcile_verified_invoice_payments(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION verified_invoice_reference_tokens(text) TO service_role;
COMMIT;
