-- ============================================================
-- 022 – Self-service option texts (Weg B), per practice.
-- Practice-added Textbausteine live here as extra rows. The seed
-- catalog (doku_vorlagen.struktur) stays untouched, so a redeploy
-- of 019b never overwrites practice texts. Loaded and merged onto
-- the matching group at read time in /api/doku/vorlagen.
--
-- Run once in the shared Supabase (project zymqxzhjbcxzhzvjqvbv).
-- Idempotent where possible.
-- ============================================================

CREATE TABLE IF NOT EXISTS doku_vorlagen_optionen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  praxis_id TEXT NOT NULL,                                   -- per-practice scope (one value per deploy for now)
  behandlungsart TEXT NOT NULL CHECK (behandlungsart IN ('aligner', 'removable', 'multiband')),
  termin_typ TEXT NOT NULL,                                  -- matches doku_vorlagen.termin_typ (slug)
  gruppe TEXT NOT NULL,                                      -- key inside struktur.groups (e.g. 'sitz', 'anliegen')
  text TEXT NOT NULL,                                        -- the option text (Textbaustein), stored verbatim
  quelle TEXT NOT NULL DEFAULT 'scribe',                     -- origin marker: added directly in Anima Scribe
  aktiv BOOLEAN NOT NULL DEFAULT TRUE,                        -- soft-hide instead of delete
  sort_index INTEGER NOT NULL DEFAULT 0,                      -- order among practice options (appended after seed opts)
  erstellt_von UUID,                                         -- auth.users id of the person who added it
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup for the merge in /api/doku/vorlagen
CREATE INDEX IF NOT EXISTS idx_doku_opt_scope
  ON doku_vorlagen_optionen (praxis_id, behandlungsart, termin_typ, aktiv, sort_index);

-- Prevent exact duplicate texts within the same group of the same practice
CREATE UNIQUE INDEX IF NOT EXISTS uq_doku_opt_text
  ON doku_vorlagen_optionen (praxis_id, behandlungsart, termin_typ, gruppe, md5(text));

-- Reuse the existing updated_at trigger function if present (defined in an earlier migration).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS doku_vorlagen_optionen_updated_at ON doku_vorlagen_optionen;
    CREATE TRIGGER doku_vorlagen_optionen_updated_at
      BEFORE UPDATE ON doku_vorlagen_optionen
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- RLS: same pattern as the rest of the doku module. Writes go through the
-- service-role client in the API route; this policy keeps authenticated reads open.
ALTER TABLE doku_vorlagen_optionen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access" ON doku_vorlagen_optionen;
CREATE POLICY "Authenticated full access" ON doku_vorlagen_optionen
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Check:
SELECT praxis_id, behandlungsart, termin_typ, gruppe, count(*) AS texte
FROM doku_vorlagen_optionen
GROUP BY praxis_id, behandlungsart, termin_typ, gruppe
ORDER BY praxis_id, behandlungsart, termin_typ, gruppe;
