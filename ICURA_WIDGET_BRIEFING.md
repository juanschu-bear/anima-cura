# iCura — In-App AI Assistant Widget

## Vision

A browser-based AI assistant that lives inside Anima Cura — available on every page, context-aware, voice-enabled, and capable of visually guiding the user through the UI. Think Clicky (farzaa/clicky), but as a web widget instead of a native macOS app.

Long-term, the widget will be extracted into its own repo as a standalone open-source product that can be embedded in any web app. For now, we build it directly inside Anima Cura.

## Tech Stack

- **Framework:** React 18, TypeScript
- **Styling:** Tailwind CSS + CSS Custom Properties (Anima Cura design tokens)
- **State:** zustand (already installed)
- **Icons:** lucide-react@0.383.0
- **Voice:** Web Speech API (SpeechRecognition + SpeechSynthesis)
- **Backend:** Existing endpoint `POST /api/workflows/assist` (SSE stream with Anthropic SDK)
- **NO new dependencies** except optionally `framer-motion` for animations

## Design Tokens (must use!)

```css
--ac-primary: #5b4de1;
--ac-bg: #f2f4f9;
--ac-surface: #ffffff;
--ac-border: #e5e8ef;
--ac-text: #243752;
--ac-text-soft: #607794;
--ac-shadow: 0 12px 28px rgba(26, 44, 68, 0.08);
```

Dark mode via `data-theme="dark"` on `:root`.

## What to Build

### 1. Floating Button (Global)

A floating button in the bottom-right corner on EVERY page of the app.

- **Position:** `fixed`, bottom-right, `z-index: 9999`
- **Appearance:** Round button (56px), Sparkles icon or custom iCura logo, subtle glow/pulse effect when idle, stronger glow when active
- **Animation:** Smooth fade-in on page load, subtle bounce on hover
- **Dark mode:** Must look great in both themes

### 2. Chat Panel

Clicking the button opens a chat panel.

- **Position:** Fixed, bottom-right, above the button
- **Size:** ~380px wide, ~520px tall, resizable from top edge
- **Animation:** Smooth slide-up + fade-in, not abrupt
- **Header:** "iCura" + subtitle "AI Assistant" + Close button + Minimize button
- **Chat area:** Scrollable message list, user messages (right, primary color) and iCura messages (left, surface color)
- **Input area:** Text field + Send button + Voice button (microphone icon)
- **Quick actions:** Context-dependent chips at the top of the chat based on the current page

### 3. Voice Input/Output

**Input (Speech-to-Text):**
- Microphone button in the input area
- Click = Push-to-Talk (records while pressed)
- Or: Toggle mode (click to start, click to stop)
- Web Speech API `SpeechRecognition`
- Visual indicator that it's listening (pulsating ring around the button)
- Live transcription appears in the text field

**Output (Text-to-Speech):**
- iCura responses are optionally read aloud
- Web Speech API `SpeechSynthesis`
- Toggle in chat settings: "Read answers aloud" on/off
- German voice as default, English when locale=en

### 4. Context Awareness

iCura knows which page the user is on and what data is displayed.

**Context to collect (sent with every message):**

```typescript
interface AppContext {
  currentPage: string;        // e.g. "/patienten", "/automatisierungen"
  locale: string;             // "de" or "en"
  theme: string;              // "light" or "dark"
  patientCount?: number;      // When on overview
  selectedPatient?: {         // When on patient detail
    name: string;
    id: string;
    behandlung?: string;
  };
  activeWorkflows?: number;   // When on automations
  openRaten?: number;         // When available
}
```

**Include context in the API call:**
The existing `/api/workflows/assist` endpoint must be extended with a `context` parameter. The system prompt is augmented with the context.

### 5. UI Highlighting (the "Clicky" Feature)

When iCura tells the user "Click on Payments in the sidebar", the element should be visually highlighted.

**Mechanism:**
- iCura responses can contain special tags: `[highlight:selector]` or `[navigate:/path]`
- The frontend parses these tags and executes the action
- Highlighting: CSS overlay with pulsating ring around the target element
- Navigation: `router.push()` to the specified route

**Tool-Use in the backend:**
Extend the `/api/workflows/assist` endpoint with a new tool:

```typescript
{
  name: "guide_user",
  description: "Visually guides the user to a UI element or page",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["highlight", "navigate", "open_chat"] },
      target: { type: "string", description: "CSS selector or path" },
      explanation: { type: "string", description: "What the user will find there" }
    },
    required: ["action", "target", "explanation"]
  }
}
```

**Known selectors/paths:**
```
/uebersicht — Overview
/zahlungen — Payments
/patienten — Patients
/ratenplan — Rate Plans
/mahnwesen — Dunning
/quartal — Quarterly Report
/automatisierungen — Automations
/import — Data Import
/einstellungen — Settings
[data-nav="zahlungen"] — Sidebar link to Payments
[data-nav="patienten"] — Sidebar link to Patients
.btn-primary — Primary action button on the current page
```

### 6. Quick-Action Chips

