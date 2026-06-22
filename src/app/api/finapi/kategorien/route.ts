import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";

// GET: Alle Kategorien + Zuordnungen laden
export async function GET() {
  const db = createServerClient();
  const { data: kategorien, error: kErr } = await db
    .from("finanz_kategorien")
    .select("id, name, color, muster, created_at")
    .order("name");
  if (kErr) return NextResponse.json({ ok: false, error: kErr.message }, { status: 500 });

  const { data: zuordnungen, error: zErr } = await db
    .from("finanz_tx_kategorien")
    .select("finapi_tx_id, kategorie_id");
  if (zErr) return NextResponse.json({ ok: false, error: zErr.message }, { status: 500 });

  // Zuordnungen als Map: tx_id -> kategorie_id
  const txMap: Record<string, string> = {};
  for (const z of zuordnungen ?? []) {
    txMap[String(z.finapi_tx_id)] = z.kategorie_id;
  }

  return NextResponse.json({ ok: true, kategorien: kategorien ?? [], txMap });
}

// POST: Neue Kategorie erstellen ODER Transaktion zuordnen
export async function POST(request: Request) {
  const db = createServerClient();
  const body = await request.json();

  // Transaktion zuordnen: { action: "zuordnen", txId, kategorieId, counterpart? }
  if (body.action === "zuordnen") {
    const { txId, kategorieId, counterpart } = body;
    if (!txId || !kategorieId) {
      return NextResponse.json({ ok: false, error: "txId und kategorieId erforderlich" }, { status: 400 });
    }

    // Zuordnung speichern (upsert)
    const { error: zErr } = await db
      .from("finanz_tx_kategorien")
      .upsert({ finapi_tx_id: txId, kategorie_id: kategorieId }, { onConflict: "finapi_tx_id" });
    if (zErr) return NextResponse.json({ ok: false, error: zErr.message }, { status: 500 });

    // Counterpart als Muster hinzufuegen (falls angegeben und noch nicht drin)
    if (counterpart && counterpart.trim()) {
      const { data: kat } = await db
        .from("finanz_kategorien")
        .select("muster")
        .eq("id", kategorieId)
        .single();
      const existing: string[] = kat?.muster ?? [];
      const cleaned = counterpart.trim();
      if (!existing.some((m: string) => m.toLowerCase() === cleaned.toLowerCase())) {
        await db
          .from("finanz_kategorien")
          .update({ muster: [...existing, cleaned], updated_at: new Date().toISOString() })
          .eq("id", kategorieId);
      }
    }

    return NextResponse.json({ ok: true });
  }

  // Neue Kategorie erstellen: { action: "erstellen", name, color? }
  if (body.action === "erstellen") {
    const { name, color } = body;
    if (!name?.trim()) {
      return NextResponse.json({ ok: false, error: "Name erforderlich" }, { status: 400 });
    }
    const { data, error } = await db
      .from("finanz_kategorien")
      .insert({ name: name.trim(), color: color || "#888888", muster: [] })
      .select("id, name, color, muster")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kategorie: data });
  }

  return NextResponse.json({ ok: false, error: "Unbekannte action" }, { status: 400 });
}

// PATCH: Kategorie umbenennen / Farbe aendern / Muster bearbeiten
export async function PATCH(request: Request) {
  const db = createServerClient();
  const body = await request.json();
  const { id, name, color, muster } = body;
  if (!id) return NextResponse.json({ ok: false, error: "id erforderlich" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name.trim();
  if (color !== undefined) updates.color = color;
  if (muster !== undefined) updates.muster = muster;

  const { error } = await db.from("finanz_kategorien").update(updates).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: Kategorie loeschen
export async function DELETE(request: Request) {
  const db = createServerClient();
  const { id } = await request.json();
  if (!id) return NextResponse.json({ ok: false, error: "id erforderlich" }, { status: 400 });

  const { error } = await db.from("finanz_kategorien").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
