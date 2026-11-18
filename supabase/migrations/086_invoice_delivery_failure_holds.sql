-- Provider rejections and spam complaints require a confirmed invoice handoff
-- before payment reminders or dunning may continue.
BEGIN;

ALTER TABLE invoice_delivery_holds
  DROP CONSTRAINT IF EXISTS invoice_delivery_holds_reason_check;

ALTER TABLE invoice_delivery_holds
  ADD CONSTRAINT invoice_delivery_holds_reason_check CHECK (
    reason IN ('no_usable_email', 'invalid_email', 'email_rejected', 'email_complaint')
  );

WITH failed_documents AS (
  SELECT DISTINCT
    document.id AS document_id,
    document.patient_id,
    CASE WHEN event.event_type = 'complained' THEN 'email_complaint' ELSE 'email_rejected' END AS reason,
    COALESCE(
      (regexp_match(document.name, 'Rechnung[[:space:]]+([1-4])[[:space:]]*/[[:space:]]*(20[0-9]{2})', 'i'))[2]
        || '-Q' || (regexp_match(document.name, 'Rechnung[[:space:]]+([1-4])[[:space:]]*/[[:space:]]*(20[0-9]{2})', 'i'))[1],
      (regexp_match(document.name, 'Rechnung[[:space:]]+Q([1-4])[[:space:]]+(20[0-9]{2})', 'i'))[2]
        || '-Q' || (regexp_match(document.name, 'Rechnung[[:space:]]+Q([1-4])[[:space:]]+(20[0-9]{2})', 'i'))[1]
    ) AS quarter
  FROM communication_events event
  JOIN communication_messages message ON message.id = event.message_id
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(message.metadata->'documentIds') = 'array'
      THEN message.metadata->'documentIds' ELSE '[]'::jsonb END
  ) AS linked(document_id)
  JOIN patient_documents document ON document.id::text = linked.document_id
  WHERE event.event_type IN ('failed', 'bounced', 'suppressed', 'complained')
)
INSERT INTO invoice_delivery_holds(patient_id, document_id, quarter, reason, status)
SELECT patient_id, document_id, quarter, reason, 'active'
FROM failed_documents
WHERE quarter IS NOT NULL
ON CONFLICT(document_id, quarter) DO NOTHING;

COMMIT;
