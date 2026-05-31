// Revenue Intelligence Engine v2
// Event-Kategorien, Warning-Gewichtung, Financial Risk, Severity, Break Pattern (Grundstruktur)

import { RI_CONFIG, categorizeEvent, EventCategory } from "./ri-config";

export interface PatientContext {
  age?: number;
  versicherung?: string | null;
  geschlecht?: string | null;
  behandlung_status?: string | null;
  beruf?: string | null;
  familienstand?: string | null;
}

export interface ProfilingInput {
  events: { event_type: string; created_at: string; metadata?: any }[];
  zahlungen?: { status: string; faellig_am: string; bezahlt_am?: string; betrag?: number }[];
  context?: PatientContext;
  restschuld?: number;
  first_risk_date?: string | null;
}

export interface BehaviorSignal {
  text: string;
  type: "positive" | "neutral" | "warning" | "info";
  severity: "kritisch" | "mittel" | "frueh" | "none";
  weight: number;
}

export interface Delta {
  metric: string;
  previous: number;
  current: number;
  change_pct: number;
}

export interface CategoryPresence {
  engagement: number;
  intent: number;
  action: number;
}

export interface PatientProfile {
  risk_level: "high" | "medium" | "low";
  risk_punkte: number;
  financial_risk: number;
  signals: BehaviorSignal[];
  context_tags: string[];
  observation: string;
  category_presence: CategoryPresence;
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
  severity_timestamp: {
    first_risk_date: string | null;
    risk_duration_days: number | null;
  };
}

const C = RI_CONFIG;

function ageGroup(age?: number): string | null {
  if (!age) return null;
  if (age < 18) return "Minderjährig";
  if (age < 24) return "Junge Erwachsene (Eltern zahlen wahrsch.)";
  if (age < 31) return "Selbstzahler-Einstieg";
  if (age < 51) return "Etabliert";
  return "Senior";
}

function timeOfDay(hour: number): string {
  if (hour >= 6 && hour < 12) return "Morgens";
  if (hour >= 12 && hour < 18) return "Mittags";
  if (hour >= 18 && hour < 24) return "Abends";
  return "Nachts";
}

function addSignal(signals: BehaviorSignal[], text: string, type: BehaviorSignal["type"], severity: BehaviorSignal["severity"]) {
  const weight = severity === "kritisch" ? C.gewicht_kritisch : severity === "mittel" ? C.gewicht_mittel : severity === "frueh" ? C.gewicht_frueh : 0;
  signals.push({ text, type, severity, weight });
}

