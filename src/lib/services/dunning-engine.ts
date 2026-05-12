// ============================================================
// DUNNING ENGINE – Automatisches Mahnwesen
// ============================================================
// Läuft als Cron-Job (täglich 06:00 nach Bank-Sync + Matching).
// Prüft überfällige Raten und erstellt/versendet Mahnungen.
// ============================================================

import { createServerClient } from "../db/supabase";
import { sendEmail } from "./email-service";
import type { MahnEinstellungen } from "../types";

interface DunningResult {
  checked: number;
  reminders_sent: number;
  escalations: number;
  errors: string[];
}

export async function runDunningEngine(): Promise<DunningResult> {
  const db = createServerClient();
  const result: DunningResult = { checked: 0, reminders_sent: 0, escalations: 0, errors: [] };

  // 1. Einstellungen laden
  const { data: fristen } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", "mahnfristen")
    .single();

  const { data: benachrichtigungen } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", "benachrichtigungen")
    .single();

  const config = (fristen?.value || {
    karenz_tage: 5,
    stufe1_ab_tag: 6,
    stufe2_ab_tag: 21,
    eskalation_ab_tag: 42,
  }) as MahnEinstellungen;

  const notify = (benachrichtigungen?.value || {
    auto_email: true,
    sabine_briefing: true,
    maria_eskalation: true,
  }) as Record<string, boolean>;

  // 2. Überfällige Raten finden
  const today = new Date();
  const { data: offeneRaten } = await db
    .from("raten")
    .select(`
      *,
      patients!inner ( id, vorname, nachname, email, telefon ),
      ratenplaene!inner ( id, rate_betrag, anzahl_raten )
    `)
    .in("status", ["offen", "überfällig"])
    .lt("faellig_am", today.toISOString().split("T")[0])
    .order("faellig_am", { ascending: true });

  if (!offeneRaten?.length) return result;

  // 3. Für jede überfällige Rate: Mahnstufe bestimmen
  for (const rate of offeneRaten) {
    result.checked++;
    const faellig = new Date(rate.faellig_am);
    const tageUeberfaellig = Math.floor((today.getTime() - faellig.getTime()) / (1000 * 60 * 60 * 24));
    const patient = (rate as any).patients;

    // Noch in Karenzzeit?
    if (tageUeberfaellig <= config.karenz_tage) continue;

    // Rate als überfällig markieren
    if (rate.status === "offen") {
      await db.from("raten").update({ status: "überfällig" }).eq("id", rate.id);
    }

    // Aktuelle Mahnstufe bestimmen
    let neueStufe = 0;
    if (tageUeberfaellig >= config.eskalation_ab_tag) neueStufe = 3;
    else if (tageUeberfaellig >= config.stufe2_ab_tag) neueStufe = 2;
    else if (tageUeberfaellig >= config.stufe1_ab_tag) neueStufe = 1;

    // Schon auf dieser Stufe gemahnt?
    if (neueStufe <= rate.mahnstufe) continue;

    // 4. Mahnung erstellen und versenden
    const mahnText = generateMahnText(neueStufe, patient, rate);
    const mahnTyp = neueStufe === 1 ? "email" : neueStufe === 2 ? "brief" : "einschreiben";

    try {
      // Mahnung in DB speichern
      await db.from("mahnungen").insert({
        rate_id: rate.id,
        patient_id: patient.id,
        stufe: neueStufe,
        typ: mahnTyp,
        status: "geplant",
        geplant_am: today.toISOString().split("T")[0],
        text: mahnText,
      });

      // Mahnstufe in Rate aktualisieren
      await db.from("raten").update({ mahnstufe: neueStufe }).eq("id", rate.id);

      // E-Mail versenden (Stufe 1 + 2)
      if (notify.auto_email && patient.email && neueStufe <= 2) {
        await sendEmail({
          to: patient.email,
          subject: neueStufe === 1
            ? "Freundliche Zahlungserinnerung – Praxis Dr. Schubert"
            : "Zahlungserinnerung (1. Mahnung) – Praxis Dr. Schubert",
          html: mahnText,
        });

        await db.from("mahnungen").update({
          status: "versendet",
          versendet_am: new Date().toISOString(),
        }).eq("rate_id", rate.id).eq("stufe", neueStufe);

        result.reminders_sent++;
      }

      // Eskalation: Maria benachrichtigen
      if (neueStufe === 3 && notify.maria_eskalation) {
        await db.from("alerts").insert({
          typ: "mahnung",
          titel: `Eskalation: ${patient.nachname}, ${patient.vorname}`,
          beschreibung: `Rate ${rate.rate_nummer} seit ${tageUeberfaellig} Tagen überfällig (${rate.betrag}€). 2 Mahnungen ohne Reaktion. Entscheidung erforderlich: Inkasso, Ratenpause oder persönliches Gespräch.`,
          schweregrad: "kritisch",
          empfaenger: "maria",
          aktion_url: `/patienten/${patient.id}`,
        });
        result.escalations++;
      }

      // Sabine-Aufgabe bei Stufe 2
      if (neueStufe === 2) {
        await db.from("alerts").insert({
          typ: "mahnung",
          titel: `Bitte anrufen: ${patient.nachname}, ${patient.vorname}`,
          beschreibung: `1. Mahnung versendet, keine Reaktion. Bitte telefonisch nachfassen: ${patient.telefon || "keine Nummer hinterlegt"}.`,
          schweregrad: "warnung",
          empfaenger: "sabine",
          aktion_url: `/patienten/${patient.id}`,
        });
      }

    } catch (err) {
      result.errors.push(`Patient ${patient.nachname}: ${err}`);
    }
  }

  return result;
}

