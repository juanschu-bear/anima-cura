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
  const { theme, toggleTheme, locale, setLocale } = useAppStore();
  const isGerman = locale === "de";
  const now = new Date().toLocaleDateString(isGerman ? "de-DE" : "en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="ac-shell flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="ac-sidebar w-64 bg-white border-r border-surface-200 flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-surface-200">
          <h1 className="text-lg font-bold text-praxis-800 leading-tight">
            Anima Curo
          </h1>
          <p className="text-xs text-praxis-400 mt-0.5">Intelligent Practice Finance</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
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

        {/* User */}
        <div className="p-3 border-t border-surface-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-praxis-100 flex items-center justify-center text-sm font-semibold text-praxis-600">
              MS
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-praxis-800 truncate">Maria Schubert</p>
              <p className="text-xs text-praxis-400">{isGerman ? "Admin" : "Admin"}</p>
            </div>
            <button className="text-praxis-400 hover:text-praxis-600 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ac-main flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-surface-200 flex items-center justify-between px-6">
          <div className="text-xs text-praxis-400 tracking-wide">{now}</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-2.5 py-1 text-xs text-praxis-500 hover:text-praxis-700 hover:bg-surface-50 transition-colors"
              onClick={() => setLocale(isGerman ? "en" : "de")}
              title={isGerman ? "Auf Englisch wechseln" : "Switch to German"}
            >
              <Languages size={13} />
              {isGerman ? "DE" : "EN"}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-2.5 py-1 text-xs text-praxis-500 hover:text-praxis-700 hover:bg-surface-50 transition-colors"
              onClick={toggleTheme}
              title={theme === "light" ? "Dark Mode" : "Light Mode"}
            >
              {theme === "light" ? <Moon size={13} /> : <Sun size={13} />}
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <span className="hidden md:inline-flex items-center gap-2 text-xs text-praxis-400">
              <span className="w-2 h-2 rounded-full bg-accent-emerald" />
              {isGerman ? "System aktiv" : "System active"}
            </span>
            <button className="relative p-2 text-praxis-400 hover:text-praxis-600 transition-colors rounded-lg hover:bg-surface-50">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent-coral" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="ac-content flex-1 overflow-y-auto p-6 bg-surface-50">
          {children}
        </div>
      </main>
    </div>
  );
}
