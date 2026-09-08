import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Position = { code?: unknown; text?: unknown; anzahl?: unknown };

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

  const positions = (Array.isArray(entry.positionen) ? entry.positionen : [])
    .map((position: Position) => ({
      code: String(position.code ?? "").trim(),
      text: String(position.text ?? "").trim(),
      anzahl: Math.max(1, Number(position.anzahl ?? 1) || 1),
    }))
    .filter((position) => position.code);
  const copyText = positions
    .map((position) => `${position.code}${position.anzahl > 1 ? ` x${position.anzahl}` : ""}\t${position.text}`.trim())
    .join("\n");

  return NextResponse.json({
    status: "manual_transfer_required",
    source_entry_id: entry.id,
    source_version: entry.version,
    confirmed_at: entry.bestaetigt_am,
    positions,
    copy_text: copyText,
    notice: "Noch keine bestätigte IVORIS-Abrechnungsschnittstelle. Positionen fachlich prüfen und manuell in IVORIS erfassen.",
  });
}
