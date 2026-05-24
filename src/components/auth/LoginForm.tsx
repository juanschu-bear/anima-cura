"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Languages, Loader2, LockKeyhole, Moon, Sun } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/hooks/useAppStore";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/uebersicht";
  const reason = searchParams.get("reason");
  const { locale, setLocale, setTheme, theme, toggleTheme } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isGerman = locale === "de";
  const isDark = theme === "dark";

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

  const statusMessage = useMemo(() => {
    if (reason === "expired") return t("auth.sessionExpired", locale);
    if (reason === "logout") return t("auth.loggedOut", locale);
    return "";
  }, [locale, reason]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(t("auth.invalidCredentials", locale));
      setLoading(false);
      return;
    }

    window.localStorage.setItem("ac-last-activity", String(Date.now()));
    router.replace(nextPath);
    router.refresh();
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(89,115,255,0.18),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(36,175,125,0.2),_transparent_30%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section
            className={`rounded-[32px] border p-8 lg:p-10 ${
              isDark ? "border-white/10 bg-[#09111b]/90 text-white" : "border-surface-200 bg-white/90 text-praxis-800"
            }`}
            style={{ boxShadow: "var(--ac-shadow)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                  isDark
                    ? "border border-white/10 bg-white/5 text-white/70"
                    : "border border-surface-200 bg-surface-50 text-praxis-500"
                }`}
              >
                {t("auth.protectedArea", locale)}
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
                </button>
              </div>
            </div>

            <div className="mt-10">
              <h1 className="text-[40px] font-bold tracking-[-0.04em]">
                Anima Cura
              </h1>
              <p
                className={`mt-4 max-w-xl text-base leading-7 ${
                  isDark ? "text-white/72" : "text-praxis-500"
                }`}
              >
                {t("auth.loginSubtitle", locale)}
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div
                className={`rounded-3xl border p-5 ${
                  isDark ? "border-white/10 bg-white/[0.03]" : "border-surface-200 bg-surface-50"
                }`}
              >
                <p className="text-sm font-semibold">{t("auth.secureSessions", locale)}</p>
                <p className={`mt-2 text-sm ${isDark ? "text-white/70" : "text-praxis-500"}`}>
                  {t("auth.secureSessionsBody", locale)}
                </p>
              </div>
              <div
                className={`rounded-3xl border p-5 ${
                  isDark ? "border-white/10 bg-white/[0.03]" : "border-surface-200 bg-surface-50"
                }`}
              >
                <p className="text-sm font-semibold">{t("auth.roleBasedAccess", locale)}</p>
                <p className={`mt-2 text-sm ${isDark ? "text-white/70" : "text-praxis-500"}`}>
                  {t("auth.roleBasedAccessBody", locale)}
                </p>
              </div>
            </div>
          </section>

          <section
            className={`rounded-[32px] border p-8 lg:p-10 ${
              isDark ? "border-white/10 bg-[#0f1724]/95 text-white" : "border-surface-200 bg-white text-praxis-800"
            }`}
            style={{ boxShadow: "var(--ac-shadow)" }}
          >
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-praxis-600 text-white shadow-lg shadow-praxis-600/20">
              <LockKeyhole size={24} />
            </div>
            <h2 className="mt-6 text-[28px] font-bold tracking-tight">
              {t("auth.loginTitle", locale)}
            </h2>
            <p className={`mt-2 text-sm ${isDark ? "text-white/70" : "text-praxis-500"}`}>
              {t("auth.loginIntro", locale)}
            </p>

            {statusMessage && (
              <div
                className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
                  isDark ? "border-white/10 bg-white/[0.04] text-white/80" : "border-surface-200 bg-surface-50 text-praxis-600"
                }`}
              >
                {statusMessage}
              </div>
            )}

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  {t("auth.email", locale)}
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  className="input"
                  placeholder="maria@praxis-schubert.de"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  {t("auth.password", locale)}
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              {error && (
                <p className="text-sm text-[#cb4a55]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3"
                disabled={loading}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? t("auth.signingIn", locale) : t("auth.signIn", locale)}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
