// Revenue Intelligence: Behavioral Profiling Engine
// Erstellt beschreibende Profile pro Patient aus Verhaltens- und Kontextdaten.
// KEIN gewichteter Score (kommt später nach Datensammlung als Kalibrierung).
// Stattdessen: Kontext + Verhaltensmuster + Klartext-Signale.

export interface PatientContext {
  age?: number;
  versicherung?: string | null;
  kasse?: string | null;
  behandlung?: string | null;
  behandlung_status?: string | null;
  geschlecht?: string | null;
  // Erweiterbar wenn Anamnesebogen erfasst wird:
  beruf?: string | null;
  familienstand?: string | null;
  kinder?: number | null;
}

export interface ProfilingInput {
  events: { event_type: string; created_at: string; metadata?: any }[];
  zahlungen?: { status: string; faellig_am: string; bezahlt_am?: string }[];
  context?: PatientContext;
}

export interface BehaviorSignal {
  text: string;
  type: "positive" | "neutral" | "warning";
}

export interface PatientProfile {
  risk_level: "high" | "medium" | "low";
  signals: BehaviorSignal[];
  context_tags: string[];        // z.B. "19 Jahre", "Gesetzlich", "Aktive Behandlung"
  activity_summary: {
    app_opens: number;
    last_active_days: number | null;
    most_used_tab: string | null;
    total_events: number;
  };
  trend: "rising" | "stable" | "falling" | "unknown";
}

function ageGroup(age?: number): string | null {
  if (!age) return null;
  if (age < 18) return "Minderjährig";
  if (age < 25) return "Junge Erwachsene";
  if (age < 40) return "Erwachsene";
  if (age < 60) return "Mittleres Alter";
  return "Senioren";
}

export function buildProfile(input: ProfilingInput): PatientProfile {
  const { events, zahlungen = [], context = {} } = input;
  const now = Date.now();
  const signals: BehaviorSignal[] = [];

  // ── Aktivitäts-Zusammenfassung ──
  const recent = events.filter(e => now - new Date(e.created_at).getTime() < 14 * 864e5);
  const appOpens = recent.filter(e => e.event_type === "app_open").length;
  const lastEvent = events[0];
  const lastActiveDays = lastEvent ? Math.floor((now - new Date(lastEvent.created_at).getTime()) / 864e5) : null;

  const tabCounts: Record<string, number> = {};
  for (const e of events.filter(e => e.event_type === "tab_view")) {
    const tab = e.metadata?.tab;
    if (tab) tabCounts[tab] = (tabCounts[tab] || 0) + 1;
  }
  const mostUsedTab = Object.entries(tabCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // ── Verhaltens-Signale ──
  let warnings = 0;

  if (appOpens === 0) { signals.push({ text: "Keine App-Nutzung in 14 Tagen", type: "warning" }); warnings++; }
  else if (appOpens >= 5) signals.push({ text: "Regelmäßig aktiv", type: "positive" });

  if (lastActiveDays !== null && lastActiveDays > 14) { signals.push({ text: `Seit ${lastActiveDays} Tagen inaktiv`, type: "warning" }); warnings++; }

  const animapayOpens = recent.filter(e => e.event_type === "animapay_open").length;
  if (animapayOpens > 0) signals.push({ text: "AnimaPay genutzt", type: "positive" });

  const chatMsgs = recent.filter(e => e.event_type === "chat_message").length;
  if (chatMsgs > 0) signals.push({ text: "Kommuniziert aktiv", type: "positive" });

  const notifReads = recent.filter(e => e.event_type === "notification_read" || e.event_type === "notification_clicked").length;
  if (notifReads === 0 && recent.length > 2) { signals.push({ text: "Benachrichtigungen ignoriert", type: "warning" }); warnings++; }

  // ── Zahlungsverhalten ──
  if (zahlungen.length > 0) {
    const bezahlt = zahlungen.filter(z => z.status === "bezahlt");
    const ueberfaellig = zahlungen.filter(z => z.status === "überfällig" || z.status === "ueberfaellig");
    const verspaetet = bezahlt.filter(z => z.bezahlt_am && z.faellig_am && new Date(z.bezahlt_am) > new Date(z.faellig_am));
    const puenktlich = bezahlt.filter(z => z.bezahlt_am && z.faellig_am && new Date(z.bezahlt_am) <= new Date(z.faellig_am));

    if (ueberfaellig.length > 0) { signals.push({ text: `${ueberfaellig.length} überfällige Rate(n)`, type: "warning" }); warnings += 2; }
    if (verspaetet.length >= 2) { signals.push({ text: `${verspaetet.length}x verspätet gezahlt`, type: "warning" }); warnings++; }
    if (puenktlich.length === zahlungen.length && zahlungen.length > 0) signals.push({ text: "Immer pünktlich", type: "positive" });
  }

  // ── Risiko-Level (heuristisch, kein Score) ──
  let risk_level: "high" | "medium" | "low" = "low";
  if (warnings >= 3) risk_level = "high";
  else if (warnings >= 1) risk_level = "medium";

  // ── Trend ──
  const firstHalf = recent.filter(e => now - new Date(e.created_at).getTime() >= 7 * 864e5).length;
  const secondHalf = recent.filter(e => now - new Date(e.created_at).getTime() < 7 * 864e5).length;
  let trend: "rising" | "stable" | "falling" | "unknown" = "unknown";
  if (recent.length >= 3) {
    if (secondHalf > firstHalf * 1.3) trend = "rising";
    else if (secondHalf < firstHalf * 0.7) trend = "falling";
    else trend = "stable";
  }

  // ── Kontext-Tags ──
  const context_tags: string[] = [];
  if (context.age) context_tags.push(`${context.age} Jahre`);
  const ag = ageGroup(context.age);
  if (ag) context_tags.push(ag);
  if (context.versicherung) { const v = context.versicherung.toLowerCase(); context_tags.push(v.includes("statut") || v.includes("gesetz") ? "Gesetzlich versichert" : v.includes("priv") ? "Privat versichert" : v.includes("famil") ? "Familienversichert" : context.versicherung); }
  if (context.behandlung_status === "aktiv") context_tags.push("Aktive Behandlung");
  if (context.beruf) context_tags.push(context.beruf);
  if (context.familienstand) context_tags.push(context.familienstand);

  return {
    risk_level,
    signals,
    context_tags,
    activity_summary: {
      app_opens: appOpens,
      last_active_days: lastActiveDays,
      most_used_tab: mostUsedTab,
      total_events: events.length,
    },
    trend,
  };
}
