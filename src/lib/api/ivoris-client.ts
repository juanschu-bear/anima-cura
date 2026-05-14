const DEFAULT_RELAY_HOST = "https://relay.computer-konkret.de";

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
    throw new Error(`IVORIS About/Documentation fehlgeschlagen (${response.status}): ${String(payload)}`);
  }

  return payload;
}

export async function fetchIvorisPatientsRaw() {
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
        throw new Error(`IVORIS Patienten-Endpoint fehlgeschlagen (${response.status}) bei ${path}: ${String(payload)}`);
      }

      if (!Array.isArray(payload) || payload.length === 0) {
        break;
      }

      aggregated.push(...payload);
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
    throw new Error(`IVORIS Patienten-Endpoint fehlgeschlagen (${response.status}) bei ${path}: ${String(payload)}`);
  }
  return payload;
}
