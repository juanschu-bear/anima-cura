# Security Hardening Report - 2026-07-02

## Scope

Umgesetzt auf Branch `codex/security-hardening-part1` basierend auf `CODEX_SECURITY_BRIEFING.md`.

Nicht angefasst:

- `src/lib/services/matching-engine.ts`
- Welcome- und Onboarding-Seiten
- RLS-Aktivierung fuer `einstellungen` in Production

## Umgesetzte Fixes

### 1. Praxis-Rollenschutz fuer ungeschuetzte API-Routen

Neue Helper-Funktion:

- `src/lib/require-praxis.ts`

Sie blockiert Requests ohne Session mit `401` und Requests ohne passende Rolle mit `403`.

Geschuetzte Routen:

- `src/app/api/finapi/konten/route.ts`
- `src/app/api/finapi/transactions/route.ts`
- `src/app/api/finapi/diagnose/route.ts`
- `src/app/api/finapi/kategorien/route.ts`
- `src/app/api/finapi/connect/route.ts`
- `src/app/api/ivoris/patients/sync/route.ts`
- `src/app/api/ivoris/patients/raw-test/route.ts`
- `src/app/api/ivoris/debug/route.ts`
- `src/app/api/ivoris/debug-sync/route.ts`
- `src/app/api/ivoris/chipkarte/route.ts`
- `src/app/api/patients/analyze/route.ts`
- `src/app/api/whatsapp/send/route.ts`
- `src/app/api/tts/route.ts`
- `src/app/api/icura/voice/route.ts`
- `src/app/api/animahost/conversation/route.ts`

Verwendete Rollen:

- Schreib-/Admin-Routen: `admin`, `verwaltung`
- Lese-/Debug-Routen: `admin`, `verwaltung`, `lesezugriff`

### 2. `/api/cfo/query` auf fail-closed umgestellt

Datei:

- `src/app/api/cfo/query/route.ts`

Vorher:

- wenn `JORDAN_API_TOKEN` nicht gesetzt war, war die Route trotzdem offen

Jetzt:

- ohne gesetztes Secret wird jeder Request abgelehnt

### 3. Cron-Pfad fuer Patienten-Sync sicher gehalten

Dateien:

- `src/app/api/ivoris/patients/batch-sync/route.ts`
- `src/app/api/cron/route.ts`
- `src/app/api/cron/patients/route.ts`

Verhalten jetzt:

- `batch-sync` akzeptiert entweder
  - `Authorization: Bearer ${CRON_SECRET}`
  - oder eine gueltige Praxis-Session mit Rolle `admin` oder `verwaltung`
- die internen Cron-Routen senden dieses Bearer-Token jetzt aktiv mit

Damit bleibt der automatische Sync lauffaehig, ohne die Route offen im Netz stehen zu lassen.

## Verifikation

### Erfolgreich

- `npm run build`
- anonymer Request auf `/api/finapi/kategorien` -> `401`
- anonymer Request auf `/api/ivoris/patients/batch-sync` -> `401`
- Request mit `Authorization: Bearer testsecret` auf `/api/ivoris/patients/batch-sync` -> Route wird ausgefuehrt
- anonymer Request auf `/api/cfo/query` ohne gesetztes `JORDAN_API_TOKEN` -> `401`
- anonymer Request auf `/api/tts` -> `401`
- anonymer Request auf `/api/animahost/conversation` -> `401`

### Auffaelligkeit

- `npx tsc --noEmit` ist im aktuellen Repo nicht sauber lauffaehig
- Ursache: `tsconfig.json` referenziert viele `.next/types/**/*.ts`, die lokal nicht vorhanden sind
- Das wirkt wie ein bestehendes Repo-Problem und nicht wie ein Nebeneffekt dieser Security-Aenderungen

## Bewusst nicht live geschaltet

### RLS auf `einstellungen`

Noch nicht aktivierbar, ohne Frontend-Flows zu brechen.

Browser-seitige Direktzugriffe existieren weiterhin unter anderem in:

- `src/hooks/useData.ts`
- `src/components/workflows/storage.ts`
- `src/app/(dashboard)/automatisierungen/page.tsx`

Solange diese Stellen mit Browser-Client direkt auf `einstellungen` zugreifen, wuerde `ENABLE ROW LEVEL SECURITY` sehr wahrscheinlich UI-Funktionen abschiessen.

Empfohlener sauberer naechster Schritt:

1. alle Browser-Zugriffe auf `einstellungen` auf serverseitige API-Routen oder Server Actions umziehen
2. dann gezielt RLS-Policies fuer `einstellungen` einfuehren
3. erst danach Migration `026` live schalten

## Risiko-Einschaetzung

### Jetzt geschlossen

- offen erreichbare interne Finanz-, Sync-, Debug- und Voice-Routen
- fail-open Verhalten von `/api/cfo/query`
- ungeschuetzter Patienten-Batch-Sync im Cron-Pfad

### Noch offen

- `einstellungen` ist weiterhin ohne den im Briefing gewuenschten finalen RLS-Schritt
- dafuer gibt es aber einen klaren technischen Grund und keinen ignorierten Restpunkt

## Empfehlung

Fuer den aktuellen Stand ist ein Preview-/Branch-Deploy sinnvoll. Danach koennen wir in einem zweiten, gezielten Schritt die `einstellungen`-Zugriffe sauber serverseitig umbauen und erst dann Migration `026` sicher aktivieren.
