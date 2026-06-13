import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Schreibberechtigung: nur admin und verwaltung duerfen Zahlungen aendern (wie RLS WITH CHECK).
async function berechtigung() {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { fehler: NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 }) };
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single();
  if (!["admin", "verwaltung"].includes(profile?.role as string)) {
    return { fehler: NextResponse.json({ error: "Keine Schreibberechtigung fuer Zahlungen" }, { status: 403 }) };
  }
  return { fehler: null };
}

const STAMPEL = () => new Date().toISOString();

// Zaehlt bzw. selektiert die sicheren Vorschlaege: Status abweichung, Patient zugeordnet, Score >= minScore.
function vorschlagQuery(service: ReturnType<typeof createServerClient>, minScore: number) {
  return service
    .from("transaktionen")
    .select("id, matching_score")
    .eq("matching_status", "abweichung")
    .not("matched_patient_id", "is", null)
    .gte("matching_score", minScore);
}

export async function POST(request: NextRequest) {
  const { fehler } = await berechtigung();
  if (fehler) return fehler;

  const service = createServerClient();
  const body = await request.json().catch(() => null);
  if (!body?.aktion) return NextResponse.json({ error: "Ungueltiger Body" }, { status: 400 });

  // Einzelne Transaktion einem Patienten zuordnen.
  if (body.aktion === "zuordnen") {
    const { txId, patientId } = body;
    if (!txId || !patientId) return NextResponse.json({ error: "txId und patientId noetig" }, { status: 400 });
    const { error } = await service
      .from("transaktionen")
      .update({ matching_status: "manuell", matched_patient_id: patientId, matching_score: 100, geprueft_am: STAMPEL() })
      .eq("id", txId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Einen Vorschlag bestaetigen (abweichung -> auto).
  if (body.aktion === "bestaetigen") {
    const { txId } = body;
    if (!txId) return NextResponse.json({ error: "txId noetig" }, { status: 400 });
    const { data: tx, error: leseErr } = await service
      .from("transaktionen")
      .select("matching_score, matched_patient_id")
      .eq("id", txId)
      .single();
    if (leseErr) return NextResponse.json({ error: leseErr.message }, { status: 500 });
    if (!tx?.matched_patient_id) return NextResponse.json({ error: "Kein Patient zugeordnet" }, { status: 400 });
    const { error } = await service
      .from("transaktionen")
      .update({ matching_status: "auto", matching_score: Math.max(Number(tx.matching_score || 0), 90), geprueft_am: STAMPEL() })
      .eq("id", txId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Eine Transaktion ignorieren.
  if (body.aktion === "ignorieren") {
    const { txId } = body;
    if (!txId) return NextResponse.json({ error: "txId noetig" }, { status: 400 });
    const { error } = await service
      .from("transaktionen")
      .update({ matching_status: "ignoriert", geprueft_am: STAMPEL() })
      .eq("id", txId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Vorschau: wie viele sichere Vorschlaege wuerde der Stapel bei dieser Schwelle bestaetigen.
  if (body.aktion === "stapel_vorschau") {
    const minScore = Number(body.minScore ?? 80);
    const { count, error } = await service
      .from("transaktionen")
      .select("id", { count: "exact", head: true })
      .eq("matching_status", "abweichung")
      .not("matched_patient_id", "is", null)
      .gte("matching_score", minScore);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, anzahl: count ?? 0 });
  }

  // Stapel: alle sicheren Vorschlaege ab Schwelle bestaetigen (abweichung -> auto), in Bloecken.
  if (body.aktion === "stapel_bestaetigen") {
    const minScore = Number(body.minScore ?? 80);
    const { data: rows, error: selErr } = await vorschlagQuery(service, minScore);
    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) return NextResponse.json({ ok: true, anzahl: 0 });
    let erledigt = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const block = ids.slice(i, i + 500);
      const { error } = await service
        .from("transaktionen")
        .update({ matching_status: "auto", geprueft_am: STAMPEL() })
        .in("id", block);
      if (error) return NextResponse.json({ error: error.message, anzahl: erledigt }, { status: 500 });
      erledigt += block.length;
    }
    return NextResponse.json({ ok: true, anzahl: erledigt });
  }

  return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
