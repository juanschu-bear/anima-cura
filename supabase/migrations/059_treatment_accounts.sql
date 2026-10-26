-- Build order V1, step 1. Additive, read-only application surface.
-- Does not modify patients, old invoices, payments, portal access or messages.
BEGIN;
CREATE TABLE treatment_plan_versions (
  id uuid NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  valid_from date NOT NULL, valid_to date CHECK (valid_to IS NULL OR valid_to >= valid_from),
  treatment_start date, jaws text CHECK (jaws IN ('OK','UK','both')),
  insurer text, insurance text,
  quotas jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(quotas) = 'array'),
  pauses jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(pauses) = 'array'),
  history jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(history) = 'object'),
  source jsonb NOT NULL CHECK (jsonb_typeof(source)='object' AND source ?& ARRAY['system','recordId','version','locator']),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid, confirmed_at timestamptz,
  CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL)),
  PRIMARY KEY (id, revision), UNIQUE(patient_id,id,revision)
);
CREATE TABLE treatment_events (
  id uuid NOT NULL, revision integer NOT NULL CHECK (revision > 0),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  plan_id uuid, plan_revision integer,
  service_date date NOT NULL, text text NOT NULL,
  component text, action text, jaw text CHECK (jaw IN ('OK','UK','both')),
  teeth text[] NOT NULL DEFAULT '{}', material text,
  quantity numeric CHECK (quantity > 0),
  clinical_state text NOT NULL CHECK (clinical_state IN ('performed','planned','negated','unclear')),
  copied boolean NOT NULL DEFAULT false,
  source jsonb NOT NULL CHECK (jsonb_typeof(source)='object' AND source ?& ARRAY['system','recordId','version','locator']),
  source_checksum text NOT NULL CHECK (source_checksum ~ '^[a-f0-9]{64}$'),
  clinician_id uuid, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid, confirmed_at timestamptz,
  CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL)),
  CHECK ((plan_id IS NULL) = (plan_revision IS NULL)),
  PRIMARY KEY(id,revision), UNIQUE(patient_id,id,revision),
  UNIQUE(patient_id,source_checksum),
  FOREIGN KEY(patient_id,plan_id,plan_revision) REFERENCES treatment_plan_versions(patient_id,id,revision)
);
CREATE TABLE treatment_baseline (
  id uuid NOT NULL, revision integer NOT NULL CHECK (revision > 0),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  before_date date NOT NULL, teeth jsonb NOT NULL CHECK (jsonb_typeof(teeth)='object'),
  note text NOT NULL,
  source jsonb NOT NULL CHECK (jsonb_typeof(source)='object' AND source ?& ARRAY['system','recordId','version','locator']),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(id,revision), UNIQUE(patient_id,id,revision)
);
-- Future steps get storage contracts only: no rules, proposals, imports or charges activated here.
CREATE TABLE billing_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  rule_id text NOT NULL, revision integer NOT NULL CHECK (revision > 0),
  state text NOT NULL CHECK (state IN ('trial','approved','withdrawn')),
  definition jsonb NOT NULL, examples jsonb NOT NULL DEFAULT '[]',
  source jsonb NOT NULL CHECK (source ?& ARRAY['system','recordId','version','locator']),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid, confirmed_at timestamptz,
  CHECK (state <> 'approved' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  UNIQUE(patient_id,rule_id,revision), UNIQUE(patient_id,id)
);
CREATE TABLE billing_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL, event_revision integer NOT NULL,
  plan_id uuid NOT NULL, plan_revision integer NOT NULL,
  rule_version_id uuid NOT NULL,
  input_checksum text NOT NULL CHECK (input_checksum ~ '^[a-f0-9]{64}$'),
  data jsonb NOT NULL,
  source jsonb NOT NULL CHECK (source ?& ARRAY['system','recordId','version','locator']),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(patient_id,input_checksum), UNIQUE(patient_id,id),
  FOREIGN KEY(patient_id,event_id,event_revision) REFERENCES treatment_events(patient_id,id,revision),
  FOREIGN KEY(patient_id,plan_id,plan_revision) REFERENCES treatment_plan_versions(patient_id,id,revision),
  FOREIGN KEY(patient_id,rule_version_id) REFERENCES billing_rule_versions(patient_id,id)
);
CREATE TABLE lab_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  laboratory text, invoice_number text, invoice_date date,
  included_in_patient_invoice boolean NOT NULL,
  data jsonb NOT NULL,
  source jsonb NOT NULL CHECK (source ?& ARRAY['system','recordId','version','locator']),
  document_checksum text NOT NULL CHECK (document_checksum ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(patient_id,document_checksum), UNIQUE(patient_id,id)
);
CREATE TABLE billing_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  proposal_id uuid, lab_invoice_id uuid, billing_version_id uuid REFERENCES billing_versions(id),
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('position','quarter_summary','invoice')),
  state text NOT NULL CHECK (state IN ('confirmed','transferred','historical_summary','reversed')),
  data jsonb NOT NULL,
  source jsonb NOT NULL CHECK (source ?& ARRAY['system','recordId','version','locator']),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid, confirmed_at timestamptz, transferred_by uuid, transferred_at timestamptz,
  CHECK (state <> 'transferred' OR (evidence_kind='position' AND confirmed_by IS NOT NULL
    AND confirmed_at IS NOT NULL AND transferred_by IS NOT NULL AND transferred_at IS NOT NULL)),
  CHECK (evidence_kind='position' OR state IN ('historical_summary','reversed')),
  FOREIGN KEY(patient_id,proposal_id) REFERENCES billing_proposals(patient_id,id),
  FOREIGN KEY(patient_id,lab_invoice_id) REFERENCES lab_invoices(patient_id,id)
);

