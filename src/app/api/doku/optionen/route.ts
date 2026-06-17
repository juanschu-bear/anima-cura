import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-practice scope. Single value per deploy for now; when true multi-tenant
// arrives, derive this from the logged-in user's profile instead of the env.
const PRAXIS_ID = process.env.SCRIBE_PRAXIS_ID || "praxis-schubert";

const ARTEN = new Set(["aligner", "removable", "multiband"]);
const MAX_LEN = 400;

type AddBody = {
  behandlungsart?: string;
  termin_typ?: string;
  gruppe?: string;
  text?: string;
};

// GET /api/doku/optionen  -> list active practice options for this practice (admin/overview)
export async function GET() {
  const auth = createServerComponentClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

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
export async function POST(request: NextRequest) {
  const auth = createServerComponentClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as AddBody | null;
  if (!body) return NextResponse.json({ error: "Ungueltiger Body" }, { status: 400 });

  const behandlungsart = String(body.behandlungsart ?? "").trim();
  const termin_typ = String(body.termin_typ ?? "").trim();
  const gruppe = String(body.gruppe ?? "").trim();
  const text = String(body.text ?? "").trim();

  if (!ARTEN.has(behandlungsart)) {
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

// PATCH /api/doku/optionen  -> hide a practice option (soft delete) by id
export async function PATCH(request: NextRequest) {
  const auth = createServerComponentClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string; aktiv?: boolean } | null;
  if (!body?.id || typeof body.aktiv !== "boolean") {
    return NextResponse.json({ error: "id und aktiv noetig" }, { status: 400 });
  }

  const db = createServerClient();
  const { error } = await db
    .from("doku_vorlagen_optionen")
    .update({ aktiv: body.aktiv })
    .eq("id", body.id)
    .eq("praxis_id", PRAXIS_ID);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
