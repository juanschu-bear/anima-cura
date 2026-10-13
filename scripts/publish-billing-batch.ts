import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServerClient } from "../src/lib/db/supabase";
import { publishBillingManifest, validateBillingManifest } from "../src/lib/billing-publish";

loadEnvConfig(process.cwd());

function argument(name: string) {
  const prefix = `${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const allowed = new Set(["--apply"]);
  for (const value of process.argv.slice(2)) {
    if (!allowed.has(value) && !value.startsWith("--manifest=") && !value.startsWith("--receipt=")) {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  const manifestPath = argument("--manifest");
  if (!manifestPath) throw new Error("Use --manifest=/absolute/path/to/manifest-private.json");
  const apply = process.argv.includes("--apply");
  const receiptPath = argument("--receipt");
  if (apply && !receiptPath) {
    throw new Error("Applied batches require --receipt=/absolute/path/to/private-receipt.json");
  }
  const parsed = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
  const manifest = validateBillingManifest(parsed);
  let lastReported = 0;
  const summary = await publishBillingManifest({
    db: createServerClient(),
    manifest,
    apply,
    onProgress(completed, total) {
      if (completed === total || completed - lastReported >= 50) {
        lastReported = completed;
        console.log(JSON.stringify({ stage: "publishing", completed, total }));
      }
    },
  });
  const receipt = {
    completed_at: new Date().toISOString(),
    manifest_audit_at: manifest.audit_at,
    ...summary,
  };
  if (apply) {
    await writeFile(resolve(receiptPath!), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  }
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Billing publication failed");
  process.exitCode = 1;
});
