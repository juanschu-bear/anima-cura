// ============================================================
// BANK SYNC SERVICE – Automatischer Kontoauszug-Import
// ============================================================
// Läuft als Cron-Job (täglich) oder manuell per Button.
//
// Ablauf pro Bankverbindung:
// 1. Bank-Update bei finAPI anstossen und auf READY warten (Standard).
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
import {
  getUserToken,
  getTransactions,
  startBackgroundUpdateTask,
  waitForUpdateTask,
  waitForConnectionReady,
} from "../api/finapi-client";
import type { FinAPITransaction } from "../types";

const MAX_PAGES = 60; // 20 x 500 = max. 10.000 Buchungen pro Lauf
const ARCHIVE_CHUNK = 200;
// Abruf-Fenster ueberlappt rueckwirkend, damit nachtraeglich eingebuchte
// Umsaetze (Wertstellung, spaete Buchung) nie durchs Raster fallen.
// Duplikate faengt das Archiv per finapi_id-Upsert ab.
const OVERLAP_DAYS = 5;

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

export async function syncBankTransactions(options: { triggerUpdate?: boolean } = {}): Promise<{
  newTransactions: number;
  errors: string[];
}> {
  const { triggerUpdate = true } = options;
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

  // 3. Für jede Verbindung: Transaktionen holen
  for (const conn of connections as BankConnectionRow[]) {
    // Erster Sync: kein minDate, damit die volle Historie kommt.
    // Folge-Syncs: last_sync minus Ueberlappung (nachzuegliche Buchungen).
    const minDate = conn.last_sync
      ? new Date(new Date(conn.last_sync).getTime() - OVERLAP_DAYS * 86_400_000)
          .toISOString()
          .split("T")[0]
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
      // Bank-Update bei finAPI anstossen (Standard fuer Cron UND Button).
      // Unser Client ist Web-Form-2.0-Kunde: direkte /bankConnections/update-
      // Aufrufe sind gesperrt (422 ILLEGAL_ENTITY_STATE). Offizieller Weg:
      // Hintergrund-Task (POST /api/tasks/backgroundUpdate) starten und den
      // Task-Status pollen. Ausgaenge laut finAPI-Doku: COMPLETED,
      // COMPLETED_WITH_ERROR, WEB_FORM_REQUIRED (= einmal neu freigeben).
      // best effort: schlaegt das Update fehl, holen wir trotzdem den bei
      // finAPI gespeicherten Bestand.
      if (triggerUpdate && !conn.finapi_connection_id) {
        // Ohne gespeicherte finAPI-Verbindungs-ID kann kein Update angestossen
        // werden; dann liest der Sync nur den gecachten Bestand. Sichtbar machen!
        errors.push(
          `Bank-Update ${conn.bank_name}: uebersprungen, keine finapi_connection_id hinterlegt (Sync liest nur Cache).`
        );
      }
      if (triggerUpdate && conn.finapi_connection_id) {
        const connectionId = Number(conn.finapi_connection_id);
        try {
          const task = await startBackgroundUpdateTask(userToken, connectionId);
          const result = await waitForUpdateTask(userToken, task.id);
          if (result.status === "WEB_FORM_REQUIRED") {
            errors.push(
              `Bank-Update ${conn.bank_name}: Bank verlangt erneute Freigabe (PSD2). Bitte Bankverbindung in den Einstellungen erneuern.${result.webFormUrl ? ` Formular: ${result.webFormUrl}` : ""}`
            );
          } else if (result.status === "COMPLETED_WITH_ERROR") {
            errors.push(
              `Bank-Update ${conn.bank_name}: mit Fehlern abgeschlossen${result.errorCode ? ` (${result.errorCode})` : ""}, letzter Stand wird abgerufen.`
            );
          } else if (result.status === "TIMEOUT") {
            errors.push(
              `Bank-Update ${conn.bank_name}: nicht rechtzeitig fertig (Timeout), letzter gespeicherter Stand wird abgerufen.`
            );
          }
        } catch (updErr) {
          errors.push(`Bank-Update ${conn.bank_name}: ${updErr}`);
        }
        // Belt & braces: warten bis die Verbindung selbst READY meldet,
        // bevor Transaktionen abgerufen werden (Daten-Download asynchron).
        try {
          await waitForConnectionReady(userToken, connectionId, { timeoutMs: 60_000 });
        } catch {
          // Statusabfrage fehlgeschlagen: Abruf trotzdem versuchen.
        }
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
          booking_date: tx.bankBookingDate,
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

      // 5. Eingänge in die Arbeitstabelle (Matching-Pipeline), wie bisher.
      // Duplikat-Prüfung gebündelt in Chunks statt pro Buchung einzeln.
      const incoming = transactions.filter((tx) => Number(tx.amount) > 0);
      const existingIds = new Set<string>();
      for (let i = 0; i < incoming.length; i += ARCHIVE_CHUNK) {
        const ids = incoming.slice(i, i + ARCHIVE_CHUNK).map((tx) => tx.id);
        const { data: existing } = await db
          .from("transaktionen")
          .select("finapi_id")
          .in("finapi_id", ids);
        for (const row of (existing ?? []) as { finapi_id: number | string }[]) {
          existingIds.add(String(row.finapi_id));
        }
      }

      for (const tx of incoming) {
        if (existingIds.has(String(tx.id))) continue; // Schon importiert

        const { error } = await db.from("transaktionen").insert({
          finapi_id: tx.id,
          bank_connection_id: conn.id,
          datum: tx.bankBookingDate,
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

      // 7. Lauf abschließen. Warnungen (z.B. fehlgeschlagenes Bank-Update)
      // landen auch bei Status ok im error-Feld, damit das Protokoll nie
      // wieder stumm ist, wenn etwas hakt.
      if (runId) {
        await db
          .from("bank_sync_runs")
          .update({
            finished_at: new Date().toISOString(),
            fetched_count: fetchedCount,
            archived_new_count: archivedNew,
            imported_new_count: importedNew,
            status: "ok",
            error: errors.length ? errors.join(" | ").slice(0, 2000) : null,
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
  if (newCount > 0 || archivedTotal > 0 || errors.length > 0) {
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
