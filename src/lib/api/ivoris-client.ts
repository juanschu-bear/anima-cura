const DEFAULT_RELAY_HOST = "https://relay.computer-konkret.de";

type IvorisCredentials = {
  app: string;
  appVersion: string;
  apiKey: string;
  linkname: string;
};

function getIvorisCredentials(): IvorisCredentials {
  const app = process.env.IVORIS_APP;
  const appVersion = process.env.IVORIS_APP_VERSION;
  const apiKey = process.env.IVORIS_API_KEY;
  const linkname = process.env.IVORIS_LINKNAME;

  if (!app || !appVersion || !apiKey || !linkname) {
    throw new Error(
      "IVORIS Konfiguration unvollständig. Erwartet: IVORIS_APP, IVORIS_APP_VERSION, IVORIS_API_KEY, IVORIS_LINKNAME"
    );
  }

  return { app, appVersion, apiKey, linkname };
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

export async function fetchIvorisDocumentation() {
  const creds = getIvorisCredentials();
  const baseUrl = buildBaseUrl(creds.linkname);
  const url = new URL(`${baseUrl}/About/v1/Documentation`);
  withAuthParams(url, creds);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json, text/plain, text/html, */*" },
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
  const service = process.env.IVORIS_PATIENTS_SERVICE || "Patient";
  const version = process.env.IVORIS_PATIENTS_VERSION || "v1";
  const action = process.env.IVORIS_PATIENTS_ACTION || "List";
  const method = (process.env.IVORIS_PATIENTS_METHOD || "GET").toUpperCase();

  const url = new URL(`${baseUrl}/${service}/${version}/${action}`);
  withAuthParams(url, creds);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const payload = await parseBestEffortResponse(response);
  if (!response.ok) {
    throw new Error(
      `IVORIS Patienten-Endpoint fehlgeschlagen (${response.status}) bei ${service}/${version}/${action}: ${String(payload)}`
    );
  }

  return payload;
}
