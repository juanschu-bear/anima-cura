import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { loadInvoiceMailStatusOverview } from "@/lib/services/invoice-mail-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const expected = process.env.INVOICE_ACCESS_WORKER_SECRET;
  const supplied = request.headers.get("x-invoice-worker-secret") ?? "";
  if (!expected || !supplied) return false;
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!process.env.INVOICE_ACCESS_WORKER_SECRET) {
    return NextResponse.json({ code: "invoice_mail_status_not_configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ code: "not_authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { days?: unknown };
  const days = typeof body.days === "number" && Number.isInteger(body.days) ? body.days : 730;
  try {
    return NextResponse.json(await loadInvoiceMailStatusOverview(days), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ code: "invoice_mail_status_unavailable" }, { status: 503 });
  }
}
