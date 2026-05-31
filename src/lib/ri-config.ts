// Revenue Intelligence — Konfigurierbare Schwellenwerte
// Alle Werte hier änderbar ohne Code-Änderung in der Engine.
// Später: In Supabase-Tabelle ri_config auslagern.

export const RI_CONFIG = {
  // Zeitfenster
  zeitfenster_tage: 14,
  vergleichsperiode_tage: 14,
  baseline_tage: 60,

  // App-Nutzung
  app_opens_aktiv_minimum: 5,
  app_opens_inaktiv_maximum: 0,

  // Delta-Schwellenwerte
  delta_fruehwarnung_pct: -25,
  delta_warning_pct: -50,
  delta_kritisch_pct: -75,
  delta_minimum_events_vorperiode: 5,

  // Tageszeit
  tageszeit_verschiebung_stunden: 6,

  // Stress
  stress_daily_opens_minimum: 5,

  // Risiko-Punkte
  risk_high_punkte: 6,
  risk_medium_punkte: 3,

  // Gewichtung
  gewicht_kritisch: 3,
  gewicht_mittel: 2,
  gewicht_frueh: 1,

  // Abwesenheit
  abwesenheit_tage_warning: 14,

  // Zahlungen
  verspaetet_minimum_fuer_warning: 2,

  // Break Pattern
  break_pattern_sensitivity: 0.3,
};

// Event-Kategorien
export const EVENT_CATEGORIES = {
  engagement: ["app_open", "tab_view", "session_end"],
  intent: ["animapay_open", "qrcode_view", "payment_view", "ratenplan_view"],
  action: ["chat_message", "notification_clicked", "notification_read", "document_view"],
} as const;

export type EventCategory = keyof typeof EVENT_CATEGORIES;

export function categorizeEvent(eventType: string): EventCategory | null {
  for (const [cat, events] of Object.entries(EVENT_CATEGORIES)) {
    if ((events as readonly string[]).includes(eventType)) return cat as EventCategory;
  }
  return null;
}
