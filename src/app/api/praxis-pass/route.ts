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
    // Praxispass-Inhalte in die produktiven Cockpit-Vorlagen (doku_vorlagen) uebernehmen.
    const { data: paesse, error: ladeErr } = await supabase.from("praxis_pass").select("*");
    if (ladeErr) return NextResponse.json({ error: ladeErr.message }, { status: 500 });

    let uebernommen = 0;
    let neu = 0;
    for (const p of paesse ?? []) {
      const final = (p.optionen_final ?? {}) as Record<string, string[]>;
      const abrechnung = [p.kig_text, p.bema_text, p.goz_text, p.abrechnung_anm]
        .filter((t) => t && String(t).trim())
        .join(" · ");

      const { data: vorlage } = await supabase
        .from("doku_vorlagen")
        .select("struktur")
        .eq("behandlungsart", p.behandlungsart)
        .eq("termin_typ", p.termin_typ)
        .maybeSingle();

      if (vorlage) {
        // Bestehende Vorlage: bearbeitete Options-Gruppen ersetzen, Beispieltext + Abrechnung als Referenz mitfuehren.
        const struktur = { ...((vorlage.struktur ?? {}) as Record<string, unknown>) };
        const groups = { ...((struktur.groups ?? {}) as Record<string, Record<string, unknown>>) };
        for (const [gk, liste] of Object.entries(final)) {
          if (groups[gk] && Array.isArray(liste)) {
            groups[gk] = { ...groups[gk], opts: liste.map((t, i) => (i === 0 ? { t, on: true } : { t })) };
          }
        }
        struktur.groups = groups;
        if (p.verlaufstext && String(p.verlaufstext).trim()) struktur.praxis_muster = p.verlaufstext;
        if (abrechnung) struktur.praxis_abrechnung = abrechnung;
        struktur.quelle = "praxis";
        const { error: upErr } = await supabase
          .from("doku_vorlagen")
          .update({ struktur })
          .eq("behandlungsart", p.behandlungsart)
          .eq("termin_typ", p.termin_typ);
        if (upErr) return NextResponse.json({ error: `Vorlage ${p.behandlungsart}/${p.termin_typ}: ${upErr.message}` }, { status: 500 });
        uebernommen++;
      } else if (p.eigener_name && String(p.eigener_name).trim()) {
        // Neu angelegte eigene Termin-Art: als neue Vorlage erzeugen.
        const groups: Record<string, unknown> = {};
        const template: unknown[] = [];
        for (const [gk, liste] of Object.entries(final)) {
          groups[gk] = { label: gk.charAt(0).toUpperCase() + gk.slice(1), req: false, type: "multi", opts: (Array.isArray(liste) ? liste : []).map((t) => ({ t })) };
          template.push({ g: gk });
        }
        const struktur = {
          template,
          groups,
          vars: [],
          kontext: "",
          abrechnung_titel: "Abrechnung",
          abrechnung_hinweis: "",
          anima_kopplung: "",
          praxis_muster: p.verlaufstext ?? "",
          praxis_abrechnung: abrechnung,
          quelle: "praxis",
        };
        const { error: insErr } = await supabase.from("doku_vorlagen").insert({
          behandlungsart: p.behandlungsart,
          termin_typ: p.termin_typ,
          name: p.eigener_name,
          sort_index: 900,
          aktiv: true,
          struktur,
          positionen: [],
        });
        if (insErr) return NextResponse.json({ error: `Neue Vorlage ${p.eigener_name}: ${insErr.message}` }, { status: 500 });
        neu++;
      }
    }

    const { error } = await supabase.from("praxis_pass").update({ status: "abgesendet" }).neq("status", "abgesendet");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, abgesendet: true, uebernommen, neu });
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
