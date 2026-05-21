# iCura Voice Companion — Codex Briefing

## What This Is

A Clicky-style (github.com/farzaa/clicky) voice-first AI companion that lives as a floating button in the Anima Cura web app. NOT a chat panel. NOT text-first. The user holds a button, speaks, releases, and iCura responds with voice while visually guiding through the UI.

## Repo

github.com/juanschu-bear/anima-cura (branch: main)

## Interaction Flow

1. User sees a floating round button (bottom-right corner, always visible)
2. User HOLDS the button (or clicks to toggle) — microphone activates, visual indicator shows "listening"
3. User speaks: "Show me patients without email"
4. User RELEASES — audio is sent to backend
5. Backend: Audio → Speech-to-Text → Anthropic Claude → Text response + optional actions (navigate, highlight)
6. Backend: Response text → ElevenLabs TTS → Audio stream back to frontend
7. Frontend: Plays audio response, shows small floating transcript bubble, executes actions (navigate to page, highlight element)
8. User can INTERRUPT at any time by pressing the button again — audio stops, new recording starts

## Architecture

### Frontend Component

File: `src/components/icura/ICuraVoiceCompanion.tsx`

This REPLACES the existing `src/components/icura/ICuraGuide.tsx` (which is a chat widget — remove it).

**Elements:**
- **Floating button** (56px, fixed bottom-right, z-index 99999)
  - Idle: subtle breathing glow animation
  - Listening: pulsating ring, microphone icon, red tint
  - Processing: spinning/loading animation
  - Speaking: waveform animation or speaker icon pulse
- **Transcript bubble** (small floating text above the button)
  - Shows user's transcribed speech (fades in)
  - Then shows iCura's response text (fades in, auto-hides after audio finishes)
  - NOT a full chat panel — just a single bubble, max 3 lines with overflow
- **Highlight overlay** (full-screen transparent overlay)
  - When iCura says to look at something, a glowing ring appears around that element
  - Ring animates in, pulses 3x, fades out
  - Element scrolls into view smoothly

**NO chat panel. NO message history visible. NO text input field.** Just the button + bubble + highlights.

### Backend Route

File: `src/app/api/icura/voice/route.ts`

**POST endpoint** that accepts audio and returns audio.

Request: `multipart/form-data` with:
- `audio`: WebM/Opus blob from MediaRecorder
- `context`: JSON string with `{ currentPage, locale, theme }`

Response: `audio/mpeg` stream (ElevenLabs TTS output)

Additionally, response headers:
- `X-ICura-Text`: URL-encoded response text (for the transcript bubble)
- `X-ICura-Actions`: URL-encoded JSON array of actions `[{ type, target, explanation }]`

### Backend Flow (inside the route)

```
1. Receive audio blob
2. Send to speech-to-text service:
   - Option A: OpenAI Whisper API (best accuracy, needs OPENAI_API_KEY)
   - Option B: AssemblyAI (what Clicky uses)
   - Option C: Google Cloud Speech-to-Text
   Pick whichever is simplest. Whisper recommended.
   
3. Transcribed text + context → Anthropic Claude
   - Model: claude-sonnet-4-6
   - System prompt includes: current page, available actions, app structure
   - Tools: guide_user (navigate/highlight), propose_workflow
   
4. Claude response text → ElevenLabs TTS
   - API Key: process.env.ELEVENLABS_API_KEY
   - Voice ID: process.env.ELEVENLABS_VOICE_ID (default: NE7AIW5DoJ7lUosXV2KR)
   - Model: eleven_multilingual_v2
   - Stream the audio response back
   
5. Return audio/mpeg with action headers
```

### Speech-to-Text Setup

If using OpenAI Whisper:
```typescript
const formData = new FormData();
formData.append("file", audioBlob, "audio.webm");
formData.append("model", "whisper-1");
formData.append("language", locale === "de" ? "de" : "en");

const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: formData,
});
const { text } = await whisperRes.json();
```

Env variable needed: `OPENAI_API_KEY` (must be set in Vercel)

If OpenAI is not available, fall back to Web Speech API on the frontend (already captures text) and send the text string instead of audio.

### Frontend Audio Recording

```typescript
// MediaRecorder for capturing voice
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
const chunks: Blob[] = [];
recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: "audio/webm" });
  sendToBackend(blob);
};

// Start on button press
recorder.start();
// Stop on button release
recorder.stop();
```

