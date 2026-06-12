"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/db/supabase";

export default function ScribeLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [pwSichtbar, setPwSichtbar] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [emailFehlt, setEmailFehlt] = useState(false);
  const [passwortFehlt, setPasswortFehlt] = useState(false);

  async function anmelden() {
    const eFehlt = !email.trim();
    const pFehlt = !passwort.trim();
    setEmailFehlt(eFehlt);
    setPasswortFehlt(pFehlt);
    if (eFehlt || pFehlt) return;
    setFehler(null);
    setLaedt(true);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: passwort });
    setLaedt(false);
    if (error) {
      setFehler("Anmeldung fehlgeschlagen. E-Mail und Passwort pruefen.");
      return;
    }
    router.push("/scribe");
    router.refresh();
  }

  return (
    <div className="login-buehne">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="login-bg-glow" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="login-bg-icon" src="/scribe-brand/icon-512.png" alt="" aria-hidden="true" />
      <div className="login-bg-wort" aria-hidden="true">Anima Scribe</div>

      <div className="login-mitte">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-hero-icon" src="/scribe-brand/icon-512.png" alt="Anima Scribe" />
        <div className="login-cockpit">Behandlungscockpit</div>
        <p className="login-claim">Termin vorbei, Doku fertig.</p>

        <label htmlFor="scribe-email">E-Mail</label>
        <input id="scribe-email" className={`login-feld${emailFehlt ? " fehlt" : ""}`} type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); if (emailFehlt) setEmailFehlt(false); }} />

        <label htmlFor="scribe-passwort">Passwort</label>
        <span className="pwfeld">
          <input
            id="scribe-passwort"
            className={`login-feld${passwortFehlt ? " fehlt" : ""}`}
            type={pwSichtbar ? "text" : "password"}
            autoComplete="current-password"
            value={passwort}
            onChange={(e) => { setPasswort(e.target.value); if (passwortFehlt) setPasswortFehlt(false); }}
            onKeyDown={(e) => e.key === "Enter" && anmelden()}
          />
          <button type="button" className="pwauge" aria-label={pwSichtbar ? "Passwort verbergen" : "Passwort anzeigen"} onClick={() => setPwSichtbar((s) => !s)}>
            {pwSichtbar ? "\u{1F648}" : "\u{1F441}"}
          </button>
        </span>

        {fehler && <div className="login-fehler">{fehler}</div>}

        <button className="haupt" onClick={anmelden} disabled={laedt}>
          {laedt ? "Anmelden ..." : "Anmelden"}
        </button>
      </div>
    </div>
  );
}
