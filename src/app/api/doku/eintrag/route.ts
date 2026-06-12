import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EintragBody = {
  patient_id: string;
  behandlungsfall_id?: string | null;
  vorlage_id?: string | null;
  behandlungsart?: string | null;
  termin_typ?: string | null;
  termin_datum?: string | null; // YYYY-MM-DD, Default heute
  text: string;
  zaehne?: string[];
  variablen?: Record<string, unknown>;
  auswahl?: Record<string, unknown>;
  positionen?: unknown[];
  ausnahme_freitext?: string | null;
  bestaetigen?: boolean; // true = direkt bestaetigen (Version 1), false = Entwurf
  entwurf_id?: string | null; // gesetzt = vorhandenen Entwurf aktualisieren/befoerdern
};

// POST /api/doku/eintrag
// Legt einen Doku-Eintrag an. Bei bestaetigen=true: status=bestaetigt, Version 1,
// parallele Zeile in doku_eintrag_versionen (revisionssichere Historie).
export async function POST(request: NextRequest) {
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

  let body: EintragBody;
  try {
    body = (await request.json()) as EintragBody;
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  if (!body.patient_id) return NextResponse.json({ error: "patient_id fehlt" }, { status: 400 });

  const bestaetigen = body.bestaetigen !== false; // Default: bestaetigen (Cockpit-Flow)
  // Ein Entwurf darf unvollstaendig sein. Erst beim Bestaetigen ist Text Pflicht.
  if (bestaetigen && (!body.text || !body.text.trim())) {
    return NextResponse.json({ error: "text fehlt" }, { status: 400 });
  }

  const terminDatum =
    body.termin_datum && /^\d{4}-\d{2}-\d{2}$/.test(body.termin_datum)
      ? body.termin_datum
      : new Date().toISOString().slice(0, 10);

  // Inhaltsfelder, fuer Insert und Update gleich
  const daten = {
    behandlungsfall_id: body.behandlungsfall_id ?? null,
    vorlage_id: body.vorlage_id ?? null,
    behandlungsart: body.behandlungsart ?? null,
    termin_typ: body.termin_typ ?? null,
    text: (body.text ?? "").trim(),
    zaehne: body.zaehne ?? [],
    variablen: body.variablen ?? {},
    auswahl: body.auswahl ?? {},
    positionen: body.positionen ?? [],
    ausnahme_freitext: body.ausnahme_freitext?.trim() || null,
  };

  // ===== Vorhandenen Entwurf weiterbearbeiten (aktualisieren oder befoerdern) =====
  if (body.entwurf_id) {
    const { data: vorhanden, error: ladeFehler } = await supabase
      .from("doku_eintraege")
      .select("id, status")
      .eq("id", body.entwurf_id)
      .single();
    if (ladeFehler || !vorhanden) {
      return NextResponse.json({ error: "Entwurf nicht gefunden" }, { status: 404 });
    }
    if (vorhanden.status !== "entwurf") {
      return NextResponse.json({ error: "Nur Entwuerfe koennen weiterbearbeitet werden" }, { status: 409 });
    }
    const update = {
      ...daten,
      status: bestaetigen ? "bestaetigt" : "entwurf",
      bestaetigt_von: bestaetigen ? user.id : null,
      bestaetigt_kuerzel: bestaetigen ? ((profile?.kuerzel as string | null) ?? null) : null,
      bestaetigt_am: bestaetigen ? new Date().toISOString() : null,
    };
    const { data: eintrag, error } = await supabase
      .from("doku_eintraege")
      .update(update)
      .eq("id", body.entwurf_id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (bestaetigen) {
      const { error: vError } = await supabase.from("doku_eintrag_versionen").insert({
        eintrag_id: eintrag.id,
        version: eintrag.version,
        text: eintrag.text,
        zaehne: eintrag.zaehne,
        variablen: eintrag.variablen,
        auswahl: eintrag.auswahl,
        positionen: eintrag.positionen,
        ausnahme_freitext: eintrag.ausnahme_freitext,
        aenderungsgrund: null,
        erstellt_von: user.id,
      });
      if (vError) {
        return NextResponse.json(
          { eintrag, warnung: `Eintrag bestaetigt, Versionszeile fehlgeschlagen: ${vError.message}` },
          { status: 207 }
        );
      }
    }
    return NextResponse.json({ eintrag }, { status: 200 });
  }

  const insert = {
    patient_id: body.patient_id,
    ...daten,
    termin_datum: terminDatum,
    status: bestaetigen ? "bestaetigt" : "entwurf",
    version: 1,
    bestaetigt_von: bestaetigen ? user.id : null,
    bestaetigt_kuerzel: bestaetigen ? ((profile?.kuerzel as string | null) ?? null) : null,
    bestaetigt_am: bestaetigen ? new Date().toISOString() : null,
    ivoris_push_status: "ausstehend",
  };

  const { data: eintrag, error } = await supabase
    .from("doku_eintraege")
    .insert(insert)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (bestaetigen) {
    const { error: vError } = await supabase.from("doku_eintrag_versionen").insert({
      eintrag_id: eintrag.id,
      version: 1,
      text: eintrag.text,
      zaehne: eintrag.zaehne,
      variablen: eintrag.variablen,
      auswahl: eintrag.auswahl,
      positionen: eintrag.positionen,
      ausnahme_freitext: eintrag.ausnahme_freitext,
      aenderungsgrund: null,
      erstellt_von: user.id,
    });
    if (vError) {
      return NextResponse.json(
        { eintrag, warnung: `Eintrag angelegt, Versionszeile fehlgeschlagen: ${vError.message}` },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ eintrag }, { status: 201 });
}
