import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { retryPendingScribeIvorisPushes } from "@/lib/services/scribe-ivoris-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NachsyncBody = { datum?: string | null; limit?: number };

export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as string | undefined) ?? null;
  const permissions = (profile?.permissions ?? {}) as { scribe_schreiben?: boolean };
  const scribeErlaubt = permissions.scribe_schreiben ?? (!!role && ["admin", "verwaltung"].includes(role));
  if (!scribeErlaubt) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as NachsyncBody;
  const datum =
    body.datum && /^\d{4}-\d{2}-\d{2}$/.test(body.datum)
      ? body.datum
      : new Date().toISOString().slice(0, 10);
  const limit = Math.max(1, Math.min(20, Number(body.limit) || 10));

  try {
    const result = await retryPendingScribeIvorisPushes({ db: supabase as never, datum, limit });
    return NextResponse.json({ status: "OK", ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
