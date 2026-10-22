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
  key: string;
};

const artKey = (id: string) => `custom-${id}`;

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
    key: typeof eintrag.key === "string" && eintrag.key.trim() ? eintrag.key.trim() : artKey(eintrag.id),
  }));
}

async function cloneBasisTemplates(
  db: ReturnType<typeof createServerClient>,
  basis: string,
  key: string,
) {
  const { data: existing, error: existingError } = await db
    .from("doku_vorlagen")
    .select("id")
    .eq("behandlungsart", key)
    .limit(1);
  if (existingError) throw existingError;
  if ((existing?.length ?? 0) === 0) {
    const { data: templates, error: templatesError } = await db
      .from("doku_vorlagen")
      .select("termin_typ, name, sort_index, aktiv, struktur, positionen")
      .eq("behandlungsart", basis)
      .eq("aktiv", true)
      .order("sort_index");
    if (templatesError) throw templatesError;
    if (!templates?.length) throw new Error("Für die gewählte Basis sind keine Vorlagen vorhanden.");

    const { error: insertError } = await db.from("doku_vorlagen").insert(
      templates.map((template) => ({
        behandlungsart: key,
        termin_typ: template.termin_typ,
        name: template.name,
        sort_index: template.sort_index,
        aktiv: true,
        struktur: JSON.parse(JSON.stringify(template.struktur ?? {})),
        positionen: JSON.parse(JSON.stringify(template.positionen ?? [])),
      })),
    );
    if (insertError) throw insertError;
  }

  const { data: options, error: optionsError } = await db
    .from("doku_vorlagen_optionen")
    .select("praxis_id, termin_typ, gruppe, text, quelle, sort_index, aktiv, erstellt_von")
    .eq("behandlungsart", basis);
  if (optionsError) throw optionsError;
  if (options?.length) {
    const { data: existingOptions, error: existingOptionsError } = await db
      .from("doku_vorlagen_optionen")
      .select("praxis_id, termin_typ, gruppe, text")
      .eq("behandlungsart", key);
    if (existingOptionsError) throw existingOptionsError;

    const vorhanden = new Set(
      (existingOptions ?? []).map((option) =>
        [option.praxis_id, option.termin_typ, option.gruppe, option.text].join("\u0000")
      ),
    );
    const fehlendeOptionen = options.filter((option) =>
      !vorhanden.has([option.praxis_id, option.termin_typ, option.gruppe, option.text].join("\u0000"))
    );
    if (!fehlendeOptionen.length) return;

    const { error: insertOptionsError } = await db.from("doku_vorlagen_optionen").insert(
      fehlendeOptionen.map((option) => ({ ...option, behandlungsart: key })),
    );
    if (insertOptionsError) throw insertOptionsError;
  }
}

async function ensureIndependentTemplates(
  db: ReturnType<typeof createServerClient>,
  arten: EigeneArt[],
) {
  for (const art of arten) await cloneBasisTemplates(db, art.basis, art.key);
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
    await ensureIndependentTemplates(db, arten);
    await speichereEigeneArten(db, arten);
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

    const id = crypto.randomUUID();
    const neueArt: EigeneArt = { id, name, basis, key: artKey(id) };
    await cloneBasisTemplates(db, basis, neueArt.key);
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
    const entfernt = arten.find((eintrag) => eintrag.id === id);
    const next = arten.filter((eintrag) => eintrag.id !== id);
    await speichereEigeneArten(db, next);
    if (entfernt) {
      await db.from("doku_vorlagen").update({ aktiv: false }).eq("behandlungsart", entfernt.key);
      await db.from("doku_vorlagen_optionen").update({ aktiv: false }).eq("behandlungsart", entfernt.key);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Löschen fehlgeschlagen." }, { status: 500 });
  }
}
