import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/team/[id]/passwort – Admin setzt neues Passwort für ein Teammitglied
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single();
  if ((profile?.role as string | undefined) !== "admin") {
    return NextResponse.json({ error: "Nur für Admins" }, { status: 403 });
  }

  let body: { passwort?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }
  const passwort = body.passwort ?? "";
  if (passwort.length < 8) return NextResponse.json({ error: "Passwort: mindestens 8 Zeichen." }, { status: 400 });

  const service = createServerClient();
  const { error } = await service.auth.admin.updateUserById(params.id, { password: passwort });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
