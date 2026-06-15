# Auth System — Codex Task

## Repo
github.com/juanschu-bear/anima-cura (branch: main)

## What Exists

The app currently has NO authentication. Anyone with the URL can access everything. There is a password-protected Settings page (password: ms13sr06?!) but that is just a simple password check, not real auth.

The Settings page already has a User Management section with three default users:
- Dr. Maria Schubert — Admin (full access)
- Sabine — Verwaltung (payments, dunning, no settings)
- Empfang — Lesezugriff (read-only, no payments, no dunning, no settings)

## What to Build

### 1. Login Page (`/login`)
- Email + password form
- Clean design matching the existing Anima Cura dark/light theme
- "Anima Cura" branding with the existing design tokens
- Error messages for wrong credentials
- Redirect to `/uebersicht` after successful login
- Bilingual (DE/EN) using the existing `t()` i18n system

### 2. Supabase Auth Integration
- Use Supabase Auth (already available via the existing Supabase project)
- Create auth users for the three default users
- Store role and permissions in a `user_profiles` table or in Supabase user metadata
- Roles: admin, verwaltung, lesezugriff

### 3. Route Protection
- All dashboard routes (`/(dashboard)/*`) must require authentication
- Redirect to `/login` if not authenticated
- Use middleware or a layout-level auth check
- The `/api/cfo/query` endpoint should remain accessible with the token auth (for Dr. Cashy)

### 4. Role-Based Access
- Admin: Full access to everything including Settings
- Verwaltung: Access to Overview, Payments, Patients, Installments, Dunning, Quarterly, Automations, Import. NO access to Settings.
- Lesezugriff: Read-only access to Overview, Patients, Quarterly. NO access to Payments, Dunning, Automations, Settings, Import.
- Hide navigation items the user does not have access to
- Show a "no permission" message if they try to access a restricted page directly

### 5. Session Management
- Keep users logged in (persistent session via Supabase)
- Logout button in the sidebar (already exists visually)
- Session timeout after 24 hours of inactivity

### 6. Default Users to Create
Create these three users in Supabase Auth during setup:

| Email | Password | Role | Name |
|-------|----------|------|------|
| maria@praxis-schubert.de | ms13sr06?! | admin | Dr. Maria Schubert |
| sabine@praxis-schubert.de | ms13sr06?! | verwaltung | Sabine |
| empfang@praxis-schubert.de | empfang2026! | lesezugriff | Empfang |

### 7. Important Notes
- `npm run build` must pass
- Do NOT modify the workflow builder, ICuraChat, or any API routes
- Do NOT change the existing Settings password protection — replace it with real auth
- The existing `useAppStore` zustand store can be extended with auth state
- Use `createBrowserClient` from `@/lib/db/supabase` for client-side auth
- Use `createServerClient` for server-side auth checks in API routes
- All texts bilingual via `t()` from `src/lib/i18n.ts`
- Dark mode must work on the login page
