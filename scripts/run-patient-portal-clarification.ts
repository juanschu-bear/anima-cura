import { loadEnvConfig } from "@next/env";
import { createHash, randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { createServerClient } from "../src/lib/db/supabase";
import { CLARIFICATION_AUTH_SETTING } from "../src/lib/services/patient-portal-clarification-campaign";

loadEnvConfig(process.cwd());
const tokenFile = "/private/tmp/anima-cura-clarification-campaign.token";
const endpoint = "https://animacura.io/api/praxis/patient-portal-clarification";
const argument = (name: string) => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);

async function authorize() {
  const token = randomBytes(32).toString("base64url");
  await writeFile(tokenFile, token, { mode: 0o600 }); await chmod(tokenFile, 0o600);
  const value = { tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() };
  const result = await createServerClient().from("einstellungen").upsert({ key: CLARIFICATION_AUTH_SETTING, value }, { onConflict: "key" });
  if (result.error) throw new Error("Kurzzeitfreigabe konnte nicht gespeichert werden");
  console.log(JSON.stringify({ authorized: true, expiresAt: value.expiresAt }));
}
async function revoke() {
  await createServerClient().from("einstellungen").delete().eq("key", CLARIFICATION_AUTH_SETTING);
  await writeFile(tokenFile, "revoked", { mode: 0o600 }); console.log(JSON.stringify({ revoked: true }));
}
async function request(action: "status" | "send") {
  const token = (await readFile(tokenFile, "utf8")).trim();
  const response = await fetch(endpoint, { method: action === "status" ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, ...(action === "send" ? { "Content-Type": "application/json" } : {}) }, body: action === "send" ? JSON.stringify({ action, limit: Number(argument("--limit") ?? "10") }) : undefined, signal: AbortSignal.timeout(65_000) });
  const body = await response.json().catch(() => null) as { pending?: number } | null;
  if (!response.ok) throw new Error(`Kampagnenaufruf fehlgeschlagen (${response.status}): ${JSON.stringify(body)}`);
  console.log(JSON.stringify(body)); return body;
}
async function main() {
  const mode = argument("--mode");
  if (mode === "authorize") return authorize(); if (mode === "revoke") return revoke(); if (mode === "status") return request("status"); if (mode === "send") return request("send");
  if (mode === "drain") { for (;;) { const status = await request("status"); if (!status?.pending) return; await request("send"); } }
  throw new Error("Use --mode=authorize|status|send|drain|revoke");
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
