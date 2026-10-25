import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Dry run by default. This script has no direct table write path.
for (const filename of [process.env.ANIMA_ENV_FILE, ".env.local", ".env"].filter(Boolean) as string[]) {
  if (!fs.existsSync(filename)) continue;
  for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals < 1 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, equals).trim();
    if (!(key in process.env)) process.env[key] = line.slice(equals + 1).trim();
  }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.resolve("tmp/verified-bank-payment-backfill.json"), "utf8"));
  if (manifest.version !== "verified-bank-v1" || typeof manifest.catalog !== "string" || !Array.isArray(manifest.rows)) {
    throw new Error("Invalid verified payment manifest");
  }
  const totalCents = manifest.rows.reduce((sum: number, row: any) => {
    if (!Number.isSafeInteger(row.amount_cents) || row.amount_cents <= 0 || !row.expected_transaction) throw new Error("Invalid payment row");
    return sum + row.amount_cents;
  }, 0);
  if (new Set(manifest.rows.map((row: any) => row.transaction_id)).size !== manifest.rows.length) throw new Error("Duplicate source in manifest");
  const apply = process.argv.includes("--apply");
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", rows: manifest.rows.length, amountCents: totalCents }));
  if (!apply || manifest.rows.length === 0) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Database configuration missing");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const totals = { imported: 0, already_imported: 0, skipped: 0, imported_cents: 0 };
  let batchSize = 100;
  for (let start = 0; start < manifest.rows.length;) {
    const batch = manifest.rows.slice(start, start + batchSize);
    const { data, error } = await db.rpc("import_verified_bank_payment_batch", { p_catalog: manifest.catalog, p_rows: batch });
    if (error?.code === "57014" && batchSize > 1) {
      batchSize = Math.max(1, Math.floor(batchSize / 2));
      console.log(JSON.stringify({ retryFrom: start, reducedBatchSize: batchSize, reason: "statement_timeout_rolled_back" }));
      continue;
    }
    if (error) throw new Error(`Import stopped at row ${start}: ${error.message}. Successful earlier batches are preserved; retry is safe.`);
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += Number(data[key]);
    start += batch.length;
    console.log(JSON.stringify({ processed: start, ...totals, skipReasons: data.skip_reasons }));
    if (data.skipped > 0) throw new Error("Source changed or prior decision found; stopped for a fresh audit, without overriding it");
  }
  const expected = new Map<string, any>(manifest.rows.map((row: any) => [row.transaction_id, row]));
  const verified = new Set<string>();
  let verifiedCents = 0;
  for (let start = 0;; start += 1000) {
    const { data, error } = await db.from("payment_patient_allocations")
      .select("id,transaction_id,patient_id,amount_cents,state,source_key")
      .like("source_key", "verified-bank-v1:%").order("id").range(start, start + 999);
    if (error) throw new Error("Post-import verification could not read journal");
    for (const row of data || []) {
      const source = expected.get(row.transaction_id);
      if (!source) continue;
      if (verified.has(row.transaction_id) || row.patient_id !== source.patient_id
        || Number(row.amount_cents) !== source.amount_cents || row.state !== "confirmed_auto"
        || row.source_key !== `verified-bank-v1:${row.transaction_id}`) throw new Error("Post-import journal mismatch");
      verified.add(row.transaction_id);
      verifiedCents += Number(row.amount_cents);
    }
    if ((data || []).length < 1000) break;
  }
  if (verified.size !== expected.size || verifiedCents !== totalCents) throw new Error("Post-import coverage does not match the manifest");
  console.log(JSON.stringify({ complete: true, ...totals, verified_rows: verified.size, verified_cents: verifiedCents }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Payment import failed"); process.exitCode = 1; });
