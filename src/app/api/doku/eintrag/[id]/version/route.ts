import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VersionBody = {
  text: string;
  zaehne?: string[];
  variablen?: Record<string, unknown>;
  auswahl?: Record<string, unknown>;
  positionen?: unknown[];
  ausnahme_freitext?: string | null;
  aenderungsgrund: string; // Pflicht ab Version 2 (§ 630f: Aenderungen nachvollziehbar)
};

// POST /api/doku/eintrag/[id]/version
// Neue Version eines bestaetigten Eintrags: Inhalt aktualisieren, Version hochzaehlen,
// Historienzeile anlegen. Der DB-Guard erzwingt den Versionssprung zusaetzlich.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, kuerzel, permissions")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as string | undefined) ?? null;
  const permissions = (profile?.permissions ?? {}) as { scribe_schreiben?: boolean };
  const scribeErlaubt = permissions.scribe_schreiben ?? (!!role && ["admin", "verwaltung"].includes(role));
  if (!scribeErlaubt) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  let body: VersionBody;
  try {
    body = (await request.json()) as VersionBody;
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: "text fehlt" }, { status: 400 });
  }
  if (!body.aenderungsgrund || !body.aenderungsgrund.trim()) {
    return NextResponse.json({ error: "aenderungsgrund ist Pflicht" }, { status: 400 });
  }

  const { data: alt, error: loadError } = await supabase
    .from("doku_eintraege")
    .select("*")
    .eq("id", params.id)
    .single();

  if (loadError || !alt) return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });

  const neueVersion = (alt.version as number) + 1;

  const update = {
    text: body.text.trim(),
    zaehne: body.zaehne ?? alt.zaehne,
    variablen: body.variablen ?? alt.variablen,
    auswahl: body.auswahl ?? alt.auswahl,
    positionen: body.positionen ?? alt.positionen,
    ausnahme_freitext: body.ausnahme_freitext?.trim() || alt.ausnahme_freitext,
    version: neueVersion,
    status: "bestaetigt",
    bestaetigt_von: user.id,
    bestaetigt_kuerzel: (profile?.kuerzel as string | null) ?? null,
    bestaetigt_am: new Date().toISOString(),
    // Inhalt hat sich geaendert: erneuter Push noetig (ivoris ist append-only,
    // dort entsteht ein zusaetzlicher Korrektur-Eintrag)
    ivoris_push_status: "ausstehend",
  };

  const { data: eintrag, error: updError } = await supabase
    .from("doku_eintraege")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();

  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 });

  const { error: vError } = await supabase.from("doku_eintrag_versionen").insert({
    eintrag_id: eintrag.id,
    version: neueVersion,
    text: eintrag.text,
    zaehne: eintrag.zaehne,
    variablen: eintrag.variablen,
    auswahl: eintrag.auswahl,
    positionen: eintrag.positionen,
    ausnahme_freitext: eintrag.ausnahme_freitext,
    aenderungsgrund: body.aenderungsgrund.trim(),
    erstellt_von: user.id,
  });

  if (vError) {
    return NextResponse.json(
      { eintrag, warnung: `Version aktualisiert, Historienzeile fehlgeschlagen: ${vError.message}` },
      { status: 207 }
    );
  }

  return NextResponse.json({ eintrag });
}
