"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import {
  LayoutDashboard,
  CreditCard,
  Users,
  CalendarRange,
  AlertTriangle,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  Moon,
  Sun,
  Languages,
  Search,
  Zap,
  Upload,
} from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import ICuraVoiceCompanion from "@/components/icura/ICuraVoiceCompanion";
import ICuraGuide from "@/components/icura/ICuraGuide";

const NAV_ITEMS = [
  { href: "/uebersicht", icon: LayoutDashboard, key: "nav.overview" },
  { href: "/zahlungen", icon: CreditCard, key: "nav.payments" },
  { href: "/patienten", icon: Users, key: "nav.patients" },
  { href: "/ratenplan", icon: CalendarRange, key: "nav.rateplans" },
  { href: "/mahnwesen", icon: AlertTriangle, key: "nav.dunning" },
  { href: "/quartal", icon: BarChart3, key: "nav.quarterly" },
  { href: "/automatisierungen", icon: Zap, key: "nav.automations" },
  { href: "/import", icon: Upload, key: "nav.import" },
  { href: "/einstellungen", icon: Settings, key: "nav.settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme, toggleTheme, locale, setLocale } = useAppStore();
  const isGerman = locale === "de";
  const now = new Date().toLocaleDateString(isGerman ? "de-DE" : "en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("ac-theme");
    const savedLocale = window.localStorage.getItem("ac-locale");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
    if (savedLocale === "de" || savedLocale === "en") {
      setLocale(savedLocale);
    }
  }, [setLocale, setTheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("ac-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("ac-locale", locale);
  }, [locale]);

  return (
    <div className="ac-shell">
      <aside className="ac-sidebar flex w-[17.5rem] flex-col">
        <div className="border-b border-surface-200 p-5">
          <div className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
            theme === "dark"
              ? "border border-white/10 bg-white/5 text-white/70"
              : "border border-surface-200 bg-white text-praxis-400"
          }`}>
            Praxis Companion
          </div>
          <h1 className={`mt-3 text-[28px] font-bold leading-none ${theme === "dark" ? "text-white" : "text-praxis-800"}`}>Anima Cura</h1>
          <p className={`mt-1 text-xs font-medium ${theme === "dark" ? "text-white/60" : "text-praxis-400"}`}>Intelligent Practice Finance</p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/uebersicht" && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-nav={item.href.slice(1)}
                className={`sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
              >
                <Icon size={18} />
                {t(item.key, locale)}
              </Link>
            );
          })}
        </nav>

        <div className={`p-3 border-t ${theme === "dark" ? "border-white/10" : "border-surface-200"}`}>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
              theme === "dark" ? "bg-white/10 text-white" : "bg-praxis-100 text-praxis-600"
            }`}>
              ES
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${theme === "dark" ? "text-white" : "text-praxis-800"}`}>Dr. Elena Schubert</p>
              <p className={`text-xs ${theme === "dark" ? "text-white/60" : "text-praxis-400"}`}>{t("header.practiceOwner", locale)}</p>
            </div>
            <button className={`${theme === "dark" ? "text-white/65 hover:text-white" : "text-praxis-400 hover:text-praxis-600"} transition-colors`}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="ac-main flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-surface-200 px-6">
          <div className="flex h-full items-center justify-between gap-4">
            <div className="hidden md:block text-xs text-praxis-400 tracking-wide">{now}</div>
            <div className="relative hidden lg:block w-full max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
              <input
                className="input pl-9"
                placeholder={t("search.placeholder", locale)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                    const val = (e.target as HTMLInputElement).value.trim();
                    window.sessionStorage.setItem("ac-patient-search", val);
                    router.push("/patienten");
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="ac-chip"
                onClick={() => setLocale(isGerman ? "en" : "de")}
                title={t("header.toggleLanguage", locale)}
              >
                <Languages size={13} />
                {isGerman ? "DE" : "EN"}
              </button>
              <button
                type="button"
                className="ac-chip"
                onClick={toggleTheme}
                title={t("header.toggleTheme", locale)}
              >
                {theme === "light" ? <Moon size={13} /> : <Sun size={13} />}
                {theme === "light" ? "Dark" : "Light"}
              </button>
              <span className="hidden md:inline-flex items-center gap-2 text-xs text-praxis-400">
                <span className="h-2 w-2 rounded-full bg-accent-emerald" />
                {t("header.systemActive", locale)}
              </span>
              <button className={`relative rounded-xl border p-2 transition-colors ${
                theme === "dark"
                  ? "border-white/10 bg-white/5 text-white/65 hover:text-white"
                  : "border-surface-200 bg-white text-praxis-400 hover:text-praxis-600"
              }`}>
                <Bell size={18} />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-coral" />
              </button>
            </div>
          </div>
        </header>

        <div className="ac-content flex-1 overflow-y-auto p-7">
          {children}
        </div>
      </main>
      <ICuraGuide />
      <ICuraVoiceCompanion />
    </div>
  );
}
