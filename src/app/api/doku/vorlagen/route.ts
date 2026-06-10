import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/doku/vorlagen
// Aktive Doku-Vorlagen, gruppierbar nach Behandlungsart. Lesend fuer alle Rollen.
export async function GET() {
  const supabase = createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { data, error } = await supabase
    .from("doku_vorlagen")
    .select("id, behandlungsart, termin_typ, name, sort_index, struktur, positionen")
    .eq("aktiv", true)
    .order("behandlungsart")
    .order("sort_index");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ vorlagen: data ?? [] });
}
