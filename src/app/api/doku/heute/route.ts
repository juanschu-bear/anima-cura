import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/doku/heute?datum=YYYY-MM-DD
// Tagesliste: alle Doku-Eintraege des Tages inkl. Patient, plus Zaehler fuer die Doku-Wache.
// Hinweis: "Termin vorbei ohne Eintrag" braucht eine Terminquelle (Doctolib) und kommt als Stufe 2.
// Stufe 1 der Wache: Entwuerfe des Tages = unbestaetigt = Alarmkandidaten.
export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const datumParam = request.nextUrl.searchParams.get("datum");
  const datum = datumParam && /^\d{4}-\d{2}-\d{2}$/.test(datumParam)
    ? datumParam
    : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("doku_eintraege")
    .select(
      "id, termin_datum, behandlungsart, termin_typ, status, version, text, zaehne, positionen, ivoris_push_status, ivoris_entry_id, bestaetigt_am, patient_id, patients ( id, vorname, nachname )"
    )
    .eq("termin_datum", datum)
    .neq("status", "verworfen")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eintraege = data ?? [];
  const offen = eintraege.filter((e) => e.status === "entwurf").length;
  const pushFehler = eintraege.filter((e) => e.ivoris_push_status === "fehler").length;

  return NextResponse.json({
    datum,
    eintraege,
    wache: {
      gesamt: eintraege.length,
      bestaetigt: eintraege.length - offen,
      offen,
      push_fehler: pushFehler,
    },
  });
}
