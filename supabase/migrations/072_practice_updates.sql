-- Praxisweite Produktneuerungen mit persoenlichem Lese- und Bestaetigungsstand.
-- Zugriff erfolgt ausschliesslich ueber die authentifizierten API-Routen.
BEGIN;

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

INSERT INTO public.praxis_updates (
  slug,
  status,
  category,
  title_de,
  summary_de,
  body_de,
  title_en,
  summary_en,
  body_en,
  requires_acknowledgement,
  published_at
)
VALUES (
  'retainer-und-kombitermine',
  'published',
  'neuerung',
  'Retainer-Service und mehrere Leistungen pro Besuch',
  'Retainer-Fälle können eigenständig dokumentiert und mehrere Terminarten in einem Besuch zusammengefasst werden.',
  'Wähle für Reparatur, Wiederbefestigung oder Erneuerung eines Retainers die eigene Behandlungsart „Retainer“. Das gilt auch für neue Patienten oder eine Vorbehandlung in einer anderen Praxis. Wenn bei einem Besuch mehrere Leistungen stattfinden, können sie gemeinsam in einem Eintrag dokumentiert werden.',
  'Retainer service and multiple services per visit',
  'Retainer cases can be documented independently and multiple appointment types can be combined in one visit.',
  'Choose the dedicated “Retainer” treatment type for repair, reattachment or replacement of a retainer. This also applies to new patients or treatment performed by another practice. If several services take place during one visit, they can be documented together in one entry.',
  false,
  now()
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
