# iCura — In-App AI Assistant Widget

## Vision

Ein Browser-basierter AI-Assistent der in Anima Cura lebt — auf jeder Seite verfügbar, kontextbewusst, sprachgesteuert, und in der Lage den User visuell durch die App zu führen. Think Clicky (farzaa/clicky), aber als Web-Widget statt native macOS App.

Langfristig wird das Widget in eine eigene Repo extrahiert als eigenständiges Open-Source-Produkt das in jede Web-App eingebettet werden kann. Für jetzt bauen wir es direkt in Anima Cura.

## Tech Stack

- **Framework:** React 18, TypeScript
- **Styling:** Tailwind CSS + CSS Custom Properties (Anima Cura Design Tokens)
- **State:** zustand (bereits installiert)
- **Icons:** lucide-react@0.383.0
- **Voice:** Web Speech API (SpeechRecognition + SpeechSynthesis)
- **Backend:** Bestehender Endpoint `POST /api/workflows/assist` (SSE Stream mit Anthropic SDK)
- **KEINE neuen Dependencies** außer ggf. `framer-motion` für Animationen (optional)

## Design Tokens (verwenden!)

```css
--ac-primary: #5b4de1;
--ac-bg: #f2f4f9;
--ac-surface: #ffffff;
--ac-border: #e5e8ef;
--ac-text: #243752;
--ac-text-soft: #607794;
--ac-shadow: 0 12px 28px rgba(26, 44, 68, 0.08);
```

Dark Mode über `data-theme="dark"` auf `:root`.

## Was gebaut werden muss

### 1. Floating Button (Global)

Ein schwebender Button unten rechts auf JEDER Seite der App.

- **Position:** `fixed`, bottom-right, `z-index: 9999`
- **Aussehen:** Runder Button (56px), Sparkles-Icon oder custom iCura-Logo, subtiler Glow/Pulse-Effekt wenn idle, stärkerer Glow wenn aktiv
- **Animation:** Sanftes Einblenden beim Seitenload, leichte Bounce-Animation beim Hover
- **Dark Mode:** Muss in beiden Themes gut aussehen

### 2. Chat-Panel

Klick auf den Button öffnet ein Chat-Panel.

- **Position:** Fixed, bottom-right, oberhalb des Buttons
- **Größe:** ~380px breit, ~520px hoch, resizable am oberen Rand
- **Animation:** Smooth slide-up + fade-in, nicht abrupt
- **Header:** "iCura" + Subtitle "AI-Assistent" + Close-Button + Minimize-Button
- **Chat-Bereich:** Scrollbare Message-Liste, Nachrichten von User (rechts, primary-Farbe) und iCura (links, surface-Farbe)
- **Input-Bereich:** Textfeld + Send-Button + Voice-Button (Mikrofon-Icon)
- **Quick-Actions:** Kontextabhängige Chips oben im Chat basierend auf der aktuellen Seite

### 3. Voice Input/Output

**Input (Speech-to-Text):**
- Mikrofon-Button im Input-Bereich
- Klick = Push-to-Talk (hält die Aufnahme solange gedrückt)
- Oder: Toggle-Mode (Klick startet, Klick stoppt)
- Web Speech API `SpeechRecognition`
- Visueller Indikator dass zugehört wird (pulsierender Ring um den Button)
- Transkription erscheint live im Textfeld

**Output (Text-to-Speech):**
- iCura-Antworten werden optional vorgelesen
- Web Speech API `SpeechSynthesis`
- Toggle in den Chat-Settings: "Antworten vorlesen" an/aus
- Deutsche Stimme als Default, Englische wenn locale=en

### 4. Kontext-Bewusstsein

iCura weiß auf welcher Seite der User ist und was angezeigt wird.

**Kontext sammeln (bei jedem Message-Send mitschicken):**

```typescript
interface AppContext {
  currentPage: string;        // z.B. "/patienten", "/automatisierungen"
  locale: string;             // "de" oder "en"
  theme: string;              // "light" oder "dark"
  patientCount?: number;      // Wenn auf Übersicht
  selectedPatient?: {         // Wenn auf Patient-Detail
    name: string;
    id: string;
    behandlung?: string;
  };
  activeWorkflows?: number;   // Wenn auf Automatisierungen
  openRaten?: number;         // Wenn verfügbar
}
```

