import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { normalizeScribeAppointmentTypeName } from "@/lib/scribe-appointment-type";
import { planPraxisPassOptionChanges } from "@/lib/scribe-praxis-pass-guard";
import {changeTemplate,historySlots,templateChangeReview} from '@/lib/scribe-template-history-service';
import {createHash,randomUUID} from 'node:crypto';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEERE_STRUKTUR = {
  template: [],
  groups: {},
  vars: [],
  kontext: "",
  anima_kopplung: "",
  abrechnung_titel: "Abrechnung",
  abrechnung_hinweis: "",
};

// Zugang: entweder eingeloggter App-User (Juan/Praxis) ODER gueltiger Link-Token.
// In beiden Faellen wird serverseitig der Service-Role-Client genutzt.
function tokenGueltig(token: string | null): boolean {
  const erlaubt = process.env.PRAXIS_PASS_TOKEN;
  return !!erlaubt && !!token && token === erlaubt;
}

async function zugang(request: NextRequest): Promise<{ ok: boolean; wer: string; id:string|null; link:boolean }> {
  const appUser = await getAuthenticatedAppUser();
  if (appUser) return { ok: true, wer: appUser.fullName || appUser.email, id:appUser.id, link:false };
  const headerToken = request.headers.get("x-praxis-pass-token");
  const urlToken = new URL(request.url).searchParams.get("token");
  if (tokenGueltig(headerToken) || tokenGueltig(urlToken)) {
    return { ok: true, wer: "Praxis (Link)", id:null, link:true };
  }
  return { ok: false, wer: "", id:null,link:false };
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

  // Reihenfolge einer Behandlungsart sichern (Termin-Arten verschoben).
  if (body.reihenfolge && Array.isArray(body.reihenfolge.ordnung)) {
    const art = String(body.reihenfolge.behandlungsart ?? "");
    const ordnung: { termin_typ: string; eigener_name?: string | null }[] = body.reihenfolge.ordnung;
    for (let i = 0; i < ordnung.length; i++) {
      const tt = String(ordnung[i].termin_typ ?? "");
      if (!art || !tt) continue;
      const { data: vorhanden } = await supabase
        .from("praxis_pass")
        .select("id")
        .eq("behandlungsart", art)
        .eq("termin_typ", tt)
        .maybeSingle();
      if (vorhanden) {
        await supabase.from("praxis_pass").update({ position: i }).eq("behandlungsart", art).eq("termin_typ", tt);
      } else {
        await supabase.from("praxis_pass").insert({
          behandlungsart: art,
          termin_typ: tt,
          eigener_name: ordnung[i].eigener_name ?? null,
          position: i,
          status: "offen",
        });
      }
    }
    return NextResponse.json({ ok: true, reihenfolge: true });
  }

  // Eigene Termin-Art umbenennen.
  if (body.umbenennen && body.umbenennen.termin_typ) {
    const { behandlungsart, termin_typ, name, basis_termin_typ, sort_index, sofort_aktivieren } = body.umbenennen;
    const eigenerName = normalizeScribeAppointmentTypeName(name);
    const sortIndexZahl = Number.isFinite(Number(sort_index)) ? Number(sort_index) : null;
    if (behandlungsart && termin_typ) {
      if (String(termin_typ).startsWith("eigen-") && !eigenerName) {
        return NextResponse.json({ error: "Bitte einen Namen mit höchstens 120 Zeichen eingeben." }, { status: 400 });
      }
      const { data: vorhanden } = await supabase
        .from("praxis_pass")
        .select("id")
        .eq("behandlungsart", behandlungsart)
        .eq("termin_typ", termin_typ)
        .maybeSingle();
      if (vorhanden) {
        const updatePass: Record<string, unknown> = { eigener_name: eigenerName ?? name ?? null };
        if (sortIndexZahl != null) updatePass.position = sortIndexZahl;
        const { error: passFehler } = await supabase
          .from("praxis_pass")
          .update(updatePass)
          .eq("behandlungsart", behandlungsart)
          .eq("termin_typ", termin_typ);
        if (passFehler) return NextResponse.json({ error: passFehler.message }, { status: 500 });
      } else {
        const { error: passFehler } = await supabase.from("praxis_pass").insert({
          behandlungsart,
          termin_typ,
          eigener_name: eigenerName ?? name ?? null,
          status: "offen",
          ...(sortIndexZahl != null ? { position: sortIndexZahl } : {}),
        });
        if (passFehler) return NextResponse.json({ error: passFehler.message }, { status: 500 });
      }

      if (sofort_aktivieren === true) {
        const { data: vorhandeneVorlage, error: vorhandeneVorlageErr } = await supabase
          .from("doku_vorlagen")
          .select("id")
          .eq("behandlungsart", behandlungsart)
          .eq("termin_typ", termin_typ)
          .maybeSingle();
        if (vorhandeneVorlageErr) {
          return NextResponse.json({ error: vorhandeneVorlageErr.message }, { status: 500 });
        }

        if (vorhandeneVorlage) {
          const updateVorlage: Record<string, unknown> = { aktiv: true };
          if (name != null) updateVorlage.name = eigenerName ?? name;
          if (sortIndexZahl != null) updateVorlage.sort_index = sortIndexZahl;
          const { error: updateVorlageErr } = await supabase
            .from("doku_vorlagen")
            .update(updateVorlage)
            .eq("behandlungsart", behandlungsart)
            .eq("termin_typ", termin_typ);
          if (updateVorlageErr) {
            return NextResponse.json({ error: updateVorlageErr.message }, { status: 500 });
          }
        } else {
          if (!basis_termin_typ) {
            return NextResponse.json({ error: "basis_termin_typ fehlt für die direkte Übernahme." }, { status: 400 });
          }
          const { data: basisVorlage, error: basisVorlageErr } = await supabase
            .from("doku_vorlagen")
            .select("struktur, positionen")
            .eq("behandlungsart", behandlungsart)
            .eq("termin_typ", basis_termin_typ)
            .maybeSingle();
          if (basisVorlageErr) {
            return NextResponse.json({ error: basisVorlageErr.message }, { status: 500 });
          }
          if (!basisVorlage) {
            return NextResponse.json({ error: "Basisvorlage für die neue Terminart wurde nicht gefunden." }, { status: 400 });
          }

          const struktur = JSON.parse(JSON.stringify(basisVorlage.struktur ?? LEERE_STRUKTUR));
          const positionen = JSON.parse(JSON.stringify(basisVorlage.positionen ?? []));
          const { error: insertVorlageErr } = await supabase.from("doku_vorlagen").insert({
            behandlungsart,
            termin_typ,
            name: eigenerName ?? termin_typ,
            sort_index: sortIndexZahl ?? 900,
            aktiv: true,
            struktur,
            positionen,
          });
          if (insertVorlageErr) {
            return NextResponse.json({ error: insertVorlageErr.message }, { status: 500 });
          }
        }
      }
    }
    return NextResponse.json({ ok: true, umbenannt: true });
  }

  // Eigene Termin-Art loeschen (praxis_pass und, falls schon uebernommen, die Cockpit-Vorlage).
  if (body.loeschen && body.loeschen.termin_typ) {
    const art = String(body.loeschen.behandlungsart ?? "");
    const tt = String(body.loeschen.termin_typ ?? "");
    if (art && tt) {
      if (!tt.startsWith("eigen-")) {
        return NextResponse.json({ error: "Nur selbst angelegte Terminarten können gelöscht werden." }, { status: 400 });
      }
      // Bereits verwendete Einträge behalten ihren Vorlagenbezug. Deshalb wird die
      // Terminart ausgeblendet statt ihre Vorlage aus der Dokumentation zu entfernen.
      const { error: vorlageFehler } = await supabase
        .from("doku_vorlagen")
        .update({ aktiv: false })
        .eq("behandlungsart", art)
        .eq("termin_typ", tt);
      if (vorlageFehler) return NextResponse.json({ error: vorlageFehler.message }, { status: 500 });

      const { error: passFehler } = await supabase
        .from("praxis_pass")
        .delete()
        .eq("behandlungsart", art)
        .eq("termin_typ", tt);
      if (passFehler) return NextResponse.json({ error: passFehler.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, geloescht: true });
  }

  if (body.absenden === true) {
    // Praxispass-Inhalte in die produktiven Cockpit-Vorlagen (doku_vorlagen) uebernehmen.
    const { data: paesse, error: ladeErr } = await supabase.from("praxis_pass").select("*");
    if (ladeErr) return NextResponse.json({ error: ladeErr.message }, { status: 500 });

    const {data: bestehendeVorlagen,error:vorlagenErr}=await supabase.from("doku_vorlagen")
      .select("id,behandlungsart,termin_typ,struktur");
    if(vorlagenErr)return NextResponse.json({error:vorlagenErr.message},{status:500});
    const slots=await historySlots((bestehendeVorlagen??[]).map(row=>row.id));
    if(slots===null)return NextResponse.json({code:'scribe_workspace_unavailable',error:'Die Bausteine konnten gerade nicht abgeglichen werden.',suggestion:{kind:'retry'}},{status:503});
    const optionChanges=planPraxisPassOptionChanges(paesse??[],bestehendeVorlagen??[],slots);
    const reviews=await Promise.all(optionChanges.map(async change=>({change,review:await templateChangeReview(change)})));
    const protectedReviews=reviews.filter(item=>item.review.requiresConfirmation);
    const impossible=reviews.filter(item=>item.review.impossible).map(item=>({change:item.change,...item.review.impossible}));
    const confirmationFingerprint=createHash('sha256').update(JSON.stringify(protectedReviews.map(item=>({change:item.change,impacts:item.review.impacts})))).digest('hex');
    const supplied=(body.confirmation??{}) as {fingerprint?:string;confirmedBy?:string};
    const protectedConfirmed=protectedReviews.length===0||supplied.fingerprint===confirmationFingerprint;
    const confirmedBy=z.id?z.wer:String(supplied.confirmedBy??'').trim();
    const canApplyProtected=protectedConfirmed&&(!z.link||!!confirmedBy);

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
        // Bestehende Vorlage: nur Metadaten übernehmen. Feste Optionsfelder sind
        // indexgebunden und werden ausschließlich über die Zeitmaschine geändert.
        const struktur = { ...((vorlage.struktur ?? {}) as Record<string, unknown>) };
        if (p.verlaufstext && String(p.verlaufstext).trim()) struktur.praxis_muster = p.verlaufstext;
        if (abrechnung) struktur.praxis_abrechnung = abrechnung;
        struktur.quelle = "praxis";
        const { error: upErr } = await supabase
          .from("doku_vorlagen")
          .update(p.position != null ? { struktur, sort_index: p.position } : { struktur })
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
          sort_index: p.position ?? 900,
          aktiv: true,
          struktur,
          positionen: [],
        });
        if (insErr) return NextResponse.json({ error: `Neue Vorlage ${p.eigener_name}: ${insErr.message}` }, { status: 500 });
        neu++;
      }
    }

    const revisions=new Map<string,number>();
    const applied:Array<{change:unknown;changeIds:string[];confirmationRecorded:boolean}>=[];
    for(const item of reviews){
      if(item.review.impossible)continue;
      if(item.review.requiresConfirmation&&!canApplyProtected)continue;
      let revision=revisions.get(item.change.templateId);
      if(revision===undefined){
        const latest=await supabase.from('scribe_option_changes').select('seq').eq('template_id',item.change.templateId).order('seq',{ascending:false}).limit(1);
        if(latest.error)return NextResponse.json({code:'template_history_read_failed',error:'Das Änderungsbuch konnte nicht gelesen werden.',suggestion:{kind:'retry'}},{status:503});
        revision=Number(latest.data?.[0]?.seq??0);
      }
      const request={...item.change,requestId:randomUUID(),expectedRevision:revision,source:'praxis_pass',confirmedBy:confirmedBy||z.wer,
        ...(item.review.requiresConfirmation?{confirmProtected:true,confirmationFingerprint:item.review.fingerprint}:{})};
      const result=await changeTemplate(z.id,request) as {revision:number;changeIds:string[];confirmationRecorded?:boolean};
      revisions.set(item.change.templateId,result.revision);
      applied.push({change:item.change,changeIds:result.changeIds,confirmationRecorded:!!result.confirmationRecorded});
    }

    const { error } = await supabase.from("praxis_pass").update({ status: "abgesendet" }).neq("status", "abgesendet");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if(protectedReviews.length&&!canApplyProtected)return NextResponse.json({
      ok:true,abgesendet:true,status:'confirmation_required',code:'template_change_confirmation_required',uebernommen,neu,applied,
      confirmation:{required:true,fingerprint:confirmationFingerprint,confirmedByRequired:z.link,
        changes:protectedReviews.flatMap(item=>item.review.impacts)},impossible,
      suggestion:{kind:z.link?'enter_name_and_confirm_again':'confirm_again'},
    },{headers:{'Cache-Control':'private, no-store'}});
    return NextResponse.json({ok:true,abgesendet:true,status:impossible.length?'saved_with_suggestion':'completed',uebernommen,neu,applied,impossible,
      suggestion:impossible.length?{kind:'keep_or_rename_last_required_option'}:null});
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
