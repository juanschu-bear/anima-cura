# CODEX TASK: Patient Portal — Commit & Deploy

Read AGENTS.md first. Commit and push after changes. npm run build must pass.

## What was built

The Patient Portal feature for Anima Cura — a mobile-optimized portal where patients can track their treatment progress, view payment status, chat with the practice, and access documents.

## Files to commit

### New files:
- `supabase/migrations/004_patient_portal.sql` — 6 new tables + RLS policies
- `src/lib/patient-auth.ts` — Patient auth helper
- `src/app/(patient)/layout.tsx` — Patient route group layout (no sidebar)
- `src/app/(patient)/login/page.tsx` — Patient login page
- `src/app/(patient)/portal/page.tsx` — Patient portal page
- `src/components/patient/PatientLoginForm.tsx` — Login form (email + password)
- `src/components/patient/PatientPortalShell.tsx` — Full 5-tab portal UI
- `src/app/api/patient/me/route.ts` — Patient profile endpoint
- `src/app/api/patient/ratenplan/route.ts` — Financial data endpoint
- `src/app/api/patient/zahlungen/route.ts` — Payment history endpoint
- `src/app/api/patient/behandlung/route.ts` — Treatment phases endpoint
- `src/app/api/patient/dokumente/route.ts` — Documents endpoint
- `src/app/api/patient/nachrichten/route.ts` — Chat GET + POST endpoint
- `src/app/api/patient/benachrichtigungen/route.ts` — Notifications endpoint
- `src/app/api/patient/tipps/route.ts` — Care tips endpoint
- `src/app/api/patient/badges/route.ts` — Achievements endpoint

### Modified files:
- `src/lib/auth.ts` — Added 'patient' to AppRole type
- `middleware.ts` — Added /patient/* route protection

## Migration

Run `004_patient_portal.sql` in Supabase SQL Editor before testing. It:
1. Adds 'patient' role to user_profiles
2. Adds patient_id column to user_profiles
3. Creates tables: behandlungsphasen, patient_documents, patient_messages, patient_notifications, pflegetipps
4. Inserts 10 default care tips
5. Replaces blanket RLS policies with role-aware ones (patients see only own data)

## To create a test patient

After running the migration, create a test patient account in Supabase SQL Editor:

```sql
-- 1. Pick an existing patient ID
SELECT id, vorname, nachname FROM patients LIMIT 5;

-- 2. Create auth user for that patient (replace PATIENT_UUID with actual ID)
SELECT public.ensure_default_auth_user(
  gen_random_uuid(),
  'lena.mueller@example.de',
  'patient2026!',
  'patient',
  'Lena Müller'
);

-- 3. Link the auth user to the patient
UPDATE user_profiles
SET patient_id = 'PATIENT_UUID_HERE'
WHERE email = 'lena.mueller@example.de';

-- 4. Add some treatment phases for this patient
INSERT INTO behandlungsphasen (patient_id, name, beschreibung, status, reihenfolge, start_datum, end_datum) VALUES
  ('PATIENT_UUID_HERE', 'Nivellierung', 'Zähne wurden in die richtige Position gebracht.', 'abgeschlossen', 1, '2025-06-15', '2025-12-10'),
  ('PATIENT_UUID_HERE', 'Lückenschluss', 'Verbleibende Lücken werden geschlossen.', 'aktiv', 2, '2026-01-08', NULL),
  ('PATIENT_UUID_HERE', 'Feineinstellung', 'Letzte Korrekturen.', 'ausstehend', 3, NULL, NULL),
  ('PATIENT_UUID_HERE', 'Retainer', 'Ergebnis langfristig sichern.', 'ausstehend', 4, NULL, NULL);
```

## Routes

- `/patient/login` — Patient login (email + password)
- `/patient/portal` — Patient portal (protected, redirects to login if not authenticated)
- `/api/patient/*` — 10 API endpoints (all require patient auth)

## Commit message

feat: add patient portal with 10 API endpoints, auth, login, and 5-tab mobile UI