// ─── Mahntexte generieren ───────────────────────────────────
function generateMahnText(
  stufe: number,
  patient: { vorname: string; nachname: string },
  rate: { rate_nummer: number; betrag: number; faellig_am: string }
): string {
  const anrede = `Sehr geehrte/r ${patient.vorname} ${patient.nachname}`;
  const faellig = new Date(rate.faellig_am).toLocaleDateString("de-DE");

  if (stufe === 1) {
    return `${anrede},

wir möchten Sie freundlich daran erinnern, dass die Rate Nr. ${rate.rate_nummer} in Höhe von ${rate.betrag.toFixed(2)} € für Ihre kieferorthopädische Behandlung am ${faellig} fällig war.

Bitte überweisen Sie den Betrag auf unser Praxiskonto. Sollte sich Ihre Zahlung mit diesem Schreiben gekreuzt haben, betrachten Sie diese Erinnerung bitte als gegenstandslos.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Praxis Dr. Maria Schubert`;
  }

  if (stufe === 2) {
    return `${anrede},

trotz unserer Zahlungserinnerung ist die Rate Nr. ${rate.rate_nummer} in Höhe von ${rate.betrag.toFixed(2)} € (fällig am ${faellig}) bisher nicht auf unserem Konto eingegangen.

Wir bitten Sie, den ausstehenden Betrag innerhalb von 14 Tagen zu überweisen.

Sollten Sie Schwierigkeiten mit der Zahlung haben, kontaktieren Sie uns bitte – wir finden gemeinsam eine Lösung.

Mit freundlichen Grüßen
Praxis Dr. Maria Schubert`;
  }

  return `${anrede},

wir haben Sie bereits zweimal an die ausstehende Zahlung der Rate Nr. ${rate.rate_nummer} in Höhe von ${rate.betrag.toFixed(2)} € (fällig am ${faellig}) erinnert. Leider ist der Betrag bisher nicht eingegangen.

Wir bitten Sie dringend, den ausstehenden Betrag innerhalb von 7 Tagen zu überweisen.

Sollte auch nach Ablauf dieser Frist kein Zahlungseingang erfolgen, behalten wir uns weitere Schritte vor.

Mit freundlichen Grüßen
Praxis Dr. Maria Schubert`;
}
