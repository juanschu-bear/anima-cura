import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAIL_DOMAIN = process.env.PRAXIS_MAIL_DOMAIN ?? "praxis-schubert.de";
const ROLLEN = ["admin", "verwaltung", "lesezugriff"];

async function adminPruefen() {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { fehler: NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 }) };
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single();
  if ((profile?.role as string | undefined) !== "admin") {
    return { fehler: NextResponse.json({ error: "Nur für Admins" }, { status: 403 }) };
  }
  return { fehler: null };
}

// GET /api/team – alle Team-Konten (keine Patienten-Profile)
export async function GET() {
  const { fehler } = await adminPruefen();
  if (fehler) return fehler;
  const service = createServerClient();
  const { data, error } = await service
    .from("user_profiles")
    .select("id, email, display_name, role, kuerzel, permissions")
    .is("patient_id", null)
    .order("display_name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mitglieder: data ?? [], mail_domain: MAIL_DOMAIN });
}

// POST /api/team – neues Teammitglied anlegen
export async function POST(request: NextRequest) {
  const { fehler } = await adminPruefen();
  if (fehler) return fehler;

  let body: { lokal?: string; name?: string; rolle?: string; kuerzel?: string; passwort?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  const lokal = (body.lokal ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const rolle = body.rolle ?? "";
  const kuerzel = (body.kuerzel ?? "").trim().toLowerCase() || null;
  const passwort = body.passwort ?? "";

  if (!/^[a-z0-9._-]{2,40}$/.test(lokal)) {
    return NextResponse.json({ error: "E-Mail-Teil vor dem @: nur Buchstaben, Zahlen, Punkt, Minus, Unterstrich (2–40 Zeichen)." }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Name fehlt." }, { status: 400 });
  if (!ROLLEN.includes(rolle)) return NextResponse.json({ error: "Ungültige Rolle." }, { status: 400 });
  if (passwort.length < 8) return NextResponse.json({ error: "Passwort: mindestens 8 Zeichen." }, { status: 400 });

  const email = `${lokal}@${MAIL_DOMAIN}`;
  const service = createServerClient();

  const { data: angelegt, error: anlageFehler } = await service.auth.admin.createUser({
    email,
    password: passwort,
    email_confirm: true,
    user_metadata: { full_name: name, display_name: name },
  });
  if (anlageFehler) {
    const msg = /already/i.test(anlageFehler.message) ? `${email} existiert bereits.` : anlageFehler.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  const { error: profilFehler } = await service.from("user_profiles").upsert(
    { id: angelegt.user.id, email, display_name: name, role: rolle, kuerzel },
    { onConflict: "id" }
  );
  if (profilFehler) return NextResponse.json({ error: profilFehler.message }, { status: 500 });

  return NextResponse.json({ ok: true, mitglied: { id: angelegt.user.id, email, display_name: name, role: rolle, kuerzel } });
}
