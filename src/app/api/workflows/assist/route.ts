import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Du bist iCura, der KI-Assistent von Anima Cura. Anima Cura ist ein Praxisverwaltungstool für eine kieferorthopädische Praxis (Praxis Dr. Elena Schubert, Nikolaistraße 20, 04109 Leipzig).

Antworte IMMER in der Sprache, in der der Benutzer schreibt (Deutsch oder Englisch). Sprich den Benutzer mit "Sie" / "you" an. Bleib freundlich, kompetent und kurz angebunden (2-3 Sätze bevorzugt). E-Mail-Templates innerhalb von Workflows bleiben Deutsch, da die Patienten deutschsprachig sind.

DU LEBST IN DER APP:
- Du bekommst bei jeder Anfrage den aktuellen App-Kontext (currentPage, locale, theme, optional: patientCount, activeWorkflows, openRaten, selectedPatient).
- Du kannst den Benutzer durch die App führen: navigiere ihn zu Seiten oder hebe Elemente visuell hervor.

DEINE FÄHIGKEITEN (Tools):
1. ask_clarification — Wenn dir Information fehlt, stelle EINE Rückfrage.
2. propose_workflow — Schlage einen kompletten Workflow vor (Nodes + Edges) für die Automatisierungs-Seite.
3. guide_user — Führe den Benutzer visuell: action="navigate" (zu einer App-Seite), action="highlight" (CSS-Selektor pulsieren lassen), action="open_chat" (Hinweis).

KENNE DIE APP:
Seiten: /uebersicht, /zahlungen, /patienten, /ratenplan, /mahnwesen, /quartal, /automatisierungen, /einstellungen, /import.
Sidebar-Selektoren: [data-nav="uebersicht"], [data-nav="zahlungen"], [data-nav="patienten"], [data-nav="ratenplan"], [data-nav="mahnwesen"], [data-nav="quartal"], [data-nav="automatisierungen"], [data-nav="einstellungen"].

CROSS-PAGE-WORKFLOWS:
Wenn der Benutzer einen Workflow erstellen möchte und nicht auf /automatisierungen ist, antworte mit guide_user (navigate zu /automatisierungen). Der Benutzer kann dann die Anfrage erneut stellen.

ASSISTENTEN-MODUS (mode="assistant"):
- Du bevorzugst kurze, hilfreiche Antworten.
- Bei Navigations-Wünschen rufst Du guide_user auf.
- Bei Workflow-Erstellung außerhalb von /automatisierungen: zuerst zu /automatisierungen leiten.

WORKFLOW-MODUS (mode="workflow"):
- Du bist im Workflow-Builder. Nutze propose_workflow direkt.

VERFÜGBARE NODE-TYPEN (für propose_workflow):

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

