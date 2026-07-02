import { NextResponse } from "next/server";
import { getUserToken, getAccounts, getTransactions } from "@/lib/api/finapi-client";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";
export const maxDuration = 15;

// Dr. Schuberts private Konten (nicht das Patientenkonto 941)
const PRIVATE_ACCOUNT_IDS = [31760546, 31760547, 31760549];

const BASE_URL = process.env.FINAPI_BASE_URL || "https://sandbox.finapi.io";

export async function GET(request: Request) {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  try {
    const db = createServerClient();
    let userId = process.env.FINAPI_USER_ID;
    let password = process.env.FINAPI_USER_PASSWORD;
    if (!userId || !password) {
      const { data: creds } = await db
        .from("einstellungen")
        .select("value")
        .eq("key", "finapi_user")
        .single();
      if (creds?.value) {
        const v = creds.value as { userId: string; password: string };
        userId = v.userId;
        password = v.password;
      }
    }
    if (!userId || !password) {
      return NextResponse.json({ ok: false, error: "Keine finAPI-Credentials" }, { status: 500 });
    }

    const userToken = await getUserToken(userId, password);

    // Konten abrufen
    const allAccounts = await getAccounts(userToken);
    const accounts = allAccounts.accounts.filter((a) =>
      PRIVATE_ACCOUNT_IDS.includes(a.id)
    );

    // Transaktionen der letzten 90 Tage fuer die privaten Konten
    const { searchParams } = new URL(request.url);
    const days = Math.min(Number(searchParams.get("days") || "90"), 365);
    const minDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const txResult = await getTransactions(userToken, {
      accountIds: PRIVATE_ACCOUNT_IDS,
      direction: "all",
      minDate,
      perPage: 500,
      page: 1,
    });

    return NextResponse.json({
      ok: true,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.accountName,
        iban: a.iban,
        balance: a.balance,
      })),
      transactions: txResult.transactions.map((tx) => ({
        id: tx.id,
        accountId: tx.accountId,
        amount: tx.amount,
        date: tx.bankBookingDate || tx.valueDate,
        counterpart: tx.counterpartName || tx.purpose?.slice(0, 40) || "Unbekannt",
        purpose: tx.purpose || "",
        category: tx.category?.name || null,
      })),
      totalCount: txResult.paging?.totalCount ?? txResult.transactions.length,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
