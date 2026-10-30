-- Extend the existing append-only catalog. No patient entries or grants change.
BEGIN;
INSERT INTO public.scribe_room_versions (room_id, version, name)
SELECT v.room_id, 1, v.name FROM (VALUES
 ('06900000-0000-4000-8000-000000000001'::uuid, 'Anmeldung / Empfang'),
 ('06900000-0000-4000-8000-000000000002'::uuid, 'Röntgen'),
 ('06900000-0000-4000-8000-000000000003'::uuid, 'Ohne festen Ort / nachträgliche Dokumentation')
) v(room_id,name)
WHERE NOT EXISTS (SELECT 1 FROM public.scribe_room_versions r WHERE r.room_id=v.room_id)
AND NOT EXISTS (SELECT 1 FROM public.scribe_room_versions r WHERE lower(btrim(r.name))=lower(v.name)
 AND r.active AND NOT EXISTS (SELECT 1 FROM public.scribe_room_versions newer WHERE newer.room_id=r.room_id AND newer.version>r.version));
COMMIT;
