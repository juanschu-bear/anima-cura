// ivoris-Doku-Client: Karteieintraege schreiben/lesen via Relay.
// Kanal: POST /Documentation/v1/Entry (append-only, kein PUT/DELETE in der ivoris-API).
// Benoetigt zusaetzlich zur bestehenden IVORIS_*-Konfiguration: IVORIS_PROFILE_ID (Mandant).

const DEFAULT_RELAY_HOST = "https://relay.computer-konkret.de";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSIENT_IVORIS_STATUSES = new Set([502, 503, 504]);
const ADD_ENTRY_RETRY_DELAY_MS = 900;

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

function formatPayload(payload: unknown): string {
  if (typeof payload === "string") return payload.trim() || "leer";
  if (payload === null || payload === undefined) return "leer";
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function normalizeLooseText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function pickString(candidate: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = candidate[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "bigint") return String(value);
  }
  return null;
}

function matchesEntryPayload(
  row: Record<string, unknown>,
  input: Pick<IvorisKarteiEintragInput, "date" | "text" | "tooth">
): string | null {
  const dateValue = pickString(row, ["Date", "date", "EntryDate", "entryDate"]);
  const textValue = pickString(row, ["Text", "text", "Content", "content", "Description", "description"]);
  const toothValue = pickString(row, ["Tooth", "tooth", "ToothNo", "toothNo"]);
  const entryId = pickString(row, ["EntryId", "entryId", "Id", "id"]);

  if (!entryId) return null;
  if (!dateValue?.startsWith(input.date)) return null;
  if (normalizeLooseText(textValue) !== normalizeLooseText(input.text)) return null;
  if (input.tooth && toothValue && toothValue !== input.tooth) return null;
  if (input.tooth && !toothValue) return null;

  return entryId;
}

function findExistingEntryId(
  payload: unknown,
  input: Pick<IvorisKarteiEintragInput, "date" | "text" | "tooth">
): string | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findExistingEntryId(item, input);
      if (found) return found;
    }
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const direct = matchesEntryPayload(candidate, input);
  if (direct) return direct;

  for (const key of ["entry", "entries", "data", "result", "items"]) {
    const nested = findExistingEntryId(candidate[key], input);
    if (nested) return nested;
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url: URL, headers: Record<string, string>, body: string) {
  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });
  const payload = await parseBestEffort(response);
  return { response, payload };
}

