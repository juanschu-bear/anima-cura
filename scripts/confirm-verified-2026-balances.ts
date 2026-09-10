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

const verified = [
  ["53b9c218-fcfc-4130-b6a3-ca74e421ef49", "00005865-1/2026-1", 317.31],
  ["03a4f040-e177-48e9-bb2d-aac0997e2ac5", "00006182-1/2026", 0.18],
  ["50589e64-7ba5-48a4-9ce8-0bbde1876546", "00007280-1/2026-1", 450],
  ["b17b9ee3-9fd0-4da4-8a55-bc0304d851f2", "00007438-1/2026", 28.9],
  ["223ec5a6-312d-44c3-9ed8-4f66cb35913a", "00005073-2/2026-1", 2.2],
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const snapshot = [];
  for (const [id, reference, open] of verified) {
    const { data, error } = await db.from("offene_posten").select("*").eq("id", id).single();
    if (error || !data || data.unser_zeichen !== reference || Number(data.offen) !== open || data.status !== "teilbezahlt") {
      throw error || new Error(`Saldo ${reference} ist nicht im verifizierten Zustand`);
    }
    snapshot.push(data);
  }
  if (!apply) return console.log(JSON.stringify({ apply, verified: snapshot.map((item) => ({ reference: item.unser_zeichen, open: item.offen })) }, null, 2));
  for (const [id, reference, open] of verified) {
    const { data, error } = await db.from("offene_posten").update({ nicht_mahnen: false })
      .eq("id", id).eq("offen", open).eq("status", "teilbezahlt").select("id");
    if (error || data?.length !== 1) throw error || new Error(`Freigabe ${reference} fehlgeschlagen`);
  }
  console.log(JSON.stringify({ applied: true, count: verified.length }, null, 2));
}
main().catch((error) => { console.error(error); process.exit(1); });
