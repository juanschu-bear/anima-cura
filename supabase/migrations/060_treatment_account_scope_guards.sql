-- Restrict default database grants on the NEW treatment tables only.
BEGIN;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['treatment_plan_versions','treatment_events','treatment_baseline',
    'billing_rule_versions','billing_proposals','billing_allocations','lab_invoices'] LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated,service_role',tbl);
    EXECUTE format('GRANT SELECT,INSERT ON %I TO service_role',tbl);
  END LOOP;
END $$;
CREATE FUNCTION treatment_allocation_scope_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.billing_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM billing_versions v JOIN billing_records r ON r.id=v.record_id
    WHERE v.id=NEW.billing_version_id AND r.patient_id=NEW.patient_id AND r.kind='service'
  ) THEN RAISE EXCEPTION 'treatment_patient_scope_conflict'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION treatment_allocation_scope_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER treatment_allocation_scope_guard BEFORE INSERT ON billing_allocations
FOR EACH ROW EXECUTE FUNCTION treatment_allocation_scope_guard();
COMMIT;
