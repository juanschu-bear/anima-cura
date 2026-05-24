import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getAccounts } from "@/lib/api/finapi-client";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const FINAPI_BASE = process.env.FINAPI_BASE_URL || "https://sandbox.finapi.io";
const WEBFORM_BASE = FINAPI_BASE.includes("sandbox")
  ? "https://webform-sandbox.finapi.io"
  : "https://webform.finapi.io";
const CLIENT_ID = process.env.FINAPI_CLIENT_ID!;
const CLIENT_SECRET = process.env.FINAPI_CLIENT_SECRET!;

async function getUserToken(userId: string, password: string): Promise<string> {
  const res = await fetch(`${FINAPI_BASE}/api/v2/oauth/token`, {
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
  const data = await res.json();
  return data.access_token;
}

// GET handler - for finAPI callback redirect and manual polling
export async function GET(request: Request) {
  const db = createServerClient();

  // Get pending web form info
  const { data: pending } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", "finapi_webform_pending")
    .single();

  if (!pending?.value?.webFormId) {
    return NextResponse.json({ ok: false, error: "Kein ausstehender Web Form gefunden" }, { status: 404 });
  }

  // Get user credentials
  const { data: creds } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", "finapi_user")
    .single();

  if (!creds?.value) {
    return NextResponse.json({ ok: false, error: "Keine finAPI Credentials" }, { status: 500 });
  }

  const { userId, password } = creds.value as { userId: string; password: string };
  const userToken = await getUserToken(userId, password);

  // Check web form status
  const webFormId = pending.value.webFormId;
  const wfRes = await fetch(`${WEBFORM_BASE}/api/webForms/${webFormId}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });

  if (!wfRes.ok) {
    return NextResponse.json({ ok: false, error: `Web Form Status-Abfrage fehlgeschlagen: ${wfRes.status}` }, { status: 500 });
  }

  const webForm = await wfRes.json();

  if (webForm.status !== "COMPLETED") {
    return NextResponse.json({
      ok: true,
      status: webForm.status,
      message: webForm.status === "NOT_YET_OPENED"
        ? "Web Form wurde noch nicht geöffnet."
        : webForm.status === "IN_PROGRESS"
        ? "Autorisierung läuft noch..."
        : webForm.status === "ABORTED"
        ? "Autorisierung wurde abgebrochen."
        : `Status: ${webForm.status}`,
    });
  }

  // Web Form completed - get bank connection details
  const bankConnectionId = webForm.payload?.bankConnectionId;
  if (!bankConnectionId) {
    return NextResponse.json({ ok: false, error: "Keine bankConnectionId in der Web Form Response" }, { status: 500 });
  }

  // Get bank connection details from finAPI
  const connRes = await fetch(`${FINAPI_BASE}/api/v2/bankConnections/${bankConnectionId}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });

  let bankName = "Unbekannte Bank";
  let iban = "";

  if (connRes.ok) {
    const conn = await connRes.json();
    bankName = conn.bank?.name || "Unbekannte Bank";

    // Get accounts to find IBAN
    try {
      const accountsData = await getAccounts(userToken);
      const account = accountsData.accounts?.find((a: any) => a.bankConnectionId === bankConnectionId);
      if (account) {
        iban = account.iban || "";
      }
    } catch {
      // Non-critical
    }
  }

  // Save bank connection to Supabase
  const { error: insertError } = await db.from("bank_connections").insert({
    finapi_connection_id: bankConnectionId,
    bank_name: bankName,
    iban: iban,
    status: "connected",
    last_sync: null,
  });

  if (insertError) {
    // Maybe already exists
    if (insertError.code === "23505") {
      await db.from("bank_connections")
        .update({ status: "connected", bank_name: bankName, iban: iban })
        .eq("finapi_connection_id", bankConnectionId);
    } else {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }
  }

  // Clean up pending state
  await db.from("einstellungen").delete().eq("key", "finapi_webform_pending");

  // Create alert
  await db.from("alerts").insert({
    typ: "system",
    titel: "Bankverbindung erfolgreich hergestellt",
    beschreibung: `${bankName}${iban ? ` (${iban})` : ""} wurde erfolgreich verbunden. Transaktionen werden ab sofort automatisch importiert.`,
    schweregrad: "info",
    empfaenger: "alle",
  });

  // Redirect to Einstellungen page
  const { searchParams } = new URL(request.url);
  if (searchParams.get("redirect") !== "false") {
    return NextResponse.redirect(new URL("/einstellungen?bank=connected", process.env.EXT_PUBLIC_APP_URL || "https://anima-cura.vercel.app"));
  }

  return NextResponse.json({
    ok: true,
    status: "COMPLETED",
    bankConnectionId,
    bankName,
    iban,
    message: `${bankName} erfolgreich verbunden!`,
  });
}
