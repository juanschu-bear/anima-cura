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

const corrections = [
  {
    id: "50589e64-7ba5-48a4-9ce8-0bbde1876546",
    reference: "00007280-1/2026-1",
    expectedPaid: 4.4,
    expectedOpen: 447.8,
    nextPaid: 2.2,
    nextOpen: 450,
    reason: "Eine einzige Zahlung über 2,20 EUR war doppelt im Posten enthalten.",
  },
  {
    id: "b17b9ee3-9fd0-4da4-8a55-bc0304d851f2",
    reference: "00007438-1/2026",
    expectedPaid: 86.73,
    expectedOpen: 15.15,
    nextPaid: 72.98,
    nextOpen: 28.9,
    reason: "13,75 EUR mit Referenz 00007438-2/2026 gehoeren nicht in Q1.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const snapshot = [];
  for (const correction of corrections) {
    const { data, error } = await db.from("offene_posten").select("*").eq("id", correction.id).single();
    if (error || !data) throw error || new Error(`Posten ${correction.id} fehlt`);
    if (data.unser_zeichen !== correction.reference || Number(data.gezahlt) !== correction.expectedPaid || Number(data.offen) !== correction.expectedOpen) {
      throw new Error(`Posten ${correction.reference} hat nicht mehr den erwarteten Zustand`);
    }
    snapshot.push(data);
  }
  if (!apply) return console.log(JSON.stringify({ apply, corrections, snapshot }, null, 2));

  const backupFile = `/tmp/anima-2026-quarter-correction-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  for (const correction of corrections) {
    const { data, error } = await db.from("offene_posten").update({
      gezahlt: correction.nextPaid,
      offen: correction.nextOpen,
      status: correction.nextOpen === 0 ? "bezahlt" : "teilbezahlt",
      nicht_mahnen: true,
    }).eq("id", correction.id).eq("gezahlt", correction.expectedPaid).eq("offen", correction.expectedOpen).select("id");
    if (error || data?.length !== 1) throw error || new Error(`Korrektur ${correction.reference} fehlgeschlagen`);
  }
  console.log(JSON.stringify({ applied: true, backupFile, corrections }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
