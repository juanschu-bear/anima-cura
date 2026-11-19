import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient } from "@/lib/db/supabase-server";

const input = z.object({ mode: z.enum(["plan", "individual"]), reason: z.string().trim().min(3).max(500) });
const noStore = { "Cache-Control": "private, no-store" };

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ code: "patient_not_found" }, { status: 404, headers: noStore });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "billing_mode_invalid" }, { status: 400, headers: noStore });
  const db = createServerComponentClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ code: "not_authenticated" }, { status: 401, headers: noStore });
  const { data, error } = await db.rpc("set_patient_billing_mode", {
    p_patient_id: id, p_mode: parsed.data.mode, p_reason: parsed.data.reason,
  });
  if (error) {
    const code = /billing_mode_forbidden/.test(error.message) ? "billing_mode_forbidden"
      : /patient_not_found/.test(error.message) ? "patient_not_found"
      : /billing_mode_invalid/.test(error.message) ? "billing_mode_invalid" : "billing_mode_unavailable";
    return NextResponse.json({ code }, { status: code === "billing_mode_forbidden" ? 403 : code === "patient_not_found" ? 404 : code === "billing_mode_invalid" ? 400 : 503, headers: noStore });
  }
  return NextResponse.json(data, { headers: noStore });
}
