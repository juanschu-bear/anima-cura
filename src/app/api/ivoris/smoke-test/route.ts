import { NextResponse } from "next/server";
import { requirePraxisRole } from "@/lib/require-praxis";
import { fetchIvoris } from "@/lib/api/ivoris-fetch";

export const runtime = "nodejs";
export const maxDuration = 60;

function mask(value: string | undefined, keep = 3) {
  if (!value) return { set: false, preview: "(missing)" };
  const trimmed = value.trim();
  if (!trimmed) return { set: false, preview: "(empty)" };
  return {
    set: true,
    preview:
      trimmed.length <= keep * 2
        ? "*".repeat(trimmed.length)
        : `${trimmed.slice(0, keep)}…${trimmed.slice(-keep)}`,
  };
}

function formatPayload(payload: unknown) {
  if (typeof payload === "string") return payload.trim();
  if (payload === null || payload === undefined) return "";
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
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

function getConfig() {
  const relayHost =
    process.env.IVORIS_RELAY_HOST?.trim() || "https://relay.computer-konkret.de";
  const linkname = process.env.IVORIS_LINKNAME?.trim() || "";
  const app = process.env.IVORIS_APP?.trim() || "";
  const appVersion = process.env.IVORIS_APP_VERSION?.trim() || "";
  const apiKey = process.env.IVORIS_API_KEY?.trim() || "";
  const username = process.env.IVORIS_USERNAME?.trim() || "";
  const password = process.env.IVORIS_PASSWORD?.trim() || "";
  const profileId = process.env.IVORIS_PROFILE_ID?.trim() || "";

  const missing = [
    !linkname ? "IVORIS_LINKNAME" : null,
    !app ? "IVORIS_APP" : null,
    !appVersion ? "IVORIS_APP_VERSION" : null,
    !apiKey ? "IVORIS_API_KEY" : null,
    !username ? "IVORIS_USERNAME" : null,
    !password ? "IVORIS_PASSWORD" : null,
  ].filter(Boolean) as string[];

  const baseUrl = `${relayHost.replace(/\/$/, "")}/relay/${linkname}/webservice/api`;
  return {
    relayHost,
    linkname,
    app,
    appVersion,
    apiKey,
    username,
    password,
    profileId,
    missing,
    baseUrl,
  };
}

async function callIvoris(
  baseUrl: string,
  endpoint: string,
  authHeader: string,
  query: URLSearchParams
) {
  const url = new URL(`${baseUrl}/${endpoint}`);
  query.forEach((value, key) => url.searchParams.set(key, value));
  const startedAt = Date.now();
  try {
    const response = await fetchIvoris(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json, text/plain, */*",
      },
      cache: "no-store",
    });
    const payload = await parseBestEffort(response);
    return {
      endpoint,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      payload,
      preview: formatPayload(payload).slice(0, 300),
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: null as number | null,
      durationMs: Date.now() - startedAt,
      payload: null,
      preview: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function inspectDocumentation(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return {
      isOpenApiLike: false,
      pathCount: 0,
      hasDocumentGet: false,
      hasDocumentPost: false,
      hasDocumentEntries: false,
      hasPatientGet: false,
    };
  }
  const candidate = payload as { paths?: Record<string, unknown> };
  const paths = candidate.paths ?? {};
  return {
    isOpenApiLike: typeof candidate.paths === "object" && candidate.paths !== null,
    pathCount: Object.keys(paths).length,
    hasDocumentGet: Boolean(paths["/Documentation/v1/Document"]),
    hasDocumentPost: Boolean(paths["/Documentation/v1/Document"]),
    hasDocumentEntries: Boolean(paths["/Documentation/v1/DocumentEntries"]),
    hasPatientGet: Boolean(paths["/Patient/v1/Patient"]),
  };
}

export async function GET() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  const cfg = getConfig();
  const envStatus = {
    relayHost: mask(cfg.relayHost, 10),
    linkname: mask(cfg.linkname),
    app: mask(cfg.app),
    appVersion: mask(cfg.appVersion),
    apiKey: mask(cfg.apiKey),
    username: mask(cfg.username),
    password: mask(cfg.password),
    profileId: mask(cfg.profileId),
    missing: cfg.missing,
  };

  if (cfg.missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        reason: "missing_env",
        env: envStatus,
      },
      { status: 500 }
    );
  }

  const query = new URLSearchParams({
    app: cfg.app,
    app_version: cfg.appVersion,
    api_key: cfg.apiKey,
  });
  const authHeader =
    "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");

  const ping = await callIvoris(cfg.baseUrl, "About/v1/Ping", authHeader, query);
  const documentation = await callIvoris(
    cfg.baseUrl,
    "About/v1/Documentation",
    authHeader,
    query
  );

  return NextResponse.json({
    ok: ping.ok || documentation.ok,
    env: envStatus,
    testedBaseUrl: `${cfg.relayHost.replace(/\/$/, "")}/relay/${mask(
      cfg.linkname
    ).preview}/webservice/api`,
    ping: {
      endpoint: ping.endpoint,
      ok: ping.ok,
      status: ping.status,
      durationMs: ping.durationMs,
      preview: ping.preview,
      error: "error" in ping ? ping.error : null,
    },
    documentation: {
      endpoint: documentation.endpoint,
      ok: documentation.ok,
      status: documentation.status,
      durationMs: documentation.durationMs,
      preview: documentation.preview,
      error: "error" in documentation ? documentation.error : null,
      inspection: inspectDocumentation(documentation.payload),
    },
  });
}
