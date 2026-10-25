-- Abandon an unpublished preparation without generating a patient document,
-- receivable or notification. Reserved numbers remain in the immutable history.
BEGIN;

CREATE TABLE billing_invoice_abandonments (
  invoice_id uuid PRIMARY KEY REFERENCES billing_invoices(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 1000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER billing_abandonment_immutable BEFORE UPDATE OR DELETE ON billing_invoice_abandonments
  FOR EACH ROW EXECUTE FUNCTION billing_protect_cancellation();

-- An abandoned correction keeps its historical reference but no longer occupies
-- the unique replacement slot of the cancelled original.
ALTER TABLE billing_invoices DROP CONSTRAINT billing_invoices_replaces_invoice_id_key;
CREATE UNIQUE INDEX billing_invoice_active_replacement ON billing_invoices(replaces_invoice_id)
  WHERE status<>'void' OR issued_at IS NOT NULL;

CREATE OR REPLACE FUNCTION billing_link_invoice_correction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE original_id uuid; original_number text;
BEGIN
  SELECT i.id,i.invoice_number INTO original_id,original_number FROM billing_invoices i
  JOIN billing_payer_versions original_payer ON original_payer.id=i.payer_version_id
  JOIN billing_payer_versions new_payer ON new_payer.id=NEW.payer_version_id AND new_payer.case_id=original_payer.case_id
  WHERE i.status='void' AND i.issued_at IS NOT NULL AND i.patient_id=NEW.patient_id
    AND NOT EXISTS(SELECT 1 FROM billing_invoices replacement WHERE replacement.replaces_invoice_id=i.id
      AND (replacement.status<>'void' OR replacement.issued_at IS NOT NULL))
  ORDER BY i.voided_at DESC,i.id LIMIT 1;
  IF NEW.replaces_invoice_id IS NOT NULL AND NEW.replaces_invoice_id IS DISTINCT FROM original_id THEN
    RAISE EXCEPTION 'billing_cancellation_conflict';
  END IF;
  NEW.replaces_invoice_id:=original_id;
  IF original_id IS NOT NULL THEN
    NEW.snapshot:=jsonb_set(NEW.snapshot,'{replacesInvoiceNumber}',to_jsonb(original_number));
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION billing_invoice_abandon(p_actor uuid,p_request_id uuid,p_invoice_id uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_role text; access_level text; invoice billing_invoices%ROWTYPE;
  previous billing_invoice_requests%ROWTYPE; existing billing_invoice_abandonments%ROWTYPE;
  request_value jsonb;
BEGIN
  SELECT role,permissions->'module'->>'rechnungen' INTO actor_role,access_level FROM user_profiles WHERE id=p_actor;
  IF actor_role IS NULL OR actor_role='patient' OR coalesce(CASE WHEN access_level IN ('keine','lesen','schreiben') THEN access_level END,
    CASE WHEN actor_role IN ('admin','verwaltung') THEN 'schreiben' ELSE 'keine' END)<>'schreiben' THEN
    RAISE EXCEPTION 'billing_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'billing_abandonment_invalid';
  END IF;
  request_value:=jsonb_build_object('action','abandon','invoiceId',p_invoice_id,'reason',p_reason);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO previous FROM billing_invoice_requests WHERE id=p_request_id;
  IF FOUND THEN
    IF previous.actor_id<>p_actor OR previous.request<>request_value THEN RAISE EXCEPTION 'billing_request_conflict'; END IF;
    RETURN previous.result_id;
  END IF;
  -- Serializes against final publication and cancellation of this invoice.
  SELECT * INTO invoice FROM billing_invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing_invoice_not_found'; END IF;
  SELECT * INTO existing FROM billing_invoice_abandonments WHERE invoice_id=invoice.id;
  IF FOUND THEN
    IF existing.reason<>p_reason THEN RAISE EXCEPTION 'billing_abandonment_conflict'; END IF;
    INSERT INTO billing_invoice_requests(id,actor_id,request,result_id) VALUES(p_request_id,p_actor,request_value,invoice.id);
    RETURN invoice.id;
  END IF;
  IF invoice.status<>'preparing' OR invoice.issued_at IS NOT NULL OR invoice.open_item_id IS NOT NULL
    OR EXISTS(SELECT 1 FROM offene_posten WHERE id=invoice.id)
    OR EXISTS(SELECT 1 FROM patient_documents WHERE id=invoice.document_id)
    OR EXISTS(SELECT 1 FROM patient_notifications WHERE id=invoice.notification_id) THEN
    RAISE EXCEPTION 'billing_abandonment_already_published';
  END IF;
  INSERT INTO billing_invoice_abandonments(invoice_id,reason,created_by) VALUES(invoice.id,p_reason,p_actor);
  UPDATE billing_invoices SET status='void',voided_by=p_actor,voided_at=now(),void_reason=p_reason WHERE id=invoice.id;
  DELETE FROM billing_invoice_service_claims WHERE invoice_id=invoice.id;
  INSERT INTO billing_invoice_requests(id,actor_id,request,result_id) VALUES(p_request_id,p_actor,request_value,invoice.id);
  RETURN invoice.id;
END $$;

ALTER TABLE billing_invoice_abandonments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_invoice_abandonments FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON billing_invoice_abandonments TO service_role;
REVOKE ALL ON FUNCTION billing_invoice_abandon(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION billing_invoice_abandon(uuid,uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
