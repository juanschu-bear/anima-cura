// ============================================================
// BANK SYNC SERVICE – Automatischer Kontoauszug-Import
// ============================================================
// Läuft als Cron-Job (täglich 06:00) oder manuell auslösbar.
//
// Ablauf pro Bankverbindung:
// 1. Bank-Update bei finAPI triggern (holt neue Buchungen).
// 2. ALLE Transaktionen (Ein- und Ausgänge) paginiert laden.
// 3. Jede Buchung unveränderlich in bank_transactions_raw
//    archivieren (volle Rohdaten als JSONB, Vorzeichen erhalten).
// 4. Nur Eingänge fließen wie bisher in die Arbeitstabelle
//    transaktionen (Matching-Pipeline, Betrag positiv).
// 5. Jeder Lauf wird in bank_sync_runs protokolliert.
//
// Beim allerersten Sync (kein last_sync) wird KEIN minDate
// gesetzt, damit die komplette bei finAPI verfügbare Historie
// archiviert wird. Sicherheitsdeckel: MAX_PAGES x 500 Buchungen.
// Archiv und Protokoll sind best effort: Fehler dort werden
// gesammelt, blockieren aber nie den Kern-Import.
// ============================================================

import { createServerClient } from "../db/supabase";
import { getUserToken, getTransactions, updateBankConnection } from "../api/finapi-client";
import type { FinAPITransaction } from "../types";

const MAX_PAGES = 20; // 20 x 500 = max. 10.000 Buchungen pro Lauf
const ARCHIVE_CHUNK = 200;

interface BankConnectionRow {
  id: string;
  bank_name: string | null;
  finapi_connection_id: number | string | null;
  last_sync: string | null;
}

async function fetchAllTransactions(
  userToken: string,
  minDate?: string
): Promise<FinAPITransaction[]> {
  const all: FinAPITransaction[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await getTransactions(userToken, {
      direction: "all",
      ...(minDate ? { minDate } : {}),
      perPage: 500,
      page,
    });
    all.push(...result.transactions);
    const total = result.paging?.totalCount ?? all.length;
    if (result.transactions.length === 0 || all.length >= total) break;
  }
  return all;
}

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

  let archivedTotal = 0;

  // 3. Für jede Verbindung: Update triggern + Transaktionen holen
  for (const conn of connections as BankConnectionRow[]) {
    // Erster Sync: kein minDate, damit die volle Historie kommt
    const minDate = conn.last_sync
      ? new Date(conn.last_sync).toISOString().split("T")[0]
      : undefined;

    // Sync-Lauf protokollieren (best effort)
    let runId: string | null = null;
    {
      const { data: run } = await db
        .from("bank_sync_runs")
        .insert({
          bank_connection_id: conn.id,
          date_from: minDate ?? null,
          direction: "all",
          status: "running",
        })
        .select("id")
        .single();
      runId = run?.id ?? null;
    }

    let fetchedCount = 0;
    let archivedNew = 0;
    let importedNew = 0;

    try {
      // Bank-Update triggern (holt neue Buchungen)
      if (conn.finapi_connection_id) {
        await updateBankConnection(userToken, Number(conn.finapi_connection_id));
      }

      // ALLE Transaktionen abrufen (paginiert)
      const transactions = await fetchAllTransactions(userToken, minDate);
      fetchedCount = transactions.length;

      // 4. Roh-Archiv: jede Buchung unveränderlich sichern
      const fetchedAt = new Date().toISOString();
      for (let i = 0; i < transactions.length; i += ARCHIVE_CHUNK) {
        const chunk = transactions.slice(i, i + ARCHIVE_CHUNK).map((tx) => ({
          finapi_id: String(tx.id),
          sync_run_id: runId,
          bank_connection_id: conn.id,
          amount: tx.amount,
          booking_date: tx.bookingDate,
          value_date: tx.valueDate,
          purpose: tx.purpose,
          counterpart_name: tx.counterpartName,
          counterpart_iban: tx.counterpartIban,
          raw: tx,
          fetched_at: fetchedAt,
        }));

        const { data: inserted, error: archiveError } = await db
          .from("bank_transactions_raw")
          .upsert(chunk, { onConflict: "finapi_id", ignoreDuplicates: true })
          .select("id");

        if (archiveError) {
          errors.push(`Archiv: ${archiveError.message}`);
        } else {
          archivedNew += inserted?.length ?? 0;
        }
      }
      archivedTotal += archivedNew;

      // 5. Eingänge in die Arbeitstabelle (Matching-Pipeline), wie bisher
      for (const tx of transactions) {
        if (!(Number(tx.amount) > 0)) continue; // Nur Eingänge

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
          importedNew++;
        }
      }

      // 6. Sync-Datum aktualisieren
      await db
        .from("bank_connections")
        .update({ last_sync: new Date().toISOString() })
        .eq("id", conn.id);

      // 7. Lauf abschließen
      if (runId) {
        await db
          .from("bank_sync_runs")
          .update({
            finished_at: new Date().toISOString(),
            fetched_count: fetchedCount,
            archived_new_count: archivedNew,
            imported_new_count: importedNew,
            status: "ok",
          })
          .eq("id", runId);
      }
    } catch (err) {
      errors.push(`Verbindung ${conn.bank_name}: ${err}`);
      if (runId) {
        await db
          .from("bank_sync_runs")
          .update({
            finished_at: new Date().toISOString(),
            fetched_count: fetchedCount,
            archived_new_count: archivedNew,
            imported_new_count: importedNew,
            status: "error",
            error: String(err),
          })
          .eq("id", runId);
      }
    }
  }

  // 8. System-Alert erstellen
  if (newCount > 0 || archivedTotal > 0) {
    await db.from("alerts").insert({
      typ: "system",
      titel: `Bank-Sync: ${newCount} neue Eingänge, ${archivedTotal} neu archiviert`,
      beschreibung: `${newCount} neue Eingänge in die Matching-Pipeline, ${archivedTotal} Buchungen neu im Roh-Archiv (${connections.length} Bankverbindung(en)).${errors.length ? ` ${errors.length} Fehler.` : ""}`,
      schweregrad: errors.length ? "warnung" : "info",
      empfaenger: "sabine",
    });
  }

  return { newTransactions: newCount, errors };
}