WICHTIG:
- Nutze nur die beiden Tools ask_clarification oder propose_workflow.
- Wenn Informationen fehlen, stelle genau eine Rückfrage mit ask_clarification.
- Wenn genug Informationen vorliegen, liefere den vollständigen Workflow mit propose_workflow.
- Node-IDs müssen eindeutig sein.
- Edges müssen auf existierende Node-IDs verweisen.
- Wenn du einen Workflow vorschlägst, gib vollständige nodes und edges zurück.`;

const contextSchema = z
  .object({
    currentPage: z.string().optional(),
    locale: z.string().optional(),
    theme: z.string().optional(),
    patientCount: z.number().optional(),
    activeWorkflows: z.number().optional(),
    openRaten: z.number().optional(),
    selectedPatient: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        behandlung: z.string().optional(),
      })
      .optional(),
  })
  .partial()
  .optional();

const guideSchema = z.object({
  action: z.enum(["navigate", "highlight", "open_chat"]),
  target: z.string().min(1),
  explanation: z.string().min(1),
});

const requestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1, "Nachricht fehlt."),
  mode: z.enum(["workflow", "assistant"]).optional(),
  context: contextSchema,
  currentWorkflow: z
    .object({
      nodes: z.array(z.unknown()),
      edges: z.array(z.unknown()),
    })
    .optional(),
});

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const nodeBaseSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "trigger",
    "condition",
    "action_email",
    "action_whatsapp",
    "action_alert",
    "action_mahnstufe",
    "action_scoring",
  ]),
  position: positionSchema.default({ x: 0, y: 0 }),
});

const triggerNodeSchema = nodeBaseSchema.extend({
  type: z.literal("trigger"),
  data: z.object({
    event: z.enum(["rate_ueberfaellig", "ruecklastschrift", "taeglicher_cron", "scoring_kritisch"]),
    delayDays: z.number().int().nonnegative().optional(),
    threshold: z.number().optional(),
    cronTime: z.string().optional(),
  }),
});

const conditionNodeSchema = nodeBaseSchema.extend({
  type: z.literal("condition"),
  data: z.object({
    field: z.enum(["mahnstufe", "versicherung_status", "email", "mobiltelefon", "kasse", "scoring"]),
    operator: z.enum(["equals", "gt", "lt", "contains", "exists"]),
    value: z.union([z.string(), z.number()]).optional(),
  }),
});

const emailNodeSchema = nodeBaseSchema.extend({
  type: z.literal("action_email"),
  data: z.object({
    to: z.enum(["patient", "versicherungsnehmer", "praxisleitung"]),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
});

const whatsappNodeSchema = nodeBaseSchema.extend({
  type: z.literal("action_whatsapp"),
  data: z.object({
    to: z.enum(["patient", "versicherungsnehmer"]),
    message: z.string().min(1),
  }),
});

const alertNodeSchema = nodeBaseSchema.extend({
  type: z.literal("action_alert"),
  data: z.object({
    severity: z.enum(["info", "warnung", "kritisch"]),
    recipient: z.enum(["alle", "praxisleitung"]),
    title: z.string().min(1),
    message: z.string().min(1),
  }),
});

const mahnstufeNodeSchema = nodeBaseSchema.extend({
  type: z.literal("action_mahnstufe"),
  data: z.object({
    action: z.enum(["increase", "set"]),
    targetStufe: z.number().int().min(0).max(3).optional(),
  }),
});

const scoringNodeSchema = nodeBaseSchema.extend({
  type: z.literal("action_scoring"),
  data: z.object({
    action: z.enum(["decrease", "set"]),
    points: z.number(),
  }),
});

const workflowNodeSchema = z.discriminatedUnion("type", [
  triggerNodeSchema,
  conditionNodeSchema,
  emailNodeSchema,
  whatsappNodeSchema,
  alertNodeSchema,
  mahnstufeNodeSchema,
  scoringNodeSchema,
]);

const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  type: z.string().optional(),
  animated: z.boolean().optional(),
});

const proposalSchema = z
  .object({
    rationale: z.string().min(1),
    nodes: z.array(workflowNodeSchema).min(1),
    edges: z.array(workflowEdgeSchema),
  })
  .superRefine((value, ctx) => {
    const nodeIds = new Set<string>();

    value.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Node-ID "${node.id}" ist doppelt vorhanden.`,
          path: ["nodes", index, "id"],
        });
      }
      nodeIds.add(node.id);
    });

    value.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge-Quelle "${edge.source}" existiert nicht.`,
          path: ["edges", index, "source"],
        });
      }
      if (!nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge-Ziel "${edge.target}" existiert nicht.`,
          path: ["edges", index, "target"],
        });
      }
    });
  });

const clarificationSchema = z.object({
  question: z.string().min(1),
});

const storedSessionMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

type StoredSessionMessage = z.infer<typeof storedSessionMessageSchema>;

function formatUserMessage(input: z.infer<typeof requestSchema>) {
  const parts: string[] = [input.message];

  if (input.mode) {
    parts.push("", `Modus: ${input.mode}`);
  }

  if (input.context && Object.keys(input.context).length > 0) {
    parts.push("", "App-Kontext:", JSON.stringify(input.context, null, 2));
  }

  if (input.currentWorkflow) {
    parts.push("", "Aktueller Workflow im Editor:", JSON.stringify(input.currentWorkflow, null, 2));
  }

  return parts.join("\n");
}

