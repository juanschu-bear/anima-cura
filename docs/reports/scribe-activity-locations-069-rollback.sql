-- Reversible deactivation, not deletion. Historical entry references remain valid.
-- Only untouched rows seeded by 069: do not overwrite later practice changes.
BEGIN;
INSERT INTO public.scribe_room_versions (room_id, version, name, active)
SELECT r.room_id, 2, r.name, false FROM public.scribe_room_versions r
WHERE r.room_id IN ('06900000-0000-4000-8000-000000000001'::uuid,
 '06900000-0000-4000-8000-000000000002'::uuid, '06900000-0000-4000-8000-000000000003'::uuid)
AND r.version=1 AND r.active
AND NOT EXISTS (SELECT 1 FROM public.scribe_room_versions newer WHERE newer.room_id=r.room_id AND newer.version>r.version);
COMMIT;
