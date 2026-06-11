import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aktive Doku-Vorlagen. Lesend fuer eingeloggte Nutzer ODER ueber den
// Praxis-Pass-Link-Token (damit das oeffentliche Onboarding die Vorlagen sieht).
function praxisPassTokenGueltig(token: string | null): boolean {
  const erlaubt = process.env.PRAXIS_PASS_TOKEN;
  return !!erlaubt && !!token && token === erlaubt;
}

export async function GET(request: NextRequest) {
  const headerToken = request.headers.get("x-praxis-pass-token");
  const urlToken = new URL(request.url).searchParams.get("token");
  const perToken = praxisPassTokenGueltig(headerToken) || praxisPassTokenGueltig(urlToken);

  if (!perToken) {
    // kein gueltiger Token: normaler Login-Pfad
    const sb = createServerComponentClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  // Lesen ueber Service-Role-Client (funktioniert mit Login wie mit Token)
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("doku_vorlagen")
    .select("id, behandlungsart, termin_typ, name, sort_index, struktur, positionen")
    .eq("aktiv", true)
    .order("behandlungsart")
    .order("sort_index");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vorlagen: data ?? [] });
}
