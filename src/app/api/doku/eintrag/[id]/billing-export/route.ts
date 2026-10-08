import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { prepareScribeBillingExport } from "@/lib/billing-foundation";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();
  const permissions = (profile?.permissions ?? {}) as { scribe_schreiben?: boolean };
  const allowed = permissions.scribe_schreiben ?? ["admin", "verwaltung"].includes(profile?.role ?? "");
  if (!allowed) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

  const { data: entry, error } = await supabase
    .from("doku_eintraege")
    .select("id, version, status, bestaetigt_am, positionen")
    .eq("id", params.id)
    .single();
  if (error || !entry) return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });
  if (entry.status !== "bestaetigt" || !entry.bestaetigt_am) {
    return NextResponse.json({ error: "Nur bestätigte, versionierte Einträge dürfen exportiert werden" }, { status: 409 });
  }

  const locale = new URL(_request.url).searchParams.get("lang") === "en" ? "en" : "de";
  const prepared = prepareScribeBillingExport(entry.positionen);
  if (!prepared.ok) return NextResponse.json({
    status: "needs_position_review",
    error: t("billing.exportReview", locale),
  }, { status: 409, headers: { "Cache-Control": "private, no-store" } });

  return NextResponse.json({
    status: "manual_transfer_required",
    source_entry_id: entry.id,
    source_version: entry.version,
    confirmed_at: entry.bestaetigt_am,
    positions: prepared.positions,
    copy_text: prepared.copyText,
    notice: "Noch keine bestätigte IVORIS-Abrechnungsschnittstelle. Positionen fachlich prüfen und manuell in IVORIS erfassen.",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
