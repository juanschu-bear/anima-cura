CREATE OR REPLACE FUNCTION public.animasign_sync_status()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH metrics AS (
    SELECT
      count(*)::integer AS total_submissions,
      count(*) FILTER (WHERE ivoris_synced = true)::integer AS patient_synced,
      count(*) FILTER (
        WHERE ivoris_synced = false
          AND coalesce(ivoris_sync_failed_permanently, false) = false
      )::integer AS patient_pending,
      count(*) FILTER (
        WHERE ivoris_synced = false
          AND coalesce(ivoris_sync_failed_permanently, false) = true
      )::integer AS patient_failed,
      count(*) FILTER (WHERE ivoris_doc_synced = true)::integer AS doc_synced,
      count(*) FILTER (
        WHERE ivoris_doc_synced = false
          AND coalesce(ivoris_doc_failed_permanently, false) = false
      )::integer AS doc_pending,
      count(*) FILTER (
        WHERE ivoris_doc_synced = false
          AND coalesce(ivoris_doc_failed_permanently, false) = true
      )::integer AS doc_failed,
      min(next_retry_at) AS next_scheduled_retry
    FROM (
      SELECT
        ivoris_synced,
        ivoris_doc_synced,
        ivoris_sync_failed_permanently,
        ivoris_doc_failed_permanently,
        ivoris_sync_next_retry_at AS next_retry_at
      FROM anamnese_submissions
      WHERE ivoris_synced = false
        AND coalesce(ivoris_sync_failed_permanently, false) = false

      UNION ALL

      SELECT
        ivoris_synced,
        ivoris_doc_synced,
        ivoris_sync_failed_permanently,
        ivoris_doc_failed_permanently,
        ivoris_doc_next_retry_at AS next_retry_at
      FROM anamnese_submissions
      WHERE ivoris_doc_synced = false
        AND coalesce(ivoris_doc_failed_permanently, false) = false
    ) pending
  ),
  last_success AS (
    SELECT max(created_at) AS last_successful_sync
    FROM animasign_sync_log
    WHERE status = 'success'
  )
  SELECT jsonb_build_object(
    'total_submissions', metrics.total_submissions,
    'patient_synced', metrics.patient_synced,
    'patient_pending', metrics.patient_pending,
    'patient_failed', metrics.patient_failed,
    'doc_synced', metrics.doc_synced,
    'doc_pending', metrics.doc_pending,
    'doc_failed', metrics.doc_failed,
    'last_successful_sync', last_success.last_successful_sync,
    'next_scheduled_retry', metrics.next_scheduled_retry
  )
  FROM metrics
  CROSS JOIN last_success;
$$;

GRANT EXECUTE ON FUNCTION public.animasign_sync_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.animasign_sync_status() TO service_role;
