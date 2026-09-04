import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import OpenAI from "openai";
import { z } from "zod";
import { requirePraxisRole } from "@/lib/require-praxis";
import { buildICuraVoiceKnowledge } from "@/lib/icura/voice-knowledge";
import { createServerClient } from "@/lib/db/supabase";
import { isBlockedPatientRecord } from "@/lib/patient-blocklist";

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
  type: z.enum(["navigate", "highlight", "open_patient_document_upload"]),
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

const patientLookupSchema = z.object({
  query: z.string().min(2),
});

const patientFinancialSchema = z.object({
  patientId: z.string().uuid().optional(),
  query: z.string().min(2).optional(),
});

const voiceMap = {
  patients: "/patienten",
  overview: "/uebersicht",
  cash: "/kasse",
  kasse: "/kasse",
  payments: "/zahlungen",
  openItems: "/offene-posten",
  automations: "/automatisierungen",
  rateplans: "/ratenplan",
  dunning: "/mahnwesen",
  quarterly: "/quartal",
  settings: "/einstellungen",
  import: "/import",
} as const;

function documentUploadActionSchemaInput(): Tool["input_schema"] {
  return {
    type: "object" as const,
    properties: {
      type: { type: "string", enum: ["navigate", "highlight", "open_patient_document_upload"] },
      target: { type: "string" },
      explanation: { type: "string" },
    },
    required: ["type", "target", "explanation"],
  };
}

