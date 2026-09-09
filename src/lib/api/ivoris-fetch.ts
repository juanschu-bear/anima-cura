const DEFAULT_IVORIS_REQUEST_TIMEOUT_MS = 20_000;
const MIN_IVORIS_REQUEST_TIMEOUT_MS = 1_000;
const MAX_IVORIS_REQUEST_TIMEOUT_MS = 120_000;

export function parseIvorisRequestTimeoutMs(raw = process.env.IVORIS_REQUEST_TIMEOUT_MS) {
  if (!raw) return DEFAULT_IVORIS_REQUEST_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_IVORIS_REQUEST_TIMEOUT_MS;
  return Math.max(MIN_IVORIS_REQUEST_TIMEOUT_MS, Math.min(MAX_IVORIS_REQUEST_TIMEOUT_MS, parsed));
}

export async function fetchIvoris(input: string | URL, init: RequestInit = {}) {
  const timeoutMs = parseIvorisRequestTimeoutMs();
  const controller = new AbortController();
  let timedOut = false;
  const handleExternalAbort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) {
    handleExternalAbort();
  } else {
    init.signal?.addEventListener("abort", handleExternalAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(`IVORIS Anfrage Timeout nach ${timeoutMs} ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", handleExternalAbort);
  }
}

