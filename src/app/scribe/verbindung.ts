/**
 * Alle Anfragen aus Scribe laufen hierüber, damit die Praxis nie hängen bleibt (Juans Grundregel vom 11.11.2026):
 * - Verbindung weg: Es wird nie geworfen, Knöpfe bleiben bedienbar. Sichere Anfragen werden 1 Mal automatisch
 *   wiederholt. Sicher heißt: GET, oder der Aufrufer bestätigt mit `wiederholbar`, dass ein zweites Senden nichts doppelt anlegt.
 * - Abgemeldet (401): Ein Anmeldefenster legt sich über die offene Seite. Nach der Anmeldung läuft dieselbe Anfrage weiter.
 *   Bei 401 hat der Server nichts verarbeitet, deshalb ist das erneute Senden immer sicher.
 * - Technische Servertexte werden durch Alltagssprache mit dem nächsten Schritt ersetzt. Der Originaltext bleibt in `serverText`.
 * Die Rückgabe ist immer eine normale Response, `error` ist danach ein Satz für die Praxis.
 */
import { t } from "@/lib/i18n";

export type AnfrageOptionen = {
  /** Schreibende Anfrage, die bei Netz- oder Serverfehler gefahrlos noch einmal gesendet werden darf. */
  wiederholbar?: boolean;
  /** Hintergrundabfrage (zum Beispiel die Glocke): kein Anmeldefenster, keine Wartezeit. */
  still?: boolean;
};

type Oeffner = (fertig: (angemeldet: boolean) => void) => void;
let oeffner: Oeffner | null = null;
let laufendeAnmeldung: Promise<boolean> | null = null;

/** Das Anmeldefenster meldet sich hier an. Ohne Fenster gilt eine abgelaufene Anmeldung als abgebrochen. */
export function anmeldeFensterRegistrieren(fn: Oeffner | null) {
  oeffner = fn;
}

function neuAnmelden(): Promise<boolean> {
  if (!oeffner) return Promise.resolve(false);
  const oeffnen = oeffner;
  // Mehrere gleichzeitige Anfragen warten auf dieselbe Anmeldung.
  if (!laufendeAnmeldung) {
    laufendeAnmeldung = new Promise<boolean>((resolve) =>
      oeffnen((ok) => {
        laufendeAnmeldung = null;
        resolve(ok);
      }),
    );
  }
  return laufendeAnmeldung;
}

const warte = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function antwort(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Servertexte, die für die Praxis keinen nächsten Schritt enthalten, mit ihrem Ersatz.
 * `code` wird ergänzt, wenn der Server keinen liefert, damit das Cockpit selbst weiterhelfen kann.
 * Die Namen sind dieselben stabilen Codes, die der Server künftig selbst mitschickt (Datenvertrag).
 */
const TECHNISCHE_TEXTE: Record<string, { key: string; code?: string }> = {
  "Nicht autorisiert": { key: "scribe.net.loggedOut", code: "not_authenticated" },
  "Keine Berechtigung": { key: "scribe.net.forbidden" },
  "Ungueltiger JSON-Body": { key: "scribe.net.invalid" },
  "Ungueltiger Body": { key: "scribe.net.invalid" },
  "Ungültiger Body": { key: "scribe.net.invalid" },
  "id fehlt.": { key: "scribe.net.invalid" },
  "id nötig": { key: "scribe.net.invalid" },
  "behandlungsart und termin_typ noetig": { key: "scribe.net.invalid" },
  "Art ist ungültig": { key: "scribe.net.invalid" },
  "Priorität ist ungültig": { key: "scribe.net.invalid" },
  "Status ist ungültig": { key: "scribe.net.invalid" },
  "Erinnerung ist ungültig": { key: "scribe.net.invalid" },
  "patient_id fehlt": { key: "scribe.net.noPatient" },
  "text fehlt": { key: "scribe.net.noText" },
  "aenderungsgrund ist Pflicht": { key: "scribe.net.noReason" },
  "Basis ungültig.": { key: "scribe.net.noBase" },
  "basis_termin_typ fehlt für die direkte Übernahme.": { key: "scribe.net.noBase" },
  "Basisvorlage für die neue Terminart wurde nicht gefunden.": { key: "scribe.net.noBase" },
  "Entwurf nicht gefunden": { key: "scribe.net.draftGone", code: "draft_not_found" },
  "Eintrag nicht gefunden": { key: "scribe.net.entryGone", code: "entry_not_found" },
  "Nur Entwuerfe koennen weiterbearbeitet werden": { key: "scribe.net.alreadyConfirmed", code: "draft_not_editable" },
};

/** Antworten, die nur einen Code und keinen Satz haben. */
const CODE_TEXTE: Record<string, string> = {
  draft_patient_mismatch: "scribe.net.draftOtherPatient",
};

async function verstaendlich(res: Response): Promise<Response> {
  if (res.ok) return res;
  const typ = res.headers.get("content-type") ?? "";
  if (!typ.includes("application/json")) {
    return antwort(res.status, { code: "server", error: t(res.status >= 500 ? "scribe.net.server" : "scribe.net.unknown") });
  }
  const json = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null;
  if (!json || typeof json !== "object") return antwort(res.status, { code: "server", error: t("scribe.net.server") });
  // Die Prüfung beim Bestätigen bringt ihre eigenen, schon verständlichen Gründe mit. Das Cockpit zeigt sie selbst.
  if (json.consistency || json.status === "needs_consistency_review") return res;
  const roh = typeof json.error === "string" ? json.error.trim() : "";
  const code = typeof json.code === "string" ? json.code : "";
  const treffer = TECHNISCHE_TEXTE[roh];
  if (treffer) {
    const text = t(treffer.key);
    return antwort(res.status, { ...json, code: code || treffer.code || "", error: text, message: text, serverText: roh });
  }
  if (!roh && code && CODE_TEXTE[code]) {
    const text = t(CODE_TEXTE[code]);
    return antwort(res.status, { ...json, error: text, message: text });
  }
  // Rohe Datenbank- oder Programmfehler ohne Code sind für die Praxis nie lesbar.
  if (res.status >= 500 && !code) {
    return antwort(res.status, { ...json, code: "server", error: t("scribe.net.server"), message: t("scribe.net.server"), serverText: roh });
  }
  if (!roh) return antwort(res.status, { ...json, error: t("scribe.net.unknown"), message: t("scribe.net.unknown") });
  return res;
}

/** Ersatz für fetch in Scribe. Wirft nie. */
export async function scribeFetch(url: string, init: RequestInit = {}, optionen: AnfrageOptionen = {}): Promise<Response> {
  const methode = (init.method ?? "GET").toUpperCase();
  const sicher = methode === "GET" || optionen.wiederholbar === true;
  let wiederholt = false;
  let neuAngemeldet = false;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      if (sicher && !wiederholt && !optionen.still) {
        wiederholt = true;
        await warte(1500);
        continue;
      }
      return antwort(503, { code: "netz_weg", error: t("scribe.net.offline"), message: t("scribe.net.offline") });
    }
    if (res.status === 401 && !optionen.still && !neuAngemeldet) {
      if (await neuAnmelden()) {
        neuAngemeldet = true;
        continue;
      }
      return antwort(401, { code: "not_authenticated", error: t("scribe.net.loggedOut"), message: t("scribe.net.loggedOut") });
    }
    if (res.status >= 500 && sicher && !wiederholt && !optionen.still) {
      wiederholt = true;
      await warte(1500);
      continue;
    }
    return verstaendlich(res);
  }
}

/** Liest JSON, ohne zu werfen. */
export async function jsonVon<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}
