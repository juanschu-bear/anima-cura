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

  async function anmelden() {
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
      <div className="login-karte">
        <h1><span className="anima">Anima</span> Scribe</h1>
        <p className="unterzeile">Behandlungscockpit. Termin vorbei, Doku fertig.</p>

        <label htmlFor="scribe-email">E-Mail</label>
        <input id="scribe-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor="scribe-passwort">Passwort</label>
        <span className="pwfeld">
          <input
            id="scribe-passwort"
            type={pwSichtbar ? "text" : "password"}
            autoComplete="current-password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && anmelden()}
          />
          <button type="button" className="pwauge" aria-label={pwSichtbar ? "Passwort verbergen" : "Passwort anzeigen"} onClick={() => setPwSichtbar((s) => !s)}>
            {pwSichtbar ? "\u{1F648}" : "\u{1F441}"}
          </button>
        </span>

        {fehler && <div className="login-fehler">{fehler}</div>}

        <button className="haupt" onClick={anmelden} disabled={laedt || !email || !passwort}>
          {laedt ? "Anmelden ..." : "Anmelden"}
        </button>
      </div>
    </div>
  );
}
