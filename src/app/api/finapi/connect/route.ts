import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getClientToken } from "@/lib/api/finapi-client";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";
export const maxDuration = 30;

const FINAPI_BASE = process.env.FINAPI_BASE_URL || "https://sandbox.finapi.io";
const WEBFORM_BASE = FINAPI_BASE.includes("sandbox")
  ? "https://webform-sandbox.finapi.io"
  : "https://webform-live.finapi.io";
const CLIENT_ID = process.env.FINAPI_CLIENT_ID!;
const CLIENT_SECRET = process.env.FINAPI_CLIENT_SECRET!;
const APP_URL = process.env.EXT_PUBLIC_APP_URL || "https://anima-cura.vercel.app";

// finAPI User for the practice (aus Env, niemals hartcodiert)
const FINAPI_USER_ID = process.env.FINAPI_USER_ID!;
const FINAPI_USER_PASSWORD = process.env.FINAPI_USER_PASSWORD!;
const FINAPI_USER_EMAIL = process.env.FINAPI_USER_EMAIL || "praxis@anima-cura.app";

async function ensureFinapiUser(clientToken: string): Promise<string> {
  // Try to get user token first (user might already exist)
  try {
    const tokenRes = await fetch(`${FINAPI_BASE}/api/v2/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        username: FINAPI_USER_ID,
        password: FINAPI_USER_PASSWORD,
      }),
    });

    if (tokenRes.ok) {
      const data = await tokenRes.json();
      return data.access_token;
    }
  } catch {
    // User doesn't exist yet, create below
  }

  // Create user
  const createRes = await fetch(`${FINAPI_BASE}/api/v2/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${clientToken}`,
    },
    body: JSON.stringify({
      id: FINAPI_USER_ID,
      password: FINAPI_USER_PASSWORD,
      email: FINAPI_USER_EMAIL,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    // If user already exists (409), try to login again
    if (createRes.status === 409 || createRes.status === 422) {
      const retryRes = await fetch(`${FINAPI_BASE}/api/v2/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          username: FINAPI_USER_ID,
          password: FINAPI_USER_PASSWORD,
        }),
      });
      if (retryRes.ok) {
        const data = await retryRes.json();
        return data.access_token;
      }
    }
    throw new Error(`finAPI User erstellen fehlgeschlagen: ${createRes.status} ${err}`);
  }

  // Now get user token
  const tokenRes = await fetch(`${FINAPI_BASE}/api/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: FINAPI_USER_ID,
      password: FINAPI_USER_PASSWORD,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`finAPI User-Token fehlgeschlagen: ${tokenRes.status}`);
  }

  const data = await tokenRes.json();
  return data.access_token;
}

export async function POST() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  try {
    // Step 1: Get client token
    const clientToken = await getClientToken();

    // Step 2: Ensure finAPI user exists and get user token
    const userToken = await ensureFinapiUser(clientToken);

    // Step 3: Create Web Form for bank connection import
    const webFormRes = await fetch(`${WEBFORM_BASE}/api/webForms/bankConnectionImport`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        accountTypes: ["CHECKING"],
        callbacks: {
          finalised: `${APP_URL}/api/finapi/callback`,
        },
      }),
    });

    if (!webFormRes.ok) {
      const err = await webFormRes.text();
      throw new Error(`Web Form erstellen fehlgeschlagen: ${webFormRes.status} ${err}`);
    }

    const webForm = await webFormRes.json();

    // Store the web form ID and user token for later callback processing
    const db = createServerClient();
    await db.from("einstellungen").upsert({
      key: "finapi_user",
      value: { userId: FINAPI_USER_ID, password: FINAPI_USER_PASSWORD },
    });
    await db.from("einstellungen").upsert({
      key: "finapi_webform_pending",
      value: { webFormId: webForm.id, createdAt: new Date().toISOString() },
    });

    return NextResponse.json({
      ok: true,
      webFormUrl: webForm.url,
      webFormId: webForm.id,
      expiresAt: webForm.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}
