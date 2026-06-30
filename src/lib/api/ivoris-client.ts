const DEFAULT_RELAY_HOST = "https://relay.computer-konkret.de";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IvorisCredentials = {
  app: string;
  appVersion: string;
  apiKey: string;
  linkname: string;
  username?: string;
  password?: string;
};

function getIvorisCredentials(): IvorisCredentials {
  const app = process.env.IVORIS_APP;
  const appVersion = process.env.IVORIS_APP_VERSION;
  const apiKey = process.env.IVORIS_API_KEY;
  const linkname = process.env.IVORIS_LINKNAME;
  const username = process.env.IVORIS_USERNAME;
  const password = process.env.IVORIS_PASSWORD;

  if (!app || !appVersion || !apiKey || !linkname) {
    throw new Error(
      "IVORIS Konfiguration unvollständig. Erwartet: IVORIS_APP, IVORIS_APP_VERSION, IVORIS_API_KEY, IVORIS_LINKNAME"
    );
  }

  return { app, appVersion, apiKey, linkname, username, password };
}

function buildBaseUrl(linkname: string) {
  const relayHost = process.env.IVORIS_RELAY_HOST || DEFAULT_RELAY_HOST;
  return `${relayHost}/relay/${linkname}/webservice/api`;
}

function withAuthParams(url: URL, creds: IvorisCredentials) {
  url.searchParams.set("app", creds.app);
  url.searchParams.set("app_version", creds.appVersion);
  url.searchParams.set("api_key", creds.apiKey);
}

