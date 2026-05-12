// ============================================================
// BANK SYNC SERVICE – Automatischer Kontoauszug-Import
// ============================================================
// Läuft als Cron-Job (täglich 06:00) oder manuell auslösbar.
// Holt neue Transaktionen von finAPI und speichert sie in Supabase.
// ============================================================

import { createServerClient } from "../db/supabase";
import { getUserToken, getTransactions, updateBankConnection } from "../api/finapi-client";

export async function syncBankTransactions(): Promise<{
  newTransactions: number;
  errors: string[];
}> {
  const db = createServerClient();
  const errors: string[] = [];
  let newCount = 0;

  // 1. Aktive Bankverbindungen laden
  const { data: connections } = await db
    .from("bank_connections")
    .select("*")
    .eq("status", "connected");

  if (!connections?.length) {
    return { newTransactions: 0, errors: ["Keine aktiven Bankverbindungen"] };
  }

  // 2. finAPI User-Token holen
  // (User-Credentials kommen aus einer sicheren Quelle, z.B. Supabase Vault)
  const { data: creds } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", "finapi_user")
    .single();

  if (!creds?.value) {
    return { newTransactions: 0, errors: ["Keine finAPI User-Credentials konfiguriert"] };
  }

  const { userId, password } = creds.value as { userId: string; password: string };

  let userToken: string;
  try {
    userToken = await getUserToken(userId, password);
  } catch (err) {
    return { newTransactions: 0, errors: [`Auth fehlgeschlagen: ${err}`] };
  }

  // 3. Für jede Verbindung: Update triggern + Transaktionen holen
  for (const conn of connections) {
    try {
      // Bank-Update triggern (holt neue Buchungen)
      if (conn.finapi_connection_id) {
        await updateBankConnection(userToken, conn.finapi_connection_id);
      }

      // Letztes Sync-Datum ermitteln
      const minDate = conn.last_sync
        ? new Date(conn.last_sync).toISOString().split("T")[0]
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // 90 Tage zurück

      // Transaktionen abrufen
      const result = await getTransactions(userToken, {
        direction: "income",
        minDate,
        perPage: 500,
      });

      // 4. Neue Transaktionen speichern (Duplikate vermeiden über finapi_id)
      for (const tx of result.transactions) {
        // Prüfe ob schon vorhanden
        const { data: existing } = await db
          .from("transaktionen")
          .select("id")
          .eq("finapi_id", tx.id)
          .limit(1);

        if (existing?.length) continue; // Schon importiert

        const { error } = await db.from("transaktionen").insert({
          finapi_id: tx.id,
          bank_connection_id: conn.id,
          datum: tx.bookingDate,
          betrag: Math.abs(tx.amount), // Immer positiv speichern
          absender_name: tx.counterpartName || "Unbekannt",
          absender_iban: tx.counterpartIban,
          verwendungszweck: tx.purpose || "",
          kategorie: tx.category?.name || null,
          matching_status: "unklar", // Wird vom Matching-Engine verarbeitet
        });

        if (error) {
          errors.push(`Transaktion ${tx.id}: ${error.message}`);
        } else {
          newCount++;
        }
      }

      // 5. Sync-Datum aktualisieren
      await db
        .from("bank_connections")
        .update({ last_sync: new Date().toISOString() })
        .eq("id", conn.id);

    } catch (err) {
      errors.push(`Verbindung ${conn.bank_name}: ${err}`);
    }
  }

  // 6. System-Alert erstellen
  if (newCount > 0) {
    await db.from("alerts").insert({
      typ: "system",
      titel: `Bank-Sync: ${newCount} neue Buchungen importiert`,
      beschreibung: `${newCount} neue Transaktionen von ${connections.length} Bankverbindung(en) importiert.${errors.length ? ` ${errors.length} Fehler.` : ""}`,
      schweregrad: errors.length ? "warnung" : "info",
      empfaenger: "sabine",
    });
  }

  return { newTransactions: newCount, errors };
}
