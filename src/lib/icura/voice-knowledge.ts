import { promises as fs } from "node:fs";
import path from "node:path";
import { createServerClient } from "@/lib/db/supabase";

type VoiceContext = {
  currentPage: string;
  locale: "de" | "en";
  theme: "light" | "dark";
};

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge", "anima-cura");

const PAGE_GUIDES: Array<{
  match: (pathname: string) => boolean;
  title: string;
  summary: string[];
}> = [
  {
    match: (pathname) => pathname.startsWith("/zahlungen"),
    title: "Zahlungen",
    summary: [
      "Hier geht es um einzelne Banktransaktionen, Zuordnungen, offene Treffer und Prueffaelle.",
      "Nicht mit Offene Posten verwechseln: Zahlungen = Bewegungen, Offene Posten = Forderungen/Rechnungen.",
      "Bei Such- oder Zuordnungsfragen soll iCura erklaeren, ob der Nutzer gerade nach Patient, Sender, Verwendungszweck oder Zuordnung filtert.",
    ],
  },
  {
    match: (pathname) => pathname.startsWith("/offene-posten"),
    title: "Offene Posten",
    summary: [
      "Hier liegen Rechnungen und Forderungen aus IVORIS mit Status wie offen, teilbezahlt oder bezahlt.",
      "Diese Seite zeigt keine reine Quartalssicht, sondern Forderungsbestand.",
      "Wenn Nutzer nach Umsatz fragen, sollte iCura eher Richtung Quartal oder Berichte fuehren statt Offene Posten zu vermischen.",
    ],
  },
  {
    match: (pathname) => pathname.startsWith("/quartal"),
    title: "Quartalsbericht",
    summary: [
      "Diese Seite soll bewusst nur Quartalszahlen erklaeren.",
      "Alt-Historie, Patientenbasis und Gesamtbestaende muessen sprachlich klar getrennt werden.",
      "Wenn Teile noch unklar zugeordnet sind, soll iCura das als laufende Zuordnungsmasse benennen statt als echten Umsatzmix auszugeben.",
    ],
  },
  {
    match: (pathname) => pathname.startsWith("/patienten"),
    title: "Patienten",
    summary: [
      "Hier geht es um Stammdaten, Suche, Detailansicht und Patientenhistorie.",
      "Die Suchlogik darf nicht so sprechen, als seien historische Gesamtzahlen automatisch aktive Patienten.",
    ],
  },
  {
    match: (pathname) => pathname.startsWith("/behandlungen"),
    title: "Behandlungen",
    summary: [
      "Hier werden Behandlungsarten pro Patient zugeordnet.",
      "Filter fuer offen, aktiv und Historie muessen sprachlich sauber getrennt werden.",
      "Wenn Nutzer nach gespeicherten Behandlungsarten fragen, sollte iCura erklaeren, dass Auswahl und Persistenz je Patient wichtig sind.",
    ],
  },
  {
    match: (pathname) => pathname.startsWith("/animasign"),
    title: "AnimaSign",
    summary: [
      "Hier geht es um Anamneseboegen, Signaturen, PDF-Ablage und IVORIS-Sync.",
      "iCura soll bei Problemen zwischen Signatur offen, PDF offen, Ivoris-Sync offen und manueller Pruefung unterscheiden.",
      "Bei rechtlich sensiblen Fragen lieber klar den Status benennen statt Vermutungen zu machen.",
    ],
  },
  {
    match: (pathname) => pathname.startsWith("/automatisierungen"),
    title: "Automatisierungen",
    summary: [
      "Hier kann iCura beim Entwurf von Workflows helfen und dann direkt in den Workflow-Bereich fuehren.",
      "iCura soll eher konkrete Automationsschritte vorschlagen als generische KI-Phrasen.",
    ],
  },
  {
    match: () => true,
    title: "Allgemein",
    summary: [
      "iCura ist ein Produktnavigator fuer Anima Cura und soll appnah statt allgemein antworten.",
      "Wenn die Frage von Live-Daten abhaengt, soll iCura das erkennbar als aktuellen Stand formulieren.",
    ],
  },
];

let cachedKnowledge: { loadedAt: number; text: string } | null = null;

