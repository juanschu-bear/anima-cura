import { NextResponse } from "next/server";
import { getUserToken } from "@/lib/api/finapi-client";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const maxDuration = 15;

const BASE_URL = process.env.FINAPI_BASE_URL || "https://sandbox.finapi.io";

export async function GET() {
  try {
    const db = createServerClient();
    let userId = process.env.FINAPI_USER_ID;
    let password = process.env.FINAPI_USER_PASSWORD;
    if (!userId || !password) {
      const { data: creds } = await db.from("einstellungen").select("value").eq("key", "finapi_user").single();
      if (creds?.value) {
        const v = creds.value as { userId: string; password: string };
        userId = v.userId;
        password = v.password;
      }
    }
    if (!userId || !password) {
      return NextResponse.json({ ok: false, error: "Keine finAPI-Credentials gefunden" }, { status: 500 });
    }
    const userToken = await getUserToken(userId, password);
    const accountsRes = await fetch(`${BASE_URL}/api/v2/accounts`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    let accounts: Record<string, unknown>[] = [];
    if (accountsRes.ok) {
      const accData = await accountsRes.json();
      accounts = accData.accounts || [];
    }
    const connectionsRes = await fetch(`${BASE_URL}/api/v2/bankConnections`, {
      headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    });
    let connections: unknown[] = [];
    if (connectionsRes.ok) {
      const connData = await connectionsRes.json();
      connections = connData.connections || connData.bankConnections || [];
    }
    const { data: storedConnections } = await db.from("bank_connections").select("id, bank_name, iban, finapi_connection_id, status, last_sync");
    const txCountsByAccount: Record<string, number> = {};
    for (const acc of accounts) {
      const accId = acc.id;
      try {
        const txRes = await fetch(
          `${BASE_URL}/api/v2/transactions?accountIds=${accId}&view=userView&perPage=1&page=1`,
          { headers: { Authorization: `Bearer ${userToken}` } },
        );
        if (txRes.ok) {
          const txData = await txRes.json();
          txCountsByAccount[String(accId)] = txData.paging?.totalCount ?? 0;
        }
      } catch {
        txCountsByAccount[String(accId)] = -1;
      }
    }
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      finapi: {
        accounts: accounts.map((a) => ({
          id: a.id,
          accountName: a.accountName,
          accountType: a.accountType,
          iban: a.iban,
          balance: a.balance,
          bankConnectionId: a.bankConnectionId,
          accountNumber: a.accountNumber,
          accountCurrency: a.accountCurrency,
          transactionCount: txCountsByAccount[String(a.id)] ?? "unbekannt",
        })),
        bankConnections: connections,
      },
      supabase: { storedConnections: storedConnections ?? [] },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
