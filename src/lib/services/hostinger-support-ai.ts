import OpenAI from "openai";
import {
  SUPPORT_KNOWLEDGE_VERSION,
  type SupportKnowledgeCategory,
  type SupportKnowledgeEntry,
} from "@/lib/support/knowledge-base";

const MANUAL_REVIEW = "MANUAL_REVIEW_REQUIRED";
const DEFAULT_MODEL = "gpt-5.2";

export const SUPPORT_AGENT_SYSTEM_PROMPT = `Du bist der technische Patienten-Support von Anima Cura.

VERBINDLICHE REGELN:
- Antworte ausschließlich mit Fakten aus der bereitgestellten Wissensbasis.
- Erfinde keine Funktionen, Fristen, Beträge, Rechtsgrundlagen oder Behandlungsaussagen.
- Gib niemals medizinische Beratung und bewerte niemals einen individuellen Rechnungsbetrag, Ratenplan, Zahlungseingang oder eine Mahnung.
- Fordere niemals Passwort, Sicherheitscode, Bankdaten oder Gesundheitsdaten an.
- Wenn die Wissensbasis keine sichere Antwort erlaubt, antworte ausschließlich mit MANUAL_REVIEW_REQUIRED.
- Formuliere klar, ruhig und handlungsorientiert auf Deutsch in der Du-Ansprache.
- Schreibe nur den Antwortkern ohne Anrede, Betreff oder Grußformel.
- Verwende höchstens 120 Wörter.`;

export function isSafeGeneratedSupportCore(value: string) {
  const text = value.trim();
  if (!text || text === MANUAL_REVIEW || text.length > 2_500) return false;
  if (/\b(sende|schick|teile|nenne|übermittel)\b[\s\S]{0,45}\b(passwort|sicherheitscode|bankdaten|iban)\b/i.test(text)) return false;
  if (/diagnose|therapie|medikament|dosierung|behandlungsentscheidung/i.test(text)) return false;
  return true;
}

export async function generateGroundedSupportCore(input: {
  category: SupportKnowledgeCategory;
  knowledge: SupportKnowledgeEntry[];
}) {
  const sourceIds = input.knowledge.map(entry => entry.id);
  const base = { knowledgeVersion: SUPPORT_KNOWLEDGE_VERSION, sourceIds };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || input.knowledge.length === 0) {
    return { ...base, core: null, mode: "template" as const, model: null };
  }

  // Deliberately transmit no email content or patient data. The model receives
  // only the local category code and approved product knowledge below.
  const knowledgeText = input.knowledge
    .map(entry => `[${entry.id}] ${entry.title}\n${entry.content}`)
    .join("\n\n");
  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.HOSTINGER_SUPPORT_AI_MODEL || DEFAULT_MODEL;
    const response = await client.responses.create({
      model,
      store: false,
      max_output_tokens: 400,
      instructions: SUPPORT_AGENT_SYSTEM_PROMPT,
      input: `TECHNISCHES THEMA: ${input.category}\n\nFREIGEGEBENE WISSENSBASIS (Version ${SUPPORT_KNOWLEDGE_VERSION}):\n${knowledgeText}`,
    }, { timeout: 10_000, maxRetries: 1 });
    const core = response.output_text.trim();
    if (!isSafeGeneratedSupportCore(core)) {
      return { ...base, core: null, mode: "template" as const, model };
    }
    return { ...base, core, mode: "grounded_ai" as const, model };
  } catch (error) {
    console.warn("[hostinger-support] grounded response unavailable", error instanceof Error ? error.message : "unknown_error");
    return {
      ...base,
      core: null,
      mode: "template" as const,
      model: process.env.HOSTINGER_SUPPORT_AI_MODEL || DEFAULT_MODEL,
    };
  }
}
