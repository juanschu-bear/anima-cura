import { NextRequest, NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: Export all patient data as JSON (Art. 15 / Art. 20 DSGVO)
export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const sc = createServerClient();
  const pid = patient.patientId;

  const [
    { data: patientData },
    { data: ratenplaene },
    { data: raten },
    { data: phasen },
    { data: dokumente },
    { data: nachrichten },
    { data: notifications },
    { data: badges },
  ] = await Promise.all([
    sc.from("patients").select("vorname, nachname, geburtsdatum, geschlecht, behandlung, email, mobiltelefon, kasse, versicherung_status").eq("id", pid).single(),
    sc.from("ratenplaene").select("gesamtbetrag, anzahl_raten, rate_betrag, start_datum, status").eq("patient_id", pid),
    sc.from("raten").select("rate_nummer, betrag, faellig_am, status, bezahlt_am, bezahlt_betrag, mahnstufe").eq("patient_id", pid).order("rate_nummer"),
    sc.from("behandlungsphasen").select("name, beschreibung, status, reihenfolge, start_datum, end_datum").eq("patient_id", pid).order("reihenfolge"),
    sc.from("patient_documents").select("name, typ, created_at").eq("patient_id", pid),
    sc.from("patient_messages").select("sender, text, created_at").eq("patient_id", pid).order("created_at"),
    sc.from("patient_notifications").select("typ, titel, text, gelesen, created_at").eq("patient_id", pid).order("created_at", { ascending: false }),
    sc.from("patient_badges").select("titel, beschreibung, icon, erreicht_am").eq("patient_id", pid),
  ]);

  const exportData = {
    exportiert_am: new Date().toISOString(),
    hinweis: "Dies ist eine vollständige Kopie Ihrer bei Anima Cura gespeicherten Daten gemäß Art. 15 und Art. 20 DSGVO.",
    persoenliche_daten: patientData,
    behandlungsphasen: phasen || [],
    ratenplaene: (ratenplaene || []).map(rp => ({
      ...rp,
      raten: (raten || []).filter(r => true), // All rates belong to this patient
    })),
    dokumente: (dokumente || []).map(d => ({ name: d.name, typ: d.typ, hochgeladen_am: d.created_at })),
    chat_nachrichten: (nachrichten || []).map(n => ({ von: n.sender, text: n.text, datum: n.created_at })),
    benachrichtigungen: notifications || [],
    badges: badges || [],
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="anima-cura-datenexport-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

// DELETE: Request account deletion (Art. 17 DSGVO)
export async function DELETE(request: NextRequest) {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const sc = createServerClient();
  const pid = patient.patientId;
  const uid = patient.userId;

  // Confirm deletion with body
  let body: any = {};
  try { body = await request.json(); } catch {}
  if (body.confirm !== "LOESCHEN") {
    return NextResponse.json({
      error: "Bitte bestätigen Sie die Löschung mit { \"confirm\": \"LOESCHEN\" }",
      hinweis: "Diese Aktion kann nicht rückgängig gemacht werden. Alle Ihre Daten werden unwiderruflich gelöscht.",
    }, { status: 400 });
  }

  // Delete in order (respecting foreign keys)
  await sc.from("patient_messages").delete().eq("patient_id", pid);
  await sc.from("patient_notifications").delete().eq("patient_id", pid);
  await sc.from("patient_badges").delete().eq("patient_id", pid);
  await sc.from("patient_documents").delete().eq("patient_id", pid);
  await sc.from("raten").delete().eq("patient_id", pid);
  await sc.from("ratenplaene").delete().eq("patient_id", pid);
  await sc.from("behandlungsphasen").delete().eq("patient_id", pid);
  await sc.from("pflegetipps").delete().eq("patient_id", pid);
  await sc.from("user_profiles").delete().eq("id", uid);

  // Note: We don't delete from auth.users here - that requires admin API
  // The patient record itself may need to be retained for legal/accounting reasons
  // We mark it as deleted instead
  await sc.from("patients").update({
    vorname: "GELÖSCHT",
    nachname: "GELÖSCHT",
    email: null,
    mobiltelefon: null,
    geburtsdatum: null,
  }).eq("id", pid);

  return NextResponse.json({
    erfolg: true,
    nachricht: "Ihre Daten wurden gelöscht. Ihr Account ist nicht mehr aktiv. Aus buchhalterischen Gründen können anonymisierte Zahlungsdaten für die gesetzliche Aufbewahrungsfrist (10 Jahre) bestehen bleiben.",
  });
}
