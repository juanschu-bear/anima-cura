import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

for (const filename of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals > 0 && !line.trimStart().startsWith("#")) {
      const key = line.slice(0, equals).trim();
      if (!(key in process.env)) process.env[key] = line.slice(equals + 1).trim();
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase-Konfiguration fehlt");
const db = createClient(url, key);

const TX_IDS = [
  "8d8d965f-8624-43d1-943e-a82a92bf97c9",
  "18c9d6db-2ac5-4c57-b447-d556b28c846c",
];
const OLEH_ID = "ecaea5fd-8360-44e7-85db-26b74d668231";
const OLENA_ID = "796c3942-df85-41ef-9463-76c48bff9f02";
const OLENA_RATE_ID = "45fd61e8-0d2a-4e91-93ba-5778b86f1023";
const LEGITIMATE_RATE_TX_ID = "939e5be4-e0f4-4c34-99f4-fe6735fa6647";

async function main() {
  const apply = process.argv.includes("--apply");
  const [{ data: transactions, error: txError }, { data: item, error: itemError }, { data: rate, error: rateError }] = await Promise.all([
    db.from("transaktionen").select("*").in("id", TX_IDS),
    db.from("offene_posten").select("*").eq("patient_id", OLEH_ID).eq("unser_zeichen", "00005467-1/2026").single(),
    db.from("raten").select("*").eq("id", OLENA_RATE_ID).single(),
  ]);
  if (txError || itemError || rateError) throw txError || itemError || rateError;
  if (!transactions || transactions.length !== 2) throw new Error("Die beiden erwarteten Zahlungen wurden nicht eindeutig gefunden");
  for (const tx of transactions) {
    if (tx.matched_patient_id !== OLENA_ID || tx.matched_rate_id !== OLENA_RATE_ID || Number(tx.betrag) !== 50) {
      throw new Error(`Unerwarteter Ist-Zustand bei ${tx.id}; keine Änderung vorgenommen`);
    }
    if (!String(tx.verwendungszweck || "").includes("00005467")) throw new Error(`Patientennummer fehlt bei ${tx.id}`);
  }
  if (Number(item.offen) < 100 || !["offen", "teilbezahlt"].includes(item.status)) throw new Error("Oleh-Posten ist nicht mehr im erwarteten Zustand");
  if (Number(rate.bezahlt_betrag) < 100) throw new Error("Olena-Rate kann nicht sicher rückgerechnet werden");

  const preview = {
    apply,
    transactions: transactions.map((tx) => ({ id: tx.id, datum: tx.datum, betrag: tx.betrag, zweck: tx.verwendungszweck })),
    olehItem: { id: item.id, vorher: { gezahlt: item.gezahlt, offen: item.offen, status: item.status } },
    olenaRate: { id: rate.id, vorher: { bezahlt_betrag: rate.bezahlt_betrag, status: rate.status } },
  };
  if (!apply) return console.log(JSON.stringify(preview, null, 2));

  const stamp = new Date().toISOString();
  const nextRatePaid = Number((Number(rate.bezahlt_betrag) - 100).toFixed(2));
  const nextRateStatus = nextRatePaid <= 0 ? "offen" : nextRatePaid >= Number(rate.betrag) ? "bezahlt" : "teilbezahlt";
  const nextOpen = Number((Number(item.offen) - 100).toFixed(2));
  const nextPaid = Number((Number(item.gezahlt || 0) + 100).toFixed(2));

  const { error: updateRateError } = await db.from("raten").update({
    bezahlt_betrag: nextRatePaid,
    status: nextRateStatus,
    transaktion_id: LEGITIMATE_RATE_TX_ID,
  }).eq("id", OLENA_RATE_ID).eq("bezahlt_betrag", rate.bezahlt_betrag);
  if (updateRateError) throw updateRateError;

  const { error: updateItemError } = await db.from("offene_posten").update({
    gezahlt: nextPaid,
    offen: nextOpen,
    status: nextOpen === 0 ? "bezahlt" : "teilbezahlt",
    bezahlt_am: nextOpen === 0 ? transactions.map((tx) => tx.datum).sort().at(-1) : null,
  }).eq("id", item.id).eq("offen", item.offen);
  if (updateItemError) throw updateItemError;

  for (const tx of transactions) {
    const { error } = await db.from("transaktionen").update({
      matched_patient_id: OLEH_ID,
      matched_rate_id: null,
      matching_status: "auto",
      matching_score: 100,
      matching_details: {
        ...(tx.matching_details || {}),
        methode: "basisnummer_korrektur",
        basisnummer: "00005467",
        previous_patient_id: OLENA_ID,
        previous_rate_id: OLENA_RATE_ID,
        corrected_at: stamp,
        open_item_sync_applied_at: stamp,
        open_item_sync_applied_amount: 50,
        open_item_sync_items: 1,
      },
      geprueft_am: stamp,
    }).eq("id", tx.id).eq("matched_patient_id", OLENA_ID).eq("matched_rate_id", OLENA_RATE_ID);
    if (error) throw error;
  }

  console.log(JSON.stringify({
    ...preview,
    applied: true,
    olehItemAfter: { gezahlt: nextPaid, offen: nextOpen, status: nextOpen === 0 ? "bezahlt" : "teilbezahlt" },
    olenaRateAfter: { bezahlt_betrag: nextRatePaid, status: nextRateStatus },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
