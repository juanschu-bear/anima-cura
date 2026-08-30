import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { applyConfirmedTransactionBooking } from "@/lib/services/matching-engine";
import { isBlockedPatientName } from "@/lib/patient-blocklist";

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
    const { data: patient, error: patientError } = await service
      .from("patients")
      .select("vorname, nachname")
      .eq("id", patientId)
      .maybeSingle();
    if (patientError) return NextResponse.json({ error: patientError.message }, { status: 500 });
    if (!patient) return NextResponse.json({ error: "Patient nicht gefunden" }, { status: 404 });
    if (isBlockedPatientName(patient.vorname, patient.nachname)) {
      return NextResponse.json({ error: "Dieser Patient ist fuer Zahlungen gesperrt" }, { status: 400 });
    }
    const { data: tx, error } = await service
      .from("transaktionen")
      .update({ matching_status: "manuell", matched_patient_id: patientId, matching_score: 100, geprueft_am: STAMPEL() })
      .eq("id", txId)
      .select("id, betrag, datum, verwendungszweck, matched_patient_id, matched_rate_id, matching_details")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await applyConfirmedTransactionBooking(service, {
      id: tx.id,
      betrag: Number(tx.betrag) || 0,
      datum: tx.datum,
      verwendungszweck: tx.verwendungszweck || "",
      matched_patient_id: tx.matched_patient_id,
      matched_rate_id: tx.matched_rate_id,
      matching_details: tx.matching_details,
    });
    return NextResponse.json({ ok: true });
  }

  // Einen Vorschlag bestaetigen (abweichung -> auto).
  if (body.aktion === "bestaetigen") {
    const { txId } = body;
    if (!txId) return NextResponse.json({ error: "txId noetig" }, { status: 400 });
    const { data: tx, error: leseErr } = await service
      .from("transaktionen")
      .select("id, betrag, datum, verwendungszweck, matching_score, matched_patient_id, matched_rate_id, matching_details")
      .eq("id", txId)
      .single();
    if (leseErr) return NextResponse.json({ error: leseErr.message }, { status: 500 });
    if (!tx?.matched_patient_id) return NextResponse.json({ error: "Kein Patient zugeordnet" }, { status: 400 });
    const { data: patient, error: patientError } = await service
      .from("patients")
      .select("vorname, nachname")
      .eq("id", tx.matched_patient_id)
      .maybeSingle();
    if (patientError) return NextResponse.json({ error: patientError.message }, { status: 500 });
    if (patient && isBlockedPatientName(patient.vorname, patient.nachname)) {
      await service
        .from("transaktionen")
        .update({ matching_status: "unklar", matched_patient_id: null, matched_rate_id: null, matching_score: null, geprueft_am: null })
        .eq("id", txId);
      return NextResponse.json({ error: "Gesperrter Patient wurde aus dem Vorschlag entfernt" }, { status: 400 });
    }
    const { data: updated, error } = await service
      .from("transaktionen")
      .update({ matching_status: "auto", matching_score: Math.max(Number(tx.matching_score || 0), 90), geprueft_am: STAMPEL() })
      .eq("id", txId)
      .select("id, betrag, datum, verwendungszweck, matched_patient_id, matched_rate_id, matching_details")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await applyConfirmedTransactionBooking(service, {
      id: updated.id,
      betrag: Number(updated.betrag) || 0,
      datum: updated.datum,
      verwendungszweck: updated.verwendungszweck || "",
      matched_patient_id: updated.matched_patient_id,
      matched_rate_id: updated.matched_rate_id,
      matching_details: updated.matching_details,
    });
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

  if (body.aktion === "notiz_speichern") {
    const zieltyp = body.zieltyp === "kasse" ? "kasse" : "transaktion";
    const zielId = typeof body.zielId === "string" ? body.zielId : "";
    const notiz = typeof body.notiz === "string" ? body.notiz.trim() : "";
    if (!zielId) return NextResponse.json({ error: "zielId noetig" }, { status: 400 });
    if (notiz.length > 1000) {
      return NextResponse.json({ error: "Notiz darf hoechstens 1000 Zeichen lang sein" }, { status: 400 });
    }

    if (zieltyp === "kasse") {
      const { error } = await service
        .from("kassen_zahlungen")
        .update({ notiz: notiz || null })
        .eq("id", zielId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, notiz: notiz || null });
    }

    const { data: tx, error: txError } = await service
      .from("transaktionen")
      .select("matching_details")
      .eq("id", zielId)
      .single();
    if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });
    const details = tx?.matching_details && typeof tx.matching_details === "object"
      ? { ...tx.matching_details }
      : {};
    if (notiz) {
      (details as Record<string, unknown>).praxis_notiz = notiz;
    } else {
      delete (details as Record<string, unknown>).praxis_notiz;
    }

    const { error } = await service
      .from("transaktionen")
      .update({ matching_details: details, geprueft_am: STAMPEL() })
      .eq("id", zielId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, notiz: notiz || null });
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
    const { data: rows, error: selErr } = await service
      .from("transaktionen")
      .select("id, betrag, datum, verwendungszweck, matched_patient_id, matched_rate_id, matching_details, matching_score")
      .eq("matching_status", "abweichung")
      .not("matched_patient_id", "is", null)
      .gte("matching_score", minScore);
    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
    const patientIds = Array.from(new Set((rows ?? []).map((r: { matched_patient_id: string | null }) => r.matched_patient_id).filter(Boolean)));
    const { data: patients, error: patientsError } = await service
      .from("patients")
      .select("id, vorname, nachname")
      .in("id", patientIds.length ? patientIds : ["00000000-0000-0000-0000-000000000000"]);
    if (patientsError) return NextResponse.json({ error: patientsError.message }, { status: 500 });
    const blockedIds = new Set((patients || []).filter((patient) => isBlockedPatientName(patient.vorname, patient.nachname)).map((patient) => patient.id));
    const erlaubteRows = (rows ?? []).filter((row) => !row.matched_patient_id || !blockedIds.has(row.matched_patient_id));
    const ids = erlaubteRows.map((r: { id: string }) => r.id);
    if (ids.length === 0) return NextResponse.json({ ok: true, anzahl: 0 });
    let erledigt = 0;
    for (const row of erlaubteRows) {
      const { data: updated, error } = await service
        .from("transaktionen")
        .update({ matching_status: "auto", geprueft_am: STAMPEL() })
        .eq("id", row.id)
        .select("id, betrag, datum, verwendungszweck, matched_patient_id, matched_rate_id, matching_details")
        .single();
      if (error) return NextResponse.json({ error: error.message, anzahl: erledigt }, { status: 500 });
      await applyConfirmedTransactionBooking(service, {
        id: updated.id,
        betrag: Number(updated.betrag) || 0,
        datum: updated.datum,
        verwendungszweck: updated.verwendungszweck || "",
        matched_patient_id: updated.matched_patient_id,
        matched_rate_id: updated.matched_rate_id,
        matching_details: updated.matching_details,
      });
      erledigt += 1;
    }
    return NextResponse.json({ ok: true, anzahl: erledigt });
  }

  return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
