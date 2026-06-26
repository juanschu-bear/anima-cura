import { createServerClient } from "@/lib/db/supabase";

// ============================================================
// AnimaHost Conversation Engine
// Das Gehirn des Avatars. Baut den kompletten Patienten-Kontext
// und generiert den System-Prompt fur die Avatar-Session.
// ============================================================

export interface PatientContext {
  mode: "neupatient" | "bestandspatient" | "unbekannt";
  patient_name: string | null;
  vorname: string | null;
  termin_uhrzeit: string | null;
  behandler: string | null;
  behandlung_art: string | null;
  wartezeit_minuten: number | null;
  sprache: string;
  aktionen: {
    chipkarte_faellig: boolean;
    anamnesebogen_ausstehend: boolean;
    offene_rechnung_euro: number;
  };
  ist_kind: boolean;
  begleitung_vermutet: boolean;
}

export interface ConversationResult {
  context: PatientContext;
  system_prompt: string;
  opening_line: string;
  display_cards: DisplayCard[];
}

export interface DisplayCard {
  type: "info" | "warning" | "alert";
  label: string;
  value: string;
}

// ============================================================
// Kontext laden
// ============================================================

export async function buildPatientContext(terminId: string): Promise<PatientContext> {
  const supabase = createServerClient();

  const { data: termin } = await supabase
    .from("tagesplan_termine")
    .select("*")
    .eq("id", terminId)
    .single();

  if (!termin) {
    return {
      mode: "unbekannt",
      patient_name: null,
      vorname: null,
      termin_uhrzeit: null,
      behandler: null,
      behandlung_art: null,
      wartezeit_minuten: null,
      sprache: "de",
      aktionen: { chipkarte_faellig: false, anamnesebogen_ausstehend: false, offene_rechnung_euro: 0 },
      ist_kind: false,
      begleitung_vermutet: false,
    };
  }

  let sprache = "de";
  let ist_kind = false;
  let vorname: string | null = null;

  if (termin.patient_id) {
    const { data: patient } = await supabase
      .from("patients")
      .select("vorname, nachname, geburtsdatum, sprache")
      .eq("id", termin.patient_id)
      .single();

    if (patient) {
      vorname = patient.vorname;
      if (patient.sprache) sprache = patient.sprache;
      if (patient.geburtsdatum) {
        const alter = Math.floor((Date.now() - new Date(patient.geburtsdatum).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        ist_kind = alter < 16;
      }
    }
  }

  // Wartezeit berechnen
  let wartezeit: number | null = null;
  if (termin.uhrzeit) {
    const [h, m] = termin.uhrzeit.split(":").map(Number);
    const terminTime = new Date();
    terminTime.setHours(h, m, 0, 0);
    const diff = Math.round((terminTime.getTime() - Date.now()) / 60000);
    wartezeit = diff > 0 ? diff : 0;
  }

  return {
    mode: termin.ist_neupatient ? "neupatient" : "bestandspatient",
    patient_name: termin.patient_name,
    vorname,
    termin_uhrzeit: termin.uhrzeit?.slice(0, 5) || null,
    behandler: termin.behandler,
    behandlung_art: termin.behandlung_art,
    wartezeit_minuten: wartezeit,
    sprache,
    aktionen: {
      chipkarte_faellig: termin.chipkarte_faellig || false,
      anamnesebogen_ausstehend: termin.anamnesebogen_ausstehend || false,
      offene_rechnung_euro: termin.offene_rechnungen_euro || 0,
    },
    ist_kind,
    begleitung_vermutet: ist_kind,
  };
}

// ============================================================
// System Prompt bauen
// ============================================================

export function buildSystemPrompt(ctx: PatientContext): string {
  const lang = ctx.sprache === "de" ? "Deutsch" : ctx.sprache === "en" ? "Englisch" : ctx.sprache === "es" ? "Spanisch" : ctx.sprache === "ru" ? "Russisch" : ctx.sprache === "tr" ? "Turkisch" : "Deutsch";

  let prompt = `Du bist der digitale Empfangsassistent der Kieferorthopädie-Praxis Dr. Schubert in Leipzig.
Du sprichst ${lang}.
Du bist freundlich, professionell und effizient. Keine Floskeln, kein Smalltalk, direkt zum Punkt.
Du sprichst Patienten mit ihrem Nachnamen an (Frau/Herr + Nachname).
${ctx.ist_kind ? "Der Patient ist ein Kind/Jugendlicher. Sprich einfacher und freundlicher. Beziehe die Begleitperson mit ein." : ""}

WICHTIGE REGELN:
- Sprich nie uber medizinische Details oder Diagnosen.
- Offene Rechnungen NIEMALS laut ansprechen wenn andere Patienten in Hörweite sein könnten. Zeige den Betrag nur auf dem Display an oder flustere diskret.
- Wenn du etwas nicht weisst oder der Patient eine komplexe Frage stellt, sage: "Das kläre ich gerne fur Sie, einen Moment bitte" und eskaliere an die Rezeption.
- Halte dich kurz. Maximal 2-3 Sätze pro Sprechakt.

`;

  if (ctx.mode === "unbekannt") {
    prompt += `SITUATION: Ein unbekannter Patient steht vor dir. Du weisst nicht wer es ist.
AUFGABE: Begrüsse freundlich und frage ob die Person einen Termin hat. Weise auf den QR-Code hin zum Einchecken.`;
  } else if (ctx.mode === "neupatient") {
    prompt += `SITUATION: ${ctx.patient_name} ist zum ERSTEN Mal in der Praxis. Neupatient.
Termin: ${ctx.termin_uhrzeit} Uhr bei ${ctx.behandler}. ${ctx.behandlung_art || ""}
AUFGABE: Herzlich begrüssen. Erklären dass der digitale Anamnesebogen ausgefüllt werden muss. QR-Code auf dem Display zeigen oder Tablet anbieten.`;
  } else {
    prompt += `SITUATION: ${ctx.patient_name} ist Bestandspatient.
Termin: ${ctx.termin_uhrzeit} Uhr bei ${ctx.behandler}. ${ctx.behandlung_art || ""}
${ctx.wartezeit_minuten !== null && ctx.wartezeit_minuten > 0 ? `Geschätzte Wartezeit: ca. ${ctx.wartezeit_minuten} Minuten.` : "Der Termin ist jetzt."}

OFFENE AKTIONEN:
${ctx.aktionen.chipkarte_faellig ? "- Versichertenkarte muss dieses Quartal noch eingelesen werden. Bitte den Patienten die Karte fur Sabine bereitzuhalten." : ""}
${ctx.aktionen.anamnesebogen_ausstehend ? "- Anamnesebogen ist noch nicht ausgefüllt. QR-Code anzeigen und Patient anleiten." : ""}
${ctx.aktionen.offene_rechnung_euro > 0 ? `- Offene Rechnung: ${ctx.aktionen.offene_rechnung_euro.toFixed(2)} EUR. NUR AUF DEM DISPLAY ANZEIGEN, NICHT LAUT SAGEN.` : ""}
${!ctx.aktionen.chipkarte_faellig && !ctx.aktionen.anamnesebogen_ausstehend && ctx.aktionen.offene_rechnung_euro === 0 ? "- Keine offenen Aktionen. Kurze Begrüssung und Platz nehmen lassen." : ""}`;
  }

  return prompt;
}

// ============================================================
// Opening Line generieren
// ============================================================

export function buildOpeningLine(ctx: PatientContext): string {
  const nachname = ctx.patient_name?.split(",")[0]?.trim();
  const anrede = ctx.ist_kind ? ctx.vorname || nachname : (nachname ? `${ctx.ist_kind ? "" : ""}${nachname}` : null);

  if (ctx.mode === "unbekannt") {
    if (ctx.sprache === "en") return "Welcome to Praxis Dr. Schubert! Do you have an appointment today?";
    if (ctx.sprache === "es") return "Bienvenido a la consulta del Dr. Schubert. Tiene una cita hoy?";
    if (ctx.sprache === "ru") return "Dobro pozhalovat v praktiku Dr. Schubert! U vas est zapis na segodnya?";
    if (ctx.sprache === "tr") return "Dr. Schubert muayenehanesine hosgeldiniz! Bugun randevunuz var mi?";
    return "Willkommen in der Praxis Dr. Schubert! Haben Sie einen Termin heute?";
  }

  if (ctx.mode === "neupatient") {
    return `Willkommen in der Praxis Dr. Schubert, ${anrede ? `${anrede}` : ""}! Schön, dass Sie da sind. Fur Ihren ersten Besuch brauchen wir noch ein paar Informationen von Ihnen.`;
  }

  // Bestandspatient
  let line = `Hallo ${anrede ? `${anrede}` : ""}, schön Sie wiederzusehen!`;

  if (ctx.wartezeit_minuten !== null && ctx.wartezeit_minuten > 5) {
    line += ` Ihr Termin ist um ${ctx.termin_uhrzeit} Uhr, es sind noch etwa ${ctx.wartezeit_minuten} Minuten.`;
  } else if (ctx.wartezeit_minuten !== null && ctx.wartezeit_minuten <= 5) {
    line += ` Ihr Termin ist gleich dran.`;
  }

  if (ctx.aktionen.chipkarte_faellig) {
    line += " Bitte halten Sie Ihre Versichertenkarte bereit.";
  }

  if (ctx.aktionen.anamnesebogen_ausstehend) {
    line += " Wir brauchen noch Ihren aktualisierten Fragebogen.";
  }

  return line;
}

// ============================================================
// Display Cards bauen (was auf dem Kiosk-Screen angezeigt wird)
// ============================================================

export function buildDisplayCards(ctx: PatientContext): DisplayCard[] {
  const cards: DisplayCard[] = [];

  if (ctx.termin_uhrzeit && ctx.behandlung_art) {
    cards.push({
      type: "info",
      label: "Termin",
      value: `${ctx.termin_uhrzeit} Uhr \u00b7 ${ctx.behandlung_art}`,
    });
  }

  if (ctx.wartezeit_minuten !== null && ctx.wartezeit_minuten > 0) {
    cards.push({
      type: "info",
      label: "Wartezeit",
      value: `ca. ${ctx.wartezeit_minuten} Minuten`,
    });
  }

  if (ctx.aktionen.chipkarte_faellig) {
    cards.push({
      type: "warning",
      label: "Aktion erforderlich",
      value: "Chipkarte dieses Quartal noch einlesen",
    });
  }

  if (ctx.aktionen.anamnesebogen_ausstehend) {
    cards.push({
      type: "warning",
      label: "Aktion erforderlich",
      value: "Anamnesebogen noch ausfullen",
    });
  }

  if (ctx.aktionen.offene_rechnung_euro > 0) {
    cards.push({
      type: "alert",
      label: "Offene Rechnung",
      value: `${ctx.aktionen.offene_rechnung_euro.toFixed(2)} \u20ac`,
    });
  }

  return cards;
}

// ============================================================
// Alles zusammen
// ============================================================

export async function generateConversation(terminId: string): Promise<ConversationResult> {
  const context = await buildPatientContext(terminId);
  const system_prompt = buildSystemPrompt(context);
  const opening_line = buildOpeningLine(context);
  const display_cards = buildDisplayCards(context);

  return { context, system_prompt, opening_line, display_cards };
}

export async function generateUnknownConversation(): Promise<ConversationResult> {
  const context: PatientContext = {
    mode: "unbekannt",
    patient_name: null,
    vorname: null,
    termin_uhrzeit: null,
    behandler: null,
    behandlung_art: null,
    wartezeit_minuten: null,
    sprache: "de",
    aktionen: { chipkarte_faellig: false, anamnesebogen_ausstehend: false, offene_rechnung_euro: 0 },
    ist_kind: false,
    begleitung_vermutet: false,
  };

  return {
    context,
    system_prompt: buildSystemPrompt(context),
    opening_line: buildOpeningLine(context),
    display_cards: [],
  };
}
