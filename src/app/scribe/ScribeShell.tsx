"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Thema = "dunkel" | "hell";

const ThemaContext = createContext<{ thema: Thema; wechseln: () => void }>({
  thema: "dunkel",
  wechseln: () => {},
});

export function useThema() {
  return useContext(ThemaContext);
}

// Huelle fuer Anima Scribe: haelt das Farbthema (Obsidian dunkel / Glas hell)
// und merkt es sich im Browser. Standard: dunkel.
export default function ScribeShell({ fontKlassen, children }: { fontKlassen: string; children: ReactNode }) {
  const [thema, setThema] = useState<Thema>("dunkel");

  useEffect(() => {
    const gespeichert = window.localStorage.getItem("scribe-thema");
    if (gespeichert === "hell" || gespeichert === "dunkel") setThema(gespeichert);
  }, []);

  function wechseln() {
    setThema((t) => {
      const neu: Thema = t === "dunkel" ? "hell" : "dunkel";
      window.localStorage.setItem("scribe-thema", neu);
      return neu;
    });
  }

  return (
    <ThemaContext.Provider value={{ thema, wechseln }}>
      <div
        className={`scribe ${fontKlassen}`}
        data-thema={thema}
        style={{ fontFamily: "var(--schrift-text), system-ui, sans-serif" }}
      >
        <div className="aurora" aria-hidden="true" />
        {children}
      </div>
    </ThemaContext.Provider>
  );
}
