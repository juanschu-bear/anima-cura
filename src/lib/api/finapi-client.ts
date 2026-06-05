// ============================================================
// finAPI Client – Banking-API Anbindung
// ============================================================

import type { FinAPIToken, FinAPITransaction, FinAPIBankConnection } from "../types";

const BASE_URL = process.env.FINAPI_BASE_URL || "https://sandbox.finapi.io";
const CLIENT_ID = process.env.FINAPI_CLIENT_ID!;
const CLIENT_SECRET = process.env.FINAPI_CLIENT_SECRET!;

let cachedToken: { token: string; expiresAt: number } | null = null;

// ─── Auth ───────────────────────────────────────────────────
export async function getClientToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${BASE_URL}/api/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`finAPI Auth fehlgeschlagen: ${res.status} ${err}`);
  }

  const data: FinAPIToken = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

export async function getUserToken(userId: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: userId,
      password: password,
    }),
  });

  if (!res.ok) throw new Error(`User-Auth fehlgeschlagen: ${res.status}`);
  const data: FinAPIToken = await res.json();
  return data.access_token;
}

// ─── Hilfsfunktion ──────────────────────────────────────────
async function apiRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/v2${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`finAPI [${res.status}] ${endpoint}: ${err}`);
  }

  return res.json();
}

// ─── Bank-Verbindungen ──────────────────────────────────────
export async function importBankConnection(
  userToken: string,
  bankId: number,
  credentials: { label: string; value: string }[]
): Promise<FinAPIBankConnection> {
  return apiRequest<FinAPIBankConnection>("/bankConnections/import", userToken, {
    method: "POST",
    body: JSON.stringify({
      bankId,
      bankingInterface: "XS2A",
      loginCredentials: credentials,
      storeSecrets: true,
    }),
  });
}

export async function updateBankConnection(
  userToken: string,
  connectionId: number
): Promise<FinAPIBankConnection> {
  return apiRequest<FinAPIBankConnection>("/bankConnections/update", userToken, {
    method: "POST",
    body: JSON.stringify({
      bankConnectionId: connectionId,
      bankingInterface: "XS2A",
    }),
  });
}

export async function getBankConnection(
  userToken: string,
  connectionId: number
): Promise<{ id: number; updateStatus?: "READY" | "IN_PROGRESS" | "QUEUED" }> {
  return apiRequest(`/bankConnections/${connectionId}`, userToken);
}

// Wartet, bis ein angestossenes Bank-Update abgeschlossen ist.
// Laut finAPI-Doku laeuft das Update asynchron (updateStatus IN_PROGRESS),
// Transaktionen duerfen erst nach READY abgerufen werden.
// Rueckgabe: true = READY, false = Timeout (dann letzten Stand abrufen).
export async function waitForConnectionReady(
  userToken: string,
  connectionId: number,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 4_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const conn = await getBankConnection(userToken, connectionId);
    if (conn.updateStatus === "READY") return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// ─── Web Form 2.0: Hintergrund-Update ───────────────────────
// Unser finAPI-Client ist als Web-Form-2.0-Kunde konfiguriert:
// Direkte Aufrufe von /bankConnections/update sind gesperrt (422
// ILLEGAL_ENTITY_STATE). Der offizielle Weg laut finAPI-Doku:
// POST {WEBFORM_BASE}/api/tasks/backgroundUpdate mit bankConnectionIds,
// dann Task-Status pollen (COMPLETED / COMPLETED_WITH_ERROR /
// WEB_FORM_REQUIRED = Nutzer muss einmal ins Web-Formular).

const WEBFORM_BASE = BASE_URL.includes("sandbox")
  ? "https://webform-sandbox.finapi.io"
  : "https://webform-live.finapi.io";

interface WebFormUpdateTask {
  id: string;
  status?: string;
  webForm?: { id?: string; url?: string };
  url?: string;
}

async function webFormRequest<T>(
  endpoint: string,
  userToken: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${WEBFORM_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`finAPI WebForm [${res.status}] ${endpoint}: ${err}`);
  }
  return res.json();
}

export async function startBackgroundUpdateTask(
  userToken: string,
  bankConnectionId: number
): Promise<WebFormUpdateTask> {
  return webFormRequest<WebFormUpdateTask>("/api/tasks/backgroundUpdate", userToken, {
    method: "POST",
    body: JSON.stringify({ bankConnectionIds: [bankConnectionId] }),
  });
}

export async function getUpdateTask(
  userToken: string,
  taskId: string
): Promise<WebFormUpdateTask> {
  return webFormRequest<WebFormUpdateTask>(`/api/tasks/${taskId}`, userToken);
}

// Pollt die Update-Task bis zu einem Endzustand.
// Rueckgabe: { status, webFormUrl? }; Endzustaende laut Doku:
// COMPLETED, COMPLETED_WITH_ERROR, WEB_FORM_REQUIRED. Alles andere
// (z.B. IN_PROGRESS / NOT_YET_STARTED) wird weiter gepollt bis Timeout.
export async function waitForUpdateTask(
  userToken: string,
  taskId: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<{ status: string; webFormUrl?: string }> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 4_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const task = await getUpdateTask(userToken, taskId);
    const status = (task.status || "").toUpperCase();
    if (
      status === "COMPLETED" ||
      status === "COMPLETED_WITH_ERROR" ||
      status === "WEB_FORM_REQUIRED"
    ) {
      return { status, webFormUrl: task.webForm?.url || task.url };
    }
    if (Date.now() >= deadline) return { status: status || "TIMEOUT" };
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// ─── Transaktionen ──────────────────────────────────────────
export async function getTransactions(
  userToken: string,
  params: {
    accountIds?: number[];
    minDate?: string;
    maxDate?: string;
    direction?: "income" | "spending" | "all";
    perPage?: number;
    page?: number;
  } = {}
): Promise<{ transactions: FinAPITransaction[]; paging: { totalCount: number } }> {
  const query = new URLSearchParams({
    view: "userView",
    perPage: String(params.perPage || 500),
    page: String(params.page || 1),
    order: "bankBookingDate,desc",
  });

  if (params.accountIds?.length) query.set("accountIds", params.accountIds.join(","));
  if (params.minDate) query.set("minBankBookingDate", params.minDate);
  if (params.maxDate) query.set("maxBankBookingDate", params.maxDate);
  if (params.direction && params.direction !== "all") query.set("direction", params.direction);

  return apiRequest(`/transactions?${query}`, userToken);
}

// ─── Konten ─────────────────────────────────────────────────
export async function getAccounts(userToken: string) {
  return apiRequest<{
    accounts: {
      id: number;
      accountName: string;
      iban: string;
      balance: number;
      bankConnectionId: number;
    }[];
  }>("/accounts", userToken);
}

// ─── Banken suchen ──────────────────────────────────────────
export async function searchBanks(userToken: string, query: string) {
  return apiRequest<{
    banks: { id: number; name: string; bic: string; blz: string }[];
  }>(`/banks?search=${encodeURIComponent(query)}&isSupported=true&perPage=10`, userToken);
}
