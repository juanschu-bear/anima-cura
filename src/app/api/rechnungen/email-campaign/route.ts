import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePraxisRole } from "@/lib/require-praxis";
import {
  q3InvoiceEmailCampaignStatus,
  sendQ3InvoiceEmailBatch,
  testQ3InvoiceEmailCampaign,
} from "@/lib/services/q3-invoice-email-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;
  try {
    return NextResponse.json(await q3InvoiceEmailCampaignStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Versandstatus derzeit nicht verfügbar" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
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