export function buildProfile(input: ProfilingInput): PatientProfile {
  const { events, zahlungen = [], context = {}, restschuld = 0, first_risk_date = null } = input;
  const now = Date.now();
  const signals: BehaviorSignal[] = [];
  const deltas: Delta[] = [];
  const stress_indicators: string[] = [];
  const absence_signals: string[] = [];

  const recent = events.filter(e => now - new Date(e.created_at).getTime() < C.zeitfenster_tage * 864e5);
  const previous = events.filter(e => {
    const a = now - new Date(e.created_at).getTime();
    return a >= C.zeitfenster_tage * 864e5 && a < (C.zeitfenster_tage + C.vergleichsperiode_tage) * 864e5;
  });
  const lastEvent = events[0];
  const lastActiveDays = lastEvent ? Math.floor((now - new Date(lastEvent.created_at).getTime()) / 864e5) : null;

  // ══ EVENT-KATEGORIEN ══
  const catRecent: CategoryPresence = { engagement: 0, intent: 0, action: 0 };
  for (const e of recent) {
    const cat = categorizeEvent(e.event_type);
    if (cat) catRecent[cat]++;
  }

  // Kategorie-basierte Warnung
  if (catRecent.engagement === 0 && catRecent.intent === 0 && catRecent.action === 0) {
    addSignal(signals, "Komplett inaktiv — kein Engagement, kein Intent, keine Action", "warning", "kritisch");
  } else if (catRecent.engagement > 0 && catRecent.intent === 0) {
    addSignal(signals, "Nutzt App aber zeigt kein Zahlungsinteresse", "warning", "frueh");
  } else if (catRecent.intent > 0 && catRecent.action === 0) {
    addSignal(signals, "Zeigt Zahlungsinteresse aber reagiert nicht auf Kommunikation", "info", "none");
  }

  // ══ APP-NUTZUNG ══
  const appOpens = recent.filter(e => e.event_type === "app_open").length;
  const prevAppOpens = previous.filter(e => e.event_type === "app_open").length;

  if (appOpens === 0) addSignal(signals, `Keine App-Nutzung in ${C.zeitfenster_tage} Tagen`, "warning", "mittel");
  else if (appOpens >= C.app_opens_aktiv_minimum) addSignal(signals, "Regelmäßig aktiv", "positive", "none");

  // Deltas mit gestuften Schwellenwerten
  if (prevAppOpens >= C.delta_minimum_events_vorperiode) {
    const pct = Math.round(((appOpens - prevAppOpens) / prevAppOpens) * 100);
    deltas.push({ metric: "App-Öffnungen", previous: prevAppOpens, current: appOpens, change_pct: pct });
    if (pct <= C.delta_kritisch_pct) addSignal(signals, `App-Nutzung um ${Math.abs(pct)}% eingebrochen`, "warning", "kritisch");
    else if (pct <= C.delta_warning_pct) addSignal(signals, `App-Nutzung um ${Math.abs(pct)}% gesunken`, "warning", "frueh");
    else if (pct <= C.delta_fruehwarnung_pct) addSignal(signals, `App-Nutzung leicht rückläufig (${Math.abs(pct)}%)`, "info", "none");
    else if (pct >= 50) addSignal(signals, `App-Nutzung um ${pct}% gestiegen`, "positive", "none");
  }

  // ══ TAGESZEIT ══
  const hours = recent.filter(e => e.event_type === "app_open" && e.metadata?.hour != null).map(e => e.metadata.hour as number);
  const primaryHour = hours.length > 0 ? timeOfDay(hours.reduce((a, b) => a + b, 0) / hours.length) : null;
  const prevHours = previous.filter(e => e.event_type === "app_open" && e.metadata?.hour != null).map(e => e.metadata.hour as number);
  if (prevHours.length > 0 && hours.length > 0) {
    const shift = Math.abs((hours.reduce((a, b) => a + b, 0) / hours.length) - (prevHours.reduce((a, b) => a + b, 0) / prevHours.length));
    if (shift > C.tageszeit_verschiebung_stunden) {
      addSignal(signals, `Nutzungszeit verschoben: ${timeOfDay(prevHours.reduce((a, b) => a + b, 0) / prevHours.length)} → ${primaryHour}`, "info", "frueh");
    }
  }

  // ══ GERÄT ══
  const devices = recent.filter(e => e.event_type === "app_open" && e.metadata?.device).map(e => e.metadata.device as string);
  const deviceCounts: Record<string, number> = {};
  for (const d of devices) deviceCounts[d] = (deviceCounts[d] || 0) + 1;
  const primaryDevice = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // ══ SESSION ══
  const tabDurations = recent.filter(e => e.event_type === "tab_view" && e.metadata?.duration_seconds > 0).map(e => e.metadata.duration_seconds as number);
  const avgSession = tabDurations.length > 0 ? Math.round(tabDurations.reduce((a, b) => a + b, 0) / Math.max(appOpens, 1)) : null;

  // ══ TAB-VERHALTEN ══
  const tabCounts: Record<string, number> = {};
  for (const e of events.filter(e => e.event_type === "tab_view")) { const t = e.metadata?.tab; if (t) tabCounts[t] = (tabCounts[t] || 0) + 1; }
  const mostUsedTab = Object.entries(tabCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const recentTabs: Record<string, number> = {};
  const prevTabs: Record<string, number> = {};
  for (const e of recent.filter(e => e.event_type === "tab_view")) { const t = e.metadata?.tab; if (t) recentTabs[t] = (recentTabs[t] || 0) + 1; }
  for (const e of previous.filter(e => e.event_type === "tab_view")) { const t = e.metadata?.tab; if (t) prevTabs[t] = (prevTabs[t] || 0) + 1; }
  const prevTop = Object.entries(prevTabs).sort((a, b) => b[1] - a[1])[0]?.[0];
  const currTop = Object.entries(recentTabs).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (prevTop && currTop && prevTop !== currTop) addSignal(signals, `Tab-Muster geändert: ${prevTop} → ${currTop}`, "info", "frueh");

  // ══ ZAHLUNGSINTERAKTION ══
  const animapayOpens = recent.filter(e => e.event_type === "animapay_open").length;
  if (animapayOpens > 0) addSignal(signals, "AnimaPay genutzt", "positive", "none");
  const qrViews = recent.filter(e => e.event_type === "qrcode_view").length;
  if (animapayOpens > 0 && qrViews === 0) addSignal(signals, "AnimaPay geöffnet aber QR nicht angesehen", "info", "frueh");

  // ══ CHAT ══
  const chatMsgs = recent.filter(e => e.event_type === "chat_message").length;
  if (chatMsgs > 0) addSignal(signals, "Kommuniziert aktiv", "positive", "none");

  // ══ BENACHRICHTIGUNGEN ══
  const notifClicks = recent.filter(e => e.event_type === "notification_clicked").length;
  const notifReads = recent.filter(e => e.event_type === "notification_read" || e.event_type === "notification_clicked").length;
  if (notifReads === 0 && recent.length > 2) addSignal(signals, "Benachrichtigungen ignoriert", "warning", "mittel");
  if (notifClicks > 0) addSignal(signals, `${notifClicks} Push-Notification(s) geklickt`, "positive", "none");

  // ══ ZAHLUNGSHISTORIE ══
  if (zahlungen.length > 0) {
    const ueberfaellig = zahlungen.filter(z => z.status === "überfällig" || z.status === "ueberfaellig");
    const verspaetet = zahlungen.filter(z => z.bezahlt_am && z.faellig_am && new Date(z.bezahlt_am) > new Date(z.faellig_am));
    const puenktlich = zahlungen.filter(z => z.status === "bezahlt" && z.bezahlt_am && z.faellig_am && new Date(z.bezahlt_am) <= new Date(z.faellig_am));

    if (ueberfaellig.length > 0) addSignal(signals, `${ueberfaellig.length} überfällige Rate(n)`, "warning", "kritisch");
    if (verspaetet.length >= C.verspaetet_minimum_fuer_warning) addSignal(signals, `${verspaetet.length}x verspätet gezahlt`, "warning", "kritisch");
    if (puenktlich.length === zahlungen.length && zahlungen.length > 0) addSignal(signals, "Immer pünktlich", "positive", "none");
  }

  // ══ STRESS (mit Kontext) ══
  const dailyOpens: Record<string, number> = {};
  for (const e of recent.filter(e => e.event_type === "app_open")) { const d = e.created_at.slice(0, 10); dailyOpens[d] = (dailyOpens[d] || 0) + 1; }
  const hasOverdue = zahlungen.some(z => z.status === "überfällig" || z.status === "ueberfaellig");
  for (const [day, count] of Object.entries(dailyOpens)) {
    if (count >= C.stress_daily_opens_minimum) {
      if (hasOverdue && chatMsgs === 0) stress_indicators.push(`${count}x App am ${day} + überfällig + kein Chat (Vermeidung)`);
      else if (hasOverdue) stress_indicators.push(`${count}x App am ${day} + überfällig (Stress)`);
      // Kein Stress-Flag wenn keine überfälligen Raten (wahrscheinlich Onboarding)
    }
  }
  if (animapayOpens > 0 && hasOverdue) {
    const recentPayments = zahlungen.filter(z => z.status === "bezahlt" && z.bezahlt_am && now - new Date(z.bezahlt_am).getTime() < C.zeitfenster_tage * 864e5);
    if (recentPayments.length === 0) stress_indicators.push("AnimaPay geöffnet aber nicht gezahlt trotz überfälliger Rate");
  }

  // ══ ABWESENHEIT ══
  if (lastActiveDays !== null && lastActiveDays > C.abwesenheit_tage_warning) absence_signals.push(`App seit ${lastActiveDays} Tagen nicht geöffnet`);
  if (events.filter(e => e.event_type === "notification_clicked" || e.event_type === "notification_read").length === 0 && events.length > 0) absence_signals.push("Hat noch nie eine Benachrichtigung geöffnet");
  if (events.filter(e => e.event_type === "animapay_open").length === 0 && events.length > 0) absence_signals.push("AnimaPay noch nie geöffnet");

  // ══ RISIKO-BERECHNUNG (gewichtet) ══
  const risk_punkte = signals.reduce((sum, s) => sum + s.weight, 0)
    + (stress_indicators.length >= 2 ? C.gewicht_kritisch : stress_indicators.length === 1 ? C.gewicht_frueh : 0)
    + (absence_signals.length >= 2 ? C.gewicht_mittel : 0);

  let risk_level: "high" | "medium" | "low" = "low";
  if (risk_punkte >= C.risk_high_punkte) risk_level = "high";
  else if (risk_punkte >= C.risk_medium_punkte) risk_level = "medium";

  // ══ FINANCIAL RISK ══
  const financial_risk = risk_punkte * restschuld;

  // ══ SEVERITY TIMESTAMP ══
  const risk_duration_days = first_risk_date ? Math.floor((now - new Date(first_risk_date).getTime()) / 864e5) : null;

  // ══ TREND ══
  const firstHalf = recent.filter(e => now - new Date(e.created_at).getTime() >= (C.zeitfenster_tage / 2) * 864e5).length;
  const secondHalf = recent.filter(e => now - new Date(e.created_at).getTime() < (C.zeitfenster_tage / 2) * 864e5).length;
  let trend: "rising" | "stable" | "falling" | "unknown" = "unknown";
  if (recent.length >= 3) {
    if (secondHalf > firstHalf * 1.3) trend = "rising";
    else if (secondHalf < firstHalf * 0.7) { trend = "falling"; addSignal(signals, "Aktivität sinkt", "warning", "frueh"); }
    else trend = "stable";
  }

  // ══ KONTEXT-TAGS ══
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

  // ══ OBSERVATION ══
  const tabNames: Record<string, string> = { home: "Start", journey: "Verlauf", progress: "Fortschritt", chat: "Chat", more: "Mehr" };
  const parts: string[] = [];
  if (context.age && context.beruf) parts.push(`${context.age} Jahre, ${context.beruf}`);
  else if (context.age) parts.push(`${context.age} Jahre`);
  if (appOpens > 0 && primaryHour) parts.push(`öffnet die App ${primaryHour.toLowerCase()} (${appOpens}x in ${C.zeitfenster_tage} Tagen)`);
  else if (appOpens === 0) parts.push(`hat die App in den letzten ${C.zeitfenster_tage} Tagen nicht geöffnet`);
  if (primaryDevice) parts.push(`nutzt ${primaryDevice}`);
  if (mostUsedTab) parts.push(`nutzt hauptsächlich ${tabNames[mostUsedTab] || mostUsedTab}`);
  if (notifReads === 0 && recent.length > 0) parts.push("reagiert nicht auf Erinnerungen");
  if (zahlungen.length > 0) {
    const uf = zahlungen.filter(z => z.status === "überfällig" || z.status === "ueberfaellig").length;
    const vs = zahlungen.filter(z => z.bezahlt_am && z.faellig_am && new Date(z.bezahlt_am) > new Date(z.faellig_am)).length;
    if (uf > 0 && vs > 0) parts.push(`hat ${uf} überfällige und ${vs}x verspätet gezahlte Raten`);
    else if (uf > 0) parts.push(`hat ${uf} überfällige Rate(n)`);
    else if (vs > 0) parts.push(`zahlt gelegentlich verspätet (${vs}x)`);
    else parts.push("zahlt zuverlässig");
  }
  if (stress_indicators.length > 0) parts.push("zeigt Stress-Muster");
  if (restschuld > 0) parts.push(`Restschuld: ${restschuld.toLocaleString("de-DE")} EUR`);
  const observation = parts.length > 0 ? parts.join(". ") + "." : "Noch keine ausreichende Datenbasis.";

  return {
    risk_level, risk_punkte, financial_risk,
    signals, context_tags, observation,
    category_presence: catRecent,
    activity_summary: { app_opens_14d: appOpens, total_events: events.length, last_active_days: lastActiveDays, most_used_tab: mostUsedTab, avg_session_seconds: avgSession, primary_device: primaryDevice, primary_time_of_day: primaryHour },
    deltas, stress_indicators, absence_signals, trend,
    severity_timestamp: { first_risk_date: first_risk_date, risk_duration_days },
  };
}
