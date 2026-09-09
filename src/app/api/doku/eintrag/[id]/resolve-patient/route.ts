import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = createServerComponentClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { data: profile } = await auth
    .from("user_profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as string | undefined) ?? null;
  const permissions = (profile?.permissions ?? {}) as { scribe_schreiben?: boolean };
  if (!(permissions.scribe_schreiben ?? (!!role && ["admin", "verwaltung"].includes(role)))) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { patientId?: unknown } | null;
  const patientId = typeof body?.patientId === "string" ? body.patientId.trim() : "";
  if (!UUID_RE.test(patientId)) {
    return NextResponse.json({ error: "Ungültige Patienten-ID" }, { status: 400 });
  }

  const db = createServerClient();
  const [{ data: entry, error: entryError }, { data: patient, error: patientError }] = await Promise.all([
    db.from("doku_eintraege").select("id,status,ivoris_push_status,ivoris_error_class").eq("id", params.id).maybeSingle(),
    db.from("patients").select("id,ivoris_id").eq("id", patientId).maybeSingle(),
  ]);
  if (entryError || !entry) return NextResponse.json({ error: "Scribe-Eintrag nicht gefunden" }, { status: 404 });
  if (patientError || !patient) return NextResponse.json({ error: "Patient nicht gefunden" }, { status: 404 });
  if (entry.status !== "bestaetigt" || entry.ivoris_push_status === "gepusht") {
    return NextResponse.json({ error: "Nur ein bestätigter, noch nicht übertragener Eintrag kann neu zugeordnet werden" }, { status: 409 });
  }
  if (entry.ivoris_error_class !== "patient_manual_review") {
    return NextResponse.json({ error: "Dieser Eintrag benötigt keine manuelle Patientenzuordnung" }, { status: 409 });
  }
  if (!patient.ivoris_id || !UUID_RE.test(patient.ivoris_id)) {
    return NextResponse.json({ error: "Die gewählte Patientenakte besitzt keine gültige IVORIS-ID" }, { status: 422 });
  }

  const { data: updatedEntry, error: updateError } = await db
    .from("doku_eintraege")
    .update({
      patient_id: patient.id,
      ivoris_push_status: "ausstehend",
      ivoris_fehler: null,
      ivoris_retry_count: 0,
      ivoris_next_retry_at: null,
      ivoris_error_class: null,
    })
    .eq("id", entry.id)
    .eq("ivoris_push_status", entry.ivoris_push_status)
    .select("id")
    .maybeSingle();
  if (updateError) {
    return NextResponse.json({ error: `Patientenzuordnung konnte nicht gespeichert werden: ${updateError.message}` }, { status: 500 });
  }
  if (!updatedEntry) {
    return NextResponse.json({ error: "Der Eintrag wurde parallel geändert; bitte Ansicht aktualisieren" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, patientId: patient.id });
}
