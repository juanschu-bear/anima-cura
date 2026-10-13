import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisRole } from "@/lib/require-praxis";
import {
  q3InvoiceEmailCampaignStatus,
  sendQ3InvoiceEmailBatch,
  testQ3InvoiceEmailCampaign,
} from "@/lib/services/q3-invoice-email-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DISPATCH_AUTH_SETTING = "q3_2026_invoice_email_dispatch_authorization";
const dispatchAuthSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().datetime(),
}).strict();

async function hasCampaignDispatchAuthorization(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return false;
  const result = await createServerClient().from("einstellungen").select("value")
    .eq("key", DISPATCH_AUTH_SETTING).maybeSingle();
  const parsed = dispatchAuthSchema.safeParse(result.data?.value);
  if (result.error || !parsed.success || new Date(parsed.data.expiresAt).getTime() <= Date.now()) return false;
  const supplied = Buffer.from(createHash("sha256").update(token).digest("hex"), "utf8");
  const expected = Buffer.from(parsed.data.tokenHash, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function authorizeCampaignRequest(request: Request) {
  if (await hasCampaignDispatchAuthorization(request)) return null;
  return requirePraxisRole(["admin", "verwaltung"]);
}

export async function GET(request: Request) {
  const authError = await authorizeCampaignRequest(request);
  if (authError) return authError;
  try {
    return NextResponse.json(await q3InvoiceEmailCampaignStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Versandstatus derzeit nicht verfügbar" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authError = await authorizeCampaignRequest(request);
  if (authError) return authError;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 403 });
  }
  const parsed = z.object({ action: z.enum(["test", "send"]), limit: z.number().int().min(1).max(12).optional() })
    .strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  try {
    const result = parsed.data.action === "test"
      ? await testQ3InvoiceEmailCampaign()
      : await sendQ3InvoiceEmailBatch(parsed.data.limit ?? 8);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Versand gestoppt; Status vor einem erneuten Versuch prüfen" }, { status: 503 });
  }
}