Context-dependent suggestions at the top of the chat panel:

**On /uebersicht:**
- "Show critical patients"
- "What's the payment rate?"
- "Create a new automation"

**On /patienten:**
- "Search for a patient"
- "How many children are registered?"
- "Find patients without email"

**On /automatisierungen:**
- "Create a payment reminder"
- "Build an escalation pipeline"
- "Set up chargeback alert"

**On /zahlungen:**
- "How do I set up the bank connection?"
- "What are chargebacks?"
- "Show open assignments"

**On /import:**
- "How do I export from IVORIS?"
- "Which formats are supported?"
- "Upload a CSV"

**On /einstellungen:**
- "Add a user"
- "Set up email provider"
- "Configure bank connection"

### 7. System Prompt Extension

The system prompt for the assist endpoint must be extended:

```
You are iCura, the AI assistant of Anima Cura. You live as a widget inside the app and help the user with everything.

YOUR CONTEXT:
- You know which page the user is on
- You know the app structure and can navigate the user to any page
- You can highlight UI elements to show the user where to click
- You respond in the language the user writes in

YOUR CAPABILITIES:
1. Answer questions about the app, features, data
2. Create workflows (as before)
3. Visually guide the user through the app (highlight, navigate)
4. Interpret and explain data from the app
5. Give recommendations based on context

PERSONALITY:
- Friendly, competent, not pushy
- Prefer short answers (2-3 sentences when possible)
- Ask follow-up questions on complex topics rather than guessing
- Address the user formally ("Sie" in German)
```

### 8. Cross-Page Workflow Creation

The most important feature: the user can say "Create an automation for payment reminders" from ANY page and iCura will:

1. Automatically navigate to `/automatisierungen` (via `guide_user` tool with `action: "navigate"`)
2. Create the workflow via the existing `propose_workflow` tool
3. Place the nodes on the canvas
4. Show the user the result and ask whether to activate it

**Backend flow:**
- If `context.currentPage !== "/automatisierungen"` and the user asks for an automation:
  - First call `guide_user({ action: "navigate", target: "/automatisierungen" })`
  - Then call `propose_workflow(...)` with nodes/edges
- The frontend navigates the user, waits briefly, then injects the workflow into the editor

**Same applies to other actions:**
- "Show me patient Mueller" → navigate to `/patienten`, fill in search
- "Import a CSV" → navigate to `/import`
- "How's my quarterly report?" → navigate to `/quartal`

## File Structure

```
src/components/icura/
  ICuraWidget.tsx           — Floating button + panel container
  ICuraChat.tsx             — Chat message view
  ICuraInput.tsx            — Text field + voice + send
  ICuraVoice.tsx            — Web Speech API wrapper
  ICuraHighlight.tsx        — UI highlighting overlay
  ICuraQuickActions.tsx     — Context-dependent chips
  ICuraProvider.tsx         — Context provider (wraps the app)
  useICura.ts               — Zustand store for iCura state
  types.ts                  — TypeScript types
```

## Integration into the App

In `src/app/(dashboard)/layout.tsx`, include the provider and widget:

```tsx
import { ICuraProvider } from "@/components/icura/ICuraProvider";
import { ICuraWidget } from "@/components/icura/ICuraWidget";

// In the layout:
<ICuraProvider>
  <div className="ac-shell">
    {/* ... existing layout ... */}
  </div>
  <ICuraWidget />
  <ICuraHighlight />
</ICuraProvider>
```

## Backend Changes

The `/api/workflows/assist` endpoint must be extended:

1. **New parameter `context`** in request body (AppContext object)
2. **New tool `guide_user`** for navigation and highlighting
3. **Extended system prompt** with app structure and context
4. **Mode parameter:** `mode: "workflow" | "assistant"` — in the workflow builder, the old behavior remains; everywhere else, the new assistant mode
5. **Cross-page actions:** When a user requests a workflow from a non-automation page, chain `guide_user` (navigate) + `propose_workflow` in sequence

## Design Requirements

- **Premium, futuristic** — no generic chat widget
- Subtle glassmorphism effects on the panel (backdrop-blur)
- Smooth animations everywhere (open/close, messages, highlighting)
- The floating button should feel alive (subtle idle animation)
- Voice indicator should be visually impressive (pulsating ring, waveform)
- Highlighting should be smooth (not abrupt box-shadow, but animated glow)
- Dark mode must look equally good as light mode
- Mobile-responsive: On small screens the panel goes fullscreen

## Important Notes

1. `"use client"` on all components
2. Voice is optional — if the browser doesn't support Web Speech API, show text input only
3. The existing iCura chat in the workflow builder (`src/components/workflows/ICuraChat.tsx`) stays — the new widget is additional and global
4. Sidebar links need `data-nav` attributes for highlighting (add in layout.tsx)
5. All texts bilingual via `t()` from `src/lib/i18n.ts`
6. Build must pass (`npm run build`)
7. No localStorage — use Zustand store for session state
8. The widget is designed for future extraction into its own repo — keep it self-contained with minimal coupling to Anima Cura internals
