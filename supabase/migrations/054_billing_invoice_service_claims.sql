-- One logical service belongs to one invoice, including payer revisions and
-- overlapping periods. A failed reservation rolls back the number and claims.
BEGIN;

CREATE TABLE billing_invoice_service_claims (
  service_record_id uuid PRIMARY KEY REFERENCES billing_records(id) ON DELETE RESTRICT,
  service_version_id uuid NOT NULL UNIQUE REFERENCES billing_versions(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES billing_invoices(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Deliberately fail the entire migration if historical invoices overlap.
INSERT INTO billing_invoice_service_claims(service_record_id,service_version_id,invoice_id)
SELECT bv.record_id,bv.id,i.id
FROM billing_invoices i
CROSS JOIN LATERAL jsonb_array_elements(i.snapshot->'lines') line
JOIN billing_versions bv ON bv.id=(line->>'versionId')::uuid;

CREATE FUNCTION billing_guard_invoice_services() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  line jsonb; service billing_versions%ROWTYPE; record billing_records%ROWTYPE;
  owner_invoice uuid; payer billing_payer_versions%ROWTYPE; payer_case billing_payer_cases%ROWTYPE;
  source_entry doku_eintraege%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status<>'issued' THEN RETURN NEW; END IF;

  SELECT * INTO payer FROM billing_payer_versions WHERE id=NEW.payer_version_id FOR SHARE;
  SELECT * INTO payer_case FROM billing_payer_cases WHERE id=payer.case_id FOR SHARE;
  IF payer.state IS DISTINCT FROM 'approved' OR payer.revision IS DISTINCT FROM payer_case.head_version
    OR payer_case.patient_id IS DISTINCT FROM NEW.patient_id THEN
    RAISE EXCEPTION 'billing_invoice_payer_stale';
  END IF;

  -- Lock in a stable order, so parallel reservations of overlapping sets cannot
  -- both claim a service and service revisions cannot change during publication.
  FOR line IN SELECT value FROM jsonb_array_elements(NEW.snapshot->'lines') ORDER BY value->>'versionId' LOOP
    SELECT * INTO service FROM billing_versions WHERE id=(line->>'versionId')::uuid FOR SHARE;
    SELECT * INTO record FROM billing_records WHERE id=service.record_id FOR SHARE;
    IF record.kind IS DISTINCT FROM 'service' OR record.patient_id IS DISTINCT FROM NEW.patient_id
      OR service.state IS DISTINCT FROM 'approved' OR service.revision IS DISTINCT FROM record.head_version THEN
      RAISE EXCEPTION 'billing_invoice_service_stale';
    END IF;
    IF record.source_system='scribe' THEN
      SELECT * INTO source_entry FROM doku_eintraege WHERE id=record.source_record_id::uuid FOR SHARE;
      IF NOT FOUND OR source_entry.patient_id IS DISTINCT FROM NEW.patient_id
        OR source_entry.status IS DISTINCT FROM 'bestaetigt' OR source_entry.bestaetigt_am IS NULL
        OR source_entry.version IS DISTINCT FROM (service.data->'source'->>'version')::integer
        OR source_entry.termin_datum::text IS DISTINCT FROM service.data->>'serviceDate'
        OR jsonb_typeof(source_entry.positionen::jsonb) IS DISTINCT FROM 'array'
        OR record.source_position_index >= jsonb_array_length(source_entry.positionen::jsonb) THEN
        RAISE EXCEPTION 'billing_invoice_service_stale';
      END IF;
    END IF;
    IF TG_OP='INSERT' THEN
      INSERT INTO billing_invoice_service_claims(service_record_id,service_version_id,invoice_id)
      VALUES(record.id,service.id,NEW.id) ON CONFLICT(service_record_id) DO NOTHING;
    END IF;
    SELECT invoice_id INTO owner_invoice FROM billing_invoice_service_claims WHERE service_record_id=record.id;
    IF owner_invoice IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'billing_invoice_service_already_billed';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- AFTER INSERT allows the claim's invoice foreign key to be checked immediately.
CREATE TRIGGER billing_invoice_claim_services AFTER INSERT ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION billing_guard_invoice_services();
CREATE TRIGGER billing_invoice_recheck_services BEFORE UPDATE ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION billing_guard_invoice_services();

ALTER TABLE billing_invoice_service_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_invoice_service_claims FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON billing_invoice_service_claims TO service_role;
REVOKE ALL ON FUNCTION billing_guard_invoice_services() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
