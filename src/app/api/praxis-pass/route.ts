import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zugang: entweder eingeloggter App-User (Juan/Praxis) ODER gueltiger Link-Token.
// In beiden Faellen wird serverseitig der Service-Role-Client genutzt.
function tokenGueltig(token: string | null): boolean {
  const erlaubt = process.env.PRAXIS_PASS_TOKEN;
  return !!erlaubt && !!token && token === erlaubt;
}

async function zugang(request: NextRequest): Promise<{ ok: boolean; wer: string }> {
  const headerToken = request.headers.get("x-praxis-pass-token");
  const urlToken = new URL(request.url).searchParams.get("token");
  if (tokenGueltig(headerToken) || tokenGueltig(urlToken)) {
    return { ok: true, wer: "Praxis (Link)" };
  }
  const appUser = await getAuthenticatedAppUser();
  if (appUser) return { ok: true, wer: appUser.fullName || appUser.email };
  return { ok: false, wer: "" };
}

export async function GET(request: NextRequest) {
  const z = await zugang(request);
  if (!z.ok) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const supabase = createServerClient();
  const { data, error } = await supabase.from("praxis_pass").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ antworten: data ?? [] });
}

export async function POST(request: NextRequest) {
  const z = await zugang(request);
  if (!z.ok) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const supabase = createServerClient();
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Ungueltiger Body" }, { status: 400 });

  if (body.absenden === true) {
    const { error } = await supabase.from("praxis_pass").update({ status: "abgesendet" }).neq("status", "abgesendet");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, abgesendet: true });
  }

  if (!body.behandlungsart || !body.termin_typ) {
    return NextResponse.json({ error: "behandlungsart und termin_typ noetig" }, { status: 400 });
  }

  const zeile = {
    behandlungsart: body.behandlungsart,
    termin_typ: body.termin_typ,
    eigener_name: body.eigener_name ?? null,
    verlaufstext: body.verlaufstext ?? null,
    optionen_text: body.optionen_text ?? null,
    optionen_final: body.optionen_final ?? {},
    zusatzschritte: body.zusatzschritte ?? {},
    kig_text: body.kig_text ?? null,
    bema_text: body.bema_text ?? null,
    goz_text: body.goz_text ?? null,
    abrechnung_anm: body.abrechnung_anm ?? null,
    status: "gespeichert",
    bearbeitet_von: z.wer,
  };

  const { error } = await supabase.from("praxis_pass").upsert(zeile, { onConflict: "behandlungsart,termin_typ" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