async function readKnowledgeFiles(): Promise<string> {
  const now = Date.now();
  if (cachedKnowledge && now - cachedKnowledge.loadedAt < 60_000) {
    return cachedKnowledge.text;
  }

  const entries = await fs.readdir(KNOWLEDGE_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  const contents = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(KNOWLEDGE_DIR, file), "utf8");
      return `# Datei: ${file}\n${raw.trim()}`;
    }),
  );

  const text = contents.join("\n\n");
  cachedKnowledge = { loadedAt: now, text };
  return text;
}

async function readWorkflowCount(db: ReturnType<typeof createServerClient>): Promise<number | null> {
  const { data, error } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", "workflows")
    .maybeSingle();

  if (error) return null;
  return Array.isArray(data?.value) ? data.value.length : 0;
}

async function loadLiveFacts() {
  const db = createServerClient();

  const [
    patientsRes,
    transactionsRes,
    openItemsRes,
    partialItemsRes,
    paidItemsRes,
    animaPendingRes,
    animaSignedTodayRes,
    workflowRunsTodayRes,
    workflowCount,
  ] = await Promise.all([
    db.from("patients").select("*", { count: "exact", head: true }),
    db.from("transaktionen").select("*", { count: "exact", head: true }),
    db.from("offene_posten").select("*", { count: "exact", head: true }).eq("status", "offen"),
    db.from("offene_posten").select("*", { count: "exact", head: true }).eq("status", "teilbezahlt"),
    db.from("offene_posten").select("*", { count: "exact", head: true }).eq("status", "bezahlt"),
    db.from("anamnese_submissions").select("*", { count: "exact", head: true }).eq("status", "signatur_ausstehend"),
    db.from("anamnese_submissions").select("*", { count: "exact", head: true }).eq("status", "signiert").gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    db.from("workflow_runs").select("*", { count: "exact", head: true }).gte("started_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    readWorkflowCount(db),
  ]);

  return {
    patients: patientsRes.count ?? null,
    transactions: transactionsRes.count ?? null,
    offenePosten: openItemsRes.count ?? null,
    teilbezahlt: partialItemsRes.count ?? null,
    bezahlt: paidItemsRes.count ?? null,
    animaPending: animaPendingRes.count ?? null,
    animaSignedToday: animaSignedTodayRes.count ?? null,
    workflowRunsToday: workflowRunsTodayRes.count ?? null,
    workflowCount,
  };
}

function buildPageGuide(pathname: string): string {
  const guide = PAGE_GUIDES.find((entry) => entry.match(pathname)) ?? PAGE_GUIDES[PAGE_GUIDES.length - 1];
  return [`Aktueller Fokusbereich: ${guide.title}`, ...guide.summary.map((line) => `- ${line}`)].join("\n");
}

function buildLiveFactsText(facts: Awaited<ReturnType<typeof loadLiveFacts>>): string {
  const lines = [
    "Live-Daten fuer iCura (wenn verfuegbar):",
    `- Patienten gesamt: ${facts.patients ?? "unbekannt"}`,
    `- Transaktionen gesamt: ${facts.transactions ?? "unbekannt"}`,
    `- Offene Posten offen: ${facts.offenePosten ?? "unbekannt"}`,
    `- Offene Posten teilbezahlt: ${facts.teilbezahlt ?? "unbekannt"}`,
    `- Offene Posten bezahlt: ${facts.bezahlt ?? "unbekannt"}`,
    `- AnimaSign Signatur offen: ${facts.animaPending ?? "unbekannt"}`,
    `- AnimaSign heute signiert: ${facts.animaSignedToday ?? "unbekannt"}`,
    `- Workflows gesamt: ${facts.workflowCount ?? "unbekannt"}`,
    `- Workflow-Runs heute: ${facts.workflowRunsToday ?? "unbekannt"}`,
  ];

  return lines.join("\n");
}

function trimKnowledge(raw: string): string {
  return raw.replace(/\r/g, "").slice(0, 12_000);
}

export async function buildICuraVoiceKnowledge(context: VoiceContext): Promise<string> {
  const [knowledgeDocs, liveFacts] = await Promise.all([
    readKnowledgeFiles(),
    loadLiveFacts().catch(() => ({
      patients: null,
      transactions: null,
      offenePosten: null,
      teilbezahlt: null,
      bezahlt: null,
      animaPending: null,
      animaSignedToday: null,
      workflowRunsToday: null,
      workflowCount: null,
    })),
  ]);

  return [
    buildPageGuide(context.currentPage),
    buildLiveFactsText(liveFacts),
    "Kuratiertes Produktwissen:",
    trimKnowledge(knowledgeDocs),
  ].join("\n\n");
}
