-- Additive billing workspace. No invoices, debts, payments or messages are created.
BEGIN;
CREATE TABLE billing_records (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('tariff', 'service')),
  patient_id uuid REFERENCES patients(id) ON DELETE RESTRICT,
  source_system text,
  source_record_id text,
  source_position_index integer,
  head_version integer NOT NULL DEFAULT 0 CHECK (head_version >= 0),
  CHECK ((kind = 'tariff' AND patient_id IS NULL AND source_system IS NULL AND source_record_id IS NULL AND source_position_index IS NULL)
    OR (kind = 'service' AND patient_id IS NOT NULL AND source_system IN ('scribe','ivoris','practice_import','manual')
      AND length(source_record_id) > 0 AND source_position_index >= 0))
);
CREATE UNIQUE INDEX billing_service_source ON billing_records (source_system, source_record_id, source_position_index) WHERE kind = 'service';
CREATE INDEX billing_records_patient ON billing_records(patient_id);

CREATE TABLE billing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES billing_records(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  tariff_version_id uuid REFERENCES billing_versions(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','approved','withdrawn')),
  gross_cents bigint CHECK (gross_cents BETWEEN 0 AND 9007199254740991),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  UNIQUE(record_id, revision),
  CHECK ((state = 'draft' AND decided_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL AND gross_cents IS NULL)
    OR (state <> 'draft' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND length(trim(decision_reason)) > 0))
);
CREATE TABLE billing_requests (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  request jsonb NOT NULL,
  result_id uuid NOT NULL REFERENCES billing_versions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION billing_protect_version() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'billing_history_immutable'; END IF;
  IF (to_jsonb(OLD) - ARRAY['state','gross_cents','decided_by','decided_at','decision_reason'])
    IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['state','gross_cents','decided_by','decided_at','decision_reason'])
    OR OLD.state <> 'draft' OR NEW.state NOT IN ('approved','withdrawn') THEN
    RAISE EXCEPTION 'billing_history_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_version_immutable BEFORE UPDATE OR DELETE ON billing_versions FOR EACH ROW EXECUTE FUNCTION billing_protect_version();

-- Only the authenticated, validated server handler may invoke this RPC.
-- Authorization is rechecked against the actor's current profile in this transaction.
CREATE FUNCTION billing_write(p_actor uuid, p_request_id uuid, p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor_role text; access_level text;
  rec billing_records%ROWTYPE; ver billing_versions%ROWTYPE; tariff billing_versions%ROWTYPE;
  previous billing_requests%ROWTYPE; entry doku_eintraege%ROWTYPE;
  payload jsonb := p_input->'data'; op text := p_input->>'action';
  result_id uuid; tariff_id uuid; calculated numeric; factor numeric;
BEGIN
  SELECT role, permissions->'module'->>'rechnungen' INTO actor_role, access_level FROM user_profiles WHERE id = p_actor;
  IF actor_role IS NULL OR actor_role = 'patient' OR
    coalesce(CASE WHEN access_level IN ('keine','lesen','schreiben') THEN access_level END,
      CASE WHEN actor_role IN ('admin','verwaltung') THEN 'schreiben' ELSE 'keine' END) <> 'schreiben' THEN
    RAISE EXCEPTION 'billing_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR op NOT IN ('save','approve','withdraw') OR length(trim(coalesce(p_input->>'reason',''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'billing_invalid';
  END IF;
  -- Serialize duplicate HTTP retries before any mutation.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO previous FROM billing_requests WHERE id = p_request_id;
  IF FOUND THEN
    IF previous.actor_id <> p_actor OR previous.request <> p_input THEN RAISE EXCEPTION 'billing_request_conflict'; END IF;
    RETURN previous.result_id;
  END IF;

  IF op = 'save' THEN
    IF (p_input->>'kind') NOT IN ('tariff','service') OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'billing_invalid'; END IF;
    INSERT INTO billing_records(id,kind,patient_id,source_system,source_record_id,source_position_index)
      VALUES ((p_input->>'recordId')::uuid,p_input->>'kind',
        CASE WHEN p_input->>'kind' = 'service' THEN (payload->>'patientId')::uuid END,
        payload->'source'->>'system',payload->'source'->>'recordId',(payload->'source'->>'positionIndex')::integer)
      ON CONFLICT (id) DO NOTHING;
    SELECT * INTO rec FROM billing_records WHERE id = (p_input->>'recordId')::uuid FOR UPDATE;
    IF rec.kind <> p_input->>'kind' OR rec.head_version IS DISTINCT FROM (p_input->>'expectedRevision')::integer THEN RAISE EXCEPTION 'billing_revision_conflict'; END IF;
    IF rec.kind = 'service' AND (rec.patient_id IS DISTINCT FROM (payload->>'patientId')::uuid
      OR rec.source_system IS DISTINCT FROM payload->'source'->>'system'
      OR rec.source_record_id IS DISTINCT FROM payload->'source'->>'recordId'
      OR rec.source_position_index IS DISTINCT FROM (payload->'source'->>'positionIndex')::integer) THEN RAISE EXCEPTION 'billing_identity_immutable'; END IF;
    tariff_id := (payload->>'tariffVersionId')::uuid;
    IF tariff_id IS NOT NULL THEN
      SELECT v.* INTO tariff FROM billing_versions v JOIN billing_records r ON r.id=v.record_id WHERE v.id=tariff_id AND r.kind='tariff' FOR SHARE OF v;
      IF NOT FOUND OR tariff.state <> 'approved' THEN RAISE EXCEPTION 'billing_tariff_unapproved'; END IF;
    END IF;
    INSERT INTO billing_versions(record_id,revision,data,tariff_version_id,reason,created_by)
      VALUES (rec.id,rec.head_version+1,payload,tariff_id,p_input->>'reason',p_actor) RETURNING id INTO result_id;
    UPDATE billing_records SET head_version=head_version+1 WHERE id=rec.id;
  ELSE
    SELECT r.* INTO rec FROM billing_records r JOIN billing_versions v ON v.record_id=r.id WHERE v.id=(p_input->>'versionId')::uuid FOR UPDATE OF r;
    IF NOT FOUND THEN RAISE EXCEPTION 'billing_not_found'; END IF;
    SELECT * INTO ver FROM billing_versions WHERE id=(p_input->>'versionId')::uuid FOR UPDATE;
    IF ver.revision <> rec.head_version OR ver.state <> 'draft' THEN RAISE EXCEPTION 'billing_revision_conflict'; END IF;
    IF op='approve' AND rec.kind='service' THEN
      -- A correction after a snapshot invalidates its approval; do not bless stale text.
      IF rec.source_system='scribe' THEN
        SELECT * INTO entry FROM doku_eintraege WHERE id=rec.source_record_id::uuid FOR SHARE;
        IF NOT FOUND OR entry.patient_id IS DISTINCT FROM rec.patient_id OR entry.status <> 'bestaetigt'
          OR entry.bestaetigt_am IS NULL OR entry.version IS DISTINCT FROM (ver.data->'source'->>'version')::integer
          OR entry.termin_datum::text IS DISTINCT FROM ver.data->>'serviceDate'
          OR jsonb_typeof(entry.positionen::jsonb) IS DISTINCT FROM 'array'
          OR rec.source_position_index >= jsonb_array_length(entry.positionen::jsonb) THEN RAISE EXCEPTION 'billing_source_stale'; END IF;
      END IF;
      SELECT * INTO tariff FROM billing_versions WHERE id=ver.tariff_version_id FOR SHARE;
      IF NOT FOUND OR tariff.state <> 'approved' THEN RAISE EXCEPTION 'billing_tariff_unapproved'; END IF;
      IF tariff.data->>'schedule' IS DISTINCT FROM ver.data->>'schedule' OR tariff.data->>'code' IS DISTINCT FROM ver.data->>'code'
        OR (ver.data->>'serviceDate')::date NOT BETWEEN (tariff.data->>'validFrom')::date AND (tariff.data->>'validTo')::date
        OR (ver.data->>'schedule'='BEMA' AND (ver.data->>'insurerId' IS NULL OR tariff.data->>'insurerId' IS DISTINCT FROM ver.data->>'insurerId')) THEN RAISE EXCEPTION 'billing_tariff_mismatch'; END IF;
      factor := coalesce((ver.data->>'factor')::numeric,1);
      calculated := CASE WHEN tariff.data->'price'->>'kind'='points'
        THEN (tariff.data->'price'->>'points')::numeric*(tariff.data->'price'->>'pointValueEuro')::numeric
        ELSE (tariff.data->'price'->>'unitPriceEuro')::numeric END;
      calculated := round(calculated*factor*(ver.data->>'quantity')::integer*100);
      IF calculated IS NULL OR calculated IS DISTINCT FROM (p_input->>'grossCents')::numeric THEN RAISE EXCEPTION 'billing_amount_mismatch'; END IF;
    END IF;
    UPDATE billing_versions SET state=CASE WHEN op='approve' THEN 'approved' ELSE 'withdrawn' END,
      gross_cents=CASE WHEN op='approve' AND rec.kind='service' THEN calculated::bigint END,
      decided_by=p_actor,decided_at=now(),decision_reason=p_input->>'reason' WHERE id=ver.id;
    result_id := ver.id;
  END IF;
  INSERT INTO billing_requests(id,actor_id,request,result_id) VALUES (p_request_id,p_actor,p_input,result_id);
  RETURN result_id;
END $$;

ALTER TABLE billing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_records,billing_versions,billing_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON billing_records,billing_versions,billing_requests TO service_role;
REVOKE ALL ON FUNCTION billing_write(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION billing_write(uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
