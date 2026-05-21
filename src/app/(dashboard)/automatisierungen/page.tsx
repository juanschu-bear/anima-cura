"use client";

import { useState } from "react";
import { Mail, MessageCircle, AlertTriangle, TrendingDown, Clock, Shield, ToggleLeft, ToggleRight, ChevronRight, Zap, Save, X, Edit3 } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";

interface Automation {
  id: string;
  icon: any;
  title: string;
  description: string;
  trigger: string;
  action: string;
  status: "aktiv" | "inaktiv" | "coming_soon";
  category: "zahlung" | "kommunikation" | "analyse";
  template?: { subject: string; body: string };
  config?: { delayDays?: number; channel?: string; threshold?: number };
}

const DEFAULT_AUTOMATIONS: Automation[] = [
  {
    id: "auto-email-reminder",
    icon: Mail,
    title: "Zahlungserinnerung per E-Mail",
    description: "Automatische freundliche Erinnerung wenn eine Rate überfällig ist. Der Patient erhält eine personalisierte E-Mail mit Zahlungsdetails und Kontoverbindung.",
    trigger: "Rate ist X Tage überfällig",
    action: "E-Mail an Patient (oder Versicherungsnehmer bei Kindern)",
    status: "inaktiv",
    category: "kommunikation",
    template: {
      subject: "Erinnerung: Offene Ratenzahlung - Praxis Dr. Schubert",
      body: "Sehr geehrte/r {{patient_name}},\n\nwir möchten Sie freundlich daran erinnern, dass die Ratenzahlung Nr. {{rate_nummer}} über {{betrag}}€ seit dem {{faellig_am}} offen ist.\n\nBitte überweisen Sie den Betrag auf folgendes Konto:\nKieferorthopädische Praxis Dr. Elena Schubert\nIBAN: DE XX XXXX XXXX XXXX XXXX XX\nVerwendungszweck: Rate {{rate_nummer}} / {{patient_name}}\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\nPraxis Dr. Elena Schubert\nNikolaistraße 20, 04109 Leipzig",
    },
    config: { delayDays: 6 },
  },
  {
    id: "auto-email-stufe2",
    icon: Mail,
    title: "Formelle Mahnung per E-Mail",
    description: "Formelleres Schreiben bei fortgesetztem Zahlungsverzug. Weist auf vertragliche Konsequenzen hin.",
    trigger: "Rate ist X Tage überfällig (Stufe 2)",
    action: "Formelle E-Mail + Telefonat-Aufgabe",
    status: "inaktiv",
    category: "kommunikation",
    template: {
      subject: "Mahnung: Offene Ratenzahlung - Praxis Dr. Schubert",
      body: "Sehr geehrte/r {{patient_name}},\n\ntrotz unserer Erinnerung ist die Ratenzahlung Nr. {{rate_nummer}} über {{betrag}}€ (fällig am {{faellig_am}}) weiterhin offen.\n\nWir bitten Sie dringend, den ausstehenden Betrag innerhalb der nächsten 7 Werktage zu überweisen.\n\nGemäß Ihrer Ratenvereinbarung wird bei Zahlungsverzug die Gesamtsumme fällig.\n\nBitte kontaktieren Sie uns unter 0341-XXXXXXX falls Sie Schwierigkeiten haben.\n\nMit freundlichen Grüßen\nPraxis Dr. Elena Schubert",
    },
    config: { delayDays: 21 },
  },
  {
    id: "auto-whatsapp",
    icon: MessageCircle,
    title: "WhatsApp-Benachrichtigung",
    description: "Nachricht über WhatsApp an den Patienten oder die Eltern bei Zahlungsverzug.",
    trigger: "Rate ist X Tage überfällig",
    action: "WhatsApp-Nachricht an hinterlegte Mobilnummer",
    status: "coming_soon",
    category: "kommunikation",
    template: {
      subject: "",
      body: "Guten Tag {{patient_name}}, hier eine freundliche Erinnerung der Praxis Dr. Schubert: Ihre Ratenzahlung Nr. {{rate_nummer}} über {{betrag}}€ ist seit dem {{faellig_am}} offen. Bei Fragen erreichen Sie uns unter 0341-XXXXXXX.",
    },
    config: { delayDays: 3 },
  },
  {
    id: "auto-ruecklast",
    icon: AlertTriangle,
    title: "Rücklastschrift-Erkennung",
    description: "Erkennt automatisch wenn ein Patient eine Lastschrift zurückholt. Erstellt sofort eine Benachrichtigung und stuft den Patienten in die Mahnpipeline ein. Bankgebühren werden automatisch vermerkt.",
    trigger: "Negative Buchung auf dem Praxiskonto erkannt",
    action: "Alert + Patient in Mahnpipeline + Gebühren vermerken",
    status: "coming_soon",
    category: "zahlung",
    config: {},
  },
  {
    id: "auto-scoring",
    icon: TrendingDown,
    title: "Patienten-Scoring",
    description: "Bewertet die Zahlungszuverlässigkeit jedes Patienten (0-100). Berücksichtigt: pünktliche Zahlungen, Rücklastschriften, Verzögerungen. Red-Flag bei kritischem Wert.",
    trigger: "Nach jeder Zahlungsabgleichung",
    action: "Score aktualisieren, Red-Flag bei Wert unter Schwellwert",
    status: "coming_soon",
    category: "analyse",
    config: { threshold: 80 },
  },
  {
    id: "auto-eskalation",
    icon: Shield,
    title: "Automatische Eskalation",
    description: "Verschiebt Fälle automatisch durch die Mahnstufen basierend auf den konfigurierten Zeiträumen. Jede Stufe löst die entsprechende Automation aus.",
    trigger: "Tägliche Prüfung um 06:00 Uhr",
    action: "Mahnstufe erhöhen + Aktion auslösen",
    status: "inaktiv",
    category: "zahlung",
  },
  {
    id: "auto-daily-briefing",
    icon: Clock,
    title: "Tägliches Briefing",
    description: "Die Praxisleitung erhält jeden Morgen eine E-Mail-Zusammenfassung mit den wichtigsten Ereignissen.",
    trigger: "Täglich um 06:30 Uhr",
    action: "E-Mail an Praxisleitung",
    status: "inaktiv",
    category: "kommunikation",
    template: {
      subject: "Anima Cura - Tagesbriefing {{datum}}",
      body: "Guten Morgen Frau Dr. Schubert,\n\nhier ist Ihr tägliches Briefing:\n\n• Neue Zahlungseingänge: {{neue_zahlungen}}\n• Überfällige Raten: {{ueberfaellige_raten}}\n• Rücklastschriften: {{ruecklastschriften}}\n• Patienten mit kritischem Scoring: {{kritische_patienten}}\n\nEine gute Woche wünscht\nIhr Anima Cura System",
    },
  },
];

