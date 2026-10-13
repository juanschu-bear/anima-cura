import { loadEnvConfig } from "@next/env";
import { createHash, randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { createServerClient } from "../src/lib/db/supabase";

loadEnvConfig(process.cwd());

const AUTH_SETTING = "q3_2026_invoice_email_dispatch_authorization";
const TOKEN_FILE = "/private/tmp/anima-cura-q3-email-campaign.token";
const ENDPOINT = "https://animacura.io/api/rechnungen/email-campaign";

function argument(name: string) {
  const prefix = `${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

async function authorize() {
  const token = randomBytes(32).toString("base64url");
  await writeFile(TOKEN_FILE, token, { mode: 0o600 });
  await chmod(TOKEN_FILE, 0o600);
  const value = {
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  };
  const result = await createServerClient().from("einstellungen")
    .upsert({ key: AUTH_SETTING, value }, { onConflict: "key" });
  if (result.error) throw new Error("Kurzzeitfreigabe konnte nicht gespeichert werden");
  console.log(JSON.stringify({ authorized: true, expiresAt: value.expiresAt }));
}

async function revoke() {
  const result = await createServerClient().from("einstellungen").delete().eq("key", AUTH_SETTING);
  if (result.error) throw new Error("Kurzzeitfreigabe konnte nicht entfernt werden");
  await writeFile(TOKEN_FILE, "revoked", { mode: 0o600 });
  console.log(JSON.stringify({ revoked: true }));
}

async function request(mode: "status" | "test" | "send") {
  const token = (await readFile(TOKEN_FILE, "utf8")).trim();
  const response = await fetch(ENDPOINT, {
    method: mode === "status" ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(mode === "status" ? {} : { "Content-Type": "application/json" }),
    },
    body: mode === "status" ? undefined : JSON.stringify({
      action: mode,
      ...(mode === "send" ? { limit: Number(argument("--limit") ?? "8") } : {}),
    }),
    signal: AbortSignal.timeout(65_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Kampagnenaufruf fehlgeschlagen (${response.status}): ${JSON.stringify(body)}`);
  console.log(JSON.stringify(body));
}

async function main() {
  const mode = argument("--mode");
  if (mode === "authorize") return authorize();
  if (mode === "revoke") return revoke();
  if (mode === "status" || mode === "test" || mode === "send") return request(mode);
  throw new Error("Use --mode=authorize|status|test|send|revoke");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
