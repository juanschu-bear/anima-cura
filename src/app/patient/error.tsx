"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

/** Keep rendering failures recoverable without clearing patient sessions. */
export default function PatientError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<"de" | "en">("de");
  useEffect(() => {
    if (navigator.language.startsWith("en")) setLocale("en");
  }, []);

  function returnHome() {
    // A remembered invoice tab must not reopen the same broken view.
    try {
      sessionStorage.removeItem("ac_tab");
      sessionStorage.removeItem("ac_balance");
    } catch { /* Navigation also works when storage is unavailable. */ }
  }

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f5f1eb", color: "#18322b", padding: 24, fontFamily: "system-ui,sans-serif" }}>
      <section role="alert" style={{ maxWidth: 480, lineHeight: 1.6 }}>
        <p>Anima Cura</p>
        <h1 style={{ fontSize: 26 }}>{t("patientError.title", locale)}</h1>
        <p>{t("patientError.body", locale)}</p>
        <button type="button" onClick={() => { reset(); window.location.reload(); }} style={{ padding: "12px 18px", border: 0, borderRadius: 12, background: "#173f34", color: "white", fontSize: 16, cursor: "pointer" }}>
          {t("patientError.retry", locale)}
        </button>
        <p><a href="/patient/portal" onClick={returnHome}>{t("patientError.home", locale)}</a></p>
        <a href="mailto:praxisteam@animacura.io">{t("patientError.contact", locale)}</a>
      </section>
    </main>
  );
}
