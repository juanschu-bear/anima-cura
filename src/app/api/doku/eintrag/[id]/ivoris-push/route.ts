import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { addIvorisKarteiEintrag } from "@/lib/api/ivoris-doku-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/doku/eintrag/[id]/ivoris-push
// Pusht einen bestaetigten Eintrag als Karteieintrag in die ivoris-Akte
// (POST /Documentation/v1/Entry, Treatment=Orthodontics, append-only).
// Idempotent: bereits gepushte Eintraege (gleiche Version) werden nicht erneut gesendet.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as string | undefined) ?? null;
  if (!role || !["admin", "verwaltung"].includes(role)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const { data: eintrag, error: loadError } = await supabase
    .from("doku_eintraege")
    .select("*, patients ( id, ivoris_id, vorname, nachname )")
    .eq("id", params.id)
    .single();

  if (loadError || !eintrag) return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });

  if (eintrag.status !== "bestaetigt") {
    return NextResponse.json({ error: "Nur bestaetigte Eintraege werden gepusht" }, { status: 409 });
  }

  if (eintrag.ivoris_push_status === "gepusht" && eintrag.ivoris_entry_id) {
    return NextResponse.json({
      status: "bereits_gepusht",
      ivoris_entry_id: eintrag.ivoris_entry_id,
    });
  }

  const patient = eintrag.patients as { ivoris_id: string | null } | null;
  if (!patient?.ivoris_id) {
    await supabase
      .from("doku_eintraege")
      .update({ ivoris_push_status: "fehler", ivoris_fehler: "Patient hat keine ivoris_id" })
      .eq("id", eintrag.id);
    return NextResponse.json({ error: "Patient hat keine ivoris_id" }, { status: 422 });
  }

  // Korrektur-Kennzeichnung: ab Version 2 entsteht in ivoris ein zusaetzlicher Eintrag
  const zaehne = (eintrag.zaehne as string[]) ?? [];
  const prefix = (eintrag.version as number) > 1 ? `KORREKTUR (v${eintrag.version}): ` : "";
  const text = `${prefix}${eintrag.text}`;

  try {
    const result = await addIvorisKarteiEintrag({
      patientIvorisId: patient.ivoris_id,
      date: eintrag.termin_datum as string,
      text,
      tooth: zaehne.length === 1 ? zaehne[0] : undefined,
    });

    const { error: updError } = await supabase
      .from("doku_eintraege")
      .update({
        ivoris_push_status: "gepusht",
        ivoris_entry_id: result.entryId,
        ivoris_gepusht_am: new Date().toISOString(),
        ivoris_fehler: null,
      })
      .eq("id", eintrag.id);

    if (updError) {
      return NextResponse.json(
        { status: "gepusht", ivoris_entry_id: result.entryId, warnung: updError.message },
        { status: 207 }
      );
    }

    return NextResponse.json({ status: "gepusht", ivoris_entry_id: result.entryId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler";
    await supabase
      .from("doku_eintraege")
      .update({ ivoris_push_status: "fehler", ivoris_fehler: message })
      .eq("id", eintrag.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
