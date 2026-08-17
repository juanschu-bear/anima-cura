import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "scribe_behandlungsarten";
const BASIS_ARTEN = new Set(["aligner", "multiband", "removable"]);

type EigeneArt = {
  id: string;
  name: string;
  basis: string;
};

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function istEigeneArt(value: unknown): value is EigeneArt {
  if (!value || typeof value !== "object") return false;
  const eintrag = value as Record<string, unknown>;
  return (
    typeof eintrag.id === "string" &&
    typeof eintrag.name === "string" &&
    typeof eintrag.basis === "string" &&
    BASIS_ARTEN.has(eintrag.basis)
  );
}

async function requireUser() {
  const auth = createServerComponentClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

async function ladeEigeneArten(db: ReturnType<typeof createServerClient>) {
  const { data, error } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();

  if (error) throw error;

  const liste = Array.isArray(data?.value) ? data.value.filter(istEigeneArt) : [];
  return liste.map((eintrag) => ({
    id: eintrag.id,
    name: normalizeName(eintrag.name),
    basis: eintrag.basis,
  }));
}

async function speichereEigeneArten(db: ReturnType<typeof createServerClient>, arten: EigeneArt[]) {
  const { error } = await db.from("einstellungen").upsert(
    {
      key: KEY,
      value: arten,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) throw error;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  try {
    const db = createServerClient();
    const arten = await ladeEigeneArten(db);
    return NextResponse.json({ arten });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Laden fehlgeschlagen." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = await request.json().catch(() => null) as { name?: string; basis?: string } | null;
  const name = normalizeName(String(body?.name ?? ""));
  const basis = String(body?.basis ?? "");

  if (!name) return NextResponse.json({ error: "Name fehlt." }, { status: 400 });
  if (!BASIS_ARTEN.has(basis)) return NextResponse.json({ error: "Basis ungültig." }, { status: 400 });

  try {
    const db = createServerClient();
    const arten = await ladeEigeneArten(db);
    const duplicate = arten.some((eintrag) => eintrag.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return NextResponse.json({ error: "Diese Behandlungsart gibt es bereits." }, { status: 409 });

    const neueArt: EigeneArt = { id: crypto.randomUUID(), name, basis };
    const next = [...arten, neueArt];
    await speichereEigeneArten(db, next);
    return NextResponse.json({ ok: true, art: neueArt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Speichern fehlgeschlagen." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = await request.json().catch(() => null) as { id?: string } | null;
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id fehlt." }, { status: 400 });

  try {
    const db = createServerClient();
    const arten = await ladeEigeneArten(db);
    const next = arten.filter((eintrag) => eintrag.id !== id);
    await speichereEigeneArten(db, next);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Löschen fehlgeschlagen." }, { status: 500 });
  }
}
