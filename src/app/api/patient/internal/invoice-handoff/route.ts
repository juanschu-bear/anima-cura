import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
const methods = new Set(["print", "in_person", "postal_mail", "other"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const secret = process.env.INVOICE_ACCESS_WORKER_SECRET;
  const supplied = request.headers.get("x-invoice-worker-secret") ?? "";
  if (!secret) return NextResponse.json({ code: "invoice_handoff_not_configured" }, { status: 503 });
  if (!supplied || !timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(secret).digest()))
    return NextResponse.json({ code: "not_authenticated" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.documentId !== "string" || !uuid.test(body.documentId) ||
      typeof body.actorId !== "string" || !uuid.test(body.actorId) ||
      typeof body.method !== "string" || !methods.has(body.method) ||
      (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 1000)))
    return NextResponse.json({ code: "invoice_handoff_invalid" }, { status: 400 });
  const db = createServerClient();
  const actor = await db.from("user_profiles").select("id,role").eq("id", body.actorId).maybeSingle();
  if (actor.error) return NextResponse.json({ code: "invoice_handoff_unavailable" }, { status: 503 });
  if (!actor.data || !["admin", "verwaltung"].includes(actor.data.role))
    return NextResponse.json({ code: "invoice_handoff_forbidden" }, { status: 403 });
  const current = await db.from("invoice_delivery_holds").select("id,patient_id,document_id,status,released_at,released_by,handoff_method")
    .eq("document_id", body.documentId).maybeSingle();
  if (current.error) return NextResponse.json({ code: "invoice_handoff_unavailable" }, { status: 503 });
  if (!current.data) return NextResponse.json({ code: "invoice_handoff_hold_not_found" }, { status: 404 });
  if (current.data.status === "released")
    return NextResponse.json({ documentId: body.documentId, patientId: current.data.patient_id, status: "released", releasedAt: current.data.released_at, releasedBy: current.data.released_by, handoffMethod: current.data.handoff_method });
  const saved = await db.from("invoice_delivery_holds").update({
    status: "released", released_at: new Date().toISOString(), released_by: body.actorId,
    handoff_method: body.method, release_note: typeof body.note === "string" ? body.note.trim() || null : null,
  }).eq("id", current.data.id).eq("status", "active")
    .select("patient_id,released_at,released_by,handoff_method").maybeSingle();
  if (saved.error) return NextResponse.json({ code: "invoice_handoff_unavailable" }, { status: 503 });
  if (!saved.data) return NextResponse.json({ code: "invoice_handoff_stale" }, { status: 409 });
  return NextResponse.json({ documentId: body.documentId, patientId: saved.data.patient_id, status: "released", releasedAt: saved.data.released_at, releasedBy: saved.data.released_by, handoffMethod: saved.data.handoff_method }, { headers: { "Cache-Control": "private, no-store" } });
}
