import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { requirePraxisRole } from "@/lib/require-praxis";
import { SUPPORT_AGENT_SYSTEM_PROMPT } from "@/lib/services/hostinger-support-ai";
import {
  buildSupportReply,
  classifySupportEvent,
  HOSTINGER_SUPPORT_WORKFLOW_ID,
  type ParsedSupportEvent,
} from "@/lib/services/hostinger-support-mail";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_KNOWLEDGE,
  SUPPORT_KNOWLEDGE_VERSION,
  retrieveSupportKnowledge,
  type SupportKnowledgeCategory,
} from "@/lib/support/knowledge-base";

const noteSchema = z.object({
  category: z.enum(["login_password", "invoice_access", "payment_method", "portal_setup", "medical", "billing_specific", "other"]),
  title: z.string().trim().min(3).max(120),
  content: z.string().trim().min(10).max(1200),
});

const reviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["reviewed", "rejected"]),
});

const SUPPORT_LEARNING_KEY = "support_learning_notes";

type LearningNote = {
  id: string;
  category: string;
  title: string;
  content: string;
  status: "pending" | "reviewed" | "rejected";
  created_at: string;
  created_by: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

function learningNotes(value: unknown): LearningNote[] {
  return Array.isArray(value) ? value.filter((item): item is LearningNote => Boolean(item && typeof item === "object" && "id" in item)) : [];
}

function containsSensitiveData(value: string) {
  return /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\+?\d[\d\s/()-]{7,}\d\b/i.test(value);
}

function resultOf(row: Record<string, unknown>) {
  return row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : {};
}

const previewScenarios = [
  { id: "password", subject: "Ich kann mich nicht anmelden", excerpt: "Mein Passwort funktioniert nicht mehr." },
  { id: "invoice", subject: "Wo finde ich meine Rechnung?", excerpt: "Der Rechnungslink zeigt zuerst die Anmeldung." },
  { id: "payment", subject: "Wie kann ich die Rechnung bezahlen?", excerpt: "Kann ich Banking-QR oder Überweisung verwenden?" },
  { id: "setup", subject: "App installieren", excerpt: "Wie bekomme ich Anima Cura auf den Startbildschirm?" },
  { id: "billing", subject: "Mein Rechnungsbetrag stimmt nicht", excerpt: "Warum soll ich diesen konkreten Betrag bezahlen?" },
  { id: "medical", subject: "Medizinische Frage", excerpt: "Mein Kind hat Schmerzen am Zahn." },
] as const;

function answerPreviews() {
  return previewScenarios.map((scenario) => {
    const event: ParsedSupportEvent = {
      event: "message.received",
      eventKey: `preview-${scenario.id}`,
      mailboxAddress: "praxisteam@animacura.io",
      mailboxResourceId: null,
      senderEmail: "patient@example.com",
      senderName: null,
      subject: scenario.subject,
      excerpt: scenario.excerpt,
      timestamp: null,
      uid: null,
      folder: "inbox",
      messageId: null,
    };
    const classification = classifySupportEvent(event);
    const supportedCategory = ["login_password", "invoice_access", "payment_method", "portal_setup"].includes(classification.category)
      ? classification.category as SupportKnowledgeCategory
      : null;
    return {
      ...scenario,
      category: classification.category,
      autoReply: classification.autoReply,
      reason: classification.reason,
      reply: classification.autoReply ? buildSupportReply(event, classification).text : null,
      sources: supportedCategory
        ? retrieveSupportKnowledge(supportedCategory, `${scenario.subject} ${scenario.excerpt}`).map((entry) => entry.id)
        : [],
    };
  });
}

export async function GET() {
  const denied = await requirePraxisRole(["admin", "verwaltung"]);
  if (denied) return denied;

  const db = createServerClient();
  const [{ data: runs, error: runError }, { data: notesSetting, error: noteError }] = await Promise.all([
    db.from("workflow_runs")
      .select("id,status,started_at,finished_at,error,result")
      .eq("workflow_id", HOSTINGER_SUPPORT_WORKFLOW_ID)
      .order("started_at", { ascending: false })
      .limit(1000),
    db.from("einstellungen").select("value").eq("key", SUPPORT_LEARNING_KEY).maybeSingle(),
  ]);

  if (runError) return NextResponse.json({ error: "Support-Auswertung konnte nicht geladen werden." }, { status: 500 });
  const safeRuns = (runs ?? []).map((row) => {
    const result = resultOf(row as Record<string, unknown>);
    return {
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      category: String(result.category || "other"),
      reason: String(result.reason || ""),
      subject: String(result.subject || ""),
      sender: String(result.sender || "").replace(/^(.{2}).*(@.*)$/, "$1•••$2"),
      caseStatus: String(result.caseStatus || (result.manualReview === true ? "open" : "observed")),
      manualReview: result.manualReview === true,
      autoReplied: result.autoReplied === true,
      replyMode: String(result.replyMode || ""),
      knowledgeSourceIds: Array.isArray(result.knowledgeSourceIds) ? result.knowledgeSourceIds : [],
      knowledgeVersion: String(result.knowledgeVersion || ""),
      error: row.error,
    };
  });

  const categories = safeRuns.reduce<Record<string, number>>((counts, row) => {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
    return counts;
  }, {});
  const sourceUsage = safeRuns.reduce<Record<string, number>>((counts, row) => {
    row.knowledgeSourceIds.forEach((id) => { counts[String(id)] = (counts[String(id)] ?? 0) + 1; });
    return counts;
  }, {});

  return NextResponse.json({
    knowledge: SUPPORT_KNOWLEDGE,
    knowledgeVersion: SUPPORT_KNOWLEDGE_VERSION,
    categoryLabels: SUPPORT_CATEGORY_LABELS,
    prompt: SUPPORT_AGENT_SYSTEM_PROMPT,
    stats: {
      total: safeRuns.length,
      autoReplied: safeRuns.filter((row) => row.autoReplied).length,
      manualReview: safeRuns.filter((row) => row.manualReview && row.caseStatus !== "resolved").length,
      failed: safeRuns.filter((row) => row.status === "failed" && row.caseStatus !== "resolved").length,
      categories,
      sourceUsage,
      automatedCoverage: 4,
      protectedBoundaries: 3,
    },
    answerPreviews: answerPreviews(),
    recentCases: safeRuns.slice(0, 50),
    learningNotes: noteError ? [] : learningNotes(notesSetting?.value).slice(0, 100),
    learningAvailable: !noteError,
  });
}

export async function POST(request: NextRequest) {
  const denied = await requirePraxisRole(["admin", "verwaltung"]);
  if (denied) return denied;
  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Thema, Titel und allgemeine Lernnotiz vollständig angeben." }, { status: 400 });
  if (containsSensitiveData(`${parsed.data.title} ${parsed.data.content}`)) {
    return NextResponse.json({ error: "Die Lernnotiz darf keine E-Mail-Adresse, Telefonnummer oder Bankverbindung enthalten." }, { status: 400 });
  }
  const auth = createServerComponentClient();
  const { data: { user } } = await auth.auth.getUser();
  const db = createServerClient();
  const { data: current, error: readError } = await db.from("einstellungen").select("value").eq("key", SUPPORT_LEARNING_KEY).maybeSingle();
  if (readError) return NextResponse.json({ error: "Lernnotiz konnte nicht gespeichert werden." }, { status: 500 });
  const note: LearningNote = { id: randomUUID(), ...parsed.data, status: "pending", created_at: new Date().toISOString(), created_by: user?.id ?? null };
  const next = [note, ...learningNotes(current?.value)].slice(0, 500);
  const { error } = await db.from("einstellungen").upsert({ key: SUPPORT_LEARNING_KEY, value: next }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "Lernnotiz konnte nicht gespeichert werden." }, { status: 500 });
  return NextResponse.json({ note }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const denied = await requirePraxisRole(["admin"]);
  if (denied) return denied;
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Prüfentscheidung." }, { status: 400 });
  const auth = createServerComponentClient();
  const { data: { user } } = await auth.auth.getUser();
  const db = createServerClient();
  const { data: current, error: readError } = await db.from("einstellungen").select("value").eq("key", SUPPORT_LEARNING_KEY).maybeSingle();
  if (readError) return NextResponse.json({ error: "Prüfentscheidung konnte nicht gespeichert werden." }, { status: 500 });
  let changed: LearningNote | null = null;
  const next = learningNotes(current?.value).map((note) => {
    if (note.id !== parsed.data.id) return note;
    changed = { ...note, status: parsed.data.status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() };
    return changed;
  });
  if (!changed) return NextResponse.json({ error: "Lernnotiz wurde nicht gefunden." }, { status: 404 });
  const { error } = await db.from("einstellungen").upsert({ key: SUPPORT_LEARNING_KEY, value: next }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "Prüfentscheidung konnte nicht gespeichert werden." }, { status: 500 });
  return NextResponse.json({ note: changed });
}
