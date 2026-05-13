"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import {
  Bell,
  LogOut,
  Moon,
  Sun,
  Languages,
  Search,
} from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";

const NAV_ITEMS = [
  { href: "/uebersicht", labelDe: "Übersicht", labelEn: "Overview" },
  { href: "/zahlungen", labelDe: "Zahlungen", labelEn: "Payments" },
  { href: "/patienten", labelDe: "Patienten", labelEn: "Patients" },
  { href: "/ratenplan", labelDe: "Ratenplan", labelEn: "Installments" },
  { href: "/mahnwesen", labelDe: "Mahnwesen", labelEn: "Dunning" },
  { href: "/quartal", labelDe: "Quartalsbericht", labelEn: "Quarterly" },
  { href: "/einstellungen", labelDe: "Einstellungen", labelEn: "Settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, setTheme, toggleTheme, locale, setLocale } = useAppStore();
  const isGerman = locale === "de";

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
    <div className="ac-shell min-h-screen p-5 md:p-8">
      <div className="mx-auto w-full max-w-[1340px] rounded-[22px] border border-surface-200 bg-white/90 shadow-[0_24px_60px_rgba(24,43,65,0.12)] backdrop-blur-md">
        <header className="border-b border-surface-200 px-5 py-4 md:px-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5046df] to-[#6b63ff] text-lg font-bold text-white shadow-[0_10px_24px_rgba(80,70,223,0.35)]">
                P
              </div>
              <div>
                <h1 className="text-2xl font-bold text-praxis-800 leading-tight">Praxis Companion</h1>
                <p className="text-sm text-praxis-400">Dr. Maria Schubert · KFO Leipzig</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3">
              <div className="relative w-full min-w-[220px] max-w-[320px] md:w-[300px]">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
                <input
                  className="input h-11 rounded-xl pl-9"
                  placeholder={isGerman ? "Patient suchen..." : "Search patient..."}
                />
              </div>
              <div className="text-sm text-praxis-400">
                {new Date().toLocaleDateString(isGerman ? "de-DE" : "en-GB", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-praxis-100 text-sm font-semibold text-praxis-600">
                MS
              </div>
            </div>
          </div>
        </header>

        <nav className="border-b border-surface-200 px-5 md:px-7">
          <div className="ac-top-tabs overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/uebersicht" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`ac-tab ${isActive ? "ac-tab-active" : ""}`}
                >
                  {isGerman ? item.labelDe : item.labelEn}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="flex items-center justify-end gap-2 border-b border-surface-200 px-5 py-2.5 md:px-7">
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
          <span className="hidden items-center gap-2 text-xs text-praxis-400 md:inline-flex">
            <span className="h-2 w-2 rounded-full bg-accent-emerald" />
            {isGerman ? "System aktiv" : "System active"}
          </span>
          <button className="relative rounded-lg p-2 text-praxis-400 transition-colors hover:bg-surface-50 hover:text-praxis-600">
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-coral" />
          </button>
          <button className="rounded-lg p-2 text-praxis-400 transition-colors hover:bg-surface-50 hover:text-praxis-600">
            <LogOut size={16} />
          </button>
        </div>

        <main className="bg-surface-50/70 p-5 md:p-7">{children}</main>
      </div>
    </div>
  );
}
