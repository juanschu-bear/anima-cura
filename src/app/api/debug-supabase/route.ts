import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET() {
  const results: Record<string, unknown> = {};

  try {
    const db = createServerClient();
    const { data, error, count } = await db
      .from("patients")
      .select("id, vorname, nachname", { count: "exact" })
      .limit(3);
    results.serverClient = {
      ok: !error, count,
      sample: data?.map((p) => `${p.vorname} ${p.nachname}`),
      error: error?.message || null,
      errorCode: error?.code || null,
    };
  } catch (e) {
    results.serverClient = { ok: false, exception: String(e) };
  }

  try {
    const anonDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data, error, count } = await anonDb
      .from("patients")
      .select("id, vorname, nachname", { count: "exact" })
      .limit(3);
    results.anonClient = {
      ok: !error, count,
      sample: data?.map((p) => `${p.vorname} ${p.nachname}`),
      error: error?.message || null,
      errorCode: error?.code || null,
    };
  } catch (e) {
    results.anonClient = { ok: false, exception: String(e) };
  }

  try {
    const anonDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data, error } = await anonDb
      .from("patients")
      .select("*, raten(id, status, betrag, faellig_am, mahnstufe)")
      .order("nachname", { ascending: true })
      .limit(3);
    results.anonWithJoin = {
      ok: !error,
      rowCount: data?.length || 0,
      sample: data?.map((p: any) => `${p.vorname} ${p.nachname} (raten: ${p.raten?.length || 0})`),
      error: error?.message || null,
      errorCode: error?.code || null,
    };
  } catch (e) {
    results.anonWithJoin = { ok: false, exception: String(e) };
  }

  results.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "(missing)";
  results.hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  results.hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return NextResponse.json(results, { status: 200 });
}
