import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { MISSING_STAFF_INITIALS_MESSAGE, normalizeStaffInitials } from "@/lib/scribe-identity";
import { roomInputError } from '@/lib/scribe-rooms';
import { checkScribeConsistency, scribeConsistencyFailure } from '@/lib/scribe-consistency-service';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VersionBody = {
  zimmer_version_id?: string | null;
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
  const mitarbeiterKuerzel = normalizeStaffInitials(profile?.kuerzel);
  if (!mitarbeiterKuerzel) {
    return NextResponse.json({ error: MISSING_STAFF_INITIALS_MESSAGE }, { status: 409 });
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
  const roomError = roomInputError(body.zimmer_version_id, false);
  if (roomError) return NextResponse.json({ error: roomError }, { status: 422 });

  const update = {
    ...(body.zimmer_version_id !== undefined ? { zimmer_version_id: body.zimmer_version_id || null } : {}),
    text: body.text.trim(),
    zaehne: body.zaehne ?? alt.zaehne,
    variablen: body.variablen ?? alt.variablen,
    auswahl: body.auswahl ?? alt.auswahl,
    positionen: body.positionen ?? alt.positionen,
    ausnahme_freitext: body.ausnahme_freitext?.trim() || alt.ausnahme_freitext,
    version: neueVersion,
    status: "bestaetigt",
    bestaetigt_von: user.id,
    bestaetigt_kuerzel: mitarbeiterKuerzel,
    bestaetigt_am: new Date().toISOString(),
    // Inhalt hat sich geaendert: erneuter Push noetig (ivoris ist append-only,
    // dort entsteht ein zusaetzlicher Korrektur-Eintrag)
    ivoris_push_status: "ausstehend",
  };

  // Validate the exact merged payload which will become this version, including
  // retained positions/selection when a correction changed only the text.
  const check = await checkScribeConsistency(supabase, { ...alt, ...update });
  if (!check.canConfirm) return scribeConsistencyFailure(check, request.url);

  const { data: eintrag, error: updError } = await supabase
    .from("doku_eintraege")
    .update(update)
    .eq("id", params.id)
    .eq("version", alt.version)
    .select("*")
    .single();

  if (updError) return NextResponse.json({ error: updError.message }, { status: updError.code === 'PGRST116' ? 409 : 500 });

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
