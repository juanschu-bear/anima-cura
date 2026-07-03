# Security Hardening Teil 2 - 2026-07-02

## Scope

Umgesetzt auf Branch `codex/security-hardening-part1` als Folgeauftrag zu Teil 1.

## Umgesetzte Punkte

### 1. Matching-Engine gehaertet

Datei:

- `src/lib/services/matching-engine.ts`

Umgesetzt:

- Auto-Schwelle auf `80` umgestellt
- Geschwister-/Mehrdeutigkeits-Guard eingebaut
- Patienten mit offenen Raten werden pro Batch nur noch einmal geladen
- IBAN-Historie wird pro Batch nur noch einmal geladen
- In-Memory-Cache wird waehrend des Laufs aktuell gehalten:
  - nach Auto-Match wird die gematchte Rate aus den Kandidaten entfernt
  - die neue IBAN-Patient-Zuordnung wird sofort in die Map uebernommen

Guard-Verhalten:

- Wenn mindestens zwei verschiedene Patienten mit demselben normalisierten Nachnamen
  einen starken Treffer erzeugen (`score >= Schwelle` und `betragMatch === true`),
  wird der Fall nicht automatisch gebucht
- Der Treffer wird auf:
  - `matching_status = "abweichung"`
  - `matching_details.mehrdeutig = true`
  - `matching_score = 79`
  gedeckelt

Das verhindert besonders den Eltern-IBAN-/Geschwister-Fall.

### 2. SQL-RPCs geprueft und 80er-Schwelle nur deshalb aktiviert

Gepruefte Definitionen:

- `supabase/migrations/008_matching_stufe2.sql`
- `supabase/migrations/009_posten_komplett_und_matching_stufe25.sql`
- `supabase/migrations/011_resolver_basisnummer_rechnungsnr.sql`
- `supabase/migrations/013_kombibeweis_stichtag.sql`

Ergebnis:

- `ac_match_names` schreibt `80`, aber nur bei genau einem exakten Namenskandidaten
- `ac_match_names_v2` schreibt `75` bzw. `70`
- `ac_match_typos` schreibt `65`
- `ac_match_referenz` schreibt `95` bzw. `90`

Bewertung:

- Es gibt im Repo keine SQL-Stelle, die den Geschwister-Fall mit gleichem Nachnamen
  und gleichem Betrag auf `>= 80` hebt, wenn mehrere Kandidaten bestehen
- Deshalb ist die 80er-Schwelle nach dem JS-Guard konsistent genug, um aktiviert zu werden

### 3. Matching-Defaults aktualisiert

Geaendert in:

- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/026_matching_auto_approve_80.sql`
- `src/lib/mock-data.ts`
- `src/app/(dashboard)/einstellungen/page.tsx`

Neu:

- Default `auto_approve_score = 80`

### 4. Reparatur- und Debug-Routen bereinigt

Behalten:

- `src/app/api/anima-sign/ivoris-nachsync/route.ts`
  - jetzt mit Praxisrollen-Check (`admin`, `verwaltung`)
  - fachlich weiterhin absichtlich deaktiviert

Aus dem oeffentlichen API-Layer entfernt:

- `src/app/api/debug-supabase/route.ts`
- `src/app/api/anima-sign/migrate/route.ts`
- `src/app/api/anima-sign/resync/route.ts`
- `src/app/api/anima-sign/account-nachsync/route.ts`
- `src/app/api/anima-sign/ivoris-merge/route.ts`
- `src/app/api/anima-sign/ivoris-resolution/route.ts`
- `src/app/api/ivoris/debug/route.ts`
- `src/app/api/ivoris/debug-sync/route.ts`

Erhaltener Backfill als Script:

- `scripts/animasign-migrate-submissions.ts`

## Verifikation

### Erfolgreich

- `npx tsx --test src/lib/services/__tests__/matching-engine.test.ts`
- `npm run build`
- `npx tsc --noEmit` nach frischem Build

### Blackbox-Checks

- `POST /api/anima-sign/ivoris-nachsync` anonym -> `401`
- `POST /api/anima-sign/resync` -> `404`
- `GET /api/ivoris/debug` -> `404`

### Neue Tests

Datei:

- `src/lib/services/__tests__/matching-engine.test.ts`

Abgedeckt:

- eindeutiger exakter Treffer -> `auto`
- Geschwister-/gemeinsame-IBAN-Fall -> `abweichung`, `mehrdeutig: true`, Score `79`

## Hinweis

Die fachliche Aktivierung der 80er-Schwelle haengt trotzdem am echten Produktionsdatenbild. Die Repo-Pruefung zeigt, dass die SQL-Definitionen dazu passen; die reale Batch-Laufzeit und die Autoquote sollten nach Preview-Deploy mit Echtdaten nochmals beobachtet werden.