**Kontext in den API-Call einbauen:**
Der bestehende `/api/workflows/assist` Endpoint muss erweitert werden um einen `context` Parameter. Der System-Prompt wird um den Kontext ergänzt.

### 5. UI-Highlighting (das "Clicky"-Feature)

Wenn iCura dem User sagt "Klick auf Zahlungen in der Sidebar", soll das Element visuell hervorgehoben werden.

**Mechanismus:**
- iCura-Antworten können spezielle Tags enthalten: `[highlight:selector]` oder `[navigate:/path]`
- Das Frontend parsed diese Tags und führt die Aktion aus
- Highlighting: CSS-Overlay mit pulsierendem Ring um das Ziel-Element
- Navigation: `router.push()` zur angegebenen Route

**Tool-Use im Backend:**
Erweitere den `/api/workflows/assist` Endpoint um ein neues Tool:

```typescript
{
  name: "guide_user",
  description: "Führt den Benutzer visuell zu einem UI-Element oder einer Seite",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["highlight", "navigate", "open_chat"] },
      target: { type: "string", description: "CSS-Selektor oder Pfad" },
      explanation: { type: "string", description: "Was der User dort finden wird" }
    },
    required: ["action", "target", "explanation"]
  }
}
```

**Bekannte Selektoren/Pfade:**
```
/uebersicht — Übersicht
/zahlungen — Zahlungen
/patienten — Patienten
/ratenplan — Ratenpläne
/mahnwesen — Mahnwesen
/quartal — Quartalsbericht
/automatisierungen — Automatisierungen
/import — Datenimport
/einstellungen — Einstellungen
[data-nav="zahlungen"] — Sidebar-Link zu Zahlungen
[data-nav="patienten"] — Sidebar-Link zu Patienten
.btn-primary — Primärer Action-Button auf der aktuellen Seite
```

### 6. Quick-Action Chips

Kontextabhängige Vorschläge oben im Chat-Panel:

**Auf /uebersicht:**
- "Zeig mir kritische Patienten"
- "Wie ist die Zahlungsquote?"
- "Neue Automatisierung erstellen"

**Auf /patienten:**
- "Suche einen Patienten"
- "Wie viele Kinder sind registriert?"
- "Patienten ohne E-Mail finden"

**Auf /automatisierungen:**
- "Erstell eine Zahlungserinnerung"
- "Eskalationspipeline bauen"
- "Rücklastschrift-Alert einrichten"

**Auf /zahlungen:**
- "Wie richte ich die Bankverbindung ein?"
- "Was sind Rücklastschriften?"
- "Offene Zuordnungen zeigen"

**Auf /import:**
- "Wie exportiere ich aus IVORIS?"
- "Welche Formate werden unterstützt?"
- "CSV hochladen"

**Auf /einstellungen:**
- "Benutzer hinzufügen"
- "E-Mail-Provider einrichten"
- "Bankverbindung konfigurieren"

### 7. System-Prompt Erweiterung

Der System-Prompt für den Assist-Endpoint muss erweitert werden:

```
Du bist iCura, der KI-Assistent von Anima Cura. Du lebst als Widget in der App und hilfst dem Benutzer bei allem.

DEIN KONTEXT:
- Du weißt auf welcher Seite der Benutzer ist
- Du kennst die App-Struktur und kannst den Benutzer zu jeder Seite navigieren
- Du kannst UI-Elemente highlighten um dem Benutzer zu zeigen wo er klicken soll
- Du antwortest in der Sprache des Benutzers

DEINE FÄHIGKEITEN:
1. Fragen beantworten über die App, Funktionen, Daten
2. Workflows erstellen (wie bisher)
3. Den Benutzer visuell durch die App führen (highlight, navigate)
4. Daten aus der App interpretieren und erklären
5. Empfehlungen geben basierend auf dem Kontext

PERSÖNLICHKEIT:
- Freundlich, kompetent, nicht aufdringlich
- Kurze Antworten bevorzugen (2-3 Sätze wenn möglich)
- Bei komplexen Themen nachfragen statt raten
- Spricht den Benutzer mit "Sie" an
```

