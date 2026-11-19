import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
const input = z.object({
  commandId: z.string().uuid(), invoiceId: z.string().uuid(), patientId: z.string().uuid(),
  actorId: z.string().uuid(), amountCents: z.number().int().positive().max(999999999),
  paymentMethod: z.enum(["bar", "girocard", "kreditkarte", "qr_ueberweisung", "ueberweisung", "guthaben"]),
  invoiceNumber: z.string().regex(/^AC-SR-\d{4}-\d{6}$/),
}).strict();
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  const expected = process.env.INVOICE_ACCESS_WORKER_SECRET;
  const supplied = request.headers.get("x-invoice-worker-secret") ?? "";
  if (!expected || !supplied || !timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(expected).digest()))
    return NextResponse.json({ code: "not_authenticated" }, { status: 401, headers });
  if (Number(request.headers.get("content-length") ?? 0) > 4096)
    return NextResponse.json({ code: "immediate_payment_invalid" }, { status: 400, headers });
  const body = input.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ code: "immediate_payment_invalid" }, { status: 400, headers });
  const { data, error } = await createServerClient().rpc("record_immediate_invoice_payment", {
    p_command_id: body.data.commandId, p_invoice_id: body.data.invoiceId,
    p_patient_id: body.data.patientId, p_actor_id: body.data.actorId,
    p_amount_cents: body.data.amountCents, p_payment_method: body.data.paymentMethod,
    p_invoice_number: body.data.invoiceNumber,
  });
  if (error) {
    const code = ["immediate_payment_invalid", "immediate_payment_forbidden", "immediate_payment_command_reused",
      "immediate_payment_patient_missing", "immediate_payment_credit_insufficient"].find(value => error.message.includes(value))
      ?? "immediate_payment_unavailable";
    const status = code === "immediate_payment_forbidden" ? 403
      : code === "immediate_payment_command_reused" ? 409
      : code === "immediate_payment_patient_missing" ? 404
      : code === "immediate_payment_unavailable" ? 503 : 422;
    return NextResponse.json({ code }, { status, headers });
  }
  return NextResponse.json(data, { headers });
}
