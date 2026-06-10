import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { MODULE, STUFEN, type Stufe } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLLEN = ["admin", "verwaltung", "lesezugriff"];

// POST /api/team/[id] – Name, Rolle, Kürzel ändern
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single();
  if ((profile?.role as string | undefined) !== "admin") {
    return NextResponse.json({ error: "Nur für Admins" }, { status: 403 });
  }

  let body: { name?: string; rolle?: string; kuerzel?: string | null; scribe_schreiben?: boolean; module_stufen?: Record<string, string> };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name darf nicht leer sein." }, { status: 400 });
    update.display_name = name;
  }
  if (body.rolle !== undefined) {
    if (!ROLLEN.includes(body.rolle)) return NextResponse.json({ error: "Ungültige Rolle." }, { status: 400 });
    if (params.id === user.id && body.rolle !== "admin") {
      return NextResponse.json({ error: "Eigene Admin-Rolle kann nicht entzogen werden." }, { status: 409 });
    }
    update.role = body.rolle;
  }
  if (body.kuerzel !== undefined) {
    update.kuerzel = (body.kuerzel ?? "").trim().toLowerCase() || null;
  }
  const service = createServerClient();
  if (body.scribe_schreiben !== undefined || body.module_stufen !== undefined) {
    const { data: aktuell } = await service.from("user_profiles").select("permissions").eq("id", params.id).single();
    const bisher = (aktuell?.permissions as Record<string, unknown>) ?? {};
    const neuePermissions: Record<string, unknown> = { ...bisher };
    if (body.scribe_schreiben !== undefined) {
      neuePermissions.scribe_schreiben = body.scribe_schreiben === true;
    }
    if (body.module_stufen !== undefined) {
      const gueltigeModule = new Set(MODULE.map((m) => m.schluessel));
      const bisherModule = (bisher.module as Record<string, string>) ?? {};
      const validiert: Record<string, string> = { ...bisherModule };
      for (const [modul, stufe] of Object.entries(body.module_stufen)) {
        if (!gueltigeModule.has(modul)) {
          return NextResponse.json({ error: `Unbekanntes Modul: ${modul}` }, { status: 400 });
        }
        if (!STUFEN.includes(stufe as Stufe)) {
          return NextResponse.json({ error: `Ungültige Stufe für ${modul}: ${stufe}` }, { status: 400 });
        }
        validiert[modul] = stufe;
      }
      neuePermissions.module = validiert;
    }
    update.permissions = neuePermissions;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nichts zu ändern." }, { status: 400 });

  const { data, error } = await service
    .from("user_profiles")
    .update(update)
    .eq("id", params.id)
    .select("id, email, display_name, role, kuerzel")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mitglied: data });
}
