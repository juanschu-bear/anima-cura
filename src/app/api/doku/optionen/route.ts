import {workspaceActor,requireWriter,workspaceError,ScribeWorkspaceError,storageError} from "@/lib/scribe-workspace-auth";
import {changeTemplate,SCRIBE_PRACTICE} from "@/lib/scribe-template-history-service";
import {randomUUID} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-practice scope. Single value per deploy for now; when true multi-tenant
// arrives, derive this from the logged-in user's profile instead of the env.
const PRAXIS_ID = process.env.SCRIBE_PRAXIS_ID || "praxis-schubert";

const MAX_LEN = 400;

type AddBody = {
  behandlungsart?: string;
  termin_typ?: string;
  gruppe?: string;
  text?: string;
};

// GET /api/doku/optionen  -> list active practice options for this practice (admin/overview)
async function getOptions() {
  const actor=await workspaceActor();requireWriter(actor);
  const user={id:actor.id!};

  const db = createServerClient();
  const { data, error } = await db
    .from("doku_vorlagen_optionen")
    .select("id, behandlungsart, termin_typ, gruppe, text, aktiv, sort_index, created_at")
    .eq("praxis_id", PRAXIS_ID)
    .order("behandlungsart")
    .order("termin_typ")
    .order("sort_index", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ optionen: data ?? [] });
}

// POST /api/doku/optionen  -> add one practice option text to an existing group
async function postOption(request: NextRequest) {
  const actor=await workspaceActor();requireWriter(actor);
  const user={id:actor.id!};

  const body = (await request.json().catch(() => null)) as AddBody | null;
  if (!body) return NextResponse.json({ error: "Ungueltiger Body" }, { status: 400 });

  const behandlungsart = String(body.behandlungsart ?? "").trim();
  const termin_typ = String(body.termin_typ ?? "").trim();
  const gruppe = String(body.gruppe ?? "").trim();
  const text = String(body.text ?? "").trim();

  if (!behandlungsart) {
    return NextResponse.json({ error: "behandlungsart ungueltig" }, { status: 400 });
  }
  if (!termin_typ || !gruppe) {
    return NextResponse.json({ error: "termin_typ und gruppe noetig" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Text darf nicht leer sein" }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: `Text zu lang (max. ${MAX_LEN} Zeichen)` }, { status: 400 });
  }

  const db = createServerClient();

  // Textbausteine dürfen nur an eine tatsächlich aktive Vorlage und eine dort
  // vorhandene Gruppe gehängt werden. Sonst würde der Eintrag gespeichert,
  // im Cockpit aber nie erscheinen.
  const { data: vorlage, error: vorlageError } = await db
    .from("doku_vorlagen")
    .select("struktur")
    .eq("behandlungsart", behandlungsart)
    .eq("termin_typ", termin_typ)
    .eq("aktiv", true)
    .maybeSingle();
  if (vorlageError) return NextResponse.json({ error: vorlageError.message }, { status: 500 });
  if (!vorlage) {
    return NextResponse.json({ error: "Die gewählte Terminart ist nicht mehr aktiv" }, { status: 404 });
  }
  const groups = (vorlage.struktur as { groups?: Record<string, unknown> } | null)?.groups;
  if (!groups || !Object.prototype.hasOwnProperty.call(groups, gruppe)) {
    return NextResponse.json({ error: "Diese Textgruppe gehört nicht zur gewählten Terminart" }, { status: 400 });
  }

  // Append after existing practice options of the same group.
  const { data: vorhanden } = await db
    .from("doku_vorlagen_optionen")
    .select("sort_index")
    .eq("praxis_id", PRAXIS_ID)
    .eq("behandlungsart", behandlungsart)
    .eq("termin_typ", termin_typ)
    .eq("gruppe", gruppe)
    .order("sort_index", { ascending: false })
    .limit(1);

  const nextSort = (vorhanden?.[0]?.sort_index ?? -1) + 1;

  const { data, error } = await db
    .from("doku_vorlagen_optionen")
    .insert({
      praxis_id: PRAXIS_ID,
      behandlungsart,
      termin_typ,
      gruppe,
      text,
      quelle: "scribe",
      sort_index: nextSort,
      erstellt_von: user.id,
    })
    .select("id, behandlungsart, termin_typ, gruppe, text")
    .single();

  if (error) {
    // 23505 = unique violation (duplicate text in this group)
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Dieser Text existiert in dieser Gruppe bereits" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, option: data });
}

// Compatibility adapter: all future hiding/restoring now creates immutable history.
async function patchOption(request:NextRequest){
 const actor=await workspaceActor();requireWriter(actor);
 const body=await request.json().catch(()=>null);
 if(!body?.id||typeof body.aktiv!=="boolean")throw new ScribeWorkspaceError("input_invalid");
 const db=createServerClient();
 const slot=await db.from("scribe_option_slots").select("template_id,option_key").eq("practice_option_id",body.id).eq("praxis_id",SCRIBE_PRACTICE).maybeSingle();
 if(slot.error)storageError(slot.error);if(!slot.data)throw new ScribeWorkspaceError("option_not_found",404);
 const latest=await db.from("scribe_option_changes").select("seq").eq("template_id",slot.data.template_id).eq("praxis_id",SCRIBE_PRACTICE).order("seq",{ascending:false}).limit(1);
 if(latest.error)storageError(latest.error);
 return NextResponse.json(await changeTemplate(actor.id!,{templateId:slot.data.template_id,optionKey:slot.data.option_key,requestId:body.requestId??randomUUID(),expectedRevision:body.expectedRevision??latest.data?.[0]?.seq??0,action:body.aktiv?"restore_practice":"hide"}));
}
export async function GET(){try{return await getOptions();}catch(e){return workspaceError(e);}}
export async function POST(r:NextRequest){try{return await postOption(r);}catch(e){return workspaceError(e);}}
export async function PATCH(r:NextRequest){try{return await patchOption(r);}catch(e){return workspaceError(e);}}
