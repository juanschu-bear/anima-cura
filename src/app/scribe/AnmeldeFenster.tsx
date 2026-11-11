"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/db/supabase";
import { t } from "@/lib/i18n";
import { anmeldeFensterRegistrieren } from "./verbindung";

/**
 * Läuft die Anmeldung ab, während jemand dokumentiert, legt sich dieses Fenster über die offene Seite.
 * Alles bleibt stehen. Nach der Anmeldung läuft die unterbrochene Aktion von selbst weiter.
 */
export default function AnmeldeFenster() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [sichtbar, setSichtbar] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const fertigRef = useRef<((angemeldet: boolean) => void) | null>(null);

  useEffect(() => {
    anmeldeFensterRegistrieren((fertig) => {
      fertigRef.current = fertig;
      setFehler(null);
      setPasswort("");
      setOffen(true);
    });
    return () => anmeldeFensterRegistrieren(null);
  }, []);

  function schliessen(angemeldet: boolean) {
    setOffen(false);
    setPasswort("");
    const fertig = fertigRef.current;
    fertigRef.current = null;
    fertig?.(angemeldet);
  }

  async function anmelden() {
    if (!email.trim() || !passwort) {
      setFehler(t("scribe.relogin.missing"));
      return;
    }
    setLaedt(true);
    setFehler(null);
    try {
      const { error } = await createBrowserClient().auth.signInWithPassword({ email: email.trim(), password: passwort });
      if (error) {
        setFehler(t("scribe.relogin.failed"));
        return;
      }
      schliessen(true);
      // Name und Kürzel oben aktualisieren, falls sich jemand anderes angemeldet hat. Eingaben auf der Seite bleiben erhalten.
      router.refresh();
    } catch {
      setFehler(t("scribe.net.offline"));
    } finally {
      setLaedt(false);
    }
  }

  if (!offen) return null;
  return (
    <div className="deckel anmelde-deckel" role="dialog" aria-modal="true" aria-labelledby="anmelde-titel">
      <div className="detailkarte anmelde-karte" onClick={(ev) => ev.stopPropagation()}>
        <div className="ohead spalte"><span id="anmelde-titel" className="otitel gross">{t("scribe.relogin.title")}</span></div>
        <p className="detailmeta anmelde-text">{t("scribe.relogin.text")}</p>
        <label className="anmelde-label" htmlFor="anmelde-email">{t("scribe.relogin.email")}</label>
        <input
          id="anmelde-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && anmelden()}
          autoFocus
        />
        <label className="anmelde-label" htmlFor="anmelde-passwort">{t("scribe.relogin.password")}</label>
        <span className="pwfeld">
          <input
            id="anmelde-passwort"
            type={sichtbar ? "text" : "password"}
            autoComplete="current-password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && anmelden()}
          />
          <button type="button" className="pwauge" aria-label={t(sichtbar ? "scribe.relogin.hide" : "scribe.relogin.show")} onClick={() => setSichtbar((s) => !s)}>
            {sichtbar ? "\u{1F648}" : "\u{1F441}"}
          </button>
        </span>
        {fehler && <p className="hinweis-fehlt anmelde-fehler" role="alert">{fehler}</p>}
        <div className="aktionen anmelde-aktionen">
          <button className="haupt" onClick={anmelden} disabled={laedt}>{laedt ? t("scribe.relogin.busy") : t("scribe.relogin.submit")}</button>
          <button className="neben" onClick={() => schliessen(false)} disabled={laedt}>{t("scribe.relogin.later")}</button>
        </div>
      </div>
    </div>
  );
}