async function findExistingKarteiEntryId(input: IvorisKarteiEintragInput): Promise<string | null> {
  try {
    const entries = await fetchIvorisKarteiEintraege(input.patientIvorisId);
    return findExistingEntryId(entries, input);
  } catch (error) {
    console.warn(
      `[IVORIS] AddEntry duplicate-check failed for patient=${input.patientIvorisId} date=${input.date}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function transientAddEntryMessage(status: number, payload: unknown): string {
  const detail = formatPayload(payload);
  const suffix = detail !== "leer" ? ` Detail: ${detail}` : "";
  return `IVORIS ist gerade nicht stabil erreichbar (${status}). Der Eintrag wurde noch nicht sicher uebernommen. Bitte in 1-2 Minuten erneut versuchen.${suffix}`;
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`IVORIS ${field} ungueltig: erwartete nicht-leeren String`);
  }
  return value.trim();
}

function normalizePatientIvorisId(value: unknown): string {
  const patientId = assertNonEmptyString(value, "PatientId");
  if (patientId === "[object Object]" || !UUID_RE.test(patientId)) {
    throw new Error(`IVORIS PatientId ungueltig: ${patientId}`);
  }
  return patientId;
}

function extractResponseId(payload: unknown, keys: string[]): string | null {
  if (typeof payload === "string") {
    const direct = payload.replace(/"/g, "").trim();
    return direct || null;
  }

  if (typeof payload === "number" || typeof payload === "bigint") {
    return String(payload);
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractResponseId(entry, keys);
      if (nested) return nested;
    }
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = candidate[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
      const direct = String(value).trim();
      if (direct) return direct;
    }
  }

  for (const nestedKey of ["entry", "document", "data", "result"]) {
    const nested = extractResponseId(candidate[nestedKey], keys);
    if (nested) return nested;
  }

  return null;
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
  const headers = buildHeaders(creds);

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
  const requestBody = JSON.stringify(body);

  let { response, payload } = await postJson(url, headers, requestBody);
  if (!response.ok && TRANSIENT_IVORIS_STATUSES.has(response.status)) {
    console.warn(
      `[IVORIS] AddEntry transient response status=${response.status} patient=${input.patientIvorisId} date=${input.date} payload=${formatPayload(payload)}`
    );

    const existingEntryId = await findExistingKarteiEntryId(input);
    if (existingEntryId) {
      console.info(
        `[IVORIS] AddEntry recovered via duplicate-check entryId=${existingEntryId} patient=${input.patientIvorisId}`
      );
      return { entryId: existingEntryId };
    }

    await sleep(ADD_ENTRY_RETRY_DELAY_MS);
    ({ response, payload } = await postJson(url, headers, requestBody));

    if (!response.ok && TRANSIENT_IVORIS_STATUSES.has(response.status)) {
      const recoveredEntryId = await findExistingKarteiEntryId(input);
      if (recoveredEntryId) {
        console.info(
          `[IVORIS] AddEntry recovered after retry-check entryId=${recoveredEntryId} patient=${input.patientIvorisId}`
        );
        return { entryId: recoveredEntryId };
      }
      throw new Error(transientAddEntryMessage(response.status, payload));
    }
  }

  if (!response.ok) {
    throw new Error(`IVORIS AddEntry fehlgeschlagen (${response.status}): ${formatPayload(payload)}`);
  }

  // AddEntry liefert die Entry-Id als nackten JSON-String zurueck (verifiziert am 2026-06-10).
  const entryId = extractResponseId(payload, ["EntryId", "entryId", "Id", "id"]);
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


// === Document Upload to Ivoris Karteikarte ===

export type IvorisDocumentInput = {
  patientIvorisId: string;
  /** Dateiname mit Endung, z.B. "Anamnesebogen_Nachname_2026-06-22.pdf" */
  name: string;
  /** ISO-Datum YYYY-MM-DD */
  date: string;
  /** PDF als base64-encoded string */
  contentBase64: string;
};

/**
 * Laedt ein Dokument (z.B. signiertes PDF) in die Ivoris-Patientenakte hoch.
 * POST /Documentation/v1/Document
 */
export async function addIvorisDocument(
  input: IvorisDocumentInput
): Promise<string> {
  const creds = getCredentials();
  const url = buildUrl(creds, "/Documentation/v1/Document");
  const patientId = normalizePatientIvorisId(input.patientIvorisId);
  const content = assertNonEmptyString(input.contentBase64, "Document.Content");

  const body = {
    document: {
      ProfileId: creds.profileId,
      PatientId: patientId,
      Name: input.name,
      Date: input.date,
      Content: content,
    },
  };
  const requestBody = JSON.stringify(body);
  const parsedRequestBody = JSON.parse(requestBody) as {
    document?: { Content?: unknown };
  };

  if (typeof parsedRequestBody.document?.Content !== "string") {
    throw new Error(
      `IVORIS AddDocument Request ungueltig: Content ist kein String (${typeof parsedRequestBody.document?.Content})`
    );
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: buildHeaders(creds),
    body: requestBody,
    cache: "no-store",
  });

  console.log(
    `[IVORIS] AddDocument request patient=${patientId}: ${JSON.stringify({
      document: {
        ...body.document,
        Content: `<base64:${content.length} chars; type=${typeof parsedRequestBody.document?.Content}>`,
      },
    })}`
  );
  const payload = await parseBestEffort(response);
  if (!response.ok) {
    console.error(
      `[IVORIS] AddDocument response patient=${patientId}: status=${response.status} payload=${
        typeof payload === "string" ? payload : JSON.stringify(payload)
      }`
    );
    throw new Error(
      `IVORIS AddDocument fehlgeschlagen (${response.status}): ${typeof payload === "string" ? payload : JSON.stringify(payload)}`
    );
  }

  console.log(
    `[IVORIS] AddDocument response patient=${patientId}: status=${response.status} payload=${
      typeof payload === "string" ? payload : JSON.stringify(payload)
    }`
  );

  const docId = extractResponseId(payload, ["DocumentId", "documentId", "Id", "id"]);
  if (!docId || docId === "null") {
    throw new Error(`IVORIS AddDocument: keine Dokument-Id in der Antwort: ${JSON.stringify(payload)}`);
  }
  return docId;
}
