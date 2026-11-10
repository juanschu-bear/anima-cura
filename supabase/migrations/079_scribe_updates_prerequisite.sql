-- 10.11.2026: Missing production prerequisite for migration 078.
-- Install 079 BEFORE the unchanged 078 after explicit checksum approval.
-- Schema from 072 only: no historical announcement is published or mailed.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE IF NOT EXISTS public.praxis_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  category text NOT NULL DEFAULT 'neuerung' CHECK (category IN ('neuerung', 'wichtig', 'hinweis')),
  title_de text NOT NULL CHECK (char_length(title_de) BETWEEN 1 AND 160),
  summary_de text NOT NULL CHECK (char_length(summary_de) BETWEEN 1 AND 500),
  body_de text NOT NULL CHECK (char_length(body_de) BETWEEN 1 AND 20000),
  title_en text NOT NULL CHECK (char_length(title_en) BETWEEN 1 AND 160),
  summary_en text NOT NULL CHECK (char_length(summary_en) BETWEEN 1 AND 500),
  body_en text NOT NULL CHECK (char_length(body_en) BETWEEN 1 AND 20000),
  requires_acknowledgement boolean NOT NULL DEFAULT false,
  audience_roles text[] NOT NULL DEFAULT ARRAY['admin','verwaltung','lesezugriff']::text[],
  visible_from timestamptz,
  visible_until timestamptz,
  published_at timestamptz,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT praxis_updates_audience_roles_valid CHECK (
    audience_roles <@ ARRAY['admin','verwaltung','lesezugriff']::text[]
    AND cardinality(audience_roles) > 0
  ),
  CONSTRAINT praxis_updates_visibility_valid CHECK (visible_until IS NULL OR visible_from IS NULL OR visible_until > visible_from),
  CONSTRAINT praxis_updates_published_at_required CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.praxis_update_lesestaende (
  update_id uuid NOT NULL REFERENCES public.praxis_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  acknowledged_at timestamptz,
  PRIMARY KEY (update_id, user_id),
  CONSTRAINT praxis_update_ack_requires_read CHECK (acknowledged_at IS NULL OR read_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_praxis_updates_visible
  ON public.praxis_updates (status, published_at DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_praxis_update_lesestaende_user
  ON public.praxis_update_lesestaende (user_id, read_at, acknowledged_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS praxis_updates_updated_at ON public.praxis_updates;
    CREATE TRIGGER praxis_updates_updated_at
      BEFORE UPDATE ON public.praxis_updates
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

ALTER TABLE public.praxis_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.praxis_update_lesestaende ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.praxis_updates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.praxis_update_lesestaende FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.praxis_updates, public.praxis_update_lesestaende TO service_role;

COMMIT;