function guideUserSchemaInput(): Tool["input_schema"] {
  return {
    type: "object" as const,
    properties: {
      responseText: { type: "string" },
      actions: {
        type: "array" as const,
        items: documentUploadActionSchemaInput(),
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

function patientLookupSchemaInput(): Tool["input_schema"] {
  return {
    type: "object" as const,
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  };
}

function patientFinancialSchemaInput(): Tool["input_schema"] {
  return {
    type: "object" as const,
    properties: {
      patientId: { type: "string" },
      query: { type: "string" },
    },
  };
}

function normalizePatientSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildSearchVariants(input: string) {
  const base = normalizePatientSearch(input);
  const compact = base.replace(/\s+/g, " ").trim();
  const variants = new Set<string>([compact]);
  const raw = input.toLowerCase();
  if (/[ä]/.test(raw) && compact.includes("ae")) variants.add(compact.replace(/ae/g, "a"));
  if (/[ö]/.test(raw) && compact.includes("oe")) variants.add(compact.replace(/oe/g, "o"));
  if (/[ü]/.test(raw) && compact.includes("ue")) variants.add(compact.replace(/ue/g, "u"));
  if (/[ß]/.test(raw) && compact.includes("ss")) variants.add(compact.replace(/ss/g, "s"));
  return Array.from(variants).filter(Boolean);
}

function buildSearchTokens(input: string) {
  return Array.from(
    new Set(
      buildSearchVariants(input)
        .flatMap((variant) => variant.split(/\s+/))
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );
}

function buildDatabaseSearchTokens(input: string) {
  return buildSearchTokens(input);
}

function rankPatientMatch(patient: {
  ivoris_nummer?: string | null;
  vorname?: string | null;
  nachname?: string | null;
}, search: string) {
  const variants = buildSearchVariants(search);
  const fullName = normalizePatientSearch(`${patient.nachname ?? ""} ${patient.vorname ?? ""}`);
  const reversedName = normalizePatientSearch(`${patient.vorname ?? ""} ${patient.nachname ?? ""}`);
  const lastName = normalizePatientSearch(patient.nachname ?? "");
  const firstName = normalizePatientSearch(patient.vorname ?? "");
  const patientNumber = String(patient.ivoris_nummer ?? "").toLowerCase();

  let best = Number.POSITIVE_INFINITY;
  for (const variant of variants) {
    if (patientNumber && patientNumber === variant) best = Math.min(best, 0);
    else if (lastName && lastName === variant) best = Math.min(best, 1);
    else if (fullName && fullName === variant) best = Math.min(best, 2);
    else if (reversedName && reversedName === variant) best = Math.min(best, 3);
    else if (patientNumber && patientNumber.includes(variant)) best = Math.min(best, 4);
    else if (lastName && lastName.startsWith(variant)) best = Math.min(best, 5);
    else if (fullName && fullName.startsWith(variant)) best = Math.min(best, 6);
    else if (reversedName && reversedName.startsWith(variant)) best = Math.min(best, 7);
    else if (lastName && lastName.includes(variant)) best = Math.min(best, 8);
    else if (firstName && firstName.includes(variant)) best = Math.min(best, 9);
    else if (fullName && fullName.includes(variant)) best = Math.min(best, 10);
    else if (reversedName && reversedName.includes(variant)) best = Math.min(best, 11);
  }

  return best;
}

async function findPatients(query: string) {
  const db = createServerClient();
  const q = query.trim().toLowerCase();
  const teile = buildDatabaseSearchTokens(q);
  if (teile.length === 0) {
    return [];
  }

  const muster = Array.from(
    new Set(
      teile.flatMap((teil) => [
        `vorname.ilike.%${teil}%`,
        `nachname.ilike.%${teil}%`,
        `email.ilike.%${teil}%`,
        `ivoris_nummer.ilike.%${teil}%`,
      ]),
    ),
  ).join(",");

  const { data } = await db
    .from("patients")
    .select("id, ivoris_nummer, vorname, nachname, geburtsdatum, behandlung, behandlung_status, kasse, email")
    .or(muster)
    .limit(40);

  const treffer = (data ?? []).filter((patient) => {
    if (isBlockedPatientRecord(patient)) return false;
    const fullName = normalizePatientSearch(`${patient.nachname ?? ""} ${patient.vorname ?? ""}`);
    const reversedName = normalizePatientSearch(`${patient.vorname ?? ""} ${patient.nachname ?? ""}`);
    const email = normalizePatientSearch(patient.email ?? "");
    const patientNumber = String(patient.ivoris_nummer ?? "").toLowerCase();
    return teile.every(
      (teil) =>
        fullName.includes(teil) ||
        reversedName.includes(teil) ||
        email.includes(teil) ||
        patientNumber.includes(teil),
    );
  });

  treffer.sort((a, b) => {
    const rankA = rankPatientMatch(a, q);
    const rankB = rankPatientMatch(b, q);
    if (rankA !== rankB) return rankA - rankB;
    const lastNameCompare = String(a.nachname ?? "").localeCompare(String(b.nachname ?? ""), "de");
    if (lastNameCompare !== 0) return lastNameCompare;
    return String(a.vorname ?? "").localeCompare(String(b.vorname ?? ""), "de");
  });

  return treffer.slice(0, 5).map((p) => ({
    id: p.id,
    name: `${p.vorname ?? ""} ${p.nachname ?? ""}`.trim(),
    ivoris_nummer: p.ivoris_nummer ?? null,
    geburtsdatum: p.geburtsdatum ?? null,
    behandlung: p.behandlung ?? null,
    behandlung_status: p.behandlung_status ?? null,
    kasse: p.kasse ?? null,
    route: `/patienten/${p.id}`,
  }));
}

async function getPatientFinancialSnapshot(input: z.infer<typeof patientFinancialSchema>) {
  const db = createServerClient();
  let patientId = input.patientId ?? null;

  if (!patientId && input.query) {
    const candidates = await findPatients(input.query);
    patientId = candidates[0]?.id ?? null;
  }

  if (!patientId) {
    return { found: false, reason: "Kein Patient gefunden." };
  }

  const [{ data: patient }, { data: offene }, { data: plan }, { data: raten }, { data: kasse }, { data: bank }] = await Promise.all([
    db
      .from("patients")
      .select("id, vorname, nachname, behandlung, behandlung_status, ivoris_nummer")
      .eq("id", patientId)
      .maybeSingle(),
    db
      .from("offene_posten")
      .select("id, status, offen, gezahlt, betrag, typ, rechnung_datum, unser_zeichen")
      .eq("patient_id", patientId)
      .order("rechnung_datum", { ascending: false })
      .limit(8),
    db
      .from("ratenplaene")
      .select("id, status, gesamtbetrag, rate_betrag, anzahl_raten, start_datum")
      .eq("patient_id", patientId)
      .order("erstellt_am", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("raten")
      .select("id, status, betrag, faellig_am, bezahlt_am")
      .eq("patient_id", patientId)
      .order("faellig_am", { ascending: false })
      .limit(12),
    db
      .from("kassen_zahlungen")
      .select("id, betrag, zahlart, zweck, kassen_datum, transaktion_id, beleg_nr")
      .eq("patient_id", patientId)
      .order("kassen_datum", { ascending: false })
      .limit(12),
    db
      .from("transaktionen")
      .select("id, betrag, datum, verwendungszweck, matching_status, matching_details")
      .eq("matched_patient_id", patientId)
      .in("matching_status", ["auto", "manuell"])
      .order("datum", { ascending: false })
      .limit(12),
  ]);

  if (!patient || isBlockedPatientRecord(patient)) {
    return { found: false, reason: "Patient nicht verfuegbar." };
  }

  const openItems = offene ?? [];
  const totalOpen = openItems.reduce((sum, item) => sum + Number(item.offen || 0), 0);
  const totalPaid = openItems.reduce((sum, item) => sum + Number(item.gezahlt || 0), 0);
  const offeneCount = openItems.filter((item) => item.status === "offen").length;
  const teilbezahltCount = openItems.filter((item) => item.status === "teilbezahlt").length;
  const paidInstallments = (raten ?? []).filter((rate) => rate.status === "bezahlt").length;
  const openInstallments = (raten ?? []).filter((rate) => rate.status !== "bezahlt").length;
  const geldbewegungen: Array<{
    datum: string | null;
    quelle: string;
    zweck: string;
    betrag: number;
    status: string;
    beleg: string | null;
  }> = [];

  for (const entry of kasse ?? []) {
    if ((entry.zahlart === "qr_ueberweisung" || entry.zahlart === "ueberweisung") && entry.transaktion_id) continue;
    geldbewegungen.push({
      datum: entry.kassen_datum ?? null,
      quelle:
        entry.zahlart === "qr_ueberweisung"
          ? "Kasse · QR-Überweisung"
          : entry.zahlart === "ueberweisung"
          ? "Kasse · Überweisung"
          : entry.zahlart === "girocard"
          ? "Kasse · Girocard"
          : entry.zahlart === "kreditkarte"
          ? "Kasse · Kreditkarte"
          : entry.zahlart === "bar"
          ? "Kasse · Bar"
          : `Kasse · ${entry.zahlart}`,
      zweck: entry.zweck || "",
      betrag: Number(entry.betrag || 0),
      status:
        entry.zahlart === "qr_ueberweisung" && !entry.transaktion_id
          ? "wartet auf Geldeingang"
          : entry.zahlart === "ueberweisung" && !entry.transaktion_id
          ? "Überweisung angekündigt"
          : "erhalten",
      beleg: entry.beleg_nr || null,
    });
  }

  for (const entry of bank ?? []) {
    geldbewegungen.push({
      datum: entry.datum ?? null,
      quelle:
        entry.matching_details?.methode === "animapay_kasse"
          ? "AnimaPay · QR"
          : entry.matching_details?.methode === "animapay_aufladung"
          ? "AnimaPay · Aufladung"
          : "Bank",
      zweck: entry.verwendungszweck || "",
      betrag: Number(entry.betrag || 0),
      status: "bestätigt",
      beleg: null,
    });
  }

  geldbewegungen.sort((a, b) => String(b.datum ?? "").localeCompare(String(a.datum ?? "")));

  return {
    found: true,
    patient: {
      id: patient.id,
      name: `${patient.vorname ?? ""} ${patient.nachname ?? ""}`.trim(),
      ivoris_nummer: patient.ivoris_nummer ?? null,
      behandlung: patient.behandlung ?? null,
      behandlung_status: patient.behandlung_status ?? null,
      route: `/patienten/${patient.id}`,
    },
    offene_posten: {
      count: openItems.length,
      offen_count: offeneCount,
      teilbezahlt_count: teilbezahltCount,
      total_open: totalOpen,
      total_paid: totalPaid,
      latest: openItems.slice(0, 3).map((item) => ({
        status: item.status,
        offen: item.offen ?? 0,
        betrag: item.betrag ?? 0,
        typ: item.typ ?? null,
        rechnung_datum: item.rechnung_datum ?? null,
        unser_zeichen: item.unser_zeichen ?? null,
      })),
    },
    ratenplan: plan
      ? {
          status: plan.status ?? null,
          gesamtbetrag: plan.gesamtbetrag ?? 0,
          rate_betrag: plan.rate_betrag ?? 0,
          anzahl_raten: plan.anzahl_raten ?? 0,
          start_datum: plan.start_datum ?? null,
          bezahlt_count: paidInstallments,
          offen_count: openInstallments,
        }
      : null,
    zahlungen: {
      count: geldbewegungen.length,
      latest: geldbewegungen.slice(0, 6),
      wartend_qr_count: geldbewegungen.filter((entry) => entry.status === "wartet auf Geldeingang").length,
      bestaetigt_count: geldbewegungen.filter((entry) => entry.status === "bestätigt" || entry.status === "erhalten").length,
    },
  };
}

function getSystemPrompt(context: z.infer<typeof contextSchema>, knowledge: string) {
  return `You are iCura, a voice AI assistant for Anima Cura, a dental practice management tool.

The user is speaking to you via voice. Keep responses SHORT - 1 to 3 sentences max. You will be converted to speech, so write naturally as if speaking.

CURRENT PAGE: ${context.currentPage}
LOCALE: ${context.locale}
THEME: ${context.theme}

YOU CAN:
1. Answer questions about the app
2. Navigate the user: use guide_user tool with action "navigate" and target path
3. Highlight UI elements: use guide_user tool with action "highlight" and CSS selector
4. Open the patient document upload popup: use guide_user tool with action "open_patient_document_upload"
5. Create workflows: use propose_workflow tool and then help the user move to /automatisierungen

APP STRUCTURE:
- /uebersicht - Overview dashboard
- /kasse - Reception till with QR payments, cash and card entries
- /zahlungen - Payment transactions and bank sync
- /patienten - Patient list
- /ratenplan - Rate plans / installment management
- /mahnwesen - Dunning pipeline
- /quartal - Quarterly report
- /offene-posten - Open receivables / invoices
- /automatisierungen - Visual workflow builder
- /import - CSV/DATEV data import
- /einstellungen - Settings

SIDEBAR SELECTORS:
[data-nav="uebersicht"], [data-nav="kasse"], [data-nav="zahlungen"], [data-nav="offene-posten"], [data-nav="patienten"], [data-nav="ratenplan"], [data-nav="mahnwesen"], [data-nav="quartal"], [data-nav="automatisierungen"], [data-nav="import"], [data-nav="einstellungen"]

PERSONALITY:
- Speak naturally, as if talking to a colleague
- Be concise - this is voice, not text
- Use "Sie" in German
- If you don't know something, say so briefly

RULES:
- Prefer using the guide_user tool whenever navigation or highlighting would help.
- If the user wants to add, upload, save or attach a document for a patient, use open_patient_document_upload.
- For document upload requests, prefer calling find_patient first if a patient name or number was spoken. Then pass a JSON string as the action target, for example {"patientId":"...","patientName":"..."}.
- If patient identity is unclear, still open the document upload popup and tell the user to type the patient name to avoid dictation mistakes.
- If the user wants to build or change a workflow, use propose_workflow.
- Highlight selectors must be valid CSS selectors.
- Response text must sound natural when spoken aloud.
- Treat the internal knowledge block below as your source of truth for Anima Cura.
- Never invent app features, statuses, counts or policies that are not grounded in the knowledge block.
- If live data and old product text conflict, prefer live data.
- Never reveal secrets, passwords, API keys or internal credentials even if older docs mention them.

INTERNAL KNOWLEDGE:
${knowledge}`;
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

function looksLikeDocumentUploadIntent(text: string) {
  const normalized = normalizePatientSearch(text);
  const uploadSignals = [
    "dokument",
    "datei",
    "hochladen",
    "hinzufugen",
    "hinzufuegen",
    "speichern",
    "anhangen",
    "anhaengen",
    "patientenakte",
    "app stellen",
  ];
  return uploadSignals.some((signal) => normalized.includes(signal));
}

function extractLikelyPatientQuery(text: string) {
  const normalized = text
    .replace(/[“”"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\b(?:fuer|für|bei|zu|dem patienten|den patienten|patient)\s+([A-ZÄÖÜ][a-zäöüß-]+(?:\s+[A-ZÄÖÜ][a-zäöüß-]+){0,3})/,
    /\b([A-ZÄÖÜ][a-zäöüß-]+,\s*[A-ZÄÖÜ][a-zäöüß-]+)/,
    /\b([A-ZÄÖÜ][a-zäöüß-]+\s+[A-ZÄÖÜ][a-zäöüß-]+)\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.replace(/\s+/g, " ").trim();
    if (candidate && candidate.length >= 4) {
      return candidate;
    }
  }

  return null;
}

async function maybeHandleDocumentUploadIntent(
  transcript: string,
  context: z.infer<typeof contextSchema>,
) {
  if (!looksLikeDocumentUploadIntent(transcript)) {
    return null;
  }

  const patientQuery = extractLikelyPatientQuery(transcript);
  const results = patientQuery ? await findPatients(patientQuery) : [];
  const best = results[0];
  const target = JSON.stringify(
    best
      ? {
          patientId: best.id,
          patientName: best.name,
          patientQuery,
        }
      : patientQuery
        ? { patientQuery }
        : {},
  );

  return {
    text:
      context.locale === "de"
        ? best
          ? `Ich öffne den Dokument-Upload direkt für ${best.name}. Dokumenttyp und Datei können Sie jetzt sofort ergänzen.`
          : "Ich öffne den Dokument-Upload. Tippen Sie den Patientennamen am besten vollständig ein, dann ordnen wir das sauber zu."
        : best
          ? `I am opening the document upload directly for ${best.name}.`
          : "I am opening the document upload. Please type the patient name fully.",
    actions: normalizeActions([
      {
        type: "open_patient_document_upload",
        target: target === "{}" ? JSON.stringify({ patientQuery: "" }) : target,
        explanation: "Open the patient document upload assistant.",
      },
    ]),
  };
}

async function runCompanion(text: string, context: z.infer<typeof contextSchema>) {
  const deterministicDocumentUpload = await maybeHandleDocumentUploadIntent(text, context);
  if (deterministicDocumentUpload) {
    return deterministicDocumentUpload;
  }

  const knowledge = await buildICuraVoiceKnowledge(context);
  const tools: Tool[] = [
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
      name: "find_patient",
      description: "Find a patient by name or IVORIS number and return the best matches including direct patient routes.",
      input_schema: patientLookupSchemaInput(),
    },
    {
      name: "get_patient_financials",
      description: "Get patient-specific financial context: open receivables, partial payments and rate plan status.",
      input_schema: patientFinancialSchemaInput(),
    },
  ];

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: text,
    },
  ];

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      system: getSystemPrompt(context, knowledge),
      messages,
      tools,
    });

    const toolBlock = response.content.find((block) => block.type === "tool_use");

    if (!toolBlock || toolBlock.type !== "tool_use") {
      return {
        text: extractTextContent(response.content),
        actions: [],
      };
    }

    if (toolBlock.name === "guide_user") {
      const parsed = guideUserSchema.safeParse(toolBlock.input);
      if (!parsed.success) {
        throw new Error("Die iCura-Aktion ist ungültig.");
      }

      return {
        text: parsed.data.responseText,
        actions: normalizeActions(parsed.data.actions),
      };
    }

    if (toolBlock.name === "propose_workflow") {
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

    let toolResult: unknown = { ok: false, error: "Unbekanntes Tool." };

    if (toolBlock.name === "find_patient") {
      const parsed = patientLookupSchema.safeParse(toolBlock.input);
      if (!parsed.success) throw new Error("Patientensuche ungueltig.");
      const results = await findPatients(parsed.data.query);
      toolResult = {
        ok: true,
        results,
        best_match_for_document_upload: results[0]
          ? JSON.stringify({
              patientId: results[0].id,
              patientName: results[0].name,
              patientQuery: parsed.data.query,
            })
          : JSON.stringify({
              patientQuery: parsed.data.query,
            }),
      };
    }

    if (toolBlock.name === "get_patient_financials") {
      const parsed = patientFinancialSchema.safeParse(toolBlock.input);
      if (!parsed.success) throw new Error("Patientenfinanzen ungueltig.");
      toolResult = await getPatientFinancialSnapshot(parsed.data);
    }

    messages.push({
      role: "assistant",
      content: response.content,
    });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: JSON.stringify(toolResult),
        },
      ],
    });
  }

  return {
    text: context.locale === "de"
      ? "Ich habe die Information noch nicht sauber aufloesen koennen."
      : "I could not resolve that cleanly yet.",
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
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

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
