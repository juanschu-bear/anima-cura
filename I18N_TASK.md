# Anima Cura — i18n Integration Task

## Aufgabe

Alle hardcoded deutschen Texte in der gesamten App durch das bestehende Translation-System ersetzen. Nach Abschluss muss der Sprach-Toggle (DE/EN oben rechts) die komplette App umschalten — nicht nur Überschriften, sondern jeden sichtbaren Text.

## Bestehendes System

Die Datei `src/lib/i18n.ts` existiert bereits mit 200+ Übersetzungen und einer `t()` Funktion:

```typescript
import { t } from "@/lib/i18n";

// Usage:
t("patients.title", locale)  // → "Patienten" (de) oder "Patients" (en)
```

Der Locale-State kommt aus dem Zustand-Store:
```typescript
import { useAppStore } from "@/hooks/useAppStore";
const { locale } = useAppStore();  // "de" oder "en"
```

## Was gemacht werden muss

### 1. Workflow-Komponenten (Priorität 1)

Diese Dateien haben KEINE Übersetzung — alles hardcoded Deutsch:

```
src/components/workflows/ICuraChat.tsx
src/components/workflows/NodeConfigPanel.tsx
src/components/workflows/TestRunDialog.tsx
src/components/workflows/VersionHistoryDrawer.tsx
src/components/workflows/WorkflowCanvas.tsx
src/components/workflows/WorkflowTemplates.tsx
src/components/workflows/nodes/ActionAlertNode.tsx
src/components/workflows/nodes/ActionEmailNode.tsx
src/components/workflows/nodes/ActionMahnstufeNode.tsx
src/components/workflows/nodes/ActionScoringNode.tsx
src/components/workflows/nodes/ActionWaitNode.tsx
src/components/workflows/nodes/ActionWhatsAppNode.tsx
src/components/workflows/nodes/BaseNode.tsx
src/components/workflows/nodes/ConditionNode.tsx
src/components/workflows/nodes/TriggerNode.tsx
```

Jede dieser Dateien muss:
- `import { t } from "@/lib/i18n"` hinzufügen
- `import { useAppStore } from "@/hooks/useAppStore"` hinzufügen (wenn nicht vorhanden)
- `const { locale } = useAppStore();` im Component Body
- Jeden deutschen String durch `t("key", locale)` ersetzen

Für Node-Komponenten die keine Hooks nutzen können (z.B. weil sie Props-basiert sind), den `locale` als Prop durchreichen vom Parent (`WorkflowCanvas.tsx`).

### 2. Dashboard-Seiten (Priorität 2)

Diese Seiten nutzen teilweise `isGerman ? "..." : "..."` — das muss auf `t()` umgestellt werden:

```
src/app/(dashboard)/uebersicht/page.tsx
src/app/(dashboard)/patienten/page.tsx
src/app/(dashboard)/patienten/[id]/page.tsx
src/app/(dashboard)/zahlungen/page.tsx
src/app/(dashboard)/mahnwesen/page.tsx
src/app/(dashboard)/ratenplan/page.tsx
src/app/(dashboard)/quartal/page.tsx
src/app/(dashboard)/einstellungen/page.tsx
src/app/(dashboard)/automatisierungen/page.tsx
```

Ersetze alle `isGerman ? "Deutsch" : "English"` Patterns durch `t("key", locale)`.

### 3. Layout

```
src/app/(dashboard)/layout.tsx
```

Navigation-Labels, Tooltip-Texte, "System aktiv", "Praxisleitung" etc.

### 4. UI-Komponenten

```
src/components/ui/index.tsx
src/components/charts/index.tsx
```

Prüfe ob dort hardcoded Strings sind.

### 5. Fehlende Übersetzungen in i18n.ts ergänzen

Wenn ein String in den Komponenten existiert der noch nicht in `src/lib/i18n.ts` als Key vorhanden ist, füge ihn hinzu. Halte die bestehende Struktur bei:

```typescript
"section.keyName": { de: "Deutscher Text", en: "English text" },
```

Verwende folgende Sections für neue Keys:
- `workflow.` — für alle Workflow-Builder Texte
- `nodes.` — für Node-Labels und Beschreibungen
- `config.` — für Config-Panel Labels
- `chat.` — für iCura Chat Texte
- `templates.` — für Workflow-Template Namen/Beschreibungen

## Regeln

1. **Kein String darf hardcoded Deutsch bleiben** wenn er im UI sichtbar ist
2. **Console.log/error bleiben Englisch** — die sind nicht User-facing
3. **E-Mail-Templates bleiben Deutsch** — die gehen an deutschsprachige Patienten
4. **Variablen-Platzhalter** (`{{patient_name}}` etc.) bleiben unübersetzt
5. **Keine neuen Dependencies** — nur `src/lib/i18n.ts` und `useAppStore`
6. **Build muss durchgehen** — `npm run build` ohne Fehler
7. **Bestehende Funktionalität nicht ändern** — nur Strings ersetzen, keine Logik-Änderungen

## Test

Nach Abschluss:
1. App laden, auf EN umschalten
2. Jede Seite durchgehen: Übersicht, Zahlungen, Patienten, Patient-Detail, Ratenpläne, Mahnwesen, Quartal, Automatisierungen, Einstellungen
3. Workflow-Builder öffnen, neuen Workflow erstellen, Nodes konfigurieren, iCura Chat nutzen
4. Alles muss auf Englisch sein. Kein deutscher String sichtbar (außer E-Mail-Templates).
5. Zurück auf DE — alles wieder Deutsch.