function summarizeAssistantPayload(
  payload:
    | ({ type: "question" } & z.infer<typeof clarificationSchema>)
    | ({ type: "proposal" } & z.infer<typeof proposalSchema>)
    | ({ type: "guide" } & z.infer<typeof guideSchema>)
) {
  if (payload.type === "question") return payload.question;
  if (payload.type === "guide") return `${payload.explanation} (${payload.action}: ${payload.target})`;
  return [
    payload.rationale,
    "",
    JSON.stringify({ nodes: payload.nodes, edges: payload.edges }),
  ].join("\n");
}

async function loadSessionMessages(sessionId: string): Promise<StoredSessionMessage[]> {
  const db = createServerClient();
  const { data } = await db
    .from("workflow_assistant_sessions")
    .select("messages")
    .eq("id", sessionId)
    .maybeSingle();

  const parsed = z.array(storedSessionMessageSchema).safeParse(data?.messages);
  return parsed.success ? parsed.data : [];
}

async function upsertSessionMessages(sessionId: string, messages: StoredSessionMessage[], workflowValue?: unknown) {
  const db = createServerClient();
  const payload: Record<string, unknown> = {
    id: sessionId,
    messages,
  };

  if (typeof workflowValue === "string" || workflowValue === null) {
    payload.workflow_id = workflowValue;
  }

  await db.from("workflow_assistant_sessions").upsert(payload, { onConflict: "id" });
}

function toolSchemaForAnthropic(): Tool["input_schema"] {
  return {
    type: "object" as const,
    properties: {
      rationale: { type: "string", description: "Kurze Erklärung auf Deutsch warum dieser Workflow so aufgebaut ist" },
      nodes: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" },
            type: { type: "string" },
            position: {
              type: "object" as const,
              properties: {
                x: { type: "number" },
                y: { type: "number" },
              },
              required: ["x", "y"],
            },
            data: { type: "object" },
          },
          required: ["id", "type", "data"],
        },
      },
      edges: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" },
            source: { type: "string" },
            target: { type: "string" },
            sourceHandle: { type: "string" },
            targetHandle: { type: "string" },
            type: { type: "string" },
            animated: { type: "boolean" },
          },
          required: ["id", "source", "target"],
        },
      },
    },
    required: ["rationale", "nodes", "edges"],
  };
}

const encoder = new TextEncoder();

function sendSse(controller: ReadableStreamDefaultController<Uint8Array>, data: unknown, event?: string) {
  const lines = [];
  if (event) {
    lines.push(`event: ${event}`);
  }
  lines.push(`data: ${JSON.stringify(data)}`);
  lines.push("");
  controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
}

