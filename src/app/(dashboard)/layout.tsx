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
} from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";

const NAV_ITEMS = [
  { href: "/uebersicht", icon: LayoutDashboard, labelDe: "Übersicht", labelEn: "Overview" },
  { href: "/zahlungen", icon: CreditCard, labelDe: "Zahlungen", labelEn: "Payments" },
  { href: "/patienten", icon: Users, labelDe: "Patienten", labelEn: "Patients" },
  { href: "/ratenplan", icon: CalendarRange, labelDe: "Ratenpläne", labelEn: "Installments" },
  { href: "/mahnwesen", icon: AlertTriangle, labelDe: "Mahnwesen", labelEn: "Dunning" },
  { href: "/quartal", icon: BarChart3, labelDe: "Quartalsbericht", labelEn: "Quarterly" },
  { href: "/einstellungen", icon: Settings, labelDe: "Einstellungen", labelEn: "Settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
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
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
            Praxis Companion
          </div>
          <h1 className="mt-3 text-[28px] font-bold leading-none text-white">Anima Curo</h1>
          <p className="mt-1 text-xs font-medium text-white/70">Intelligent Practice Finance</p>
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
                className={`sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
              >
                <Icon size={18} />
                {isGerman ? item.labelDe : item.labelEn}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-sm font-semibold text-white">
              MS
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Maria Schubert</p>
              <p className="text-xs text-white/65">{isGerman ? "Admin" : "Admin"}</p>
            </div>
            <button className="text-white/70 hover:text-white transition-colors">
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
              <input className="input pl-9" placeholder={isGerman ? "Patient suchen..." : "Search patient..."} />
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden xl:inline-flex rounded-full border border-surface-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-praxis-500">
                UI 2026-05-14 · 978ef7a
              </span>
              <button
                type="button"
                className="ac-chip"
                onClick={() => setLocale(isGerman ? "en" : "de")}
                title={isGerman ? "Auf Englisch wechseln" : "Switch to German"}
              >
                <Languages size={13} />
                {isGerman ? "DE" : "EN"}
              </button>
              <button
                type="button"
                className="ac-chip"
                onClick={toggleTheme}
                title={theme === "light" ? "Dark Mode" : "Light Mode"}
              >
                {theme === "light" ? <Moon size={13} /> : <Sun size={13} />}
                {theme === "light" ? "Dark" : "Light"}
              </button>
              <span className="hidden md:inline-flex items-center gap-2 text-xs text-praxis-400">
                <span className="h-2 w-2 rounded-full bg-accent-emerald" />
                {isGerman ? "System aktiv" : "System active"}
              </span>
              <button className="relative rounded-xl border border-surface-200 bg-white p-2 text-praxis-400 transition-colors hover:text-praxis-600">
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
    </div>
  );
}
