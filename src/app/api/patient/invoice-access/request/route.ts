import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestInvoiceAccess } from "@/lib/services/invoice-contact-access";

const schema = z.object({ email: z.string().trim().email().max(254), next: z.string().optional(), language: z.enum(["de", "en", "es"]).optional() });
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ ok: true, expiresInDays: 14 }, { headers: { "Cache-Control": "no-store" } });
  try {
    const result = await requestInvoiceAccess({ ...input.data, ip: request.headers.get("x-forwarded-for") ?? undefined });
    // Only the authenticated Leitstand worker may receive the opaque token.
    const worker = Boolean(process.env.INVOICE_ACCESS_WORKER_SECRET && request.headers.get("x-invoice-worker-secret") === process.env.INVOICE_ACCESS_WORKER_SECRET);
    return NextResponse.json(worker ? result : { ok: true, expiresInDays: result.expiresInDays }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("invoice access request failed", error);
    return NextResponse.json({ ok: true, expiresInDays: 14 }, { headers: { "Cache-Control": "no-store" } });
  }
}