## Dateistruktur

```
src/components/icura/
  ICuraWidget.tsx           — Floating Button + Panel Container
  ICuraChat.tsx             — Chat-Nachrichten-Ansicht
  ICuraInput.tsx            — Textfeld + Voice + Send
  ICuraVoice.tsx            — Web Speech API Wrapper
  ICuraHighlight.tsx        — UI-Highlighting Overlay
  ICuraQuickActions.tsx     — Kontextabhängige Chips
  ICuraProvider.tsx         — Context Provider (wraps the app)
  useICura.ts               — Zustand Store für iCura State
  types.ts                  — TypeScript Types
```

## Integration in die App

In `src/app/(dashboard)/layout.tsx` den Provider und das Widget einbinden:

```tsx
import { ICuraProvider } from "@/components/icura/ICuraProvider";
import { ICuraWidget } from "@/components/icura/ICuraWidget";

// Im Layout:
<ICuraProvider>
  <div className="ac-shell">
    {/* ... existing layout ... */}
  </div>
  <ICuraWidget />
  <ICuraHighlight />
</ICuraProvider>
```

## Backend-Änderungen

Der `/api/workflows/assist` Endpoint muss erweitert werden:

1. **Neuer Parameter `context`** im Request Body (AppContext Objekt)
2. **Neues Tool `guide_user`** für Navigation und Highlighting
3. **Erweiterter System-Prompt** mit App-Struktur und Kontext
4. **Mode-Parameter:** `mode: "workflow" | "assistant"` — im Workflow-Builder bleibt das alte Verhalten, überall sonst der neue Assistenten-Modus

### Cross-Page Workflow-Erstellung

Das wichtigste Feature: Der User kann von JEDER Seite aus sagen "Erstell eine Automatisierung für Zahlungserinnerungen" und iCura:

1. Navigiert automatisch zu `/automatisierungen` (via `guide_user` Tool mit `action: "navigate"`)
2. Erstellt den Workflow über das bestehende `propose_workflow` Tool
3. Legt die Nodes auf den Canvas
4. Zeigt dem User das Ergebnis und fragt ob er es aktivieren möchte

Der Flow im Backend:
- Wenn `context.currentPage !== "/automatisierungen"` und der User nach einer Automatisierung fragt:
  - Erst `guide_user({ action: "navigate", target: "/automatisierungen" })` aufrufen
  - Dann `propose_workflow(...)` mit den Nodes/Edges
- Das Frontend navigiert den User, wartet kurz, und injected dann den Workflow in den Editor

Gleiches gilt für andere Aktionen:
- "Zeig mir Patient Müller" → navigate zu `/patienten`, Suche ausfüllen
- "Importiere eine CSV" → navigate zu `/import`
- "Wie ist mein Quartalsbericht?" → navigate zu `/quartal`

## Design-Anforderungen

- **Premium, futuristisch** — kein generisches Chat-Widget
- Subtile Glassmorphism-Effekte auf dem Panel (backdrop-blur)
- Smooth Animationen überall (open/close, messages, highlighting)
- Der Floating Button soll sich lebendig anfühlen (subtle idle animation)
- Voice-Indikator soll visuell beeindruckend sein (pulsierender Ring, Waveform)
- Highlighting soll smooth sein (nicht abruptes Box-Shadow, sondern animated glow)
- Dark Mode muss genauso gut aussehen wie Light Mode
- Mobile-responsive: Auf kleinen Screens wird das Panel fullscreen

## Wichtige Hinweise

1. `"use client"` auf allen Komponenten
2. Voice ist optional — wenn der Browser die Web Speech API nicht unterstützt, nur Text-Input zeigen
3. Der bestehende iCura Chat im Workflow-Builder (`src/components/workflows/ICuraChat.tsx`) bleibt bestehen — das neue Widget ist zusätzlich und global
4. Sidebar-Links brauchen `data-nav` Attribute für das Highlighting (in layout.tsx hinzufügen)
5. Alle Texte zweisprachig über `t()` aus `src/lib/i18n.ts`
6. Build muss durchgehen (`npm run build`)
7. Kein localStorage — Zustand-Store für Session-State
