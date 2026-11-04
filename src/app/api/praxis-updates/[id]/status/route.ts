import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { getPracticeUpdateActor } from "@/lib/practice-update-auth";
import { canReadPracticeUpdates, isVisiblePracticeUpdate, practiceUpdateStatusSchema } from "@/lib/practice-updates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const user = await getPracticeUpdateActor().catch(() => null);
  const language = request.nextUrl.searchParams.get("lang") === "en" ? "en" : "de";
  const errorText = (de: string, en: string) => language === "en" ? en : de;
  if (!user) return NextResponse.json({ error: errorText("Nicht autorisiert.", "Not authorized.") }, { status: 401, headers: noStore });
  if (!canReadPracticeUpdates(user.role)) {
    return NextResponse.json({ error: errorText("Nur für das Praxisteam.", "Practice team access only.") }, { status: 403, headers: noStore });
  }

  const id = idSchema.safeParse(context.params.id);
  const body = practiceUpdateStatusSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) {
    return NextResponse.json({ error: errorText("Ungültige Angabe.", "Invalid request.") }, { status: 400, headers: noStore });
  }

  const db = createServerClient();
  const { data: update, error: updateError } = await db
    .from("praxis_updates")
    .select("id,status,audience_roles,visible_from,visible_until")
    .eq("id", id.data)
    .maybeSingle();
  if (updateError) {
    return NextResponse.json({ error: errorText("Neuerung konnte nicht geprüft werden.", "Update could not be checked.") }, { status: 503, headers: noStore });
  }
  if (!update || !isVisiblePracticeUpdate(update, user.role)) {
    return NextResponse.json({ error: errorText("Neuerung nicht gefunden.", "Update not found.") }, { status: 404, headers: noStore });
  }

  const { data: existing, error: receiptError } = await db
    .from("praxis_update_lesestaende")
    .select("first_seen_at,read_at,acknowledged_at")
    .eq("update_id", id.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (receiptError) {
    return NextResponse.json({ error: errorText("Lesestand konnte nicht gespeichert werden.", "Read status could not be saved.") }, { status: 503, headers: noStore });
  }

  const now = new Date().toISOString();
  const readAt = existing?.read_at ?? now;
  const acknowledgedAt = body.data.action === "acknowledge" ? (existing?.acknowledged_at ?? now) : (existing?.acknowledged_at ?? null);
  const { error } = await db.from("praxis_update_lesestaende").upsert({
    update_id: id.data,
    user_id: user.id,
    first_seen_at: existing?.first_seen_at ?? now,
    read_at: readAt,
    acknowledged_at: acknowledgedAt,
  }, { onConflict: "update_id,user_id" });
  if (error) {
    return NextResponse.json({ error: errorText("Lesestand konnte nicht gespeichert werden.", "Read status could not be saved.") }, { status: 503, headers: noStore });
  }

  return NextResponse.json({ status: { readAt, acknowledgedAt } }, { headers: noStore });
}
