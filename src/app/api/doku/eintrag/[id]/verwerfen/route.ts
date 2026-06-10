import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/doku/eintrag/[id]/verwerfen
// Setzt einen Eintrag auf Status 'verworfen' (kein Loeschen, Historie bleibt).
// Nur erlaubt, solange der Eintrag NICHT in ivoris steht. Danach gilt: nur Korrektur-Versionen.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
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

  const { data: eintrag, error: ladeFehler } = await supabase
    .from("doku_eintraege")
    .select("id, status, ivoris_push_status")
    .eq("id", params.id)
    .single();

  if (ladeFehler || !eintrag) {
    return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });
  }
  if (eintrag.ivoris_push_status === "gepusht") {
    return NextResponse.json(
      { error: "Eintrag steht bereits in ivoris. Verwerfen nicht möglich, nur Korrektur-Versionen." },
      { status: 409 }
    );
  }
  if (eintrag.status === "verworfen") {
    return NextResponse.json({ ok: true, eintrag });
  }

  const { data: aktualisiert, error: updateFehler } = await supabase
    .from("doku_eintraege")
    .update({ status: "verworfen" })
    .eq("id", params.id)
    .select("id, status")
    .single();

  if (updateFehler) {
    return NextResponse.json({ error: updateFehler.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eintrag: aktualisiert });
}
