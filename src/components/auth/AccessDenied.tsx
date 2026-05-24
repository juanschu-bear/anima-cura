"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { t } from "@/lib/i18n";

export default function AccessDenied({
  locale,
  theme,
  fallbackHref,
}: {
  locale: "de" | "en";
  theme: "light" | "dark";
  fallbackHref: string;
}) {
  const isDark = theme === "dark";

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className={`w-full max-w-lg rounded-[28px] border p-8 ${
          isDark ? "border-white/10 bg-[#0d1420] text-white" : "border-surface-200 bg-white text-praxis-800"
        }`}
        style={{ boxShadow: "var(--ac-shadow)" }}
      >
        <div
          className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${
            isDark ? "bg-white/10 text-white" : "bg-praxis-100 text-praxis-600"
          }`}
        >
          <ShieldAlert size={26} />
        </div>
        <h1 className="mt-5 text-[28px] font-bold tracking-tight">
          {t("auth.noPermissionTitle", locale)}
        </h1>
        <p className={`mt-2 text-sm ${isDark ? "text-white/70" : "text-praxis-500"}`}>
          {t("auth.noPermissionBody", locale)}
        </p>
        <div className="mt-6">
          <Link href={fallbackHref} className="btn-primary inline-flex items-center gap-2">
            {t("auth.backToAllowedArea", locale)}
          </Link>
        </div>
      </div>
    </div>
  );
}
