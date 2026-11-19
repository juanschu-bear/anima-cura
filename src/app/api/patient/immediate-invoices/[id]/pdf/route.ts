import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { loadPatientImmediateInvoicePdf, loadPatientImmediateInvoices } from "@/lib/patient-immediate-invoices";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, context: { params: { id: string } }) {
  const id = context.params.id;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ code: "invoice_not_found" }, { status: 404, headers });
  const session = createServerComponentClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return NextResponse.json({ code: "sign_in_required" }, { status: 401, headers });
  const { data: profile } = await session.from("user_profiles").select("role,patient_id").eq("id", user.id).maybeSingle();
  if (profile?.role !== "patient" || !profile.patient_id)
    return NextResponse.json({ code: "patient_invoice_forbidden" }, { status: 403, headers });
  const { data: memberships, error: membershipsError } = await createServerClient().from("patient_access_memberships")
    .select("patient_id").eq("user_id", user.id);
  if (membershipsError) return NextResponse.json({ code: "invoice_source_unavailable" }, { status: 503, headers });
  const patientIds = Array.from(new Set([profile.patient_id as string, ...(memberships ?? []).map(row => row.patient_id as string)]));
  try {
    const item = (await loadPatientImmediateInvoices(patientIds)).find(invoice => invoice.id === id);
    if (!item) return NextResponse.json({ code: "invoice_not_found" }, { status: 404, headers });
    const pdf = await loadPatientImmediateInvoicePdf(item.patientId, id);
    if (!pdf.ok || pdf.headers.get("content-type") !== "application/pdf")
      return NextResponse.json({ code: "invoice_source_unavailable" }, { status: 503, headers });
    return new Response(pdf.body, { headers: { ...headers, "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${item.invoiceNumber}.pdf"` } });
  } catch { return NextResponse.json({ code: "invoice_source_unavailable" }, { status: 503, headers }); }
}
