-- AnimaHost WhatsApp rulebook and decisions. No patient data is copied here.
BEGIN;

CREATE TABLE animahost_whatsapp_settings (
  tenant_id uuid PRIMARY KEY,
  model text NOT NULL DEFAULT 'anthropic/claude-haiku-5.5',
  active_rulebook_version integer,
  voice_output_enabled boolean NOT NULL DEFAULT false,
  voice_perception_enabled boolean NOT NULL DEFAULT false,
  doctolib_url text CHECK (doctolib_url IS NULL OR doctolib_url LIKE 'https://%'),
  practice_phone text,
  salutation text NOT NULL DEFAULT 'Sie' CHECK (salutation IN ('Sie','Du')),
  host_name text NOT NULL DEFAULT 'AnimaHost',
  introduction text NOT NULL DEFAULT 'Digitaler Assistent der Praxis Dr. Schubert',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE animahost_whatsapp_rulebook_versions (
  tenant_id uuid NOT NULL REFERENCES animahost_whatsapp_settings(tenant_id),
  version integer NOT NULL CHECK (version > 0),
  rules jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  PRIMARY KEY (tenant_id, version)
);

ALTER TABLE animahost_whatsapp_settings
  ADD CONSTRAINT animahost_active_rulebook_fk
  FOREIGN KEY (tenant_id, active_rulebook_version)
  REFERENCES animahost_whatsapp_rulebook_versions(tenant_id, version);

CREATE TABLE animahost_whatsapp_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES animahost_whatsapp_settings(tenant_id),
  message_id text NOT NULL,
  sender_jid text NOT NULL,
  action text NOT NULL CHECK (action IN ('antworten','klaerfall','notfall')),
  rule_id text,
  rulebook_version integer,
  patient_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, message_id)
);
CREATE INDEX animahost_whatsapp_decisions_by_action
  ON animahost_whatsapp_decisions(tenant_id, action, created_at DESC);

CREATE FUNCTION animahost_whatsapp_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'animahost_history_immutable';
END $$;
CREATE TRIGGER animahost_rulebook_immutable
  BEFORE UPDATE OR DELETE ON animahost_whatsapp_rulebook_versions
  FOR EACH ROW EXECUTE FUNCTION animahost_whatsapp_immutable();
CREATE TRIGGER animahost_decision_immutable
  BEFORE UPDATE OR DELETE ON animahost_whatsapp_decisions
  FOR EACH ROW EXECUTE FUNCTION animahost_whatsapp_immutable();

CREATE FUNCTION animahost_whatsapp_publish_rules(
  p_tenant uuid, p_expected_version integer, p_rules jsonb, p_actor uuid
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_version integer; next_version integer;
BEGIN
  SELECT active_rulebook_version INTO current_version
  FROM animahost_whatsapp_settings WHERE tenant_id=p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'animahost_tenant_not_found'; END IF;
  IF current_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'animahost_rulebook_stale';
  END IF;
  IF jsonb_typeof(p_rules) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'animahost_rules_invalid';
  END IF;
  next_version:=COALESCE(current_version,0)+1;
  INSERT INTO animahost_whatsapp_rulebook_versions(tenant_id,version,rules,created_by)
  VALUES(p_tenant,next_version,p_rules,p_actor);
  UPDATE animahost_whatsapp_settings
  SET active_rulebook_version=next_version,updated_at=now(),updated_by=p_actor
  WHERE tenant_id=p_tenant;
  RETURN next_version;
END $$;

ALTER TABLE animahost_whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE animahost_whatsapp_rulebook_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE animahost_whatsapp_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON animahost_whatsapp_settings,
  animahost_whatsapp_rulebook_versions,
  animahost_whatsapp_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON animahost_whatsapp_settings TO service_role;
GRANT SELECT, INSERT ON animahost_whatsapp_rulebook_versions,
  animahost_whatsapp_decisions TO service_role;
REVOKE ALL ON FUNCTION animahost_whatsapp_publish_rules(uuid,integer,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION animahost_whatsapp_publish_rules(uuid,integer,jsonb,uuid)
  TO service_role;

INSERT INTO animahost_whatsapp_settings(tenant_id, practice_phone)
VALUES ('0514a140-e570-4c10-a5c1-838a2cfd1d12', '+49 179 5351813');

COMMIT;
