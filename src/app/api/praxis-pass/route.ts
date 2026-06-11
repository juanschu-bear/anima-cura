import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient, getAuthenticatedAppUser } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/praxis-pass
// Liefert alle bisher gespeicherten Antworten (eine Zeile je Vorlage).
export async function GET() {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { data, error } = await supabase
    .from("praxis_pass")
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ antworten: data ?? [] });
}

// POST /api/praxis-pass
// Speichert eine einzelne Vorlage-Antwort (Upsert) oder sendet alles ab.
// Body: { behandlungsart, termin_typ, verlaufstext?, optionen_text?, zusatzschritte?, kig_text?, bema_text?, goz_text?, abrechnung_anm?, absenden? }
export async function POST(request: NextRequest) {
  const appUser = await getAuthenticatedAppUser();
  if (!appUser) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const supabase = createServerComponentClient();
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Ungueltiger Body" }, { status: 400 });

  // Variante 1: alles absenden -> Status aller vorhandenen Zeilen auf 'abgesendet'
  if (body.absenden === true) {
    const { error } = await supabase
      .from("praxis_pass")
      .update({ status: "abgesendet" })
      .neq("status", "abgesendet");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, abgesendet: true });
  }

  // Variante 2: eine Vorlage speichern (Upsert auf behandlungsart+termin_typ)
  if (!body.behandlungsart || !body.termin_typ) {
    return NextResponse.json({ error: "behandlungsart und termin_typ noetig" }, { status: 400 });
  }

  const zeile = {
    behandlungsart: body.behandlungsart,
    termin_typ: body.termin_typ,
    verlaufstext: body.verlaufstext ?? null,
    optionen_text: body.optionen_text ?? null,
    zusatzschritte: body.zusatzschritte ?? {},
    kig_text: body.kig_text ?? null,
    bema_text: body.bema_text ?? null,
    goz_text: body.goz_text ?? null,
    abrechnung_anm: body.abrechnung_anm ?? null,
    status: "gespeichert",
    bearbeitet_von: appUser.fullName || appUser.email,
  };

  const { error } = await supabase
    .from("praxis_pass")
    .upsert(zeile, { onConflict: "behandlungsart,termin_typ" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
