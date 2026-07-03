-- Matching-Autobuchung auf 80 senken.
-- Wichtig: Die Geschwister-/Mehrdeutigkeits-Guard-Logik wurde im
-- Engine-Code gehaertet, bevor diese Schwelle scharf geschaltet wird.

INSERT INTO einstellungen (key, value)
VALUES (
  'matching',
  '{"min_score": 70, "auto_approve_score": 80, "fuzzy_threshold": 0.7}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = COALESCE(einstellungen.value, '{}'::jsonb)
  || jsonb_build_object('auto_approve_score', 80);