export default function AutomatisierungenPage() {
  const { theme } = useAppStore();
  const isDark = theme === "dark";
  const [automations, setAutomations] = useState<Automation[]>(DEFAULT_AUTOMATIONS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTemplate, setEditTemplate] = useState<{ subject: string; body: string }>({ subject: "", body: "" });
  const [editConfig, setEditConfig] = useState<{ delayDays?: number; threshold?: number }>({});
  const [saveHint, setSaveHint] = useState("");

  function handleToggle(id: string) {
    const auto = automations.find((a) => a.id === id);
    if (auto?.status === "coming_soon") return;
    setAutomations((prev) =>
      prev.map((a) => a.id === id ? { ...a, status: a.status === "aktiv" ? "inaktiv" : "aktiv" } : a)
    );
  }

  function startEditing(auto: Automation) {
    setEditingId(auto.id);
    setEditTemplate(auto.template || { subject: "", body: "" });
    setEditConfig(auto.config || {});
    setExpandedId(auto.id);
  }

  function saveEditing(id: string) {
    setAutomations((prev) =>
      prev.map((a) => a.id === id ? { ...a, template: { ...editTemplate }, config: { ...editConfig } } : a)
    );
    setEditingId(null);
    setSaveHint("Gespeichert!");
    setTimeout(() => setSaveHint(""), 2000);
  }

  function cancelEditing() {
    setEditingId(null);
  }

  const activeCount = automations.filter((a) => a.status === "aktiv").length;
  const availableCount = automations.filter((a) => a.status !== "coming_soon").length;
  const soonCount = automations.filter((a) => a.status === "coming_soon").length;

  const categories = [
    { key: "kommunikation", label: "Kommunikation", icon: Mail },
    { key: "zahlung", label: "Zahlungen & Mahnwesen", icon: AlertTriangle },
    { key: "analyse", label: "Analyse & Scoring", icon: TrendingDown },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-[30px] font-extrabold tracking-tight ${isDark ? "text-white" : "text-praxis-800"}`}>Automatisierungen</h1>
        <p className={`mt-1 text-sm ${isDark ? "text-[#b6c2d6]" : "text-praxis-400"}`}>
          Regeln und Workflows die automatisch im Hintergrund arbeiten. Aktivieren, konfigurieren, fertig.
        </p>
      </div>

      {saveHint && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">{saveHint}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Aktive Automationen" value={String(activeCount)} isDark={isDark} />
        <StatCard label="Verfügbar" value={String(availableCount)} isDark={isDark} />
        <StatCard label="In Entwicklung" value={String(soonCount)} isDark={isDark} accent />
      </div>

      {categories.map((cat) => {
        const items = automations.filter((a) => a.category === cat.key);
        const CatIcon = cat.icon;
        return (
          <div key={cat.key} className="space-y-3">
            <h2 className={`flex items-center gap-2 text-lg font-bold ${isDark ? "text-[#e2eaf6]" : "text-praxis-700"}`}>
              <CatIcon size={18} />
              {cat.label}
            </h2>
            <div className="space-y-2">
              {items.map((auto) => {
                const Icon = auto.icon;
                const isOn = auto.status === "aktiv";
                const isExpanded = expandedId === auto.id;
                const isEditing = editingId === auto.id;
                const isSoon = auto.status === "coming_soon";

                return (
                  <div
                    key={auto.id}
                    className={`rounded-xl border p-5 transition-all ${isDark ? "border-white/10 bg-[#111824]" : "border-surface-200 bg-white"} ${isSoon ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="flex flex-1 items-center gap-4 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : auto.id)}
                      >
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          isSoon ? "bg-gray-100 text-gray-400"
                          : isOn ? "bg-[#edf8ed] text-[#3d9c46]"
                          : isDark ? "bg-white/5 text-[#7b93b4]" : "bg-surface-100 text-praxis-400"
                        }`}>
                          <Icon size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-[15px] font-semibold ${isDark ? "text-[#e9eef8]" : "text-praxis-800"}`}>{auto.title}</p>
                            {isSoon && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">COMING SOON</span>}
                            {isOn && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">AKTIV</span>}
                          </div>
                          <p className={`mt-0.5 text-sm truncate ${isDark ? "text-[#9db0cc]" : "text-praxis-500"}`}>{auto.description}</p>
                        </div>
                        <ChevronRight size={16} className={`transition-transform ${isExpanded ? "rotate-90" : ""} ${isDark ? "text-[#7b93b4]" : "text-praxis-400"}`} />
                      </div>

                      <button
                        onClick={() => handleToggle(auto.id)}
                        className={`ml-4 shrink-0 ${isSoon ? "cursor-not-allowed" : "cursor-pointer"}`}
                        disabled={isSoon}
                      >
                        {isOn ? <ToggleRight size={36} className="text-[#3d9c46]" /> : <ToggleLeft size={36} className={isDark ? "text-[#4a5d7a]" : "text-praxis-300"} />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className={`mt-4 space-y-4 rounded-lg border p-4 ${isDark ? "border-white/5 bg-[#0c1018]" : "border-surface-100 bg-surface-50"}`}>
                        <p className={`text-sm ${isDark ? "text-[#b4c0d4]" : "text-praxis-600"}`}>{auto.description}</p>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#7b93b4]" : "text-praxis-400"}`}>Auslöser</p>
                            <p className={`mt-1 text-sm font-medium ${isDark ? "text-[#e2eaf6]" : "text-praxis-700"}`}>
                              <Zap size={12} className="inline mr-1 text-amber-500" />{auto.trigger}
                            </p>
                          </div>
                          <div>
                            <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#7b93b4]" : "text-praxis-400"}`}>Aktion</p>
                            <p className={`mt-1 text-sm font-medium ${isDark ? "text-[#e2eaf6]" : "text-praxis-700"}`}>{auto.action}</p>
                          </div>
                        </div>

                        {/* Config: Delay Days */}
                        {auto.config?.delayDays !== undefined && (
                          <div>
                            <label className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#7b93b4]" : "text-praxis-400"}`}>
                              Verzögerung (Tage nach Fälligkeit)
                            </label>
                            {isEditing ? (
                              <input
                                type="number"
                                className="input mt-1 w-32"
                                value={editConfig.delayDays ?? auto.config.delayDays}
                                onChange={(e) => setEditConfig((prev) => ({ ...prev, delayDays: Number(e.target.value) }))}
                              />
                            ) : (
                              <p className={`mt-1 text-sm font-bold ${isDark ? "text-white" : "text-praxis-800"}`}>{auto.config.delayDays} Tage</p>
                            )}
                          </div>
                        )}

                        {/* Config: Threshold */}
                        {auto.config?.threshold !== undefined && (
                          <div>
                            <label className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#7b93b4]" : "text-praxis-400"}`}>
                              Scoring-Schwellwert für Red-Flag
                            </label>
                            {isEditing ? (
                              <input
                                type="number"
                                className="input mt-1 w-32"
                                value={editConfig.threshold ?? auto.config.threshold}
                                onChange={(e) => setEditConfig((prev) => ({ ...prev, threshold: Number(e.target.value) }))}
                              />
                            ) : (
                              <p className={`mt-1 text-sm font-bold ${isDark ? "text-white" : "text-praxis-800"}`}>Unter {auto.config.threshold}%</p>
                            )}
                          </div>
                        )}

                        {/* Template Editor */}
                        {auto.template && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#7b93b4]" : "text-praxis-400"}`}>
                                {auto.id.includes("whatsapp") ? "Nachrichtenvorlage" : "E-Mail-Vorlage"}
                              </p>
                              {!isEditing && !isSoon && (
                                <button
                                  onClick={() => startEditing(auto)}
                                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#4b42d6] hover:bg-[#f5f3ff]"
                                >
                                  <Edit3 size={12} /> Bearbeiten
                                </button>
                              )}
                            </div>

                            {auto.template.subject && (
                              <div>
                                <p className={`text-xs ${isDark ? "text-[#7b93b4]" : "text-praxis-400"}`}>Betreff:</p>
                                {isEditing ? (
                                  <input
                                    className="input mt-1"
                                    value={editTemplate.subject}
                                    onChange={(e) => setEditTemplate((prev) => ({ ...prev, subject: e.target.value }))}
                                  />
                                ) : (
                                  <p className={`mt-1 text-sm font-medium ${isDark ? "text-[#e2eaf6]" : "text-praxis-700"}`}>{auto.template.subject}</p>
                                )}
                              </div>
                            )}

                            <div>
                              <p className={`text-xs ${isDark ? "text-[#7b93b4]" : "text-praxis-400"}`}>
                                {auto.id.includes("whatsapp") ? "Nachricht:" : "Inhalt:"}
                              </p>
                              {isEditing ? (
                                <textarea
                                  className="input mt-1 min-h-[200px] font-mono text-sm"
                                  value={editTemplate.body}
                                  onChange={(e) => setEditTemplate((prev) => ({ ...prev, body: e.target.value }))}
                                />
                              ) : (
                                <pre className={`mt-1 whitespace-pre-wrap rounded-lg border p-3 text-sm ${isDark ? "border-white/5 bg-[#080c14] text-[#c8d5e8]" : "border-surface-200 bg-white text-praxis-600"}`}>
                                  {auto.template.body}
                                </pre>
                              )}
                            </div>

                            <div className={`rounded-lg px-3 py-2 text-xs ${isDark ? "bg-white/5 text-[#9db0cc]" : "bg-blue-50 text-blue-600"}`}>
                              Verfügbare Variablen: <code>{"{{patient_name}}"}</code>, <code>{"{{rate_nummer}}"}</code>, <code>{"{{betrag}}"}</code>, <code>{"{{faellig_am}}"}</code>, <code>{"{{datum}}"}</code>
                            </div>

                            {isEditing && (
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => saveEditing(auto.id)}
                                  className="btn-primary inline-flex items-center gap-1.5 text-sm"
                                >
                                  <Save size={14} /> Speichern
                                </button>
                                <button
                                  onClick={cancelEditing}
                                  className="btn-secondary inline-flex items-center gap-1.5 text-sm"
                                >
                                  <X size={14} /> Abbrechen
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, isDark, accent }: { label: string; value: string; isDark: boolean; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-5 py-4 ${isDark ? "border-white/10 bg-[#111824]" : "border-surface-200 bg-white"}`}>
      <p className={`text-sm font-medium ${isDark ? "text-[#9fb2cd]" : "text-praxis-400"}`}>{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ? "text-amber-500" : isDark ? "text-white" : "text-praxis-800"}`}>{value}</p>
    </div>
  );
}
