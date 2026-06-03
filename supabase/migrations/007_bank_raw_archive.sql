-- ============================================================
-- 007: Raw bank transaction archive + sync run log
-- ============================================================
-- bank_sync_runs:         One row per bank connection per sync
--                         run. Answers: when was what fetched.
-- bank_transactions_raw:  Immutable archive of every transaction
--                         ever fetched from finAPI (all
--                         directions, signed amounts, full raw
--                         payload as JSONB). Never updated or
--                         deleted by the application.
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  bank_connection_id UUID REFERENCES bank_connections(id),
  date_from DATE,
  date_to DATE,
  direction TEXT NOT NULL DEFAULT 'all',
  fetched_count INTEGER NOT NULL DEFAULT 0,
  archived_new_count INTEGER NOT NULL DEFAULT 0,
  imported_new_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
  error TEXT
);

CREATE TABLE IF NOT EXISTS bank_transactions_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finapi_id TEXT NOT NULL UNIQUE,
  sync_run_id UUID REFERENCES bank_sync_runs(id),
  bank_connection_id UUID REFERENCES bank_connections(id),
  amount NUMERIC(12,2),
  booking_date DATE,
  value_date DATE,
  purpose TEXT,
  counterpart_name TEXT,
  counterpart_iban TEXT,
  raw JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btr_booking_date ON bank_transactions_raw (booking_date);
CREATE INDEX IF NOT EXISTS idx_btr_counterpart_iban ON bank_transactions_raw (counterpart_iban);
CREATE INDEX IF NOT EXISTS idx_btr_connection ON bank_transactions_raw (bank_connection_id);
CREATE INDEX IF NOT EXISTS idx_bsr_started_at ON bank_sync_runs (started_at);

ALTER TABLE bank_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions_raw ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bank_sync_runs' AND policyname = 'Authenticated users full access'
  ) THEN
    CREATE POLICY "Authenticated users full access" ON bank_sync_runs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bank_transactions_raw' AND policyname = 'Authenticated users full access'
  ) THEN
    CREATE POLICY "Authenticated users full access" ON bank_transactions_raw
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
