import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getAccounts } from "@/lib/api/finapi-client";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const FINAPI_BASE = process.env.FINAPI_BASE_URL || "https://sandbox.finapi.io";
const WEBFORM_BASE = FINAPI_BASE.includes("sandbox")
  ? "https://webform-sandbox.finapi.io"
  : "https://webform-live.finapi.io";
const CLIENT_ID = process.env.FINAPI_CLIENT_ID!;
const CLIENT_SECRET = process.env.FINAPI_CLIENT_SECRET!;

type FinapiConnection = { id: number; bank?: { name?: string } };
type FinapiAccount = { bankConnectionId?: number; iban?: string };

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

// GET handler - prueft Bankverbindungen direkt bei finAPI und uebernimmt sie.
// Web-Form-Status dient nur noch als Diagnose, wenn keine Verbindung existiert.
export async function GET(request: Request) {
  const db = createServerClient();

  // User credentials
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

  // 1) Direkt bei finAPI fragen: existieren Bankverbindungen?
  const listRes = await fetch(`${FINAPI_BASE}/api/v2/bankConnections`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });

  if (!listRes.ok) {
    return NextResponse.json(
      { ok: false, error: `Bankverbindungs-Abfrage fehlgeschlagen: ${listRes.status}` },
      { status: 500 }
    );
  }

  const listData = await listRes.json();
  const connections: FinapiConnection[] = listData.connections || [];

  if (connections.length > 0) {
    // Konten einmal holen, um IBANs zuzuordnen
    let accounts: FinapiAccount[] = [];
    try {
      const accountsData = await getAccounts(userToken);
      accounts = accountsData.accounts || [];
    } catch {
      // Nicht kritisch, IBAN bleibt dann leer
    }

    const stored: { bankConnectionId: number; bankName: string; iban: string }[] = [];

    for (const conn of connections) {
      const bankConnectionId = conn.id;
      const bankName = conn.bank?.name || "Unbekannte Bank";
      const account = accounts.find((a) => a.bankConnectionId === bankConnectionId);
      const iban = account?.iban || "";

      const { error: insertError } = await db.from("bank_connections").insert({
        finapi_connection_id: bankConnectionId,
        bank_name: bankName,
        iban: iban,
        status: "connected",
        last_sync: null,
      });

      if (insertError) {
        // Existiert schon: Status und Stammdaten aktualisieren
        if (insertError.code === "23505") {
          await db
            .from("bank_connections")
            .update({ status: "connected", bank_name: bankName, iban: iban })
            .eq("finapi_connection_id", bankConnectionId);
        } else {
          return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
        }
      }

      stored.push({ bankConnectionId, bankName, iban });
    }

    // Ausstehendes Web Form aufraeumen
    await db.from("einstellungen").delete().eq("key", "finapi_webform_pending");

    // Alert anlegen
    const beschreibungTeile = stored.map((s) => `${s.bankName}${s.iban ? ` (${s.iban})` : ""}`);
    await db.from("alerts").insert({
      typ: "system",
      titel: "Bankverbindung erfolgreich hergestellt",
      beschreibung: `${beschreibungTeile.join(", ")} wurde erfolgreich verbunden. Transaktionen werden ab sofort automatisch importiert.`,
      schweregrad: "info",
      empfaenger: "alle",
    });

    const { searchParams } = new URL(request.url);
    if (searchParams.get("redirect") !== "false") {
      return NextResponse.redirect(
        new URL("/einstellungen?bank=connected", process.env.EXT_PUBLIC_APP_URL || "https://anima-cura.vercel.app")
      );
    }

    return NextResponse.json({
      ok: true,
      status: "CONNECTED",
      connections: stored,
      message: "Bankverbindung bei finAPI gefunden und uebernommen.",
    });
  }

  // 2) Keine Verbindung vorhanden: Web-Form-Status nur als Diagnose
  const { data: pending } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", "finapi_webform_pending")
    .single();

  const webFormId = pending?.value?.webFormId;
  if (!webFormId) {
    return NextResponse.json({
      ok: true,
      status: "NO_CONNECTION",
      message: "Keine Bankverbindung bei finAPI vorhanden und kein ausstehendes Web Form. Bitte neu verbinden.",
    });
  }

  const wfRes = await fetch(`${WEBFORM_BASE}/api/webForms/${webFormId}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });

  if (!wfRes.ok) {
    return NextResponse.json({
      ok: true,
      status: "NO_CONNECTION",
      message: `Keine Bankverbindung vorhanden. Web-Form-Status nicht abfragbar (${wfRes.status}). Bitte neu verbinden.`,
    });
  }

  const webForm = await wfRes.json();
  const diagnose =
    webForm.status === "NOT_YET_OPENED"
      ? "Web Form wurde noch nicht geoeffnet."
      : webForm.status === "IN_PROGRESS"
      ? "Autorisierung laeuft noch. In einer Minute erneut aufrufen."
      : webForm.status === "ABORTED"
      ? "Autorisierung wurde abgebrochen. Bitte neu verbinden."
      : webForm.status === "EXPIRED"
      ? "Web Form abgelaufen, es ist keine Bankverbindung entstanden. Bitte neu verbinden."
      : `Status: ${webForm.status}`;

  return NextResponse.json({
    ok: true,
    status: webForm.status,
    connected: false,
    message: `Keine Bankverbindung bei finAPI vorhanden. ${diagnose}`,
  });
}
