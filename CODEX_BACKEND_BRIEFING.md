# Anima Cura — Backend Briefing für Codex

## Projektkontext

Anima Cura ist ein Praxisverwaltungstool für eine kieferorthopädische Praxis. Das Frontend ist Next.js 14 auf Vercel, die Datenbank ist Supabase (PostgreSQL). Das Frontend hat einen visuellen Workflow-Builder (React Flow) in dem Benutzer Automationen zusammenbauen können (z.B. "Wenn Rate 6 Tage überfällig → E-Mail an Patient senden").

Codex baut die Backend-Logik die diese Workflows ausführt und einen AI-Assistenten der beim Erstellen hilft.

## Tech Stack

- **Runtime:** Node.js, Next.js 14 API Routes (`src/app/api/...`)
- **Database:** Supabase (PostgreSQL + REST API)
- **DB Client:** `@supabase/supabase-js` — Server-Client via `createServerClient()` aus `src/lib/db/supabase.ts`
- **AI:** Anthropic SDK (`@anthropic-ai/sdk`, bereits installiert)
- **E-Mail:** Resend (muss installiert werden: `npm install resend`)
- **Alle API Routes** brauchen `export const runtime = "nodejs";`
- **Env-Variables** (alle bereits in Vercel gesetzt außer RESEND_API_KEY):
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `ANTHROPIC_API_KEY`
  - `RESEND_API_KEY` (neu, muss gesetzt werden)

## Bestehende Supabase-Tabellen (relevant)

```
patients         — 4607 Patienten mit email, telefon, mobiltelefon, vorname, nachname
raten            — Einzelne Raten (rate_nummer, betrag, faellig_am, status, mahnstufe, patient_id)
ratenplaene      — Ratenpläne pro Patient (gesamtbetrag, anzahl_raten, rate_betrag)
mahnungen        — Mahnungs-Records
alerts           — Interne Benachrichtigungen (typ, titel, beschreibung, schweregrad, empfaenger)
einstellungen    — Key-Value Config Store (key TEXT, value JSONB)
```

## Neue Tabellen (SQL bereits vom Auftraggeber ausgeführt)

```sql
workflow_assistant_sessions (
  id uuid pk,
  workflow_id uuid nullable,
  messages jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

workflow_runs (
  id uuid pk,
  workflow_id uuid not null,
  status text default 'pending',
  trigger_event text,
  started_at timestamptz default now(),
  finished_at timestamptz,
  result jsonb,
  error text
);
```

---

## Aufgabe 1: AI Workflow Assistant

### Datei: `src/app/api/workflows/assist/route.ts`

**POST Endpoint** der einen AI-Chat-Assistenten bereitstellt der Benutzern hilft Workflows zu erstellen.

### Request

```typescript
interface AssistRequest {
  sessionId?: string;       // Bestehende Session fortsetzen
  message: string;          // User-Nachricht auf Deutsch
  currentWorkflow?: {       // Aktueller Workflow im Editor (optional)
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
}
```

### Response (SSE Stream)

Server-Sent Events Stream mit Token-by-Token Ausgabe. Am Ende kommt ein finales JSON-Event:

```typescript
// Entweder eine Rückfrage:
{ type: "question", text: "Soll die Erinnerung auch per WhatsApp gehen?" }

// Oder ein Workflow-Vorschlag:
{ type: "proposal", rationale: "...", nodes: WorkflowNode[], edges: WorkflowEdge[] }
```

### Anthropic SDK Setup

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const stream = anthropic.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  system: [
    {
      type: "text",
      text: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" }  // Prompt-Caching
    }
  ],
  messages: sessionMessages,  // Letzte 8 Messages aus der Session
  tools: [
    {
      name: "propose_workflow",
      description: "Schlägt einen kompletten Workflow vor mit Nodes und Edges",
      input_schema: {
        type: "object",
        properties: {
          rationale: { type: "string", description: "Kurze Erklärung auf Deutsch warum dieser Workflow so aufgebaut ist" },
          nodes: { type: "array", items: { "$ref": "#/$defs/WorkflowNode" } },
          edges: { type: "array", items: { "$ref": "#/$defs/WorkflowEdge" } }
        },
        required: ["rationale", "nodes", "edges"]
      }
    },
    {
      name: "ask_clarification",
      description: "Stellt eine Rückfrage wenn Informationen fehlen",
      input_schema: {
        type: "object",
        properties: {
          question: { type: "string", description: "Rückfrage auf Deutsch" }
        },
        required: ["question"]
      }
    }
  ]
});
```

### System-Prompt (muss enthalten)

```
Du bist der Workflow-Assistent von Anima Cura, einem Praxisverwaltungstool für eine kieferorthopädische Praxis.

Du hilfst beim Erstellen von Automationen. Antworte immer auf Deutsch.

VERFÜGBARE NODE-TYPEN:

