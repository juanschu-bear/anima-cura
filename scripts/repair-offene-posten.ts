import fs from "fs";
import path from "path";

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(full)) continue;
    const raw = fs.readFileSync(full, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadLocalEnv();

import { syncOpenItemsByReference } from "@/lib/services/offene-posten-sync";

async function run() {
  const dryRun = !process.argv.includes("--apply");
  const summary = await syncOpenItemsByReference({ dryRun });
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error("[repair-offene-posten] fatal", error);
  process.exitCode = 1;
});
