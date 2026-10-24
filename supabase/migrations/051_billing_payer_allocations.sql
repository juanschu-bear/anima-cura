-- A clinically approved service value is not automatically patient debt.
-- This immutable, server-only ledger records the separately evidenced payer share.
BEGIN;

CREATE TABLE billing_payer_cases (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  from_date date NOT NULL,
  to_date date NOT NULL,
  head_version integer NOT NULL DEFAULT 0 CHECK (head_version >= 0),
  CHECK (from_date <= to_date),
  UNIQUE(patient_id, from_date, to_date)
);

CREATE TABLE billing_payer_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES billing_payer_cases(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  service_version_ids uuid[] NOT NULL CHECK (cardinality(service_version_ids) BETWEEN 1 AND 500),
  payer_model text NOT NULL CHECK (payer_model IN ('private_full','statutory_share')),
  patient_share_basis_points integer NOT NULL CHECK (patient_share_basis_points IN (1000,2000,10000)),
  share_source_reference text NOT NULL CHECK (length(trim(share_source_reference)) BETWEEN 3 AND 1000),
  expected_patient_cents bigint NOT NULL CHECK (expected_patient_cents > 0),
  gross_cents bigint,
  patient_cents bigint,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','approved','withdrawn')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  UNIQUE(case_id, revision),
  CHECK ((payer_model='private_full' AND patient_share_basis_points=10000)
    OR (payer_model='statutory_share' AND patient_share_basis_points IN (1000,2000))),
  CHECK ((state='draft' AND gross_cents IS NULL AND patient_cents IS NULL AND decided_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
    OR (state<>'draft' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND length(trim(decision_reason))>0))
);

CREATE TABLE billing_payer_requests (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  request jsonb NOT NULL,
  result_id uuid NOT NULL REFERENCES billing_payer_versions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION billing_protect_payer_version() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'billing_payer_history_immutable'; END IF;
  IF (to_jsonb(OLD)-ARRAY['state','gross_cents','patient_cents','decided_by','decided_at','decision_reason'])
    IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['state','gross_cents','patient_cents','decided_by','decided_at','decision_reason'])
    OR OLD.state<>'draft' OR NEW.state NOT IN ('approved','withdrawn') THEN
    RAISE EXCEPTION 'billing_payer_history_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_payer_version_immutable BEFORE UPDATE OR DELETE ON billing_payer_versions
  FOR EACH ROW EXECUTE FUNCTION billing_protect_payer_version();

CREATE FUNCTION billing_payer_write(p_actor uuid,p_request_id uuid,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_role text; access_level text; op text:=p_input->>'action'; previous billing_payer_requests%ROWTYPE;
  c billing_payer_cases%ROWTYPE; v billing_payer_versions%ROWTYPE; result_id uuid;
  requested_ids uuid[]; selected_count integer; approved_count integer; selected_gross bigint;
  has_bema boolean; has_non_bema boolean; calculated_patient bigint;
BEGIN
  SELECT role,permissions->'module'->>'rechnungen' INTO actor_role,access_level FROM user_profiles WHERE id=p_actor;
  IF actor_role IS NULL OR actor_role='patient' OR coalesce(CASE WHEN access_level IN ('keine','lesen','schreiben') THEN access_level END,
    CASE WHEN actor_role IN ('admin','verwaltung') THEN 'schreiben' ELSE 'keine' END)<>'schreiben' THEN
    RAISE EXCEPTION 'billing_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR op NOT IN ('save','approve','withdraw') OR length(trim(coalesce(p_input->>'reason',''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'billing_payer_invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO previous FROM billing_payer_requests WHERE id=p_request_id;
  IF FOUND THEN
    IF previous.actor_id<>p_actor OR previous.request<>p_input THEN RAISE EXCEPTION 'billing_request_conflict'; END IF;
    RETURN previous.result_id;
  END IF;
  IF op='save' THEN
    requested_ids:=ARRAY(SELECT jsonb_array_elements_text(p_input->'data'->'serviceVersionIds')::uuid);
    IF cardinality(requested_ids) NOT BETWEEN 1 AND 500 OR cardinality(requested_ids)<>(SELECT count(DISTINCT x) FROM unnest(requested_ids) x) THEN
      RAISE EXCEPTION 'billing_payer_invalid';
    END IF;
    INSERT INTO billing_payer_cases(id,patient_id,from_date,to_date)
      VALUES((p_input->>'caseId')::uuid,(p_input->'data'->>'patientId')::uuid,(p_input->'data'->>'from')::date,(p_input->'data'->>'to')::date)
      ON CONFLICT(id) DO NOTHING;
    SELECT * INTO c FROM billing_payer_cases WHERE id=(p_input->>'caseId')::uuid FOR UPDATE;
    IF c.patient_id IS DISTINCT FROM (p_input->'data'->>'patientId')::uuid OR c.from_date IS DISTINCT FROM (p_input->'data'->>'from')::date
      OR c.to_date IS DISTINCT FROM (p_input->'data'->>'to')::date OR c.head_version IS DISTINCT FROM (p_input->>'expectedRevision')::integer THEN
      RAISE EXCEPTION 'billing_payer_revision_conflict';
    END IF;
    INSERT INTO billing_payer_versions(case_id,revision,service_version_ids,payer_model,patient_share_basis_points,
      share_source_reference,expected_patient_cents,reason,created_by)
    VALUES(c.id,c.head_version+1,requested_ids,p_input->'data'->>'payerModel',(p_input->'data'->>'patientShareBasisPoints')::integer,
      p_input->'data'->>'shareSourceReference',(p_input->'data'->>'expectedPatientCents')::bigint,p_input->>'reason',p_actor)
    RETURNING id INTO result_id;
    UPDATE billing_payer_cases SET head_version=head_version+1 WHERE id=c.id;
  ELSE
    SELECT pv.* INTO v FROM billing_payer_versions pv WHERE pv.id=(p_input->>'versionId')::uuid FOR UPDATE;
    IF NOT FOUND OR v.state<>'draft' THEN RAISE EXCEPTION 'billing_payer_revision_conflict'; END IF;
    SELECT * INTO c FROM billing_payer_cases WHERE id=v.case_id FOR UPDATE;
    IF v.revision<>c.head_version THEN RAISE EXCEPTION 'billing_payer_revision_conflict'; END IF;
    IF op='approve' THEN
      SELECT count(*),coalesce(sum(bv.gross_cents),0),bool_or(bv.data->>'schedule'='BEMA'),bool_or(bv.data->>'schedule'<>'BEMA')
        INTO selected_count,selected_gross,has_bema,has_non_bema
      FROM billing_versions bv JOIN billing_records br ON br.id=bv.record_id
      WHERE bv.id=ANY(v.service_version_ids) AND bv.state='approved' AND bv.revision=br.head_version AND br.kind='service'
        AND br.patient_id=c.patient_id AND (bv.data->>'serviceDate')::date BETWEEN c.from_date AND c.to_date;
      SELECT count(*) INTO approved_count FROM billing_versions bv JOIN billing_records br ON br.id=bv.record_id
      WHERE bv.state='approved' AND bv.revision=br.head_version AND br.kind='service' AND br.patient_id=c.patient_id
        AND (bv.data->>'serviceDate')::date BETWEEN c.from_date AND c.to_date;
      IF selected_count<>cardinality(v.service_version_ids) OR approved_count<>selected_count OR selected_gross<=0 THEN
        RAISE EXCEPTION 'billing_payer_scope_mismatch';
      END IF;
      IF (v.payer_model='private_full' AND has_bema) OR (v.payer_model='statutory_share' AND has_non_bema) THEN
        RAISE EXCEPTION 'billing_payer_model_mismatch';
      END IF;
      calculated_patient:=round(selected_gross::numeric*v.patient_share_basis_points/10000)::bigint;
      IF calculated_patient<>v.expected_patient_cents THEN RAISE EXCEPTION 'billing_payer_total_mismatch'; END IF;
    END IF;
    UPDATE billing_payer_versions SET state=CASE WHEN op='approve' THEN 'approved' ELSE 'withdrawn' END,
      gross_cents=CASE WHEN op='approve' THEN selected_gross END,patient_cents=CASE WHEN op='approve' THEN calculated_patient END,
      decided_by=p_actor,decided_at=now(),decision_reason=p_input->>'reason' WHERE id=v.id;
    result_id:=v.id;
  END IF;
  INSERT INTO billing_payer_requests(id,actor_id,request,result_id) VALUES(p_request_id,p_actor,p_input,result_id);
  RETURN result_id;
END $$;

ALTER TABLE billing_payer_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payer_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_payer_cases,billing_payer_versions,billing_payer_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON billing_payer_cases,billing_payer_versions,billing_payer_requests TO service_role;
REVOKE ALL ON FUNCTION billing_payer_write(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION billing_payer_write(uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