1. trigger — Auslöser
   Events: "rate_ueberfaellig", "ruecklastschrift", "taeglicher_cron", "scoring_kritisch"
   Data: { event: string, delayDays?: number, threshold?: number, cronTime?: string }

2. condition — Bedingung
   Data: { field: string, operator: "equals"|"gt"|"lt"|"contains"|"exists", value: string }
   Felder: "mahnstufe", "versicherung_status", "email", "mobiltelefon", "kasse", "scoring"

3. action_email — E-Mail senden
   Data: { to: "patient"|"versicherungsnehmer"|"praxisleitung", subject: string, body: string }

4. action_whatsapp — WhatsApp senden (Coming Soon)
   Data: { to: "patient"|"versicherungsnehmer", message: string }

5. action_alert — Interne Benachrichtigung
   Data: { severity: "info"|"warnung"|"kritisch", recipient: "alle"|"praxisleitung", title: string, message: string }

6. action_mahnstufe — Mahnstufe ändern
   Data: { action: "increase"|"set", targetStufe?: number }

7. action_scoring — Scoring anpassen
   Data: { action: "decrease"|"set", points: number }

TEMPLATE-VARIABLEN für E-Mail/WhatsApp:
{{patient_name}}, {{rate_nummer}}, {{betrag}}, {{faellig_am}}, {{mahnstufe}}, {{scoring}}, {{praxis_name}}, {{praxis_iban}}

HAUSSTIL:
- Mahnungen freundlich-bestimmt formulieren
- Immer "Sie"-Form
- Absender: Kieferorthopädische Praxis Dr. Elena Schubert, Nikolaistraße 20, 04109 Leipzig

FEW-SHOT BEISPIELE:

Beispiel 1 — Einfacher Trigger:
User: "Erstell eine Erinnerung wenn eine Rate 7 Tage überfällig ist"
→ propose_workflow mit:
  - Node: trigger (rate_ueberfaellig, delayDays: 7)
  - Node: action_email (an Patient, freundliche Erinnerung)
  - Edge: trigger → action_email

Beispiel 2 — Mit Bedingung:
User: "E-Mail-Erinnerung aber nur wenn der Patient eine E-Mail hat"
→ propose_workflow mit:
  - Node: trigger (rate_ueberfaellig, delayDays: 6)
  - Node: condition (field: "email", operator: "exists")
  - Node: action_email
  - Edges: trigger → condition → action_email

Beispiel 3 — Verzweigung:
User: "Eskalation: erst E-Mail, dann nach 21 Tagen formelle Mahnung"
→ propose_workflow mit:
  - Node: trigger (rate_ueberfaellig, delayDays: 6)
  - Node: action_email (freundliche Erinnerung)
  - Node: trigger2 (rate_ueberfaellig, delayDays: 21)
  - Node: action_email2 (formelle Mahnung)
  - Node: action_mahnstufe (increase)
  - Edges: trigger → action_email, trigger2 → action_email2 → action_mahnstufe
```

### Session-Management

- Wenn `sessionId` gegeben: Messages aus `workflow_assistant_sessions` laden
- Neue Messages (User + Assistant) an das Array appenden
- Nur die letzten 8 Messages an Anthropic senden
- Nach jeder Antwort die Session updaten

### Validierung

- Tool-Output mit Zod validieren bevor er zurückgegeben wird
- Node-IDs müssen eindeutig sein
- Edges müssen auf existierende Node-IDs verweisen
- Ungültige Proposals abfangen und als Fehler-Nachricht zurückgeben

---

## Aufgabe 2: Workflow Execution Engine

### Datei: `src/app/api/workflows/execute/route.ts`

**POST Endpoint** der einen gespeicherten Workflow ausführt.

### Request

```typescript
{ workflowId: string }
```

### Ablauf

1. Workflow aus `einstellungen` laden (Key: `workflows`, Value ist ein JSON-Array von Workflows, jeder hat `id`, `name`, `nodes`, `edges`, `active`)
2. Trigger-Node finden (es gibt immer genau einen pro Workflow)
3. Edges folgen und Nodes sequenziell ausführen:
   - **condition**: Bedingung auswerten, wenn falsch → Execution stoppen
   - **action_email**: E-Mail senden (siehe Aufgabe 3)
   - **action_whatsapp**: In `workflow_runs` loggen als "whatsapp_pending" (WhatsApp-Service ist noch nicht live)
   - **action_alert**: Alert in `alerts`-Tabelle erstellen
   - **action_mahnstufe**: `raten`-Tabelle updaten (mahnstufe erhöhen)
   - **action_scoring**: Für später vorbereiten (scoring-Spalte existiert noch nicht)
4. Ergebnis in `workflow_runs` speichern

### Batch-Execution für Cron

Zusätzlich: `GET /api/workflows/execute-all`
- Lädt alle aktiven Workflows aus `einstellungen`
- Für jeden Workflow mit Trigger-Event "taeglicher_cron": Execute
- Für jeden Workflow mit Trigger-Event "rate_ueberfaellig": Prüfe welche Raten die Bedingung erfüllen (delayDays überfällig), führe den Workflow für jeden betroffenen Patienten aus
- CRON_SECRET Header prüfen (wie bestehender Cron-Endpoint)

---

## Aufgabe 3: E-Mail Service

### Datei: `src/lib/services/email-send.ts`

```typescript
import { Resend } from "resend";

