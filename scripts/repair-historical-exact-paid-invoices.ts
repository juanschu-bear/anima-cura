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

const repairs = [
  { itemId: "31d96300-914f-4a96-8b74-f2e318a926a3", txId: "9bb9b92c-47a6-4a61-8d77-a682551d9169", reference: "00003510-1/2023-1", amount: 360.84 },
  { itemId: "ccccbf48-37c4-46e9-8808-713fb75400ba", txId: "443d79b3-0695-4ab9-9c63-244b2a7802a0", reference: "00004955-1/2023-1", amount: 304.79 },
  { itemId: "300b1e8f-d5fd-434f-b271-cec592a7a8f2", txId: "c4e1f94a-431e-4026-bb9e-f4e2980e00ac", reference: "00004937-1/2023-1", amount: 366.94 },
  { itemId: "a2d83d3a-5c31-4c41-8cc7-04eb58d74434", txId: "9582d350-a5e6-42d1-be42-0e17acc435ad", reference: "00004068-4/2024-1", amount: 174.79 },
  { itemId: "e76a3f94-b377-4b76-bb09-9369e5c67f02", txId: "6e82faf3-5d90-4506-acb8-a651fccb4016", reference: "00004559-1/2025-1", amount: 180.42 },
  { itemId: "b6bbcef6-d511-45b9-b5bb-6af22d624fae", txId: "3113391d-4f64-4f8a-84c5-b707335982ab", reference: "00006160-1/2025-1", amount: 692.68 },
  { itemId: "63a50121-e7e4-4db3-87de-ef253aadef91", txId: "5e827295-3c9f-4423-aa45-aaed08db90e9", reference: "00005391-2/2025-1", amount: 30 },
  { itemId: "3d425e6e-af4c-46b5-8230-2dd801fee9bc", txId: "a2f7c904-de67-4f25-aa0f-53c0c730f46a", reference: "00006268-2/2025", amount: 39.94 },
  { itemId: "f36480f5-5aa3-4150-b6e2-9979d003f205", txId: "7dc754ac-6fa3-4519-bf82-9c15fb32bdda", reference: "00006958-2/2025", amount: 51.95 },
  { itemId: "ebde9ad3-ff57-419b-99b0-7ce570ea488a", txId: "c3f2e9ee-72cd-46aa-b4a5-e7f213bb6a53", reference: "00006268-2/2025-1", amount: 15 },
  { itemId: "d39d1fa8-f9af-40f2-bc16-9fca8a79b754", txId: "8c55f405-f12e-4cef-bb80-db1902a819c1", reference: "00006795-3/2025", amount: 41.37 },
  { itemId: "f3422767-9ba1-47e0-bb3e-18f46e05e259", txId: "35940844-f843-463e-b02d-13ea0bc385d6", reference: "00003165-4/2025", amount: 13.98 },
  { itemId: "f00c5c5d-704d-412d-a70e-dcf0ecd26e1d", txId: "dc50aef4-2f7c-4d29-a795-9fdc4d1a158c", reference: "00004740-2/2023-1", amount: 500.09 },
  { itemId: "93b6f17f-0532-45c5-bd8e-856358da9312", txId: "8a2c6b66-6f81-44f1-8bc8-e3610149084d", reference: "00004741-2/2023-1", amount: 523.38 },
  { itemId: "c3c8f311-dbd4-4e6d-82ce-b45710e75e0c", txId: "56042e11-2140-4520-a4cb-1a073c2b4dcd", reference: "00003804-1/2024-1", amount: 20.1 },
  { itemId: "5cc5ce30-3b31-43ba-b835-f2a337e7ce5e", txId: "e0a31e93-ca75-4e0b-911e-2edabc486156", reference: "00005147-4/2024", amount: 22.77 },
  { itemId: "6ce9f106-d0f1-4021-9046-a8917ed1b348", txId: "21483303-e4d3-4d91-a791-0da78eb05650", reference: "00004706-4/2024-1", amount: 432.42 },
  { itemId: "d973afc8-c8be-4fc1-9c82-ea85703ea28a", txId: "5cec4eb3-449a-4029-83d4-c40e8259f152", reference: "00003804-2/2025-3", amount: 561.34 },
  { itemId: "6936f1d6-290f-46d4-b654-69a8cdffc2fe", txId: "51ea747a-73aa-45a8-a019-ca9f779dfac0", reference: "00003804-2/2025-1", amount: 350.01 },
  { itemId: "5d099ed0-8655-4954-aee0-8ed77fdeff4c", txId: "4560d857-1c8b-4045-a8d9-0bb2650087c4", reference: "00006160-2/2025-1", amount: 544.42 },
  { itemId: "62e98191-9d36-4e18-9f84-10bd2cd27ab0", txId: "b3eedd5a-6d02-46b3-b7f0-1180f18636d6", reference: "00006406-4/2025", amount: 18.78 },
  { itemId: "3e7280eb-a0af-42d0-8849-4d45824b27ba", txId: "1ee01877-5b96-4b30-bfae-83e132e87a96", reference: "00006631-4/2025", amount: 102.44 },
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const snapshot = [];
  for (const repair of repairs) {
    const [{ data: item, error: itemError }, { data: tx, error: txError }] = await Promise.all([
      db.from("offene_posten").select("*").eq("id", repair.itemId).single(),
      db.from("transaktionen").select("*").eq("id", repair.txId).single(),
    ]);
    if (itemError || txError) throw itemError || txError;
    if (!item || !tx || item.unser_zeichen !== repair.reference || Number(item.betrag) !== repair.amount ||
        Number(tx.betrag) !== repair.amount || tx.matched_patient_id !== item.patient_id || tx.datum < item.rechnung_datum ||
        (!["offen", "teilbezahlt"].includes(item.status) && item.status !== "bezahlt") ||
        (item.status !== "bezahlt" && Number(item.offen) <= 0)) {
      throw new Error(`Beweiskette für ${repair.reference} ist nicht vollständig`);
    }
    snapshot.push({ item, tx });
  }
  if (!apply) return console.log(JSON.stringify({ apply, repairs: snapshot.map(({ item, tx }) => ({ reference: item.unser_zeichen, open: item.offen, payment: tx.betrag, date: tx.datum })) }, null, 2));

  const backupFile = `/tmp/anima-historical-exact-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  const stamp = new Date().toISOString();
  let repaired = 0;
  for (const { item, tx } of snapshot) {
    if (item.status === "bezahlt") continue;
    const oldOpen = Number(item.offen);
    const { data, error } = await db.from("offene_posten").update({
      gezahlt: Number(item.betrag), offen: 0, status: "bezahlt", bezahlt_am: tx.datum, nicht_mahnen: false,
    }).eq("id", item.id).eq("offen", oldOpen).in("status", ["offen", "teilbezahlt"]).select("id");
    if (error || data?.length !== 1) throw error || new Error(`Posten ${item.id} wurde parallel verändert`);
    const { error: txUpdateError } = await db.from("transaktionen").update({
      matching_details: {
        ...(tx.matching_details || {}), methode: "historischer_vollzahlungsbeweis",
        open_item_sync_applied_at: stamp, open_item_sync_applied_amount: oldOpen,
        open_item_sync_remaining_amount: 0, open_item_sync_items: 1,
      },
      geprueft_am: stamp,
    }).eq("id", tx.id);
    if (txUpdateError) throw txUpdateError;
    repaired += 1;
  }
  console.log(JSON.stringify({ applied: true, backupFile, repaired }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