### Frontend Audio Playback

```typescript
// Play ElevenLabs audio response
const res = await fetch("/api/icura/voice", { method: "POST", body: formData });
const audioBlob = await res.blob();
const url = URL.createObjectURL(audioBlob);
const audio = new Audio(url);

// Read actions from headers
const actions = JSON.parse(decodeURIComponent(res.headers.get("X-ICura-Actions") || "[]"));
const text = decodeURIComponent(res.headers.get("X-ICura-Text") || "");

// Show transcript
setTranscript(text);

// Play audio
audio.play();

// Execute actions after short delay
setTimeout(() => executeActions(actions), 500);

// User interrupts: stop audio
audio.pause();
audio.currentTime = 0;
```

### Anthropic System Prompt

```
You are iCura, a voice AI assistant for Anima Cura, a dental practice management tool.

The user is speaking to you via voice. Keep responses SHORT — 1 to 3 sentences max. You will be converted to speech, so write naturally as if speaking.

CURRENT PAGE: {currentPage}
LOCALE: {locale}

YOU CAN:
1. Answer questions about the app
2. Navigate the user: use guide_user tool with action "navigate" and target path
3. Highlight UI elements: use guide_user tool with action "highlight" and CSS selector
4. Create workflows: use propose_workflow tool (navigate to /automatisierungen first)

APP STRUCTURE:
- /uebersicht — Overview dashboard with patient stats
- /zahlungen — Payment transactions and bank sync
- /patienten — Patient list (4601 patients)
- /ratenplan — Rate plans / installment management
- /mahnwesen — Dunning pipeline with drag & drop
- /quartal — Quarterly report with charts
- /automatisierungen — Visual workflow builder (n8n style)
- /import — CSV/DATEV data import
- /einstellungen — Settings (password protected)

SIDEBAR SELECTORS:
[data-nav="uebersicht"], [data-nav="zahlungen"], [data-nav="patienten"], etc.

PERSONALITY:
- Speak naturally, as if talking to a colleague
- Be concise — this is voice, not text
- Use "Sie" in German
- If you don't know something, say so briefly
```

### Integration

In `src/app/(dashboard)/layout.tsx`:

```tsx
import ICuraVoiceCompanion from "@/components/icura/ICuraVoiceCompanion";

// Add before closing </div> of the shell:
<ICuraVoiceCompanion />
```

Remove the import of `ICuraGuide` if it exists.

Add `data-nav` attributes to sidebar links:
```tsx
<Link href={item.href} data-nav={item.href.slice(1)} ...>
```

### Env Variables Needed

All in Vercel:
- `ELEVENLABS_API_KEY` — already set
- `ELEVENLABS_VOICE_ID` — already set  
- `OPENAI_API_KEY` — MUST BE ADDED for Whisper STT
- `ANTHROPIC_API_KEY` — already set

### Design Requirements

- The button must feel ALIVE — breathing animation, responsive to state changes
- Transcript bubble: glassmorphism, small, appears/disappears smoothly
- Highlight ring: animated glow that feels premium, not a red box
- All animations CSS-only or minimal JS, 60fps
- Dark mode must look equally good
- Mobile: button smaller (48px), bubble narrower

### What NOT to Build

- No chat panel
- No message history
- No text input field
- No settings drawer
- Keep it minimal — button + bubble + highlights, nothing else

### Dependencies to Install

```bash
npm install openai
```

(for Whisper STT — the `openai` npm package)

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/icura/ICuraVoiceCompanion.tsx` | CREATE — main component |
| `src/app/api/icura/voice/route.ts` | CREATE — voice processing endpoint |
| `src/app/(dashboard)/layout.tsx` | MODIFY — add component + data-nav attributes |
| `src/components/icura/ICuraGuide.tsx` | DELETE — replaced by VoiceCompanion |

### Test Plan

1. Open any page
2. Hold the floating button — microphone indicator appears
3. Say "Show me the patients page"
4. Release — processing animation
5. iCura responds with voice: "I'll take you to the patients page"
6. Sidebar "Patients" link gets a highlight glow
7. App navigates to /patienten
8. Transcript bubble shows the response text, fades out after 5 seconds
9. Say "How many patients do we have?" — iCura answers with voice
10. While iCura is speaking, press button again — audio stops, new recording starts
