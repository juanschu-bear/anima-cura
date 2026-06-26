// Gemeinsame Plausibilitaetspruefung fuer alle Formulare (Anamnese, Praxis-Pass, Login).
// Prueft die FORM einer Eingabe, nicht ihre Echtheit. Echtheit (existiert die Nummer/Mail
// wirklich) braucht einen Rueckkanal (SMS-Code, Bestaetigungsmail) und ist hier bewusst NICHT
// enthalten. Ziel: offensichtlichen Muell und falsche Formate abfangen, ohne korrekte
// Eingaben faelschlich anzumeckern. Die Regeln sind in REGELN.md dokumentiert.

export type PruefErgebnis = { ok: true } | { ok: false; grund: string };

const OK: PruefErgebnis = { ok: true };

// Tastaturreihen (deutsches und englisches Layout). Wird auf 4er-Folgen geprueft.
const TASTATURREIHEN = [
  "qwertzuiopue", "asdfghjkloeae", "yxcvbnm",
  "qwertyuiop", "asdfghjkl", "zxcvbnm",
  "1234567890",
];

// 3 oder mehr gleiche Zeichen am Stueck, z. B. "xxxxx" oder "aaaa".
function hatWiederholung(s: string): boolean {
  return /(.)\1\1/.test(s);
}

// 4er-Ausschnitt einer Tastaturreihe, vorwaerts oder rueckwaerts, z. B. "asdf", "rewq".
function hatTastaturmuster(s: string): boolean {
  const t = s.toLowerCase();
  for (const reihe of TASTATURREIHEN) {
    const rueck = reihe.split("").reverse().join("");
    for (let i = 0; i <= reihe.length - 4; i++) {
      if (t.includes(reihe.slice(i, i + 4))) return true;
      if (t.includes(rueck.slice(i, i + 4))) return true;
    }
  }
  return false;
}

// 3 oder mehr im Alphabet aufeinanderfolgende Buchstaben, vor- oder rueckwaerts, z. B. "abc", "cba".
function hatAlphabetfolge(s: string): boolean {
  const t = s.toLowerCase().replace(/[^a-z]/g, "");
  let vor = 1;
  let rueck = 1;
  for (let i = 1; i < t.length; i++) {
    const d = t.charCodeAt(i) - t.charCodeAt(i - 1);
    vor = d === 1 ? vor + 1 : 1;
    rueck = d === -1 ? rueck + 1 : 1;
    if (vor >= 4 || rueck >= 4) return true;
  }
  return false;
}

// Offensichtlicher Muell-Test: wird fuer Namen und kurze Pflichttexte genutzt.
function wirktWieMuell(s: string): boolean {
  return hatWiederholung(s) || hatTastaturmuster(s) || hatAlphabetfolge(s);
}

export function pruefeName(v: string): PruefErgebnis {
  const roh = (v ?? "").trim();
  const clean = roh.replace(/[\s.'-]/g, "");
  if (clean.length < 2) return { ok: false, grund: "Bitte einen vollständigen Namen eingeben." };
  if (/\d/.test(roh)) return { ok: false, grund: "Ein Name enthält keine Ziffern." };
  if (wirktWieMuell(clean)) return { ok: false, grund: "Das wirkt nicht wie ein echter Name." };
  return OK;
}

export function pruefeEmail(v: string): PruefErgebnis {
  const e = (v ?? "").trim();
  if (e.split("@").length !== 2) return { ok: false, grund: "Bitte eine gültige E-Mail mit genau einem @ eingeben." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { ok: false, grund: "Bitte eine gültige E-Mail-Adresse eingeben." };
  return OK;
}

export function pruefeTelefon(v: string): PruefErgebnis {
  const clean = (v ?? "").replace(/[\s/().-]/g, "");
  if (!/^(\+|00)?\d+$/.test(clean)) return { ok: false, grund: "Bitte eine gültige Telefonnummer eingeben." };
  const ziffern = clean.replace(/\D/g, "");
  if (!(clean.startsWith("+") || clean.startsWith("00") || clean.startsWith("0"))) {
    return { ok: false, grund: "Telefonnummer bitte mit 0 oder +49 beginnen." };
  }
  if (ziffern.length < 7 || ziffern.length > 15) return { ok: false, grund: "Die Telefonnummer hat eine unplausible Länge." };
  return OK;
}

export function pruefePlz(v: string): PruefErgebnis {
  const p = (v ?? "").trim();
  if (!/^\d{5}$/.test(p)) return { ok: false, grund: "Die PLZ muss aus genau 5 Ziffern bestehen." };
  return OK;
}

export function pruefeHausnummer(v: string): PruefErgebnis {
  if (!/\d/.test(v ?? "")) return { ok: false, grund: "Die Hausnummer muss eine Zahl enthalten." };
  return OK;
}

export function pruefeDatum(v: string, opt?: { geburt?: boolean }): PruefErgebnis {
  const s = (v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, grund: "Bitte ein gültiges Datum eingeben." };
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return { ok: false, grund: "Bitte ein gültiges Datum eingeben." };
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  if (opt?.geburt) {
    if (d.getTime() > heute.getTime()) return { ok: false, grund: "Das Geburtsdatum kann nicht in der Zukunft liegen." };
    const jahre = (heute.getTime() - d.getTime()) / (365.25 * 864e5);
    if (jahre > 120) return { ok: false, grund: "Bitte das Geburtsdatum prüfen." };
  }
  return OK;
}

export function pruefeText(v: string, minLen = 2, muellPruefen = true): PruefErgebnis {
  const t = (v ?? "").trim();
  if (t.length < minLen) return { ok: false, grund: "Diese Angabe ist zu kurz." };
  if (muellPruefen && t.replace(/\s/g, "").length <= 12 && wirktWieMuell(t.replace(/\s/g, ""))) {
    return { ok: false, grund: "Diese Eingabe wirkt nicht plausibel." };
  }
  return OK;
}
