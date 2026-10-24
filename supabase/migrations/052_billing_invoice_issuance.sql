-- Atomic invoice issuance from an approved payer decision.
-- PDF storage is prepared first; the receivable and portal publication are
-- committed together only after the server supplies the verified PDF digest.
BEGIN;

CREATE TABLE billing_invoice_counters (
  invoice_year integer PRIMARY KEY CHECK (invoice_year BETWEEN 2020 AND 2200),
  last_value integer NOT NULL CHECK (last_value > 0)
);

CREATE TABLE billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_version_id uuid NOT NULL UNIQUE REFERENCES billing_payer_versions(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL UNIQUE CHECK (invoice_number ~ '^AC-[0-9]{4}-[0-9]{6}$'),
  issue_date date NOT NULL,
  due_date date NOT NULL CHECK (due_date >= issue_date AND due_date <= issue_date + 365),
  total_cents bigint NOT NULL CHECK (total_cents > 0),
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','issued','void')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  document_id uuid NOT NULL UNIQUE,
  notification_id uuid NOT NULL UNIQUE,
  storage_path text,
  pdf_sha256 text,
  pdf_bytes bigint,
  open_item_id uuid UNIQUE,
  issuance_reason text NOT NULL CHECK (length(trim(issuance_reason)) BETWEEN 3 AND 1000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid,
  issued_at timestamptz,
  voided_by uuid,
  voided_at timestamptz,
  void_reason text,
  CHECK ((status='preparing' AND storage_path IS NULL AND pdf_sha256 IS NULL AND pdf_bytes IS NULL
      AND open_item_id IS NULL AND issued_by IS NULL AND issued_at IS NULL)
    OR (status='issued' AND storage_path IS NOT NULL AND pdf_sha256 ~ '^[a-f0-9]{64}$' AND pdf_bytes > 0
      AND open_item_id IS NOT NULL AND issued_by IS NOT NULL AND issued_at IS NOT NULL)
    OR (status='void' AND voided_by IS NOT NULL AND voided_at IS NOT NULL AND length(trim(void_reason)) >= 3))
);

CREATE TABLE billing_invoice_requests (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  request jsonb NOT NULL,
  result_id uuid NOT NULL REFERENCES billing_invoices(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION billing_protect_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.status<>'preparing' OR NEW.status NOT IN ('issued','void') THEN
    RAISE EXCEPTION 'billing_invoice_history_immutable';
  END IF;
  IF (to_jsonb(OLD)-ARRAY['status','storage_path','pdf_sha256','pdf_bytes','open_item_id','issued_by','issued_at','voided_by','voided_at','void_reason'])
    IS DISTINCT FROM
    (to_jsonb(NEW)-ARRAY['status','storage_path','pdf_sha256','pdf_bytes','open_item_id','issued_by','issued_at','voided_by','voided_at','void_reason']) THEN
    RAISE EXCEPTION 'billing_invoice_history_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_invoice_immutable BEFORE UPDATE OR DELETE ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION billing_protect_invoice();

CREATE FUNCTION billing_invoice_reserve(p_actor uuid,p_request_id uuid,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_role text; access_level text; previous billing_invoice_requests%ROWTYPE;
  payer billing_payer_versions%ROWTYPE; payer_case billing_payer_cases%ROWTYPE;
  patient_row patients%ROWTYPE; existing billing_invoices%ROWTYPE;
  result_id uuid; counter_value integer; number_value text; due_value date;
  lines jsonb; snapshot_value jsonb;
BEGIN
  SELECT role,permissions->'module'->>'rechnungen' INTO actor_role,access_level FROM user_profiles WHERE id=p_actor;
  IF actor_role IS NULL OR actor_role='patient' OR coalesce(CASE WHEN access_level IN ('keine','lesen','schreiben') THEN access_level END,
    CASE WHEN actor_role IN ('admin','verwaltung') THEN 'schreiben' ELSE 'keine' END)<>'schreiben' THEN
    RAISE EXCEPTION 'billing_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR (p_input->>'action') IS DISTINCT FROM 'reserve' OR length(trim(coalesce(p_input->>'reason',''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'billing_invoice_invalid';
  END IF;
  due_value := (p_input->>'dueDate')::date;
  IF due_value < current_date OR due_value > current_date + 365 THEN RAISE EXCEPTION 'billing_invoice_invalid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO previous FROM billing_invoice_requests WHERE id=p_request_id;
  IF FOUND THEN
    IF previous.actor_id<>p_actor OR previous.request<>p_input THEN RAISE EXCEPTION 'billing_request_conflict'; END IF;
    RETURN previous.result_id;
  END IF;
  SELECT * INTO payer FROM billing_payer_versions WHERE id=(p_input->>'payerVersionId')::uuid FOR SHARE;
  IF NOT FOUND OR payer.state<>'approved' OR payer.patient_cents IS NULL OR payer.patient_cents<=0 THEN
    RAISE EXCEPTION 'billing_invoice_payer_unapproved';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(payer.id::text,1));
  SELECT * INTO payer_case FROM billing_payer_cases WHERE id=payer.case_id FOR SHARE;
  IF NOT FOUND OR payer.revision<>payer_case.head_version THEN RAISE EXCEPTION 'billing_invoice_payer_stale'; END IF;
  SELECT * INTO existing FROM billing_invoices WHERE payer_version_id=payer.id FOR SHARE;
  IF FOUND THEN
    IF existing.due_date<>due_value THEN RAISE EXCEPTION 'billing_invoice_conflict'; END IF;
    result_id:=existing.id;
    INSERT INTO billing_invoice_requests(id,actor_id,request,result_id) VALUES(p_request_id,p_actor,p_input,result_id);
    RETURN result_id;
  END IF;
  SELECT * INTO patient_row FROM patients WHERE id=payer_case.patient_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing_invoice_patient_missing'; END IF;
  SELECT jsonb_agg(jsonb_build_object(
      'versionId',v.id,'serviceDate',v.data->>'serviceDate','schedule',v.data->>'schedule','code',v.data->>'code',
      'description',v.data->>'description','quantity',(v.data->>'quantity')::integer,'factor',v.data->'factor',
      'grossCents',v.gross_cents,'justification',v.data->'justification') ORDER BY v.data->>'serviceDate',v.id)
    INTO lines
  FROM billing_versions v JOIN billing_records r ON r.id=v.record_id
  WHERE v.id=ANY(payer.service_version_ids) AND v.state='approved' AND v.revision=r.head_version
    AND r.kind='service' AND r.patient_id=payer_case.patient_id;
  IF jsonb_array_length(coalesce(lines,'[]'::jsonb))<>cardinality(payer.service_version_ids) THEN
    RAISE EXCEPTION 'billing_invoice_service_stale';
  END IF;
  INSERT INTO billing_invoice_counters(invoice_year,last_value) VALUES(extract(year FROM current_date)::integer,1)
  ON CONFLICT(invoice_year) DO UPDATE SET last_value=billing_invoice_counters.last_value+1 RETURNING last_value INTO counter_value;
  number_value:='AC-'||extract(year FROM current_date)::integer||'-'||lpad(counter_value::text,6,'0');
  result_id:=gen_random_uuid();
  snapshot_value:=jsonb_build_object(
    'invoiceNumber',number_value,'issueDate',current_date,'dueDate',due_value,'patientId',payer_case.patient_id,
    'patientName',trim(concat_ws(' ',patient_row.vorname,patient_row.nachname)),'patientNumber',patient_row.ivoris_nummer::text,
    'periodFrom',payer_case.from_date,'periodTo',payer_case.to_date,'payerModel',payer.payer_model,
    'patientShareBasisPoints',payer.patient_share_basis_points,'shareSourceReference',payer.share_source_reference,
    'grossCents',payer.gross_cents,'totalCents',payer.patient_cents,'lines',coalesce(lines,'[]'::jsonb));
  INSERT INTO billing_invoices(id,payer_version_id,patient_id,invoice_number,issue_date,due_date,total_cents,snapshot,
    document_id,notification_id,issuance_reason,created_by)
  VALUES(result_id,payer.id,payer_case.patient_id,number_value,current_date,due_value,payer.patient_cents,snapshot_value,
    result_id,gen_random_uuid(),p_input->>'reason',p_actor);
  INSERT INTO billing_invoice_requests(id,actor_id,request,result_id) VALUES(p_request_id,p_actor,p_input,result_id);
  RETURN result_id;
END $$;

CREATE FUNCTION billing_invoice_finalize(p_actor uuid,p_invoice_id uuid,p_pdf_sha256 text,p_pdf_bytes bigint,p_storage_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_role text; access_level text; invoice billing_invoices%ROWTYPE; patient_row patients%ROWTYPE;
  expected_path text; amount_euro numeric;
BEGIN
  SELECT role,permissions->'module'->>'rechnungen' INTO actor_role,access_level FROM user_profiles WHERE id=p_actor;
  IF actor_role IS NULL OR actor_role='patient' OR coalesce(CASE WHEN access_level IN ('keine','lesen','schreiben') THEN access_level END,
    CASE WHEN actor_role IN ('admin','verwaltung') THEN 'schreiben' ELSE 'keine' END)<>'schreiben' THEN
    RAISE EXCEPTION 'billing_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO invoice FROM billing_invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing_invoice_not_found'; END IF;
  expected_path:=invoice.patient_id::text||'/'||invoice.document_id::text||'.pdf';
  IF p_pdf_sha256 IS NULL OR p_pdf_sha256 !~ '^[a-f0-9]{64}$' OR p_pdf_bytes IS NULL OR p_pdf_bytes<=0
    OR p_pdf_bytes>26214400 OR p_storage_path IS DISTINCT FROM expected_path THEN
    RAISE EXCEPTION 'billing_invoice_pdf_invalid';
  END IF;
  IF invoice.status='issued' THEN
    IF invoice.pdf_sha256<>p_pdf_sha256 OR invoice.pdf_bytes<>p_pdf_bytes OR invoice.storage_path<>p_storage_path THEN
      RAISE EXCEPTION 'billing_invoice_conflict';
    END IF;
    RETURN invoice.id;
  END IF;
  IF invoice.status<>'preparing' THEN RAISE EXCEPTION 'billing_invoice_conflict'; END IF;
  IF NOT EXISTS(SELECT 1 FROM billing_payer_versions pv JOIN billing_payer_cases pc ON pc.id=pv.case_id
    WHERE pv.id=invoice.payer_version_id AND pv.state='approved' AND pv.revision=pc.head_version
      AND pc.patient_id=invoice.patient_id AND pv.patient_cents=invoice.total_cents) THEN
    RAISE EXCEPTION 'billing_invoice_payer_stale';
  END IF;
  SELECT * INTO patient_row FROM patients WHERE id=invoice.patient_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing_invoice_patient_missing'; END IF;
  amount_euro:=invoice.total_cents::numeric/100;
  INSERT INTO offene_posten(id,typ,rechnung_datum,patient_name,rechnung_nr,unser_zeichen,basis_nr,betrag,gebuehr,offen,gezahlt,
    mahnung_datum,status,bezahlt_am,patient_id,source_file,imported_at,mahnstufe,nicht_mahnen)
  VALUES(invoice.id,'rechnung',invoice.issue_date,trim(concat_ws(' ',patient_row.vorname,patient_row.nachname)),invoice.invoice_number,
    invoice.invoice_number,patient_row.ivoris_nummer,amount_euro,NULL,amount_euro,0,NULL,'offen',NULL,invoice.patient_id,p_storage_path,now(),0,false);
  INSERT INTO patient_documents(id,patient_id,name,typ,file_url,hochgeladen_am)
  VALUES(invoice.document_id,invoice.patient_id,'[[typ:rechnung]] Rechnung '||invoice.invoice_number,'ratenzahlung',
    '/api/patient/dokumente/'||invoice.document_id::text||'/datei',now());
  INSERT INTO patient_notifications(id,patient_id,typ,titel,text,gelesen)
  VALUES(invoice.notification_id,invoice.patient_id,'eingang','Neue Rechnung bereit',
    'Deine Rechnung '||invoice.invoice_number||' ist jetzt sicher in deinem Patientenportal verfügbar.',false);
  UPDATE billing_invoices SET status='issued',storage_path=p_storage_path,pdf_sha256=p_pdf_sha256,pdf_bytes=p_pdf_bytes,
    open_item_id=invoice.id,issued_by=p_actor,issued_at=now() WHERE id=invoice.id;
  RETURN invoice.id;
END $$;

ALTER TABLE billing_invoice_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoice_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_invoice_counters,billing_invoices,billing_invoice_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON billing_invoice_counters,billing_invoices,billing_invoice_requests TO service_role;
REVOKE ALL ON FUNCTION billing_invoice_reserve(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION billing_invoice_finalize(uuid,uuid,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION billing_invoice_reserve(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION billing_invoice_finalize(uuid,uuid,text,bigint,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
