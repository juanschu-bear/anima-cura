import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { initialisiereBehandlungsfall } from "@/lib/services/behandlungsfall-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/behandlungsfall/[id]/initialisieren
// Erzeugt Phasen und feststehende Forderungen fuer einen Behandlungsfall.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as string | undefined) ?? null;
  if (!role || !["admin", "verwaltung"].includes(role)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  try {
    const result = await initialisiereBehandlungsfall(params.id);
    return NextResponse.json(result, { status: result.errors.length > 0 ? 207 : 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unbekannter Fehler" },
      { status: 500 },
    );
  }
}
