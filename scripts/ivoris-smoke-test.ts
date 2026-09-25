type TestResult = {
  baseLabel: string;
  endpoint: string;
  ok: boolean;
  status?: number;
  durationMs: number;
  preview?: string;
  error?: string;
};

const REQUIRED = [
  "IVORIS_APP",
  "IVORIS_APP_VERSION",
  "IVORIS_API_KEY",
  "IVORIS_USERNAME",
  "IVORIS_PASSWORD",
] as const;

function readRequired(name: (typeof REQUIRED)[number]) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function maskRelayPath(url: string) {
  return url.replace(
    /(https:\/\/relay\.computer-konkret\.de\/relay\/)([^/]+)/i,
    (_match, prefix: string, token: string) =>
      `${prefix}${token.slice(0, 2)}…${token.slice(-2)}`
  );
}

function describeBase(url: string) {
  try {
    const parsed = new URL(url);
    return maskRelayPath(`${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`);
  } catch {
    return "(invalid-base-url)";
  }
}

function getCandidateBases(): string[] {
  const directBase = process.env.IVORIS_BASE_URL?.trim();
  if (directBase) return [directBase.replace(/\/$/, "")];

  const relayRoot = process.env.IVORIS_RELAY_URL?.trim();
  if (relayRoot) {
    const trimmed = relayRoot.replace(/\/$/, "");
    return Array.from(
      new Set([
        trimmed,
        `${trimmed}/api`,
        `${trimmed}/webservice`,
        `${trimmed}/webservice/api`,
      ])
    );
  }

  const linkname = process.env.IVORIS_LINKNAME?.trim();
  if (linkname) {
    const relayHost =
      process.env.IVORIS_RELAY_HOST?.trim() || "https://relay.computer-konkret.de";
    return [`${relayHost.replace(/\/$/, "")}/relay/${linkname}/webservice/api`];
  }

  throw new Error(
    "Provide one of: IVORIS_BASE_URL, IVORIS_RELAY_URL, IVORIS_LINKNAME"
  );
}

async function testEndpoint(
  baseUrl: string,
  endpoint: string,
  authHeader: string,
  query: URLSearchParams,
  allowInsecure: boolean
): Promise<TestResult> {
  const url = new URL(
    `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`
  );
  query.forEach((value, key) => url.searchParams.set(key, value));

  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json, text/plain, */*",
      },
      cache: "no-store",
    });

    const raw = (await response.text()).trim();
    return {
      baseLabel: describeBase(baseUrl),
      endpoint,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - started,
      preview: raw.slice(0, 180),
    };
  } catch (error) {
    return {
      baseLabel: describeBase(baseUrl),
      endpoint,
      ok: false,
      durationMs: Date.now() - started,
      error:
        error instanceof Error
          ? [error.message, error.cause ? String(error.cause) : null]
              .filter(Boolean)
              .join(" | cause: ")
          : String(error),
    };
  }
}

async function main() {
  const app = readRequired("IVORIS_APP");
  const appVersion = readRequired("IVORIS_APP_VERSION");
  const apiKey = readRequired("IVORIS_API_KEY");
  const username = readRequired("IVORIS_USERNAME");
  const password = readRequired("IVORIS_PASSWORD");
  const allowInsecure = process.argv.includes("--insecure");
  if (allowInsecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  const bases = getCandidateBases();

  const query = new URLSearchParams({
    app,
    app_version: appVersion,
    api_key: apiKey,
  });

  const authHeader =
    "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const results: TestResult[] = [];
  for (const base of bases) {
    results.push(
      await testEndpoint(base, "About/v1/Ping", authHeader, query, allowInsecure)
    );
    results.push(
      await testEndpoint(
        base,
        "About/v1/Documentation",
        authHeader,
        query,
        allowInsecure
      )
    );
  }

  const okCount = results.filter((item) => item.ok).length;
  const summary = {
    testedBases: bases.map(describeBase),
    okCount,
    resultCount: results.length,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (okCount === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
