import { NextResponse } from "next/server";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mask(value: string | undefined, keep = 4) {
  if (!value) return { set: false, preview: "(missing)", length: 0 };
  const trimmed = value.trim();
  if (!trimmed) return { set: false, preview: "(empty)", length: 0 };
  return {
    set: true,
    preview: `${trimmed.slice(0, keep)}...${trimmed.slice(-Math.min(keep, trimmed.length))}`,
    length: trimmed.length,
  };
}

export async function GET() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  const app = process.env.IVORIS_APP;
  const appVersion = process.env.IVORIS_APP_VERSION;
  const linkname = process.env.IVORIS_LINKNAME;
  const apiKey = process.env.IVORIS_API_KEY;
  const username = process.env.IVORIS_USERNAME;
  const password = process.env.IVORIS_PASSWORD;
  const profileId = process.env.IVORIS_PROFILE_ID;
  const relayHost = process.env.IVORIS_RELAY_HOST || "https://relay.computer-konkret.de";

  return NextResponse.json({
    ok: true,
    relayHost,
    values: {
      IVORIS_APP: mask(app),
      IVORIS_APP_VERSION: mask(appVersion),
      IVORIS_LINKNAME: mask(linkname),
      IVORIS_API_KEY: mask(apiKey),
      IVORIS_USERNAME: mask(username),
      IVORIS_PASSWORD: mask(password),
      IVORIS_PROFILE_ID: mask(profileId),
    },
    flags: {
      profileIsPlaceholder: (profileId ?? "").trim().toLowerCase() === "placeholder",
      hasBasicAuth: Boolean(username?.trim() && password?.trim()),
    },
  });
}
