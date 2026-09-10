import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

for (const filename of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals < 1 || line.trimStart().startsWith("#")) continue;
    const envKey = line.slice(0, equals).trim();
    if (!(envKey in process.env)) process.env[envKey] = line.slice(equals + 1).trim();
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase-Konfiguration fehlt");
const db = createClient(url, key);
const OPEN_ITEMS_IMPORT_CUTOFF = "2026-06-03";

const ledgers = [
  { patientId: "516d8fe6-5e53-4257-a9c1-fe73f1d3351b", itemId: "53b9c218-fcfc-4130-b6a3-ca74e421ef49", open: 340.97, tx: [["9659574c-8529-44af-b812-52196ef6fce1", 23.66]] },
  { patientId: "6f618c62-81aa-40bc-a3a0-22d86f1589d4", itemId: "aa59dc2c-25ca-442f-bf64-2ffbfe7cd79f", open: 451.34, tx: [["fce63f45-38e3-408c-852f-0f93fc4a62ca", 503.54]] },
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const snapshot = [];
  for (const ledger of ledgers) {
    const [{ data: patient, error: patientError }, { data: item, error: itemError }, { data: txs, error: txError }] = await Promise.all([
      db.from("patients").select("id,guthaben").eq("id", ledger.patientId).single(),
      db.from("offene_posten").select("*").eq("id", ledger.itemId).single(),
      db.from("transaktionen").select("*").in("id", ledger.tx.map(([id]) => id)),
    ]);
    if (patientError || itemError || txError) throw patientError || itemError || txError;
    if (!patient || Number(patient.guthaben || 0) !== 0 || !item || Number(item.offen) !== ledger.open) throw new Error(`Ledger ${ledger.patientId} nicht im erwarteten Zustand`);
    if (txs?.length !== ledger.tx.length) throw new Error(`Ledger ${ledger.patientId}: Zahlung fehlt`);
    for (const [id, amount] of ledger.tx) {
      const tx = txs.find((row) => row.id === id);
      if (!tx || Number(tx.betrag) !== amount || tx.matched_patient_id !== ledger.patientId) throw new Error(`Zahlung ${id} nicht eindeutig`);
      if (!tx.datum || String(tx.datum).slice(0, 10) < OPEN_ITEMS_IMPORT_CUTOFF) {
        throw new Error(`Zahlung ${id} liegt vor dem offenen-Posten-Import und darf nicht erneut angerechnet werden`);
      }
      if (tx.matching_details?.open_item_sync_applied_at) throw new Error(`Zahlung ${id} bereits auf Posten angewandt`);
    }
    snapshot.push({ patient, item, txs });
  }
  if (!apply) return console.log(JSON.stringify({ apply, ledgers: ledgers.length, snapshot }, null, 2));

  const backupFile = `/tmp/anima-2026-unique-ledgers-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  const stamp = new Date().toISOString();
  for (const ledger of ledgers) {
    const total = ledger.tx.reduce((sum, [, amount]) => sum + amount, 0);
    const applied = Math.min(ledger.open, total);
    const credit = Number(Math.max(0, total - applied).toFixed(2));
    const nextOpen = Number(Math.max(0, ledger.open - total).toFixed(2));
    const { data: item } = await db.from("offene_posten").select("gezahlt").eq("id", ledger.itemId).single();
    const { data: updated, error: updateError } = await db.from("offene_posten").update({
      gezahlt: Number((Number(item?.gezahlt || 0) + applied).toFixed(2)),
      offen: nextOpen,
      status: nextOpen === 0 ? "bezahlt" : "teilbezahlt",
      bezahlt_am: nextOpen === 0 ? stamp : null,
      nicht_mahnen: nextOpen !== 0,
    }).eq("id", ledger.itemId).eq("offen", ledger.open).select("id");
    if (updateError || updated?.length !== 1) throw updateError || new Error(`Posten ${ledger.itemId} nicht aktualisiert`);
    if (credit > 0) {
      const { error } = await db.from("patients").update({ guthaben: credit }).eq("id", ledger.patientId).or("guthaben.is.null,guthaben.eq.0");
      if (error) throw error;
    }
    let remaining: number = ledger.open;
    for (const [id, amount] of ledger.tx) {
      const chunk = Math.min(remaining, amount);
      remaining = Math.max(0, remaining - chunk);
      const { data: tx } = await db.from("transaktionen").select("matching_details").eq("id", id).single();
      const { error } = await db.from("transaktionen").update({
        matching_details: { ...(tx?.matching_details || {}), methode: "eindeutiges_patientenkonto_2026", open_item_sync_applied_at: stamp, open_item_sync_applied_amount: chunk, open_item_sync_remaining_amount: Number((amount - chunk).toFixed(2)), open_item_sync_items: chunk > 0 ? 1 : 0 },
        geprueft_am: stamp,
      }).eq("id", id);
      if (error) throw error;
    }
  }
  console.log(JSON.stringify({ applied: true, backupFile, ledgers: ledgers.length }, null, 2));
}
main().catch((error) => { console.error(error); process.exit(1); });
