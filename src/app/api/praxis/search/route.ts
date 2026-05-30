import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const sc = createServerClient();
  const { data: patients } = await sc
    .from("patients")
    .select("id, vorname, nachname, email, telefon")
    .or(`vorname.ilike.%${q}%,nachname.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(8);

  return NextResponse.json({
    results: (patients || []).map(p => ({
      id: p.id,
      name: `${p.vorname} ${p.nachname}`,
      email: p.email || "",
      telefon: p.telefon || "",
    })),
  });
}
