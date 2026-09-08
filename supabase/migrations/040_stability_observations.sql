CREATE TABLE IF NOT EXISTS stability_observations (
  observation_date date PRIMARY KEY,
  observed_at timestamptz NOT NULL DEFAULT now(),
  healthy boolean NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stability_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stability_observations_service_role ON stability_observations;
CREATE POLICY stability_observations_service_role ON stability_observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS stability_observations_authenticated_read ON stability_observations;
CREATE POLICY stability_observations_authenticated_read ON stability_observations
  FOR SELECT TO authenticated USING (true);

