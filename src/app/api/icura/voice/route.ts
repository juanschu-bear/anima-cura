import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import OpenAI from "openai";
import { z } from "zod";

export const runtime = "nodejs";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

const contextSchema = z.object({
  currentPage: z.string().default("/uebersicht"),
  locale: z.enum(["de", "en"]).default("de"),
  theme: z.enum(["light", "dark"]).default("light"),
});

const actionSchema = z.object({
  type: z.enum(["navigate", "highlight"]),
  target: z.string().min(1),
  explanation: z.string().default(""),
});

const guideUserSchema = z.object({
  responseText: z.string().min(1),
  actions: z.array(actionSchema).max(4).default([]),
});

const proposeWorkflowSchema = z.object({
  responseText: z.string().min(1),
  rationale: z.string().optional(),
});

const voiceMap = {
  patients: "/patienten",
  overview: "/uebersicht",
  payments: "/zahlungen",
  automations: "/automatisierungen",
  rateplans: "/ratenplan",
  dunning: "/mahnwesen",
  quarterly: "/quartal",
  settings: "/einstellungen",
  import: "/import",
} as const;

function guideUserSchemaInput(): Tool["input_schema"] {
  return {
    type: "object" as const,
    properties: {
      responseText: { type: "string" },
      actions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            type: { type: "string", enum: ["navigate", "highlight"] },
            target: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["type", "target", "explanation"],
        },
      },
    },
    required: ["responseText", "actions"],
  };
}

function proposeWorkflowSchemaInput(): Tool["input_schema"] {
  return {
    type: "object" as const,
    properties: {
      responseText: { type: "string" },
      rationale: { type: "string" },
    },
    required: ["responseText"],
  };
}

function getSystemPrompt(context: z.infer<typeof contextSchema>) {
  return `You are iCura, a voice AI assistant for Anima Cura, a dental practice management tool.

The user is speaking to you via voice. Keep responses SHORT - 1 to 3 sentences max. You will be converted to speech, so write naturally as if speaking.

CURRENT PAGE: ${context.currentPage}
LOCALE: ${context.locale}
THEME: ${context.theme}

YOU CAN:
1. Answer questions about the app
2. Navigate the user: use guide_user tool with action "navigate" and target path
3. Highlight UI elements: use guide_user tool with action "highlight" and CSS selector
4. Create workflows: use propose_workflow tool and then help the user move to /automatisierungen

APP STRUCTURE:
- /uebersicht - Overview dashboard with patient stats
- /zahlungen - Payment transactions and bank sync
- /patienten - Patient list (4601 patients)
- /ratenplan - Rate plans / installment management
- /mahnwesen - Dunning pipeline with drag & drop
- /quartal - Quarterly report with charts
- /automatisierungen - Visual workflow builder (n8n style)
- /import - CSV/DATEV data import
- /einstellungen - Settings (password protected)

SIDEBAR SELECTORS:
[data-nav="uebersicht"], [data-nav="zahlungen"], [data-nav="patienten"], [data-nav="ratenplan"], [data-nav="mahnwesen"], [data-nav="quartal"], [data-nav="automatisierungen"], [data-nav="import"], [data-nav="einstellungen"]

PERSONALITY:
- Speak naturally, as if talking to a colleague
- Be concise - this is voice, not text
- Use "Sie" in German
- If you don't know something, say so briefly

RULES:
- Prefer using the guide_user tool whenever navigation or highlighting would help.
- If the user wants to build or change a workflow, use propose_workflow.
- Highlight selectors must be valid CSS selectors.
- Response text must sound natural when spoken aloud.`;
}

async function transcribeAudio(input: {
  audioFile: File | null;
  locale: "de" | "en";
  fallbackText?: string;
}) {
  if (input.fallbackText?.trim()) {
    return input.fallbackText.trim();
  }

  if (!input.audioFile) {
    throw new Error("Es wurde keine Audiodatei übertragen.");
  }

  if (!openai) {
    throw new Error("OPENAI_API_KEY fehlt für Whisper STT.");
  }

  const transcription = await openai.audio.transcriptions.create({
    file: input.audioFile,
    model: "whisper-1",
    language: input.locale === "de" ? "de" : "en",
  });

  if (!transcription.text?.trim()) {
    throw new Error("Die Spracheingabe konnte nicht transkribiert werden.");
  }

  return transcription.text.trim();
}

function extractTextContent(content: Array<{ type: string; text?: string }>) {
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join(" ")
    .trim();
}