CREATE FUNCTION treatment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'treatment_history_immutable'; END $$;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['treatment_plan_versions','treatment_events','treatment_baseline',
    'billing_rule_versions','billing_proposals','billing_allocations','lab_invoices'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, anon, authenticated, service_role',tbl);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO service_role',tbl);
    EXECUTE format('CREATE POLICY treatment_service_read_insert ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',tbl);
    EXECUTE format('CREATE TRIGGER treatment_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION treatment_immutable()',tbl);
    EXECUTE format('CREATE INDEX ON %I (patient_id,created_at)',tbl);
  END LOOP;
END $$;

-- Complete LOCAL candidate search. Anima Cura leads; no external outage can imply absence.
-- No LIMIT; transport pagination is explicit in the caller. No mutation or portal grant.
CREATE FUNCTION treatment_name_keys(p_name text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT ARRAY[
   lower(regexp_replace(trim(normalize(p_name,NFC)),'\s+',' ','g')),
   translate(replace(replace(replace(replace(lower(regexp_replace(trim(normalize(p_name,NFC)),'\s+',' ','g')),'ä','ae'),'ö','oe'),'ü','ue'),'ß','ss'),'éèêáàâóòôúùûíìî','eeeaaaooouuuiii'),
   translate(replace(lower(regexp_replace(trim(normalize(p_name,NFC)),'\s+',' ','g')),'ß','ss'),'äöüéèêáàâóòôúùûíìî','aoueeeaaaooouuuiii')
 ];
$$;
CREATE FUNCTION treatment_identity_candidates(p_first text,p_last text,p_dob date,p_patient_id uuid,p_external_id text)
RETURNS TABLE(id uuid,vorname text,nachname text,geburtsdatum date,ivoris_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p.id,p.vorname,p.nachname,p.geburtsdatum,p.ivoris_id FROM patients p
  WHERE p.id=p_patient_id OR p.ivoris_id=p_external_id OR p.geburtsdatum=p_dob
    OR (treatment_name_keys(p.vorname) && treatment_name_keys(p_first) AND treatment_name_keys(p.nachname) && treatment_name_keys(p_last))
    OR (treatment_name_keys(p.vorname) && treatment_name_keys(p_last) AND treatment_name_keys(p.nachname) && treatment_name_keys(p_first))
  ORDER BY p.id;
$$;
REVOKE ALL ON FUNCTION treatment_identity_candidates(text,text,date,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION treatment_identity_candidates(text,text,date,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION treatment_name_keys(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION treatment_name_keys(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
