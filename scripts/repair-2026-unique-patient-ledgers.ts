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

const ledgers = [
  { patientId: "516d8fe6-5e53-4257-a9c1-fe73f1d3351b", itemId: "53b9c218-fcfc-4130-b6a3-ca74e421ef49", open: 340.97, tx: [["9659574c-8529-44af-b812-52196ef6fce1", 23.66]] },
  { patientId: "557ede0d-c509-45fd-b8ee-904a36e50b78", itemId: "3d32d575-ad89-4a9e-8e9f-6255a2098c7e", open: 61.57, tx: [["6159024c-cc11-4013-9b08-d0d324e62c74", 67.81], ["4457b525-69c0-4ac4-8758-b875d5ddadf4", 67.81]] },
  { patientId: "6f618c62-81aa-40bc-a3a0-22d86f1589d4", itemId: "aa59dc2c-25ca-442f-bf64-2ffbfe7cd79f", open: 451.34, tx: [["fce63f45-38e3-408c-852f-0f93fc4a62ca", 503.54]] },
  { patientId: "1678bd1e-5fcd-4546-87bf-5a62e2e3d33a", itemId: "bc5309bc-3e03-4183-93d1-cf12f09f668a", open: 28.21, tx: [["0fc979a6-3e51-4608-b876-eff704b3461d", 57], ["7827d569-d071-4012-9608-bf730a9a2444", 57], ["4dce7f2a-6473-40e7-a428-ae3acabb78bd", 57], ["5b738eb1-b72d-4c05-b892-866488d30f8c", 57], ["8b245a6d-5090-4f19-b597-c253a1fb3e3f", 57], ["faac2d38-4245-40ec-ac68-195d7c1c8932", 57]] },
  { patientId: "d3d89759-954f-410b-987a-c947b93f1576", itemId: "f13bd514-cef9-4c27-8c07-4167b7dac3a1", open: 454, tx: [["ad154689-9ae7-4c96-91f5-349084a2e2c6", 1550]] },
  { patientId: "2c6676cb-dec6-4696-9c3d-b9d4250da10b", itemId: "f53f286c-4c4f-4c8f-a242-d0630d56829a", open: 113.73, tx: [["bbde238d-7ea7-4f8a-b5be-420c6895615b", 45.21], ["8275ab9f-4366-4f29-bcb7-d2b6ed2d5a81", 45.21], ["03f5da89-aa03-47cd-930e-9ffd0aedc920", 45.21]] },
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
