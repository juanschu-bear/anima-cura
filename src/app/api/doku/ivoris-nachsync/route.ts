import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { addIvorisKarteiEintrag } from "@/lib/api/ivoris-doku-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NachsyncBody = {
  datum?: string | null;
  limit?: number;
};

function istTransienterPushFehler(fehler: string | null | undefined): boolean {
  const text = (fehler ?? "").trim();
  return (
    text.includes("(502)") ||
    text.includes("(503)") ||
    text.includes("(504)") ||
    text.includes("nicht stabil erreichbar")
  );
}

export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as string | undefined) ?? null;
  const permissions = (profile?.permissions ?? {}) as { scribe_schreiben?: boolean };
  const scribeErlaubt = permissions.scribe_schreiben ?? (!!role && ["admin", "verwaltung"].includes(role));
  if (!scribeErlaubt) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as NachsyncBody;
  const datum =
    body.datum && /^\d{4}-\d{2}-\d{2}$/.test(body.datum)
      ? body.datum
      : new Date().toISOString().slice(0, 10);
  const limit = Math.max(1, Math.min(20, Number(body.limit) || 10));

  const { data, error } = await supabase
    .from("doku_eintraege")
    .select("id, termin_datum, version, text, zaehne, bestaetigt_kuerzel, ivoris_fehler, patients ( ivoris_id, vorname, nachname )")
    .eq("termin_datum", datum)
    .eq("status", "bestaetigt")
    .eq("ivoris_push_status", "fehler")
    .order("bestaetigt_am", { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const kandidaten = (data ?? []).filter((eintrag) => istTransienterPushFehler((eintrag as { ivoris_fehler?: string | null }).ivoris_fehler));

  let recovered = 0;
  let failed = 0;
  const results: Array<{ id: string; status: "gepusht" | "fehler" | "ignoriert"; patient: string }> = [];

  for (const eintrag of kandidaten) {
    const patient = (Array.isArray(eintrag.patients) ? eintrag.patients[0] : eintrag.patients) as
      | { ivoris_id: string | null; vorname?: string; nachname?: string }
      | null;
    const patientName = patient ? `${patient.vorname ?? ""} ${patient.nachname ?? ""}`.trim() || "Unbekannt" : "Unbekannt";

    if (!patient?.ivoris_id) {
      failed += 1;
      results.push({ id: eintrag.id as string, status: "fehler", patient: patientName });
      continue;
    }

    const zaehne = ((eintrag.zaehne as string[] | null) ?? []).map(String);
    const prefix = (eintrag.version as number) > 1 ? `KORREKTUR (v${eintrag.version}): ` : "";
    const kuerzel = typeof eintrag.bestaetigt_kuerzel === "string" && eintrag.bestaetigt_kuerzel.trim()
      ? ` ${eintrag.bestaetigt_kuerzel.trim()}`
      : "";
    const text = `${prefix}${(eintrag.text as string) ?? ""}${kuerzel}`;

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

      if (updError) throw updError;
      recovered += 1;
      results.push({ id: eintrag.id as string, status: "gepusht", patient: patientName });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unbekannter Fehler";
      await supabase
        .from("doku_eintraege")
        .update({ ivoris_push_status: "fehler", ivoris_fehler: message })
        .eq("id", eintrag.id);
      failed += 1;
      results.push({ id: eintrag.id as string, status: "fehler", patient: patientName });
    }
  }

  return NextResponse.json({
    status: "OK",
    datum,
    processed: kandidaten.length,
    recovered,
    failed,
    results,
  });
}