interface SendEmailParams {
  to: string;           // Empfänger E-Mail
  subject: string;      // Betreff
  body: string;         // HTML oder Text
  from?: string;        // Absender (Default aus Config)
}

export async function sendEmail(params: SendEmailParams): Promise<{ ok: boolean; error?: string }> {
  // 1. Config aus Supabase laden: einstellungen.key = 'email_provider'
  //    Format: { provider: "resend", api_key: "re_xxx", from: "praxis@anima-cura.app" }
  //
  // 2. Wenn kein Config: Fallback auf process.env.RESEND_API_KEY
  //
  // 3. Template-Variablen im Body ersetzen ({{patient_name}} etc.)
  //
  // 4. Senden via Resend:
  //    const resend = new Resend(apiKey);
  //    await resend.emails.send({ from, to, subject, html: body });
  //
  // 5. Ergebnis loggen in audit_log Tabelle
}
```

### Template-Variable Replacement

```typescript
function replaceTemplateVars(text: string, context: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || `{{${key}}}`);
}
```

Context wird aus dem Patienten-Record gebaut:
```typescript
{
  patient_name: `${patient.vorname} ${patient.nachname}`,
  rate_nummer: String(rate.rate_nummer),
  betrag: rate.betrag.toLocaleString("de-DE"),
  faellig_am: new Date(rate.faellig_am).toLocaleDateString("de-DE"),
  mahnstufe: String(rate.mahnstufe || 0),
  praxis_name: "Kieferorthopädische Praxis Dr. Elena Schubert",
  praxis_iban: "DE XX XXXX XXXX XXXX XXXX XX",  // Aus einstellungen laden
}
```

---

## Aufgabe 4: WhatsApp REST API Stub

### Datei: `src/app/api/whatsapp/send/route.ts`

Platzhalter-Endpoint der den WhatsApp-Versand vorbereitet. Wenn der Baileys-Service später läuft, ruft dieser Endpoint ihn auf.

```typescript
export async function POST(request: Request) {
  const { to, message, patientId } = await request.json();
  
  // 1. Prüfe ob WhatsApp-Service konfiguriert ist
  //    einstellungen.key = 'whatsapp_service'
  //    Format: { enabled: true, endpoint: "http://localhost:3001/send" }
  
  // 2. Wenn enabled: fetch(endpoint, { method: "POST", body: { to, message } })
  //    Wenn nicht enabled: Log als "whatsapp_pending" und return { ok: false, reason: "not_configured" }
  
  // 3. Ergebnis in audit_log speichern
  
  // 4. Return { ok: true/false, messageId?: string }
}
```

---

## Aufgabe 5: Cron-Integration

### Datei: `src/app/api/cron/route.ts` (bestehend, erweitern)

Nach dem bestehenden IVORIS-Sync und Bank-Sync einen neuen Schritt hinzufügen:

```typescript
// Schritt 4: Workflow-Engine (aktive Workflows ausführen)
try {
  const executeRes = await fetch(`${appUrl}/api/workflows/execute-all`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  results.workflows = executeRes.ok ? await executeRes.json() : { error: `HTTP ${executeRes.status}` };
} catch (e) {
  results.workflows = { error: String(e) };
}
```

---

## Dependencies (installieren)

```bash
npm install resend zod
```

---

## Zusammenfassung der zu erstellenden Dateien

| Datei | Beschreibung |
|-------|-------------|
| `src/app/api/workflows/assist/route.ts` | AI Workflow-Assistent (SSE Stream) |
| `src/app/api/workflows/execute/route.ts` | Einzelnen Workflow ausführen |
| `src/app/api/workflows/execute-all/route.ts` | Alle aktiven Workflows ausführen (für Cron) |
| `src/lib/services/email-send.ts` | E-Mail-Versand via Resend |
| `src/app/api/whatsapp/send/route.ts` | WhatsApp Stub-Endpoint |
| `src/app/api/cron/route.ts` | Bestehend, Workflow-Schritt hinzufügen |

## Wichtige Hinweise

- Alle API-Routes brauchen `export const runtime = "nodejs";`
- Server-Client: `import { createServerClient } from "@/lib/db/supabase";`
- Keine Frontend-Arbeit nötig — nur Backend/API
- Anthropic SDK ist bereits installiert und `ANTHROPIC_API_KEY` ist in Vercel gesetzt
- Alle Texte, Fehlermeldungen und Logs auf Deutsch
- Zod für Validierung nutzen, nicht einfach casten