export async function POST(request: Request) {
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success) {
    return new Response(
      JSON.stringify({
        error: "Ungültige Anfrage.",
        details: parsedBody.error.flatten(),
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  const body = parsedBody.data;
  const sessionId = body.sessionId || crypto.randomUUID();
  const existingMessages = body.sessionId ? await loadSessionMessages(body.sessionId) : [];
  const userMessage = formatUserMessage(body);
  const nextMessages = [...existingMessages, { role: "user" as const, content: userMessage }];
  const anthropicMessages = nextMessages.slice(-8).map<MessageParam>((message) => ({
    role: message.role,
    content: message.content,
  }));

  await upsertSessionMessages(sessionId, nextMessages);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const anthropicStream = anthropic.messages
          .stream({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: [
              {
                type: "text",
                text: SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              } as never,
            ],
            messages: anthropicMessages,
            tools: [
              {
                name: "propose_workflow",
                description: "Schlägt einen kompletten Workflow vor mit Nodes und Edges",
                input_schema: toolSchemaForAnthropic(),
              },
              {
                name: "ask_clarification",
                description: "Stellt eine Rückfrage wenn Informationen fehlen",
                input_schema: {
                  type: "object" as const,
                  properties: {
                    question: {
                      type: "string",
                      description: "Rückfrage in der Sprache des Benutzers",
                    },
                  },
                  required: ["question"],
                },
              },
              {
                name: "guide_user",
                description: "Führt den Benutzer visuell durch die App — navigiert zu einer Seite oder hebt ein UI-Element hervor.",
                input_schema: {
                  type: "object" as const,
                  properties: {
                    action: {
                      type: "string",
                      enum: ["navigate", "highlight", "open_chat"],
                      description: "Was gemacht werden soll",
                    },
                    target: {
                      type: "string",
                      description: "Bei navigate: Pfad (z.B. /patienten). Bei highlight: CSS-Selektor (z.B. [data-nav=\"zahlungen\"]).",
                    },
                    explanation: {
                      type: "string",
                      description: "Kurzer freundlicher Hinweis was der Benutzer dort findet.",
                    },
                  },
                  required: ["action", "target", "explanation"],
                },
              },
            ],
          })
          .on("text", (textDelta) => {
            if (textDelta.length > 0) {
              sendSse(controller, { type: "token", text: textDelta }, "token");
            }
          });

        const finalMessage = await anthropicStream.finalMessage();
        const toolUse = finalMessage.content.find((block) => block.type === "tool_use");

        let payload:
          | ({ type: "question" } & z.infer<typeof clarificationSchema>)
          | ({ type: "proposal" } & z.infer<typeof proposalSchema>)
          | ({ type: "guide" } & z.infer<typeof guideSchema>);

        if (toolUse?.type === "tool_use" && toolUse.name === "ask_clarification") {
          const parsedTool = clarificationSchema.safeParse(toolUse.input);
          if (!parsedTool.success) {
            throw new Error("Die Rückfrage des Assistenten ist ungültig.");
          }
          payload = { type: "question", ...parsedTool.data };
          sendSse(controller, { type: "question", text: parsedTool.data.question }, "final");
        } else if (toolUse?.type === "tool_use" && toolUse.name === "guide_user") {
          const parsedTool = guideSchema.safeParse(toolUse.input);
          if (!parsedTool.success) {
            throw new Error("Die Navigations-Anweisung ist ungültig.");
          }
          payload = { type: "guide", ...parsedTool.data };
          sendSse(
            controller,
            {
              type: "guide",
              action: parsedTool.data.action,
              target: parsedTool.data.target,
              explanation: parsedTool.data.explanation,
            },
            "final"
          );
        } else if (toolUse?.type === "tool_use" && toolUse.name === "propose_workflow") {
          const parsedTool = proposalSchema.safeParse(toolUse.input);
          if (!parsedTool.success) {
            throw new Error(`Der Workflow-Vorschlag ist ungültig: ${parsedTool.error.issues.map((issue) => issue.message).join(", ")}`);
          }
          payload = { type: "proposal", ...parsedTool.data };
          sendSse(
            controller,
            {
              type: "proposal",
              rationale: parsedTool.data.rationale,
              nodes: parsedTool.data.nodes,
              edges: parsedTool.data.edges,
            },
            "final"
          );
        } else {
          const fallbackText =
            finalMessage.content
              .filter((block): block is { type: "text"; text: string } => block.type === "text")
              .map((block) => block.text)
              .join("")
              .trim() || "Können Sie mir bitte noch etwas mehr Kontext geben?";

          payload = { type: "question", question: fallbackText };
          sendSse(controller, { type: "question", text: fallbackText }, "final");
        }

        await upsertSessionMessages(sessionId, [
          ...nextMessages,
          {
            role: "assistant",
            content: summarizeAssistantPayload(payload),
          },
        ]);

        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unbekannter Fehler im Workflow-Assistenten.";
        sendSse(controller, { type: "error", text: message }, "error");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Session-Id": sessionId,
    },
  });
}
