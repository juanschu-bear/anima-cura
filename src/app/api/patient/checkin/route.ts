import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await req.json();
    const { patient_id, via = "qr_scan" } = body;

    if (!patient_id) {
      return NextResponse.json({ error: "patient_id fehlt" }, { status: 400 });
    }

    const { data: termin, error: terminError } = await supabase
      .from("tagesplan_termine")
      .select("*")
      .eq("patient_id", patient_id)
      .eq("datum", new Date().toISOString().split("T")[0])
      .eq("status", "erwartet")
      .order("uhrzeit", { ascending: true })
      .limit(1)
      .single();

    if (terminError || !termin) {
      return NextResponse.json(
        { error: "Kein Termin fur heute gefunden", found: false },
        { status: 404 }
      );
    }

    const { data: checkinResult, error: checkinError } = await supabase
      .rpc("patient_checkin", {
        p_termin_id: termin.id,
        p_via: via,
      });

    if (checkinError) {
      console.error("[checkin] RPC error:", checkinError);
      return NextResponse.json({ error: "Check-in fehlgeschlagen" }, { status: 500 });
    }

    const { data: offeneRaten } = await supabase
      .from("raten")
      .select("betrag, faellig_am, status")
      .eq("patient_id", patient_id)
      .eq("status", "offen");

    const offenerBetrag = (offeneRaten || []).reduce(
      (sum, r) => sum + Number(r.betrag), 0
    );

    const { data: submission } = await supabase
      .from("anamnese_submissions")
      .select("id, created_at")
      .eq("patient_id", patient_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      termin: {
        id: termin.id,
        uhrzeit: termin.uhrzeit,
        behandler: termin.behandler,
        behandlung_art: termin.behandlung_art,
      },
      aktionen: {
        chipkarte_faellig: termin.chipkarte_faellig,
        anamnesebogen_ausstehend: !submission,
        offener_betrag: offenerBetrag,
      },
    });
  } catch (err) {
    console.error("[checkin] Unexpected error:", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
