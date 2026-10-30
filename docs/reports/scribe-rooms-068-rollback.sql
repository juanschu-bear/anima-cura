-- Deploy the previous application first. Retain recorded rooms and history.
-- No patient records are edited or deleted. New inserts may omit the room again.
BEGIN;
DROP TRIGGER IF EXISTS scribe_entry_room_guard ON public.doku_eintraege;
-- Keep immutable catalog and history copying; additive columns remain readable.
COMMIT;
