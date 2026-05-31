// Revenue Intelligence: Behavioral Profiling Engine
// Säule 1: Patient — Verhaltens-Profiling
// Kein gewichteter Score. Profiling + Deltas + Stress + Abwesenheit.

export interface PatientContext {
  age?: number;
  versicherung?: string | null;
  kasse?: string | null;
  behandlung?: string | null;
  behandlung_status?: string | null;
  geschlecht?: string | null;
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
  type: "positive" | "neutral" | "warning" | "info";
}

export interface Delta {
  metric: string;
  previous: number;
  current: number;
  change_pct: number; // positive = increase, negative = decrease
}

export interface PatientProfile {
  risk_level: "high" | "medium" | "low";
  signals: BehaviorSignal[];
  context_tags: string[];
  observation: string; // Fliesstext-Beobachtung ("Das System hat beobachtet:")
  activity_summary: {
    app_opens_14d: number;
    total_events: number;
    last_active_days: number | null;
    most_used_tab: string | null;
    avg_session_seconds: number | null;
    primary_device: string | null;
    primary_time_of_day: string | null;
  };
  deltas: Delta[];
  stress_indicators: string[];
  absence_signals: string[];
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

function timeOfDay(hour: number): string {
  if (hour >= 6 && hour < 12) return "Morgens";
  if (hour >= 12 && hour < 18) return "Mittags";
  if (hour >= 18 && hour < 24) return "Abends";
  return "Nachts";
}

export function buildProfile(input: ProfilingInput): PatientProfile {
  const { events, zahlungen = [], context = {} } = input;
  const now = Date.now();
  const signals: BehaviorSignal[] = [];
  const deltas: Delta[] = [];
  const stress_indicators: string[] = [];
  const absence_signals: string[] = [];

  // ── Zeitfenster ──
  const recent = events.filter(e => now - new Date(e.created_at).getTime() < 14 * 864e5);
  const previous = events.filter(e => {
    const age = now - new Date(e.created_at).getTime();
    return age >= 14 * 864e5 && age < 28 * 864e5;
  });
  const lastEvent = events[0];
  const lastActiveDays = lastEvent ? Math.floor((now - new Date(lastEvent.created_at).getTime()) / 864e5) : null;

  // ── App-Nutzung ──
  const appOpens = recent.filter(e => e.event_type === "app_open").length;
  const prevAppOpens = previous.filter(e => e.event_type === "app_open").length;

  if (appOpens === 0) { signals.push({ text: "Keine App-Nutzung in 14 Tagen", type: "warning" }); }
  else if (appOpens >= 5) { signals.push({ text: "Regelmäßig aktiv", type: "positive" }); }

  if (prevAppOpens > 0) {
    const changePct = Math.round(((appOpens - prevAppOpens) / prevAppOpens) * 100);
    deltas.push({ metric: "App-Öffnungen", previous: prevAppOpens, current: appOpens, change_pct: changePct });
    if (changePct <= -50) signals.push({ text: `App-Nutzung um ${Math.abs(changePct)}% gesunken`, type: "warning" });
    else if (changePct >= 50) signals.push({ text: `App-Nutzung um ${changePct}% gestiegen`, type: "positive" });
  }

  // ── Tageszeit-Analyse ──
  const hours = recent.filter(e => e.event_type === "app_open" && e.metadata?.hour != null).map(e => e.metadata.hour as number);
  const primaryHour = hours.length > 0 ? timeOfDay(hours.reduce((a, b) => a + b, 0) / hours.length) : null;

  // Tageszeit-Verschiebung
  const prevHours = previous.filter(e => e.event_type === "app_open" && e.metadata?.hour != null).map(e => e.metadata.hour as number);
  if (prevHours.length > 0 && hours.length > 0) {
    const prevAvg = prevHours.reduce((a, b) => a + b, 0) / prevHours.length;
    const currAvg = hours.reduce((a, b) => a + b, 0) / hours.length;
    if (Math.abs(currAvg - prevAvg) > 6) {
      signals.push({ text: `Nutzungszeit verschoben: ${timeOfDay(prevAvg)} → ${timeOfDay(currAvg)}`, type: "info" });
    }
  }

  // ── Gerät ──
  const devices = recent.filter(e => e.event_type === "app_open" && e.metadata?.device).map(e => e.metadata.device as string);
  const deviceCounts: Record<string, number> = {};
  for (const d of devices) deviceCounts[d] = (deviceCounts[d] || 0) + 1;
  const primaryDevice = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // ── Session-Länge ──
  const tabDurations = recent.filter(e => e.event_type === "tab_view" && e.metadata?.duration_seconds > 0).map(e => e.metadata.duration_seconds as number);
  const avgSession = tabDurations.length > 0 ? Math.round(tabDurations.reduce((a, b) => a + b, 0) / Math.max(appOpens, 1)) : null;

  // ── Tab-Verhalten ──
  const tabCounts: Record<string, number> = {};
  for (const e of events.filter(e => e.event_type === "tab_view")) {
    const tab = e.metadata?.tab;
    if (tab) tabCounts[tab] = (tabCounts[tab] || 0) + 1;
  }
  const mostUsedTab = Object.entries(tabCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Tab-Muster-Änderung
  const recentTabs: Record<string, number> = {};
  const prevTabs: Record<string, number> = {};
  for (const e of recent.filter(e => e.event_type === "tab_view")) { const t = e.metadata?.tab; if (t) recentTabs[t] = (recentTabs[t] || 0) + 1; }
  for (const e of previous.filter(e => e.event_type === "tab_view")) { const t = e.metadata?.tab; if (t) prevTabs[t] = (prevTabs[t] || 0) + 1; }

  const prevTopTab = Object.entries(prevTabs).sort((a, b) => b[1] - a[1])[0]?.[0];
  const currTopTab = Object.entries(recentTabs).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (prevTopTab && currTopTab && prevTopTab !== currTopTab) {
    signals.push({ text: `Tab-Muster geändert: ${prevTopTab} → ${currTopTab}`, type: "info" });
  }

  // ── Zahlungsinteraktion ──
  const animapayOpens = recent.filter(e => e.event_type === "animapay_open").length;
  if (animapayOpens > 0) signals.push({ text: "AnimaPay genutzt", type: "positive" });

  const qrViews = recent.filter(e => e.event_type === "qrcode_view").length;
  if (qrViews > 0 && animapayOpens > qrViews) {
    signals.push({ text: "AnimaPay geöffnet aber QR nicht gescannt", type: "info" });
  }

  // ── Chat ──
  const chatMsgs = recent.filter(e => e.event_type === "chat_message").length;
  if (chatMsgs > 0) signals.push({ text: "Kommuniziert aktiv", type: "positive" });

  const chatResponses = recent.filter(e => e.event_type === "chat_response" && e.metadata?.response_time_seconds);
  const avgResponseTime = chatResponses.length > 0 ? Math.round(chatResponses.reduce((a, b) => a + (b.metadata.response_time_seconds as number), 0) / chatResponses.length) : null;

  // ── Benachrichtigungen ──
  const notifClicks = recent.filter(e => e.event_type === "notification_clicked").length;
  const notifReads = recent.filter(e => e.event_type === "notification_read" || e.event_type === "notification_clicked").length;
  if (notifReads === 0 && recent.length > 2) { signals.push({ text: "Benachrichtigungen ignoriert", type: "warning" }); }
  if (notifClicks > 0) { signals.push({ text: `${notifClicks} Push-Notification(s) geklickt`, type: "positive" }); }

  // ── Zahlungshistorie ──
  if (zahlungen.length > 0) {
    const bezahlt = zahlungen.filter(z => z.status === "bezahlt");
    const ueberfaellig = zahlungen.filter(z => z.status === "überfällig" || z.status === "ueberfaellig");
    const verspaetet = bezahlt.filter(z => z.bezahlt_am && z.faellig_am && new Date(z.bezahlt_am) > new Date(z.faellig_am));
    const puenktlich = bezahlt.filter(z => z.bezahlt_am && z.faellig_am && new Date(z.bezahlt_am) <= new Date(z.faellig_am));

    if (ueberfaellig.length > 0) signals.push({ text: `${ueberfaellig.length} überfällige Rate(n)`, type: "warning" });
    if (verspaetet.length >= 2) signals.push({ text: `${verspaetet.length}x verspätet gezahlt`, type: "warning" });
    if (puenktlich.length === zahlungen.length && zahlungen.length > 0) signals.push({ text: "Immer pünktlich", type: "positive" });

    const prevPuenktlich = previous.filter(e => e.event_type === "payment_view").length;
    const currPayViews = recent.filter(e => e.event_type === "payment_view").length;
    if (prevPuenktlich > 0) {
      deltas.push({ metric: "Zahlungs-Ansichten", previous: prevPuenktlich, current: currPayViews, change_pct: Math.round(((currPayViews - prevPuenktlich) / prevPuenktlich) * 100) });
    }
  }

  // ── Stress-Indikatoren ──
  const dailyOpens: Record<string, number> = {};
  for (const e of recent.filter(e => e.event_type === "app_open")) {
    const day = e.created_at.slice(0, 10);
    dailyOpens[day] = (dailyOpens[day] || 0) + 1;
  }
  for (const [day, count] of Object.entries(dailyOpens)) {
    if (count >= 5) stress_indicators.push(`${count}x App geöffnet am ${day}`);
  }

  const animapayNoPayment = recent.filter(e => e.event_type === "animapay_open").length > 0 && zahlungen.filter(z => z.status === "bezahlt" && z.bezahlt_am && now - new Date(z.bezahlt_am).getTime() < 14 * 864e5).length === 0;
  if (animapayNoPayment) stress_indicators.push("AnimaPay geöffnet aber nicht gezahlt");

  // ── Abwesenheit als Signal ──
  if (lastActiveDays !== null && lastActiveDays > 14) absence_signals.push(`App seit ${lastActiveDays} Tagen nicht geöffnet`);
  if (notifReads === 0 && events.filter(e => e.event_type === "notification_clicked" || e.event_type === "notification_read").length === 0) {
    absence_signals.push("Hat noch nie eine Benachrichtigung geöffnet");
  }
  if (animapayOpens === 0 && events.filter(e => e.event_type === "animapay_open").length === 0) {
    absence_signals.push("AnimaPay noch nie geöffnet");
  }

  // ── Risiko-Level ──
  const warnings = signals.filter(s => s.type === "warning").length;
  let risk_level: "high" | "medium" | "low" = "low";
  if (warnings >= 3 || stress_indicators.length >= 2) risk_level = "high";
  else if (warnings >= 1 || absence_signals.length >= 2) risk_level = "medium";

  // ── Trend ──
  const firstHalf = recent.filter(e => now - new Date(e.created_at).getTime() >= 7 * 864e5).length;
  const secondHalf = recent.filter(e => now - new Date(e.created_at).getTime() < 7 * 864e5).length;
  let trend: "rising" | "stable" | "falling" | "unknown" = "unknown";
  if (recent.length >= 3) {
    if (secondHalf > firstHalf * 1.3) trend = "rising";
    else if (secondHalf < firstHalf * 0.7) { trend = "falling"; signals.push({ text: "Aktivität sinkt", type: "warning" }); }
    else trend = "stable";
  }

  // ── Kontext-Tags ──
  const context_tags: string[] = [];
  if (context.age) context_tags.push(`${context.age} Jahre`);
  const ag = ageGroup(context.age);
  if (ag) context_tags.push(ag);
  if (context.versicherung) {
    const v = context.versicherung.toLowerCase();
    context_tags.push(v.includes("statut") || v.includes("gesetz") ? "Gesetzlich versichert" : v.includes("priv") ? "Privat versichert" : v.includes("famil") ? "Familienversichert" : context.versicherung);
  }
  if (context.geschlecht) context_tags.push(context.geschlecht === "m" || context.geschlecht === "männlich" ? "Männlich" : context.geschlecht === "w" || context.geschlecht === "weiblich" ? "Weiblich" : context.geschlecht);
  if (context.behandlung_status === "aktiv") context_tags.push("Aktive Behandlung");
  if (context.beruf) context_tags.push(context.beruf);
  if (context.familienstand) context_tags.push(context.familienstand);

  // ── Fliesstext-Beobachtung ──
  const tabNames: Record<string, string> = { home: "Start", journey: "Verlauf", progress: "Fortschritt", chat: "Chat", more: "Mehr" };
  const parts: string[] = [];
  if (appOpens > 0 && primaryHour) parts.push(`öffnet die App ${primaryHour.toLowerCase()} (${appOpens}x in 14 Tagen)`);
  else if (appOpens === 0) parts.push("hat die App in den letzten 14 Tagen nicht geöffnet");
  if (primaryDevice) parts.push(`nutzt ${primaryDevice}`);
  if (mostUsedTab) parts.push(`nutzt hauptsächlich ${tabNames[mostUsedTab] || mostUsedTab}`);
  if (notifReads === 0 && recent.length > 0) parts.push("ignoriert Push-Benachrichtigungen");
  if (zahlungen.length > 0) {
    const uf = zahlungen.filter(z => z.status === "überfällig" || z.status === "ueberfaellig").length;
    const vs = zahlungen.filter(z => z.bezahlt_am && z.faellig_am && new Date(z.bezahlt_am) > new Date(z.faellig_am)).length;
    if (uf > 0) parts.push(`hat ${uf} überfällige Rate(n)`);
    else if (vs > 0) parts.push(`zahlt gelegentlich verspätet (${vs}x)`);
    else parts.push("zahlt zuverlässig");
  }
  if (stress_indicators.length > 0) parts.push("zeigt Stress-Muster");

  const name = "Patient";
  const observation = parts.length > 0 ? parts.join(", ") + "." : "Noch keine ausreichende Datenbasis.";

  return {
    risk_level,
    signals,
    context_tags,
    observation,
    activity_summary: {
      app_opens_14d: appOpens,
      total_events: events.length,
      last_active_days: lastActiveDays,
      most_used_tab: mostUsedTab,
      avg_session_seconds: avgSession,
      primary_device: primaryDevice,
      primary_time_of_day: primaryHour,
    },
    deltas,
    stress_indicators,
    absence_signals,
    trend,
  };
}
