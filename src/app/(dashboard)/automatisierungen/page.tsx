"use client";

import { useState } from "react";
import { Mail, MessageCircle, AlertTriangle, TrendingDown, Clock, Shield, ToggleLeft, ToggleRight, ChevronRight, Zap } from "lucide-react";
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
}

const AUTOMATIONS: Automation[] = [
  {
    id: "auto-email-reminder",
    icon: Mail,
    title: "Zahlungserinnerung per E-Mail",
    description: "Automatische freundliche Erinnerung wenn eine Rate 6 Tage überfällig ist. Der Patient erhält eine personalisierte E-Mail mit Zahlungsdetails und Kontoverbindung.",
    trigger: "Rate ist 6 Tage überfällig",
    action: "E-Mail an Patient (oder Versicherungsnehmer bei Kindern)",
    status: "inaktiv",
    category: "kommunikation",
  },
  {
    id: "auto-whatsapp",
    icon: MessageCircle,
    title: "WhatsApp-Benachrichtigung",
    description: "Nachricht über WhatsApp an den Patienten oder die Eltern bei Zahlungsverzug. Nutzt die Open-Source WhatsApp-Integration für automatisierten Versand.",
    trigger: "Rate ist 3 Tage überfällig (vor E-Mail)",
    action: "WhatsApp-Nachricht an hinterlegte Mobilnummer",
    status: "coming_soon",
    category: "kommunikation",
  },
  {
    id: "auto-ruecklast",
    icon: AlertTriangle,
    title: "Rücklastschrift-Erkennung",
    description: "Erkennt automatisch wenn ein Patient eine Lastschrift zurückholt. Erstellt sofort eine Red-Flag-Benachrichtigung und stuft den Patienten in die Mahnpipeline ein.",
    trigger: "Negative Buchung auf dem Praxiskonto erkannt (finAPI)",
    action: "Alert an Praxisleitung + Patient in Mahnpipeline + Gebühren vermerken",
    status: "coming_soon",
    category: "zahlung",
  },
  {
    id: "auto-scoring",
    icon: TrendingDown,
    title: "Patienten-Scoring",
    description: "Bewertet die Zahlungszuverlässigkeit jedes Patienten auf einer Skala von 0-100. Bei Scoring unter 80% wird eine Red-Flag gesetzt. Berücksichtigt: pünktliche Zahlungen, Rücklastschriften, Zahlungsverzögerungen.",
    trigger: "Nach jeder Zahlungsabgleichung",
    action: "Score aktualisieren, Red-Flag bei kritischem Wert",
    status: "coming_soon",
    category: "analyse",
  },
  {
    id: "auto-eskalation",
    icon: Shield,
    title: "Automatische Eskalation",
    description: "Verschiebt Fälle automatisch durch die Mahnstufen: Karenz (1-5 Tage) → Stufe 1 (6-20) → Stufe 2 (21-42) → Eskalation (42+). Jede Stufe löst die konfigurierte Aktion aus.",
    trigger: "Tägliche Prüfung um 06:00 Uhr",
    action: "Mahnstufe erhöhen + entsprechende Aktion auslösen",
    status: "inaktiv",
    category: "zahlung",
  },
  {
    id: "auto-daily-briefing",
    icon: Clock,
    title: "Tägliches Briefing",
    description: "Maria erhält jeden Morgen um 06:30 eine E-Mail mit dem wichtigsten: neue Zahlungseingänge, überfällige Raten, Rücklastschriften, Patienten mit kritischem Scoring.",
    trigger: "Täglich um 06:30 Uhr",
    action: "Zusammenfassung per E-Mail an Praxisleitung",
    status: "inaktiv",
    category: "kommunikation",
  },
];

export default function AutomatisierungenPage() {
  const { theme } = useAppStore();
  const isDark = theme === "dark";
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleToggle(id: string) {
    const auto = AUTOMATIONS.find((a) => a.id === id);
    if (auto?.status === "coming_soon") return;
    setToggles((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const categories = [
    { key: "zahlung", label: "Zahlungen & Mahnwesen", icon: AlertTriangle },
    { key: "kommunikation", label: "Kommunikation", icon: Mail },
    { key: "analyse", label: "Analyse & Scoring", icon: TrendingDown },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-[30px] font-extrabold tracking-tight ${isDark ? "text-white" : "text-praxis-800"}`}>Automatisierungen</h1>
        <p className={`mt-1 text-sm ${isDark ? "text-[#b6c2d6]" : "text-praxis-400"}`}>
          Regeln und Workflows die automatisch im Hintergrund arbeiten. Aktivieren, konfigurieren, vergessen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Aktive Automationen" value={String(Object.values(toggles).filter(Boolean).length)} isDark={isDark} />
        <StatCard label="Verfügbar" value={String(AUTOMATIONS.filter((a) => a.status !== "coming_soon").length)} isDark={isDark} />
        <StatCard label="In Entwicklung" value={String(AUTOMATIONS.filter((a) => a.status === "coming_soon").length)} isDark={isDark} accent />
      </div>

      {categories.map((cat) => {
        const items = AUTOMATIONS.filter((a) => a.category === cat.key);
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
                const isOn = toggles[auto.id] || false;
                const isExpanded = expandedId === auto.id;
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
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-[15px] font-semibold ${isDark ? "text-[#e9eef8]" : "text-praxis-800"}`}>{auto.title}</p>
                            {isSoon && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">COMING SOON</span>
                            )}
                          </div>
                          <p className={`mt-0.5 text-sm ${isDark ? "text-[#9db0cc]" : "text-praxis-500"}`}>
                            {auto.description.slice(0, 80)}{auto.description.length > 80 ? "..." : ""}
                          </p>
                        </div>
                        <ChevronRight size={16} className={`transition-transform ${isExpanded ? "rotate-90" : ""} ${isDark ? "text-[#7b93b4]" : "text-praxis-400"}`} />
                      </div>

                      <button
                        onClick={() => handleToggle(auto.id)}
                        className={`ml-4 shrink-0 ${isSoon ? "cursor-not-allowed" : "cursor-pointer"}`}
                        disabled={isSoon}
                      >
                        {isOn ? (
                          <ToggleRight size={36} className="text-[#3d9c46]" />
                        ) : (
                          <ToggleLeft size={36} className={isDark ? "text-[#4a5d7a]" : "text-praxis-300"} />
                        )}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className={`mt-4 rounded-lg border p-4 ${isDark ? "border-white/5 bg-[#0c1018]" : "border-surface-100 bg-surface-50"}`}>
                        <p className={`text-sm ${isDark ? "text-[#b4c0d4]" : "text-praxis-600"}`}>{auto.description}</p>
                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
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