function routeToSidebarSelector(path: string) {
  const normalized = path.replace(/^\//, "");
  if (!normalized) {
    return null;
  }
  return `[data-nav="${normalized}"]`;
}

function normalizeActions(actions: z.infer<typeof actionSchema>[]) {
  const normalized = [...actions];
  const hasNavigate = normalized.some((action) => action.type === "navigate");
  const hasSidebarHighlight = normalized.some(
    (action) => action.type === "highlight" && action.target.startsWith("[data-nav=")
  );

  if (hasNavigate && !hasSidebarHighlight) {
    const navigateAction = normalized.find((action) => action.type === "navigate");
    if (navigateAction) {
      const selector = routeToSidebarSelector(navigateAction.target);
      if (selector) {
        normalized.push({
          type: "highlight",
          target: selector,
          explanation: navigateAction.explanation,
        });
      }
    }
  }

  return normalized;
}

async function runCompanion(text: string, context: z.infer<typeof contextSchema>) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: getSystemPrompt(context),
    messages: [
      {
        role: "user",
        content: text,
      },
    ],
    tools: [
      {
        name: "guide_user",
        description: "Guide the user through the app with optional navigation and UI highlighting.",
        input_schema: guideUserSchemaInput(),
      },
      {
        name: "propose_workflow",
        description: "Use this when the user wants to create or change a workflow. It should keep the spoken answer concise.",
        input_schema: proposeWorkflowSchemaInput(),
      },
      {
        type: "web_search_20250305",
        name: "web_search",
      } as never,
    ],
  });

  const toolBlock = response.content.find((block) => block.type === "tool_use");

  if (toolBlock?.type === "tool_use" && toolBlock.name === "guide_user") {
    const parsed = guideUserSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      throw new Error("Die iCura-Aktion ist ungültig.");
    }

    return {
      text: parsed.data.responseText,
      actions: normalizeActions(parsed.data.actions),
    };
  }

  if (toolBlock?.type === "tool_use" && toolBlock.name === "propose_workflow") {
    const parsed = proposeWorkflowSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      throw new Error("Die Workflow-Antwort von iCura ist ungültig.");
    }

    return {
      text: parsed.data.responseText,
      actions: normalizeActions([
        {
          type: "navigate",
          target: voiceMap.automations,
          explanation: parsed.data.rationale || parsed.data.responseText,
        },
      ]),
    };
  }

  return {
    text: extractTextContent(response.content),
    actions: [],
  };
}

async function synthesizeSpeech(text: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "NE7AIW5DoJ7lUosXV2KR";

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY fehlt.");
  }

  const elevenResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: text.slice(0, 1000),
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.8,
        style: 0.34,
        use_speaker_boost: true,
      },
    }),
  });

  if (!elevenResponse.ok || !elevenResponse.body) {
    const detail = await elevenResponse.text().catch(() => "");
    throw new Error(`ElevenLabs-Antwort fehlgeschlagen (${elevenResponse.status}): ${detail}`);
  }

  return elevenResponse;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioValue = formData.get("audio");
    const contextValue = formData.get("context");
    const fallbackTextValue = formData.get("text");

    const audioFile = audioValue instanceof File ? audioValue : null;
    const parsedContext = contextSchema.safeParse(
      typeof contextValue === "string" ? JSON.parse(contextValue) : {}
    );

    if (!parsedContext.success) {
      return Response.json(
        {
          error: "Ungültiger Kontext.",
          details: parsedContext.error.flatten(),
        },
        { status: 400 }
      );
    }

    const transcript = await transcribeAudio({
      audioFile,
      locale: parsedContext.data.locale,
      fallbackText: typeof fallbackTextValue === "string" ? fallbackTextValue : undefined,
    });

    const aiResult = await runCompanion(transcript, parsedContext.data);
    const spokenText =
      aiResult.text || (parsedContext.data.locale === "de" ? "Ich bin bereit, wenn Sie es noch einmal versuchen möchten." : "I am ready if you want to try that again.");
    const audioResponse = await synthesizeSpeech(spokenText);

    return new Response(audioResponse.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-ICura-Text": encodeURIComponent(spokenText),
        "X-ICura-Actions": encodeURIComponent(JSON.stringify(aiResult.actions)),
        "X-ICura-Transcript": encodeURIComponent(transcript),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Die Sprachverarbeitung ist fehlgeschlagen.";

    return Response.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
