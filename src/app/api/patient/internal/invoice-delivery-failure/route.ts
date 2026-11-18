import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { holdInvoiceDocuments } from "@/lib/invoice-delivery-holds";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = new Set(["failed", "bounced", "suppressed", "complained"]);

export async function POST(request: NextRequest) {
  const expected = process.env.INVOICE_ACCESS_WORKER_SECRET;
  const actual = request.headers.get("x-invoice-worker-secret") ?? "";
  if (!expected) return NextResponse.json({ code: "invoice_delivery_failure_not_configured" }, { status: 503 });
  if (!actual || !timingSafeEqual(createHash("sha256").update(actual).digest(), createHash("sha256").update(expected).digest()))
    return NextResponse.json({ code: "not_authenticated" }, { status: 401 });
  const body = await request.json().catch(() => null) as { documentIds?: unknown; eventType?: unknown } | null;
  if (!body || !Array.isArray(body.documentIds) || body.documentIds.length > 100 ||
      !body.documentIds.every(id => typeof id === "string" && uuid.test(id)) ||
      typeof body.eventType !== "string" || !failure.has(body.eventType))
    return NextResponse.json({ code: "invoice_delivery_failure_invalid" }, { status: 400 });
  try {
    const result = await holdInvoiceDocuments(createServerClient(), body.documentIds, body.eventType);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "invoice_delivery_failure_unavailable" }, { status: 503 });
  }
}
