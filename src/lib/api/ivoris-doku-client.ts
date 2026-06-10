// ivoris-Doku-Client: Karteieintraege schreiben/lesen via Relay.
// Kanal: POST /Documentation/v1/Entry (append-only, kein PUT/DELETE in der ivoris-API).
// Benoetigt zusaetzlich zur bestehenden IVORIS_*-Konfiguration: IVORIS_PROFILE_ID (Mandant).

const DEFAULT_RELAY_HOST = "https://relay.computer-konkret.de";

type IvorisDokuCredentials = {
  app: string;
  appVersion: string;
  apiKey: string;
  linkname: string;
  profileId: string;
  username?: string;
  password?: string;
};

function getCredentials(): IvorisDokuCredentials {
  const app = process.env.IVORIS_APP;
  const appVersion = process.env.IVORIS_APP_VERSION;
  const apiKey = process.env.IVORIS_API_KEY;
  const linkname = process.env.IVORIS_LINKNAME;
  const profileId = process.env.IVORIS_PROFILE_ID;
  const username = process.env.IVORIS_USERNAME;
  const password = process.env.IVORIS_PASSWORD;

  if (!app || !appVersion || !apiKey || !linkname || !profileId) {
    throw new Error(
      "IVORIS Doku-Konfiguration unvollstaendig. Erwartet: IVORIS_APP, IVORIS_APP_VERSION, IVORIS_API_KEY, IVORIS_LINKNAME, IVORIS_PROFILE_ID"
    );
  }

  return { app, appVersion, apiKey, linkname, profileId, username, password };
}

function buildUrl(creds: IvorisDokuCredentials, path: string) {
  const relayHost = process.env.IVORIS_RELAY_HOST || DEFAULT_RELAY_HOST;
  const url = new URL(`${relayHost}/relay/${creds.linkname}/webservice/api${path}`);
  url.searchParams.set("app", creds.app);
  url.searchParams.set("app_version", creds.appVersion);
  url.searchParams.set("api_key", creds.apiKey);
  return url;
}

function buildHeaders(creds: IvorisDokuCredentials) {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
  };
  if (creds.username && creds.password) {
    headers.Authorization = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString("base64")}`;
  }
  return headers;
}

async function parseBestEffort(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export type IvorisKarteiEintragInput = {
  patientIvorisId: string;
  /** ISO-Datum YYYY-MM-DD */
  date: string;
  text: string;
  /** Nur setzen, wenn genau ein Zahn betroffen ist (FDI, z. B. "21") */
  tooth?: string;
  /** Default "Text" */
  type?: "Text" | "Note";
};

export type IvorisKarteiEintragResult = {
  entryId: string;
};

/**
 * Schreibt einen Karteieintrag in die ivoris-Patientenakte.
 * Treatment ist fest "Orthodontics". Rueckgabe ist die ivoris Entry-Id.
 * Achtung: append-only. Korrekturen = neuer Eintrag, kein Update moeglich.
 */
export async function addIvorisKarteiEintrag(
  input: IvorisKarteiEintragInput
): Promise<IvorisKarteiEintragResult> {
  const creds = getCredentials();
  const url = buildUrl(creds, "/Documentation/v1/Entry");

  const body = {
    entry: {
      ProfileId: creds.profileId,
      PatientId: input.patientIvorisId,
      Date: input.date,
      Type: input.type ?? "Text",
      Treatment: "Orthodontics",
      ...(input.tooth ? { Tooth: input.tooth } : {}),
      Text: input.text,
    },
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = await parseBestEffort(response);
  if (!response.ok) {
    throw new Error(
      `IVORIS AddEntry fehlgeschlagen (${response.status}): ${typeof payload === "string" ? payload : JSON.stringify(payload)}`
    );
  }

  // AddEntry liefert die Entry-Id als nackten JSON-String zurueck (verifiziert am 2026-06-10).
  const entryId = typeof payload === "string" ? payload.replace(/"/g, "") : String(payload);
  if (!entryId || entryId === "null") {
    throw new Error(`IVORIS AddEntry: keine Entry-Id in der Antwort: ${JSON.stringify(payload)}`);
  }

  return { entryId };
}

/** Liest Karteieintraege eines Patienten (z. B. zum Gegenpruefen nach Push). */
export async function fetchIvorisKarteiEintraege(patientIvorisId: string): Promise<unknown[]> {
  const creds = getCredentials();
  const url = buildUrl(creds, "/Documentation/v1/Entries");
  url.searchParams.set("patientId", patientIvorisId);
  url.searchParams.set("profileId", creds.profileId);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(creds),
    cache: "no-store",
  });

  const payload = await parseBestEffort(response);
  if (!response.ok) {
    throw new Error(
      `IVORIS GetEntries fehlgeschlagen (${response.status}): ${typeof payload === "string" ? payload : JSON.stringify(payload)}`
    );
  }

  return Array.isArray(payload) ? payload : [];
}
