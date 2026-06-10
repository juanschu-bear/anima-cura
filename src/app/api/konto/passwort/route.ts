import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/konto/passwort – eingeloggte Person ändert ihr eigenes Passwort
// (kein altes Passwort nötig, die aktive Sitzung ist der Nachweis; kein Postfach nötig)
export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  let body: { passwort?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }
  const passwort = body.passwort ?? "";
  if (passwort.length < 8) return NextResponse.json({ error: "Passwort: mindestens 8 Zeichen." }, { status: 400 });

  const { error } = await supabase.auth.updateUser({ password: passwort });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