async function parseBestEffortResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatPayload(payload: unknown) {
  if (typeof payload === "string") return payload;
  if (payload === null || payload === undefined) return "null";
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function extractIvorisId(payload: unknown): string | null {
  if (typeof payload === "string") {
    const candidate = payload.replace(/"/g, "").trim();
    return UUID_RE.test(candidate) ? candidate : null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractIvorisId(item);
      if (nested) return nested;
    }
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const directKeys = ["Id", "id", "PatientId", "patientId", "Uuid", "uuid"];

  for (const key of directKeys) {
    const value = candidate[key];
    if (typeof value === "string" && UUID_RE.test(value.trim())) {
      return value.trim();
    }
  }

  const nestedKeys = ["patient", "data", "result", "document"];
  for (const key of nestedKeys) {
    const nested = extractIvorisId(candidate[key]);
    if (nested) return nested;
  }

  return null;
}

function buildHeaders(creds: IvorisCredentials) {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, text/html, */*",
    "Content-Type": "application/json",
  };

  if (creds.username && creds.password) {
    const basic = Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  return headers;
}

export async function fetchIvorisDocumentation() {
  const creds = getIvorisCredentials();
  const baseUrl = buildBaseUrl(creds.linkname);
  const url = new URL(`${baseUrl}/About/v1/Documentation`);
  withAuthParams(url, creds);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(creds),
    cache: "no-store",
  });

  const payload = await parseBestEffortResponse(response);
  if (!response.ok) {
    throw new Error(`IVORIS About/Documentation fehlgeschlagen (${response.status}): ${formatPayload(payload)}`);
  }

  return payload;
}

export async function fetchIvorisPatientsRaw() {
  console.log("[IVORIS-SYNC] fetchIvorisPatientsRaw called, IVORIS_PATIENTS_PATH=" + (process.env.IVORIS_PATIENTS_PATH || "(default)"));
  const creds = getIvorisCredentials();
  const baseUrl = buildBaseUrl(creds.linkname);
  const path = process.env.IVORIS_PATIENTS_PATH || "/Patient/v1/AllPatients";
  const method = (process.env.IVORIS_PATIENTS_METHOD || "GET").toUpperCase();
  const mandantIndex = process.env.IVORIS_MANDANT_INDEX;

  // Standard laut geliefertem OpenAPI-Dokument: /Patient/v1/AllPatients mit optionaler page-Query.
  const supportsPaging = method === "GET" && path === "/Patient/v1/AllPatients";

  if (supportsPaging) {
    const aggregated: unknown[] = [];
    for (let page = 0; page < 200; page++) {
      const url = new URL(`${baseUrl}${path}`);
      withAuthParams(url, creds);
      url.searchParams.set("page", String(page));
      if (mandantIndex) {
        url.searchParams.set("mandantIndex", mandantIndex);
      }

      const response = await fetch(url.toString(), {
        method,
        headers: buildHeaders(creds),
        cache: "no-store",
      });

      const payload = await parseBestEffortResponse(response);
      if (!response.ok) {
        throw new Error(`IVORIS Patienten-Endpoint fehlgeschlagen (${response.status}) bei ${path}: ${formatPayload(payload)}`);
      }

      if (!Array.isArray(payload) || payload.length === 0) {
        break;
      }

      aggregated.push(...payload);
      // Throttle: avoid overwhelming the IVORIS relay server
      await new Promise((r) => setTimeout(r, 200));
    }

    return aggregated;
  }

  const url = new URL(`${baseUrl}${path}`);
  withAuthParams(url, creds);
  if (mandantIndex) {
    url.searchParams.set("mandantIndex", mandantIndex);
  }

  const response = await fetch(url.toString(), {
    method,
    headers: buildHeaders(creds),
    cache: "no-store",
  });
  const payload = await parseBestEffortResponse(response);
  if (!response.ok) {
    throw new Error(`IVORIS Patienten-Endpoint fehlgeschlagen (${response.status}) bei ${path}: ${formatPayload(payload)}`);
  }
  return payload;
}

// Single-page fetch for diagnostics: returns one page of AllPatients without
// aggregating all pages (avoids the long-running full pull that times out).
export async function fetchIvorisPatientsPage(page = 0) {
  const creds = getIvorisCredentials();
  const baseUrl = buildBaseUrl(creds.linkname);
  const mandantIndex = process.env.IVORIS_MANDANT_INDEX;
  const url = new URL(`${baseUrl}/Patient/v1/AllPatients`);
  withAuthParams(url, creds);
  url.searchParams.set("page", String(page));
  if (mandantIndex) {
    url.searchParams.set("mandantIndex", mandantIndex);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(creds),
    cache: "no-store",
  });
  const payload = await parseBestEffortResponse(response);
  if (!response.ok) {
    throw new Error(`IVORIS AllPatients Seite ${page} fehlgeschlagen (${response.status}): ${formatPayload(payload)}`);
  }
  return payload;
}

// Fetch a single patient by ivoris UUID. Documented as GET /Patient/v1/Patient?id={uuid}.
// The detail object often carries more fields than the AllPatients list entry.
export async function fetchIvorisPatientById(id: string) {
  const creds = getIvorisCredentials();
  const baseUrl = buildBaseUrl(creds.linkname);
  const mandantIndex = process.env.IVORIS_MANDANT_INDEX;
  const url = new URL(`${baseUrl}/Patient/v1/Patient`);
  withAuthParams(url, creds);
  url.searchParams.set("id", id);
  if (mandantIndex) {
    url.searchParams.set("mandantIndex", mandantIndex);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(creds),
    cache: "no-store",
  });
  const payload = await parseBestEffortResponse(response);
  if (!response.ok) {
    throw new Error(`IVORIS GetPatient ${id} fehlgeschlagen (${response.status}): ${formatPayload(payload)}`);
  }
  return payload;
}


// === Ivoris Patient Write Operations ===

export type IvorisPatientInput = {
  Firstname: string;
  Lastname: string;
  Birthday: string;
  Gender?: string;
  Email?: string;
  Phone?: string;
  Mobile?: string;
  Address?: {
    Street?: string;
    Zip?: string;
    City?: string;
    Country?: string;
  };
  HealthInsurance?: string;
  CurrentInsurance?: {
    InsuranceStatus?: string;
    InsuranceNumber?: string;
    validFrom?: string;
  };
  mandantIndex?: string;
};

/** PUT /Patient/v1/Patient — Update an existing patient in Ivoris */
export async function updateIvorisPatient(
  ivorisId: string,
  data: Partial<IvorisPatientInput>
): Promise<void> {
  const creds = getIvorisCredentials();
  const baseUrl = buildBaseUrl(creds.linkname);
  const url = new URL(`${baseUrl}/Patient/v1/Patient`);
  withAuthParams(url, creds);

  const body = {
    patient: {
      Id: ivorisId,
      ...data,
    },
  };

  console.log(`[IVORIS] UpdatePatient request ${ivorisId}: ${JSON.stringify(body)}`);

  const response = await fetch(url.toString(), {
    method: "PUT",
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = await parseBestEffortResponse(response);
  if (!response.ok) {
    console.error(
      `[IVORIS] UpdatePatient response ${ivorisId}: status=${response.status} payload=${formatPayload(payload)}`
    );
    throw new Error(
      `IVORIS UpdatePatient ${ivorisId} fehlgeschlagen (${response.status}): ${formatPayload(payload)}`
    );
  }

  console.log(
    `[IVORIS] UpdatePatient response ${ivorisId}: status=${response.status} payload=${formatPayload(payload)}`
  );
}

/** POST /Patient/v1/Patient — Create a new patient in Ivoris. Returns the new ivoris UUID. */
export async function createIvorisPatient(
  data: IvorisPatientInput
): Promise<string> {
  const creds = getIvorisCredentials();
  const baseUrl = buildBaseUrl(creds.linkname);
  const mandantIndex = process.env.IVORIS_MANDANT_INDEX;
  const url = new URL(`${baseUrl}/Patient/v1/Patient`);
  withAuthParams(url, creds);

  const body = {
    patient: {
      ...data,
      mandantIndex: data.mandantIndex || mandantIndex || "0",
    },
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  console.log(`[IVORIS] AddPatient request: ${JSON.stringify(body)}`);
  const payload = await parseBestEffortResponse(response);
  if (!response.ok) {
    console.error(
      `[IVORIS] AddPatient response: status=${response.status} payload=${formatPayload(payload)}`
    );
    throw new Error(
      `IVORIS AddPatient fehlgeschlagen (${response.status}): ${formatPayload(payload)}`
    );
  }

  console.log(
    `[IVORIS] AddPatient response: status=${response.status} payload=${formatPayload(payload)}`
  );

  const newId = extractIvorisId(payload);
  if (!newId) {
    throw new Error(`IVORIS AddPatient: keine ID in Antwort: ${formatPayload(payload)}`);
  }
  return newId;
}
