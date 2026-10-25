-- Cancellation is a separate immutable document, never deletion of an invoice.
BEGIN;

ALTER TABLE billing_invoices ADD COLUMN replaces_invoice_id uuid UNIQUE REFERENCES billing_invoices(id) ON DELETE RESTRICT;
ALTER TABLE billing_invoices ADD CONSTRAINT billing_invoice_replacement_not_self CHECK(replaces_invoice_id IS DISTINCT FROM id);

CREATE FUNCTION billing_link_invoice_correction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE original_id uuid; original_number text;
BEGIN
  SELECT i.id,i.invoice_number INTO original_id,original_number FROM billing_invoices i
  JOIN billing_payer_versions original_payer ON original_payer.id=i.payer_version_id
  JOIN billing_payer_versions new_payer ON new_payer.id=NEW.payer_version_id AND new_payer.case_id=original_payer.case_id
  WHERE i.status='void' AND i.patient_id=NEW.patient_id
    AND NOT EXISTS(SELECT 1 FROM billing_invoices replacement WHERE replacement.replaces_invoice_id=i.id)
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
CREATE TRIGGER billing_invoice_link_correction BEFORE INSERT ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION billing_link_invoice_correction();

CREATE TABLE billing_invoice_cancellations (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL UNIQUE REFERENCES billing_invoices(id) ON DELETE RESTRICT,
  cancellation_number text NOT NULL UNIQUE,
  cancellation_date date NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  document_id uuid NOT NULL UNIQUE,
  storage_path text NOT NULL,
  pdf_sha256 text NOT NULL CHECK (pdf_sha256 ~ '^[a-f0-9]{64}$'),
  pdf_bytes bigint NOT NULL CHECK (pdf_bytes BETWEEN 1 AND 26214400),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION billing_protect_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'billing_invoice_history_immutable'; END $$;
CREATE TRIGGER billing_cancellation_immutable BEFORE UPDATE OR DELETE ON billing_invoice_cancellations
  FOR EACH ROW EXECUTE FUNCTION billing_protect_cancellation();

CREATE OR REPLACE FUNCTION billing_protect_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'billing_invoice_history_immutable'; END IF;
  IF OLD.status='issued' AND NEW.status='void' THEN
    IF (to_jsonb(OLD)-ARRAY['status','voided_by','voided_at','void_reason']) IS DISTINCT FROM
       (to_jsonb(NEW)-ARRAY['status','voided_by','voided_at','void_reason'])
       OR NOT EXISTS (SELECT 1 FROM billing_invoice_cancellations c WHERE c.invoice_id=OLD.id
         AND c.created_by=NEW.voided_by AND c.reason=NEW.void_reason) THEN
      RAISE EXCEPTION 'billing_invoice_history_immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'preparing' OR NEW.status NOT IN ('issued','void') THEN
    RAISE EXCEPTION 'billing_invoice_history_immutable';
  END IF;
  IF (to_jsonb(OLD)-ARRAY['status','storage_path','pdf_sha256','pdf_bytes','open_item_id','issued_by','issued_at','voided_by','voided_at','void_reason'])
    IS DISTINCT FROM
    (to_jsonb(NEW)-ARRAY['status','storage_path','pdf_sha256','pdf_bytes','open_item_id','issued_by','issued_at','voided_by','voided_at','void_reason']) THEN
    RAISE EXCEPTION 'billing_invoice_history_immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION billing_invoice_cancel(p_actor uuid,p_request_id uuid,p_invoice_id uuid,p_document_id uuid,
  p_date date,p_reason text,p_pdf_sha256 text,p_pdf_bytes bigint,p_storage_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_role text; access_level text; invoice billing_invoices%ROWTYPE; item offene_posten%ROWTYPE;
  previous billing_invoice_requests%ROWTYPE; existing billing_invoice_cancellations%ROWTYPE;
  request_value jsonb; number_value text;
BEGIN
  SELECT role,permissions->'module'->>'rechnungen' INTO actor_role,access_level FROM user_profiles WHERE id=p_actor;
  IF actor_role IS NULL OR actor_role='patient' OR coalesce(CASE WHEN access_level IN ('keine','lesen','schreiben') THEN access_level END,
    CASE WHEN actor_role IN ('admin','verwaltung') THEN 'schreiben' ELSE 'keine' END)<>'schreiben' THEN
    RAISE EXCEPTION 'billing_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_document_id IS NULL OR p_date IS NULL
    OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000
    OR p_pdf_sha256 IS NULL OR p_pdf_sha256 !~ '^[a-f0-9]{64}$'
    OR p_pdf_bytes IS NULL OR p_pdf_bytes NOT BETWEEN 1 AND 26214400 THEN
    RAISE EXCEPTION 'billing_cancellation_invalid';
  END IF;
  request_value:=jsonb_build_object('action','cancel','invoiceId',p_invoice_id,'documentId',p_document_id,
    'date',p_date,'reason',p_reason,'sha256',p_pdf_sha256,'bytes',p_pdf_bytes,'path',p_storage_path);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO previous FROM billing_invoice_requests WHERE id=p_request_id;
  IF FOUND THEN
    IF previous.actor_id<>p_actor OR previous.request<>request_value THEN RAISE EXCEPTION 'billing_request_conflict'; END IF;
    RETURN previous.result_id;
  END IF;
  SELECT * INTO invoice FROM billing_invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing_invoice_not_found'; END IF;
  SELECT * INTO existing FROM billing_invoice_cancellations WHERE invoice_id=invoice.id;
  IF FOUND THEN
    IF existing.reason<>p_reason THEN RAISE EXCEPTION 'billing_cancellation_conflict'; END IF;
    INSERT INTO billing_invoice_requests(id,actor_id,request,result_id) VALUES(p_request_id,p_actor,request_value,invoice.id);
    RETURN invoice.id;
  END IF;
  IF invoice.status<>'issued' OR p_date IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Berlin')::date
    OR p_document_id=invoice.document_id OR p_storage_path IS DISTINCT FROM invoice.patient_id::text||'/'||p_document_id::text||'.pdf' THEN
    RAISE EXCEPTION 'billing_cancellation_invalid';
  END IF;
  SELECT * INTO item FROM offene_posten WHERE id=invoice.open_item_id FOR UPDATE;
  IF NOT FOUND OR item.patient_id IS DISTINCT FROM invoice.patient_id
    OR item.betrag IS DISTINCT FROM invoice.total_cents::numeric/100
    OR item.offen IS DISTINCT FROM item.betrag OR coalesce(item.gezahlt,0)<>0
    OR item.bezahlt_am IS NOT NULL OR coalesce(item.status,'') NOT IN ('offen','überfällig') THEN
    RAISE EXCEPTION 'billing_cancellation_payment_review';
  END IF;
  IF EXISTS (SELECT 1 FROM payment_invoice_allocations a WHERE a.invoice_id=item.id
    AND a.state IN ('allocated_auto','allocated_manual') AND NOT EXISTS (
      SELECT 1 FROM payment_invoice_allocations reversal WHERE reversal.reversal_of_allocation_id=a.id AND reversal.state='reversed')) THEN
    RAISE EXCEPTION 'billing_cancellation_payment_review';
  END IF;
  number_value:=invoice.invoice_number||'-S';
  INSERT INTO billing_invoice_cancellations(id,invoice_id,cancellation_number,cancellation_date,reason,document_id,
    storage_path,pdf_sha256,pdf_bytes,created_by)
  VALUES(p_document_id,invoice.id,number_value,p_date,p_reason,p_document_id,p_storage_path,p_pdf_sha256,p_pdf_bytes,p_actor);
  UPDATE offene_posten SET offen=0,status='storniert',nicht_mahnen=true WHERE id=item.id;
  UPDATE billing_invoices SET status='void',voided_by=p_actor,voided_at=now(),void_reason=p_reason WHERE id=invoice.id;
  UPDATE patient_documents SET name='[[typ:rechnung]] Stornierte Rechnung '||invoice.invoice_number WHERE id=invoice.document_id;
  INSERT INTO patient_documents(id,patient_id,name,typ,file_url,hochgeladen_am)
  VALUES(p_document_id,invoice.patient_id,'[[typ:rechnung]] Stornobeleg '||number_value,'ratenzahlung',
    '/api/patient/dokumente/'||p_document_id::text||'/datei',now());
  INSERT INTO patient_notifications(id,patient_id,typ,titel,text,gelesen)
  VALUES(p_document_id,invoice.patient_id,'eingang','Rechnung storniert',
    'Die Rechnung '||invoice.invoice_number||' wurde aufgehoben. Den Stornobeleg findest du in deinen Dokumenten.',false);
  DELETE FROM billing_invoice_service_claims WHERE invoice_id=invoice.id;
  INSERT INTO billing_invoice_requests(id,actor_id,request,result_id) VALUES(p_request_id,p_actor,request_value,invoice.id);
  RETURN invoice.id;
END $$;

-- The existing allocation validator locks the open item first. This additional
-- check then rejects new payment assignments after cancellation, but permits reversals.
CREATE FUNCTION billing_reject_void_invoice_allocation() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE item_status text;
BEGIN
  IF NEW.state<>'reversed' THEN
    SELECT status INTO item_status FROM offene_posten WHERE id=NEW.invoice_id FOR UPDATE;
    IF item_status='storniert' THEN RAISE EXCEPTION 'billing_invoice_cancelled'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_billing_reject_void_invoice_allocation BEFORE INSERT OR UPDATE ON payment_invoice_allocations
  FOR EACH ROW EXECUTE FUNCTION billing_reject_void_invoice_allocation();

CREATE FUNCTION billing_protect_cancelled_open_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM billing_invoices WHERE open_item_id=OLD.id) THEN
      RAISE EXCEPTION 'billing_invoice_history_immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status='storniert' AND EXISTS(SELECT 1 FROM billing_invoices WHERE open_item_id=OLD.id AND status='void')
    AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.betrag IS DISTINCT FROM OLD.betrag
      OR NEW.offen IS DISTINCT FROM OLD.offen OR NEW.gezahlt IS DISTINCT FROM OLD.gezahlt
      OR NEW.bezahlt_am IS DISTINCT FROM OLD.bezahlt_am OR NEW.nicht_mahnen IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'billing_invoice_cancelled';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_protect_cancelled_open_item BEFORE UPDATE OR DELETE ON offene_posten
  FOR EACH ROW EXECUTE FUNCTION billing_protect_cancelled_open_item();

ALTER TABLE billing_invoice_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_invoice_cancellations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON billing_invoice_cancellations TO service_role;
REVOKE ALL ON FUNCTION billing_protect_cancellation(),billing_reject_void_invoice_allocation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION billing_link_invoice_correction() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION billing_protect_cancelled_open_item() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION billing_invoice_cancel(uuid,uuid,uuid,uuid,date,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION billing_invoice_cancel(uuid,uuid,uuid,uuid,date,text,text,bigint,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
