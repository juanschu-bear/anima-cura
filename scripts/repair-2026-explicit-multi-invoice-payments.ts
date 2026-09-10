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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase-Konfiguration fehlt");
const db = createClient(url, serviceKey);

type Split = { itemId: string; expectedOpen: number; applied: number; previousItemId?: string; previousPaid?: number; previousNextPaid?: number };
type Repair = { txId: string; expectedAmount: number; splits: Split[]; patientCredit?: { patientId: string; amount: number } };

const repairs: Repair[] = [
  {
    txId: "9efba6d6-9838-4a32-a94c-8ce09366958c",
    expectedAmount: 262.66,
    splits: [{
      itemId: "3743f969-23f4-4810-ae07-96f485182b50",
      expectedOpen: 177.42,
      applied: 177.42,
      previousItemId: "55c60d6c-2cdc-4ab9-82c7-e779f96a4a52",
      previousPaid: 262.66,
      previousNextPaid: 85.24,
    }],
  },
  {
    txId: "388fdbb1-811d-4a62-96ba-da7a55c3677b",
    expectedAmount: 542.79,
    splits: [{
      itemId: "2f5f1bca-41b2-43ef-b9eb-d0ba92e1bbef",
      expectedOpen: 12.94,
      applied: 12.94,
      previousItemId: "8dc993a9-ce34-4a72-b0d2-0bd0f1919b43",
      previousPaid: 542.79,
      previousNextPaid: 522.69,
    }],
    patientCredit: { patientId: "a6c4bda4-5efe-4805-8958-1aca56bdfbd4", amount: 7.16 },
  },
  {
    txId: "1bd0d579-7f77-4d4e-a9dc-149d27def1dd",
    expectedAmount: 485.24,
    splits: [{ itemId: "73a37ee0-16a6-48ac-a203-5219d2032140", expectedOpen: 485.24, applied: 485.24 }],
  },
  {
    txId: "05838b35-a0ac-4210-87c2-f3c3b5058c90",
    expectedAmount: 814.29,
    splits: [
      { itemId: "bdb1a389-60b9-4a75-bc0c-014dba6b44a5", expectedOpen: 653.79, applied: 653.79 },
      { itemId: "c620c1a9-67a7-49b4-9205-f08fe4795e64", expectedOpen: 160.5, applied: 160.5 },
    ],
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const preview: unknown[] = [];
  for (const repair of repairs) {
    const { data: tx, error: txError } = await db.from("transaktionen").select("*").eq("id", repair.txId).single();
    if (txError || !tx || Number(tx.betrag) !== repair.expectedAmount) throw txError || new Error(`Transaktion ${repair.txId} unerwartet`);
    const splitTotal = repair.splits.reduce((sum, split) => sum + split.applied, 0);
    if (splitTotal > repair.expectedAmount + 0.001) throw new Error(`Aufteilung übersteigt Zahlung ${repair.txId}`);

    for (const split of repair.splits) {
      const { data: item, error } = await db.from("offene_posten").select("*").eq("id", split.itemId).single();
      if (error || !item || Number(item.offen) !== split.expectedOpen || !["offen", "teilbezahlt"].includes(item.status)) {
        throw error || new Error(`Posten ${split.itemId} nicht im erwarteten Zustand`);
      }
      if (split.previousItemId) {
        const { data: previous, error: previousError } = await db.from("offene_posten").select("*").eq("id", split.previousItemId).single();
        if (previousError || !previous || Number(previous.gezahlt) !== split.previousPaid) throw previousError || new Error(`Vorposten ${split.previousItemId} unerwartet`);
      }
      preview.push({ tx: repair.txId, item: item.unser_zeichen, applied: split.applied });
    }
  }
  if (!apply) return console.log(JSON.stringify({ apply, preview }, null, 2));

  const backupFile = `/tmp/anima-2026-explicit-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backupFile, JSON.stringify({ repairs, preview }, null, 2), { mode: 0o600 });
  const stamp = new Date().toISOString();

  for (const repair of repairs) {
    for (const split of repair.splits) {
      if (split.previousItemId) {
        const { error } = await db.from("offene_posten").update({ gezahlt: split.previousNextPaid })
          .eq("id", split.previousItemId).eq("gezahlt", split.previousPaid);
        if (error) throw error;
      }
      const { data: item } = await db.from("offene_posten").select("gezahlt").eq("id", split.itemId).single();
      const { error } = await db.from("offene_posten").update({
        gezahlt: Number((Number(item?.gezahlt || 0) + split.applied).toFixed(2)),
        offen: 0,
        status: "bezahlt",
        bezahlt_am: stamp,
        nicht_mahnen: false,
      }).eq("id", split.itemId).eq("offen", split.expectedOpen);
      if (error) throw error;
    }
    if (repair.patientCredit) {
      const { data: patient, error } = await db.from("patients").select("guthaben").eq("id", repair.patientCredit.patientId).single();
      if (error) throw error;
      const { error: creditError } = await db.from("patients").update({
        guthaben: Number((Number(patient?.guthaben || 0) + repair.patientCredit.amount).toFixed(2)),
      }).eq("id", repair.patientCredit.patientId).eq("guthaben", patient?.guthaben || 0);
      if (creditError) throw creditError;
    }
    const { data: tx } = await db.from("transaktionen").select("matching_details").eq("id", repair.txId).single();
    const { error } = await db.from("transaktionen").update({
      matching_details: {
        ...(tx?.matching_details || {}),
        explicit_multi_invoice_repair_at: stamp,
        open_item_sync_applied_at: stamp,
        open_item_sync_applied_amount: repair.splits.reduce((sum, split) => sum + split.applied, 0),
        open_item_sync_items: repair.splits.length + repair.splits.filter((split) => split.previousItemId).length,
      },
      geprueft_am: stamp,
    }).eq("id", repair.txId);
    if (error) throw error;
  }

  console.log(JSON.stringify({ applied: true, backupFile, preview }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
