"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CreditCard,
  Languages,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import type { AuthenticatedAppUser } from "@/lib/auth";
import {
  canAccessPath,
  getDefaultDashboardPath,
  isReadOnlyRole,
} from "@/lib/auth";
import { createBrowserClient } from "@/lib/db/supabase";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/hooks/useAppStore";
import AccessDenied from "@/components/auth/AccessDenied";
import AuthSessionManager from "@/components/auth/AuthSessionManager";
import ICuraVoiceCompanion from "@/components/icura/ICuraVoiceCompanion";

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

function getInitials(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: AuthenticatedAppUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    authUser,
    locale,
    setAuthReady,
    setAuthUser,
    setLocale,
    setTheme,
    theme,
    toggleTheme,
  } = useAppStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const activeUser = authUser ?? user;
  const isGerman = locale === "de";
  const now = new Date().toLocaleDateString(isGerman ? "de-DE" : "en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    canAccessPath(activeUser.role, item.href)
  );
  const hasAccess = pathname ? canAccessPath(activeUser.role, pathname) : true;
  const fallbackHref = getDefaultDashboardPath(activeUser.role);
  const isReadOnly = isReadOnlyRole(activeUser.role);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("ac-theme");
    const savedLocale = window.localStorage.getItem("ac-locale");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
    if (savedLocale === "de" || savedLocale === "en") {
      setLocale(savedLocale);
    }
    setAuthUser(user);
    setAuthReady(true);
  }, [setAuthReady, setAuthUser, setLocale, setTheme, user]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("ac-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("ac-locale", locale);
  }, [locale]);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    const supabase = createBrowserClient();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      window.localStorage.removeItem("ac-last-activity");
      setAuthUser(null);
      setAuthReady(true);
      window.location.replace("/login?reason=logout");
    }
  }

  return (
    <div className="ac-shell">
      <AuthSessionManager initialUser={user} />
      <aside className="ac-sidebar flex w-[17.5rem] flex-col">
        <div className="border-b border-surface-200 p-5">
          <div
            className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
              theme === "dark"
                ? "border border-white/10 bg-white/5 text-white/70"
                : "border border-surface-200 bg-white text-praxis-400"
            }`}
          >
            {t("auth.protectedArea", locale)}
          </div>
          <h1
            className={`mt-3 text-[28px] font-bold leading-none ${
              theme === "dark" ? "text-white" : "text-praxis-800"
            }`}
          >
            Anima Cura
          </h1>
          <p
            className={`mt-1 text-xs font-medium ${
              theme === "dark" ? "text-white/60" : "text-praxis-400"
            }`}
          >
            Intelligent Practice Finance
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {visibleNavItems.map((item) => {
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
                style={{ position: "relative" }}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebarActiveBlob"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    style={{ position: "absolute", inset: 0, borderRadius: 12, background: theme === "dark" ? "rgba(74,222,128,0.08)" : "var(--ac-sidebar-active-bg)", zIndex: -1 }}
                  />
                )}
                <Icon size={18} />
                {t(item.key, locale)}
              </Link>
            );
          })}
        </nav>

        <div
          className={`border-t p-3 ${
            theme === "dark" ? "border-white/10" : "border-surface-200"
          }`}
        >
          <div className="flex items-center gap-3 px-3 py-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                theme === "dark"
                  ? "bg-white/10 text-white"
                  : "bg-praxis-100 text-praxis-600"
              }`}
            >
              {getInitials(activeUser.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-medium ${
                  theme === "dark" ? "text-white" : "text-praxis-800"
                }`}
              >
                {activeUser.fullName}
              </p>
              <p
                className={`text-xs ${
                  theme === "dark" ? "text-white/60" : "text-praxis-400"
                }`}
              >
                {t(`settings.${activeUser.role === "verwaltung" ? "office" : activeUser.role === "lesezugriff" ? "readOnly" : "admin"}`, locale)}
                {isReadOnly ? ` · ${t("auth.readOnlyMode", locale)}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={isLoggingOut}
              className={`transition-colors ${
                theme === "dark"
                  ? "text-white/65 hover:text-white"
                  : "text-praxis-400 hover:text-praxis-600"
              } ${isLoggingOut ? "pointer-events-none opacity-50" : ""}`}
              title={t("header.logout", locale)}
              onClick={() => void handleLogout()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="ac-main flex flex-1 flex-col overflow-hidden">
        <header className="h-16 border-b border-surface-200 px-6">
          <div className="flex h-full items-center justify-between gap-4">
            <div className="hidden text-xs tracking-wide text-praxis-400 md:block">
              {now}
            </div>
            <div className="relative hidden w-full max-w-sm lg:block">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400"
              />
              <input
                className="input pl-9"
                placeholder={t("search.placeholder", locale)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.target as HTMLInputElement).value.trim()
                  ) {
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
              <span className="hidden items-center gap-2 text-xs text-praxis-400 md:inline-flex">
                <span className="h-2 w-2 rounded-full bg-accent-emerald" />
                {t("header.systemActive", locale)}
              </span>
            </div>
          </div>
        </header>

        <div className="ac-content flex-1 overflow-y-auto p-7">
          {hasAccess ? (
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          ) : (
            <AccessDenied
              locale={locale}
              theme={theme}
              fallbackHref={fallbackHref}
            />
          )}
        </div>
      </main>
      <ICuraVoiceCompanion />
    </div>
  );
}
