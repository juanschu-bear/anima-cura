import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id")?.trim();
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  const sc = createServerClient();

  if (id) {
    const { data: patient } = await sc
      .from("patients")
      .select("id, vorname, nachname, geschlecht, geburtsdatum, behandlung, kasse, telefon, mobiltelefon, email, strasse, plz, ort")
      .eq("id", id)
      .maybeSingle();

    return NextResponse.json({
      results: patient
        ? [{
            id: patient.id,
            vorname: patient.vorname ?? "",
            nachname: patient.nachname ?? "",
            name: `${patient.vorname ?? ""} ${patient.nachname ?? ""}`.trim(),
            geschlecht: patient.geschlecht ?? null,
            geburtsdatum: patient.geburtsdatum ?? null,
            behandlung: patient.behandlung ?? null,
            kasse: patient.kasse ?? null,
            telefon: patient.telefon ?? "",
            mobiltelefon: patient.mobiltelefon ?? "",
            email: patient.email ?? "",
            strasse: patient.strasse ?? null,
            plz: patient.plz ?? null,
            ort: patient.ort ?? null,
          }]
        : [],
    });
  }

  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const teile = q.split(/\s+/).filter(Boolean);
  const muster = Array.from(new Set(teile.flatMap((teil) => [
    `vorname.ilike.%${teil}%`,
    `nachname.ilike.%${teil}%`,
    `email.ilike.%${teil}%`,
  ]))).join(",");

  const { data: patients } = await sc
    .from("patients")
    .select("id, vorname, nachname, geschlecht, geburtsdatum, behandlung, kasse, telefon, mobiltelefon, email, strasse, plz, ort")
    .or(muster)
    .limit(20);

  const treffer = (patients || []).filter((patient) => {
    const name = `${patient.vorname ?? ""} ${patient.nachname ?? ""}`.trim().toLowerCase();
    const email = (patient.email ?? "").toLowerCase();
    return teile.every((teil) => name.includes(teil) || email.includes(teil));
  });

  return NextResponse.json({
    results: treffer.slice(0, 8).map(p => ({
      id: p.id,
      vorname: p.vorname ?? "",
      nachname: p.nachname ?? "",
      name: `${p.vorname ?? ""} ${p.nachname ?? ""}`.trim(),
      geschlecht: p.geschlecht ?? null,
      behandlung: p.behandlung ?? null,
      kasse: p.kasse ?? null,
      email: p.email || "",
      telefon: p.telefon || "",
      mobiltelefon: p.mobiltelefon || "",
      geburtsdatum: p.geburtsdatum || null,
      strasse: p.strasse ?? null,
      plz: p.plz ?? null,
      ort: p.ort ?? null,
    })),
  });
}
