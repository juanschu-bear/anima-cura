CREATE TABLE IF NOT EXISTS communication_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  campaign_key text,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'portal')),
  provider text,
  provider_message_id text,
  recipient text NOT NULL,
  subject text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'accepted', 'delivered', 'delayed', 'opened', 'clicked',
    'failed', 'bounced', 'complained', 'suppressed'
  )),
  tracking_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  sent_at timestamptz,
  delivered_at timestamptz,
  first_opened_at timestamptz,
  first_clicked_at timestamptz,
  last_event_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_messages_provider_id
  ON communication_messages (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communication_messages_patient
  ON communication_messages (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_messages_campaign
  ON communication_messages (campaign_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_messages_status
  ON communication_messages (status, created_at DESC);

CREATE TABLE IF NOT EXISTS communication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES communication_messages(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'queued', 'accepted', 'delivered', 'delayed', 'opened', 'clicked',
    'failed', 'bounced', 'complained', 'suppressed',
    'portal_login', 'document_opened', 'document_downloaded', 'payment_opened'
  )),
  event_key text,
  source text NOT NULL DEFAULT 'anima_cura',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_events_event_key
  ON communication_events (event_key) WHERE event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communication_events_message
  ON communication_events (message_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS communication_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES communication_messages(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  target_url text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communication_messages_service_role ON communication_messages;
CREATE POLICY communication_messages_service_role ON communication_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS communication_events_service_role ON communication_events;
CREATE POLICY communication_events_service_role ON communication_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS communication_links_service_role ON communication_links;
CREATE POLICY communication_links_service_role ON communication_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS communication_messages_practice_read ON communication_messages;
CREATE POLICY communication_messages_practice_read ON communication_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );
DROP POLICY IF EXISTS communication_events_practice_read ON communication_events;
CREATE POLICY communication_events_practice_read ON communication_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );
DROP POLICY IF EXISTS communication_links_practice_read ON communication_links;
CREATE POLICY communication_links_practice_read ON communication_links
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'verwaltung'))
  );
