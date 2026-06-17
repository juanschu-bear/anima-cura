import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-practice scope. Single value per deploy for now (mirror of /api/doku/optionen).
const PRAXIS_ID = process.env.SCRIBE_PRAXIS_ID || "praxis-schubert";

// Aktive Doku-Vorlagen. Lesend fuer eingeloggte Nutzer ODER ueber den
// Praxis-Pass-Link-Token (damit das oeffentliche Onboarding die Vorlagen sieht).
function praxisPassTokenGueltig(token: string | null): boolean {
  const erlaubt = process.env.PRAXIS_PASS_TOKEN;
  return !!erlaubt && !!token && token === erlaubt;
}

type Opt = { t: string; on?: boolean };
type Gruppe = { label: string; req: boolean; type: "single" | "multi"; opts: Opt[] };
type Struktur = { template: unknown[]; groups: Record<string, Gruppe>; [k: string]: unknown };
type VorlageRow = {
  id: string;
  behandlungsart: string;
  termin_typ: string;
  name: string;
  sort_index: number;
  struktur: Struktur;
  positionen: unknown;
};
type OptRow = {
  behandlungsart: string;
  termin_typ: string;
  gruppe: string;
  text: string;
  sort_index: number;
};

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

  const vorlagen = (data ?? []) as VorlageRow[];

  // Practice-added option texts (Weg B). Appended AFTER the seed opts of the
  // matching group, so seed indices stay stable (positionen.if and stored
  // auswahl keep working). Only groups that already exist in the seed get extras.
  const { data: optData } = await supabase
    .from("doku_vorlagen_optionen")
    .select("behandlungsart, termin_typ, gruppe, text, sort_index")
    .eq("praxis_id", PRAXIS_ID)
    .eq("aktiv", true)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  const optionen = (optData ?? []) as OptRow[];

  if (optionen.length > 0) {
    for (const v of vorlagen) {
      const groups = v.struktur?.groups;
      if (!groups) continue;
      for (const o of optionen) {
        if (o.behandlungsart !== v.behandlungsart || o.termin_typ !== v.termin_typ) continue;
        const g = groups[o.gruppe];
        if (!g || !Array.isArray(g.opts)) continue; // group must exist in the seed
        g.opts.push({ t: o.text });
      }
    }
  }

  return NextResponse.json({ vorlagen });
}
